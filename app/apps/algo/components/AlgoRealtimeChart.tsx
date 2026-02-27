
'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AlgoSignal } from '@/lib/algo/types';

export interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface AlgoRealtimeChartProps {
    data: OHLCV[];
    signals?: AlgoSignal[];
    zones?: any[];
    height?: number;
    symbol: string;
}

const AlgoRealtimeChart: React.FC<AlgoRealtimeChartProps> = ({ data, signals = [], zones = [], height, symbol }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const isAutoPricedRef = useRef(true);

    // Initial setup for dimensions
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height: contentHeight } = entry.contentRect;
                setDimensions({ width, height: height || contentHeight });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [height]);

    useEffect(() => {
        if (!svgRef.current || data.length === 0 || dimensions.width === 0) return;

        const { width, height: chartHeightFull } = dimensions;
        const margin = { top: 20, right: 70, bottom: 30, left: 10 };
        const widthChart = width - margin.left - margin.right;
        const heightChart = chartHeightFull - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); // Clear previous

        const mainG = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const x = d3.scaleLinear()
            .domain([Math.max(0, data.length - 800), data.length]) // Show last 800 candles (covering ~2 days)
            .range([0, widthChart]);

        const latestData = data.slice(-800);
        const priceMin = d3.min(latestData, d => d.low) || 0;
        const priceMax = d3.max(latestData, d => d.high) || 0;
        const pricePadding = (priceMax - priceMin) * 0.15;

        const y = d3.scaleLinear()
            .domain([priceMin - pricePadding, priceMax + pricePadding])
            .range([heightChart, 0]);

        // Clip Path
        svg.append('defs').append('clipPath')
            .attr('id', 'algo-chart-clip')
            .append('rect')
            .attr('width', widthChart)
            .attr('height', heightChart);

        const chartArea = mainG.append('g')
            .attr('clip-path', 'url(#algo-chart-clip)');

        // Grid lines (Dark Theme)
        const gridG = chartArea.append('g').attr('class', 'grid');
        const drawGrid = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            gridG.selectAll('*').remove();

            // Vertical Grid
            const xTicks = sx.ticks(10);
            gridG.selectAll('.v-grid')
                .data(xTicks)
                .join('line')
                .attr('x1', d => sx(d))
                .attr('x2', d => sx(d))
                .attr('y1', 0)
                .attr('y2', heightChart)
                .attr('stroke', 'rgba(255,255,255,0.03)')
                .attr('stroke-width', 1);

            // Horizontal grid
            const ticks = sy.ticks(10);
            gridG.selectAll('.h-grid')
                .data(ticks)
                .join('line')
                .attr('x1', 0)
                .attr('x2', widthChart)
                .attr('y1', d => sy(d))
                .attr('y2', d => sy(d))
                .attr('stroke', 'rgba(255,255,255,0.03)')
                .attr('stroke-width', 1);
        };

        // Candles
        const candleG = chartArea.append('g').attr('class', 'candles');
        const drawCandles = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const bandwidth = (sx(1) - sx(0)) * 0.8;

            const selection = candleG.selectAll('.candle')
                .data(data, (d: any) => d.time);

            const enter = selection.enter().append('g').attr('class', 'candle');

            enter.append('line').attr('class', 'wick');
            enter.append('rect').attr('class', 'body');

            const update = selection.merge(enter as any);

            update.attr('transform', (d, i) => `translate(${sx(i) - bandwidth / 2}, 0)`)
                .style('display', (d, i) => {
                    const xPos = sx(i);
                    return (xPos >= -bandwidth && xPos <= widthChart + bandwidth) ? null : 'none';
                });

            update.select('.wick')
                .attr('x1', bandwidth / 2)
                .attr('x2', bandwidth / 2)
                .attr('y1', d => sy(d.high))
                .attr('y2', d => sy(d.low))
                .attr('stroke', d => d.close >= d.open ? '#10b981' : '#f43f5e') // Emerald and Rose
                .attr('stroke-width', 1);

            update.select('.body')
                .attr('width', Math.max(1, bandwidth))
                .attr('y', d => sy(Math.max(d.open, d.close)))
                .attr('height', d => Math.max(0.5, Math.abs(sy(d.open) - sy(d.close))))
                .attr('fill', d => d.close >= d.open ? '#10b981' : '#f43f5e')
                .attr('rx', 1);

            selection.exit().remove();
        };

        // Signals Layer
        const signalG = chartArea.append('g').attr('class', 'signals');
        const drawSignals = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            signalG.selectAll('*').remove();

            signals.forEach(sig => {
                // Find matching candle by timestamp (rough match for 1min)
                const index = data.findIndex(d => Math.abs(d.time - sig.timestamp / 1000) < 60);
                if (index === -1) return;

                const xPos = sx(index);
                const yPos = sy(sig.price);

                if (sig.type === 'BUY') {
                    signalG.append('path')
                        .attr('d', d3.symbol().type(d3.symbolTriangle).size(100)())
                        .attr('transform', `translate(${xPos}, ${yPos + 15})`)
                        .attr('fill', '#10b981')
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1);
                } else if (sig.type === 'SELL') {
                    signalG.append('path')
                        .attr('d', d3.symbol().type(d3.symbolTriangle).size(100)())
                        .attr('transform', `translate(${xPos}, ${yPos - 15}) rotate(180)`)
                        .attr('fill', '#f43f5e')
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1);
                }
            });
        };

        // Levels Layer (PDH, PDL, PDC)
        const levelG = chartArea.append('g').attr('class', 'levels');
        const drawLevels = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            levelG.selectAll('*').remove();

            // Filter zones for current symbol
            const currentZones = zones.filter(z => z.description.includes(symbol) || z.description === 'PDH' || z.description === 'PDL' || z.description === 'PDC');

            currentZones.forEach(zone => {
                const yPos = sy(zone.price);
                const color = zone.description.includes('PDH') ? '#f43f5e' :
                    zone.description.includes('PDL') ? '#10b981' : '#3b82f6';

                const line = levelG.append('line')
                    .attr('x1', 0)
                    .attr('x2', widthChart)
                    .attr('y1', yPos)
                    .attr('y2', yPos)
                    .attr('stroke', color)
                    .attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '5,5')
                    .attr('opacity', 0.6);

                levelG.append('text')
                    .attr('x', widthChart - 5)
                    .attr('y', yPos - 5)
                    .attr('text-anchor', 'end')
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .attr('font-weight', 'bold')
                    .text(`${zone.description}: ${zone.price.toFixed(1)}`);
            });
        };

        // Axes (Dark Theme Styling)
        const xAxisG = mainG.append('g').attr('transform', `translate(0,${heightChart})`);
        const yAxisG = mainG.append('g').attr('transform', `translate(${widthChart},0)`);

        const drawAxes = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const timeFormat = d3.timeFormat('%H:%M');

            const [start, end] = sx.domain();
            const tickIndices = [];
            const step = Math.max(1, Math.ceil((end - start) / 8));
            for (let i = Math.floor(start); i <= end; i += step) if (data[i]) tickIndices.push(i);

            xAxisG.call(d3.axisBottom(sx)
                .tickValues(tickIndices)
                .tickFormat(i => data[i as number] ? timeFormat(new Date(data[i as number].time * 1000)) : '') as any)
                .select('.domain').remove();

            xAxisG.selectAll('text').attr('fill', '#64748b').style('font-size', '10px').style('font-weight', '600');
            xAxisG.selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)');

            yAxisG.call(d3.axisRight(sy).tickSize(0).tickPadding(8) as any).select('.domain').remove();
            yAxisG.selectAll('text').attr('fill', '#94a3b8').style('font-size', '10px').style('font-family', 'monospace');
        };

        // Zoom Behavior
        let currentScaleX = x;
        let currentScaleY = y;

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 100])
            .on('zoom', (e) => {
                transformRef.current = e.transform;
                currentScaleX = e.transform.rescaleX(x);

                if (isAutoPricedRef.current) {
                    const [s, ed] = currentScaleX.domain();
                    const visible = data.filter((_, i) => i >= s && i <= ed);
                    if (visible.length > 0) {
                        const minP = d3.min(visible, d => d.low)!;
                        const maxP = d3.max(visible, d => d.high)!;
                        const pad = (maxP - minP) * 0.15;
                        currentScaleY.domain([minP - pad, maxP + pad]);
                    }
                }

                drawCandles(currentScaleX, currentScaleY);
                drawSignals(currentScaleX, currentScaleY);
                drawLevels(currentScaleX, currentScaleY);
                drawAxes(currentScaleX, currentScaleY);
                drawGrid(currentScaleX, currentScaleY);
            });

        svg.call(zoom as any);

        if (transformRef.current !== d3.zoomIdentity) {
            svg.call(zoom.transform, transformRef.current);
        } else {
            drawCandles(x, y);
            drawSignals(x, y);
            drawLevels(x, y);
            drawAxes(x, y);
            drawGrid(x, y);
        }

        // Crosshair
        const crosshair = mainG.append('g').attr('class', 'crosshair').style('display', 'none');
        const vLine = crosshair.append('line').attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-dasharray', '3,3');
        const hLine = crosshair.append('line').attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-dasharray', '3,3');
        const priceTag = mainG.append('rect').attr('fill', '#3b82f6').attr('width', 60).attr('height', 20).style('display', 'none');
        const priceText = mainG.append('text').attr('fill', '#fff').style('font-size', '10px').style('font-weight', 'bold').attr('text-anchor', 'middle').style('display', 'none');

        svg.on('mousemove', (e) => {
            const [mx, my] = d3.pointer(e);
            const cx = mx - margin.left;
            const cy = my - margin.top;

            if (cx >= 0 && cx <= widthChart && cy >= 0 && cy <= heightChart) {
                crosshair.style('display', null);
                priceTag.style('display', null);
                priceText.style('display', null);

                vLine.attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', heightChart);
                hLine.attr('y1', cy).attr('y2', cy).attr('x1', 0).attr('x2', widthChart);

                const price = currentScaleY.invert(cy);
                priceTag.attr('x', widthChart + 5).attr('y', cy - 10);
                priceText.attr('x', widthChart + 35).attr('y', cy + 4).text(price.toFixed(1));
            } else {
                crosshair.style('display', 'none');
                priceTag.style('display', 'none');
                priceText.style('display', 'none');
            }
        });

        svg.on('mouseleave', () => {
            crosshair.style('display', 'none');
            priceTag.style('display', 'none');
            priceText.style('display', 'none');
        });

    }, [data, signals, zones, dimensions, symbol]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#0a0c10]/40 rounded-3xl border border-white/5 backdrop-blur-sm">
            <div className="absolute top-4 left-6 z-10 flex items-center gap-3">
                <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{symbol}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Real-time Node</span>
            </div>
            <svg ref={svgRef} className="w-full h-full block" />
        </div>
    );
};

export default AlgoRealtimeChart;
