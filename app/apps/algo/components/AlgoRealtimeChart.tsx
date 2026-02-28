'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';

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
    height?: number;
    symbol: string;
    trades?: any[];
}

const AlgoRealtimeChart: React.FC<AlgoRealtimeChartProps> = ({ data, height, symbol, trades }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const isAutoPricedRef = useRef(true);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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
        svg.selectAll('*').remove();

        const mainG = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // ── Scales ──────────────────────────────────────────────────────────
        const x = d3.scaleLinear()
            .domain([-1, data.length + 1])
            .range([0, widthChart]);

        const priceMin = d3.min(data, d => d.low) || 0;
        const priceMax = d3.max(data, d => d.high) || 0;
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

        // ── Grid ─────────────────────────────────────────────────────────────
        const gridG = chartArea.append('g').attr('class', 'grid');
        const drawGrid = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            gridG.selectAll('*').remove();
            const xTicks = sx.ticks(10);
            gridG.selectAll('.v-grid').data(xTicks).join('line')
                .attr('x1', d => sx(d)).attr('x2', d => sx(d))
                .attr('y1', 0).attr('y2', heightChart)
                .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);

            sy.ticks(10);
            gridG.selectAll('.h-grid').data(sy.ticks(10)).join('line')
                .attr('x1', 0).attr('x2', widthChart)
                .attr('y1', d => sy(d)).attr('y2', d => sy(d))
                .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);
        };

        // ── ADR Indicators ───────────────────────────────────────────────────
        const adrG = chartArea.append('g').attr('class', 'adr-lines');
        const drawADR = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const linesData = [
                { key: 'adr3h', color: '#FF0000' }, // Red
                { key: 'adr2h', color: '#FF4000' }, // Red Orange
                { key: 'adr1h', color: '#FF8000' }, // Orange
                { key: 'adr1l', color: '#80FF00' }, // Chartreuse
                { key: 'adr2l', color: '#00FF00' }, // Lime
                { key: 'adr3l', color: '#00FF80' }, // Mint
                { key: 'open', color: '#808080' }  // Gray
            ];

            adrG.selectAll('.adr-line')
                .data(linesData)
                .join('path')
                .attr('class', 'adr-line')
                .attr('fill', 'none')
                .attr('stroke', d => d.color)
                .attr('stroke-width', d => d.key === 'open' ? 2 : 1)
                .attr('d', d => {
                    const lineGen = d3.line<any>()
                        .defined((item: any) => item.adr && item.adr[d.key] > 0)
                        .x((_, i) => sx(i))
                        .y((item: any) => sy(item.adr[d.key]));
                    return lineGen(data) as string;
                });
        };

        // ── Candles ───────────────────────────────────────────────────────────
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
                .attr('x1', bandwidth / 2).attr('x2', bandwidth / 2)
                .attr('y1', d => sy(d.high)).attr('y2', d => sy(d.low))
                .attr('stroke', d => d.close >= d.open ? '#10b981' : '#f43f5e')
                .attr('stroke-width', 1);

            update.select('.body')
                .attr('width', Math.max(1, bandwidth))
                .attr('y', d => sy(Math.max(d.open, d.close)))
                .attr('height', d => Math.max(0.5, Math.abs(sy(d.open) - sy(d.close))))
                .attr('fill', d => d.close >= d.open ? '#10b981' : '#f43f5e')
                .attr('rx', 1);

            selection.exit().remove();
        };

        // ── Trades ───────────────────────────────────────────────────────────
        const tradeG = chartArea.append('g').attr('class', 'trades');
        const drawTrades = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            if (!trades || trades.length === 0) return;

            const markers: any[] = [];

            trades.forEach(t => {
                const entryIdx = data.findIndex(d => d.time === t.entryTimestamp);
                if (entryIdx !== -1) {
                    markers.push({
                        type: 'entry',
                        idx: entryIdx,
                        price: data[entryIdx].low, // Point below candle
                        priceHigh: data[entryIdx].high, // Point above candle
                        isLong: t.type === 'LONG',
                        tradeId: t.id
                    });
                }

                const exitIdx = data.findIndex(d => d.time === t.exitTimestamp);
                if (exitIdx !== -1) {
                    markers.push({
                        type: 'exit',
                        idx: exitIdx,
                        price: data[exitIdx].close,
                        isLong: t.type === 'LONG',
                        reason: t.exitReason,
                        tradeId: t.id
                    });
                }
            });

            // Entry Markers (Triangles)
            tradeG.selectAll('.entry-marker')
                .data(markers.filter(m => m.type === 'entry'), (d: any) => d.tradeId + '-entry')
                .join('path')
                .attr('class', 'entry-marker')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(80) as any)
                .attr('fill', d => d.isLong ? '#10b981' : '#f43f5e') // Green triangle = Long, Red triangle = Short
                .attr('transform', d => {
                    const xPos = sx(d.idx);
                    // Buy CE = Arrow pointing UP below candle. Buy PE = Arrow pointing DOWN above candle.
                    const yPos = d.isLong ? sy(d.price) + 20 : sy(d.priceHigh) - 20;
                    const rot = d.isLong ? 0 : 180;
                    return `translate(${xPos}, ${yPos}) rotate(${rot})`;
                });

            // Exit Markers (Dots / Crosses)
            const exitMarkers = markers.filter(m => m.type === 'exit');
            const getColor = (r: string) => r === 'TARGET' ? '#10b981' : r === 'SL' ? '#f43f5e' : '#eab308';

            tradeG.selectAll('.exit-marker-bg')
                .data(exitMarkers, (d: any) => d.tradeId + '-exit-bg')
                .join('circle')
                .attr('class', 'exit-marker-bg')
                .attr('cx', d => sx(d.idx))
                .attr('cy', d => sy(d.price))
                .attr('r', 6)
                .attr('fill', '#0a0c10')
                .attr('stroke', d => getColor(d.reason))
                .attr('stroke-width', 2);

            tradeG.selectAll('.exit-marker-x')
                .data(exitMarkers, (d: any) => d.tradeId + '-exit-x')
                .join('path')
                .attr('class', 'exit-marker-x')
                .attr('d', d => {
                    const r = 3;
                    return `M ${sx(d.idx) - r},${sy(d.price) - r} L ${sx(d.idx) + r},${sy(d.price) + r} M ${sx(d.idx) + r},${sy(d.price) - r} L ${sx(d.idx) - r},${sy(d.price) + r}`;
                })
                .attr('stroke', d => getColor(d.reason))
                .attr('stroke-width', 1.5)
                .attr('fill', 'none');
        };

        // ── Axes ──────────────────────────────────────────────────────────────
        const xAxisG = mainG.append('g').attr('transform', `translate(0,${heightChart})`);
        const yAxisG = mainG.append('g').attr('transform', `translate(${widthChart},0)`);

        const drawAxes = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const timeFormat = d3.timeFormat('%H:%M');
            const dateTimeFormat = d3.timeFormat('%d/%m %H:%M');
            const [start, end] = sx.domain();
            const range = end - start;
            const step = Math.max(1, Math.ceil(range / 6));
            const tickIndices = [];
            for (let i = Math.max(0, Math.floor(start)); i <= Math.min(data.length - 1, end); i += step) {
                if (data[i]) tickIndices.push(i);
            }
            xAxisG.call(d3.axisBottom(sx)
                .tickValues(tickIndices)
                .tickFormat(i => {
                    const d = data[i as number];
                    if (!d) return '';
                    const date = new Date(d.time * 1000);
                    return range > 500 ? dateTimeFormat(date) : timeFormat(date);
                }) as any)
                .select('.domain').remove();
            xAxisG.selectAll('text').attr('fill', '#64748b').style('font-size', '10px').style('font-weight', '600');
            xAxisG.selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)');
            yAxisG.call(d3.axisRight(sy).tickSize(0).tickPadding(8) as any).select('.domain').remove();
            yAxisG.selectAll('text').attr('fill', '#94a3b8').style('font-size', '10px').style('font-family', 'monospace');
        };

        // ── Zoom ──────────────────────────────────────────────────────────────
        let currentScaleX = x;
        let currentScaleY = y;

        const redrawAll = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            drawGrid(sx, sy);
            drawADR(sx, sy);
            drawCandles(sx, sy);
            drawTrades(sx, sy);
            drawAxes(sx, sy);
        };

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

                redrawAll(currentScaleX, currentScaleY);
            });

        zoomBehaviorRef.current = zoom;
        svg.call(zoom as any);

        if (transformRef.current !== d3.zoomIdentity) {
            svg.call(zoom.transform, transformRef.current);
        } else {
            redrawAll(x, y);
        }

        // ── Crosshair ─────────────────────────────────────────────────────────
        const crosshair = mainG.append('g').attr('class', 'crosshair').style('display', 'none');
        crosshair.append('line').attr('class', 'v-line').attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-dasharray', '3,3');
        crosshair.append('line').attr('class', 'h-line').attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-dasharray', '3,3');
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

                crosshair.select('.v-line').attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', heightChart);
                crosshair.select('.h-line').attr('y1', cy).attr('y2', cy).attr('x1', 0).attr('x2', widthChart);

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

    }, [data, dimensions, symbol]);

    const handleResetChart = () => {
        if (!svgRef.current || !zoomBehaviorRef.current) return;
        const svg = d3.select(svgRef.current);

        svg.transition()
            .duration(750)
            .call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity);

        isAutoPricedRef.current = true;
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#0a0c10]/40 rounded-3xl border border-white/5 backdrop-blur-sm cursor-crosshair">
                    {/* Top Bar */}
                    <div className="absolute top-3 left-4 z-10 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold text-white uppercase tracking-widest">{symbol}</span>
                        </div>
                    </div>

                    <svg ref={svgRef} className="w-full h-full block" />
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-48 bg-[#0a0c10] border border-white/10 text-slate-200">
                <ContextMenuItem onClick={handleResetChart} className="hover:bg-white/5 cursor-pointer focus:bg-white/5 focus:text-white transition-colors">
                    Reset Chart View
                </ContextMenuItem>
                <ContextMenuSeparator className="bg-white/5" />
                <ContextMenuItem className="hover:bg-white/5 cursor-pointer text-slate-400 focus:bg-white/5 focus:text-white transition-colors">
                    Add Alert...
                </ContextMenuItem>
                <ContextMenuItem className="hover:bg-white/5 cursor-pointer text-slate-400 focus:bg-white/5 focus:text-white transition-colors">
                    Algorithm Settings
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

export default AlgoRealtimeChart;
