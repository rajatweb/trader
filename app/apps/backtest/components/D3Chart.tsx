'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

export interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface D3ChartProps {
    data: OHLCV[];
    height?: number;
}

const D3Chart: React.FC<D3ChartProps> = ({ data, height }) => {
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
            .domain([0, data.length])
            .range([0, widthChart]);

        const priceMin = d3.min(data, d => d.low)!;
        const priceMax = d3.max(data, d => d.high)!;
        const pricePadding = (priceMax - priceMin) * 0.1;
        const y = d3.scaleLinear()
            .domain([priceMin - pricePadding, priceMax + pricePadding])
            .range([heightChart, 0]);

        // Clip Path
        svg.append('defs').append('clipPath')
            .attr('id', 'chart-clip')
            .append('rect')
            .attr('width', widthChart)
            .attr('height', heightChart);

        const chartArea = mainG.append('g')
            .attr('clip-path', 'url(#chart-clip)');

        // Grid lines
        const gridG = chartArea.append('g').attr('class', 'grid');
        const drawGrid = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            gridG.selectAll('*').remove();

            // Horizontal grid
            const ticks = sy.ticks(10);
            gridG.selectAll('.h-grid')
                .data(ticks)
                .join('line')
                .attr('x1', 0)
                .attr('x2', widthChart)
                .attr('y1', d => sy(d))
                .attr('y2', d => sy(d))
                .attr('stroke', '#f0f0f0')
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
                .attr('stroke', d => d.close >= d.open ? '#26a69a' : '#ef5350')
                .attr('stroke-width', 1);

            update.select('.body')
                .attr('width', Math.max(1, bandwidth))
                .attr('y', d => sy(Math.max(d.open, d.close)))
                .attr('height', d => Math.max(0.5, Math.abs(sy(d.open) - sy(d.close))))
                .attr('fill', d => d.close >= d.open ? '#26a69a' : '#ef5350')
                .attr('rx', 1);

            selection.exit().remove();
        };

        // Axes
        const xAxisG = mainG.append('g').attr('transform', `translate(0,${heightChart})`);
        const yAxisG = mainG.append('g').attr('transform', `translate(${widthChart},0)`);

        const drawAxes = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const timeFormat = d3.timeFormat('%H:%M');

            // X-Axis - Simplified for index-based data
            const [start, end] = sx.domain();
            const step = Math.ceil((end - start) / 8);
            const tickIndices = [];
            for (let i = Math.floor(start); i <= end; i += step) tickIndices.push(i);

            xAxisG.call(d3.axisBottom(sx)
                .tickValues(tickIndices.filter(i => data[i]))
                .tickFormat(val => {
                    const i = Number(val);
                    const item = data[i];
                    return item ? timeFormat(new Date(item.time * 1000)) : '';
                }) as any)
                .select('.domain').remove();

            xAxisG.selectAll('text').attr('fill', '#94a3b8').style('font-size', '10px');

            // Y-Axis
            yAxisG.call(d3.axisRight(sy).tickSize(0).tickPadding(8) as any).select('.domain').remove();
            yAxisG.selectAll('text').attr('fill', '#94a3b8').style('font-size', '10px');
        };

        // Zoom Behavior
        let currentScaleX = x;
        let currentScaleY = y;

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 50])
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
                drawAxes(currentScaleX, currentScaleY);
                drawGrid(currentScaleX, currentScaleY);
            });

        svg.call(zoom as any);

        if (transformRef.current !== d3.zoomIdentity) {
            svg.call(zoom.transform, transformRef.current);
        } else {
            // Initial Draw
            drawCandles(x, y);
            drawAxes(x, y);
            drawGrid(x, y);
        }

        // Crosshair
        const crosshair = mainG.append('g').attr('class', 'crosshair').style('display', 'none');
        const vLine = crosshair.append('line').attr('stroke', '#cbd5e1').attr('stroke-dasharray', '3,3');
        const hLine = crosshair.append('line').attr('stroke', '#cbd5e1').attr('stroke-dasharray', '3,3');

        svg.on('mousemove', (e) => {
            const [mx, my] = d3.pointer(e);
            const cx = mx - margin.left;
            const cy = my - margin.top;

            if (cx >= 0 && cx <= widthChart && cy >= 0 && cy <= heightChart) {
                crosshair.style('display', null);
                vLine.attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', heightChart);
                hLine.attr('y1', cy).attr('y2', cy).attr('x1', 0).attr('x2', widthChart);
            } else {
                crosshair.style('display', 'none');
            }
        });

        svg.on('mouseleave', () => crosshair.style('display', 'none'));

    }, [data, dimensions]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-white">
            <svg ref={svgRef} className="w-full h-full block" />
        </div>
    );
};

export default D3Chart;
