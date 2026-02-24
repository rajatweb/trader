'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface ChartData {
    index: number; // Mandatory for strict spacing inside scaling logic without array shuffling
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

interface D3CandlestickChartProps {
    data: ChartData[];
    ticker?: string;
}

export default function D3CandlestickChart({ data, ticker = 'CHART' }: D3CandlestickChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const isAutoPricedRef = useRef(true);
    const isTrackingEdgeRef = useRef(true);

    useEffect(() => {
        const observeTarget = containerRef.current;
        if (!observeTarget) return;

        const resizeObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width && height && (dimensions.width !== width || dimensions.height !== height)) {
                    setDimensions({ width, height });
                }
            }
        });

        resizeObserver.observe(observeTarget);
        return () => resizeObserver.disconnect();
    }, [dimensions.width, dimensions.height]);

    useEffect(() => {
        if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0 || !data || data.length === 0) return;

        const { width, height } = dimensions;
        const margin = { top: 20, right: 60, bottom: 30, left: 10 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        svg.attr('width', width).attr('height', height);

        svg.append('defs').append('clipPath')
            .attr('id', 'chart-clip')
            .append('rect')
            .attr('width', innerWidth)
            .attr('height', innerHeight);

        const rootGroup = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Use scaleLinear mapped to Array Index for continuous smooth X-axis zooming (Market hours only)
        const x = d3.scaleLinear().domain([0, data.length]).range([0, innerWidth]);

        const priceMin = d3.min(data, d => d.low) || 0;
        const priceMax = d3.max(data, d => d.high) || 0;
        const pricePadding = (priceMax - priceMin) * 0.15;
        const y = d3.scaleLinear().domain([priceMin - pricePadding, priceMax + pricePadding]).range([innerHeight, 0]);

        const chartArea = rootGroup.append('g').attr('clip-path', 'url(#chart-clip)');

        // Background Ticker Watermark
        chartArea.append('text')
            .attr('x', 10)
            .attr('y', 40)
            .attr('fill', '#d1d5db')
            .attr('font-size', '36px')
            .attr('font-weight', '900')
            .attr('opacity', 0.1)
            .text(ticker);

        const xAxisGroup = rootGroup.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .attr('class', 'x-axis select-none');

        const yAxisGroup = rootGroup.append('g')
            .attr('transform', `translate(${innerWidth}, 0)`)
            .attr('class', 'y-axis select-none');

        const candleGroup = chartArea.append('g').attr('class', 'candlesticks');

        const drawAxes = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const [startIdx, endIdx] = sx.domain();
            const tickStep = Math.max(1, Math.ceil((endIdx - startIdx) / 10));
            const tickValues = [];
            for (let i = Math.floor(Math.max(0, startIdx)); i <= Math.min(data.length - 1, endIdx); i += tickStep) tickValues.push(i);

            xAxisGroup.call(d3.axisBottom(sx)
                .tickValues(tickValues)
                .tickFormat((idx) => {
                    const d = data[idx as number];
                    if (!d) return '';
                    return d3.timeFormat('%d %b %H:%M')(d.date); // e.g. 23 Feb 15:00
                }) as any)
                .call(g => g.select(".domain").attr("stroke", "#2b3040"))
                .call(g => g.selectAll(".tick line").attr("stroke", "#2b3040"))
                .call(g => g.selectAll(".tick text").attr("fill", "#6b7280").attr("font-size", "10px"));

            yAxisGroup.call(d3.axisRight(sy).ticks(8) as any)
                .call(g => g.select(".domain").attr("stroke", "#2b3040"))
                .call(g => g.selectAll(".tick line")
                    .attr("stroke", "#2b3040")
                    .attr("x2", -innerWidth)
                    .attr("stroke-dasharray", "4,4")
                    .attr('opacity', 0.5)
                )
                .call(g => g.selectAll(".tick text").attr("fill", "#6b7280").attr("font-size", "10px"));
        };

        const drawCandles = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const bandwidth = Math.max(1, (sx(1) - sx(0)) * 0.8);

            const candleSelection = candleGroup.selectAll<SVGGElement, ChartData>('.candle')
                .data(data, (d) => d.date.getTime().toString());

            const enter = candleSelection.enter().append('g').attr('class', 'candle');
            enter.append('line').attr('class', 'wick').attr('stroke-width', 1.5);
            enter.append('rect').attr('class', 'body').attr('rx', 1);

            const update = candleSelection.merge(enter as any);

            update
                .attr('transform', (d) => `translate(${sx(d.index) - bandwidth / 2}, 0)`)
                .style('display', (d) => {
                    const xPos = sx(d.index);
                    return xPos >= -bandwidth && xPos <= innerWidth + bandwidth ? null : 'none';
                });

            update.select('.wick')
                .attr('y1', d => sy(d.high))
                .attr('y2', d => sy(d.low))
                .attr('x1', bandwidth / 2)
                .attr('x2', bandwidth / 2)
                .attr('stroke', d => (d.close >= d.open ? '#00b852' : '#ff4a4a'));

            update.select('.body')
                .attr('y', d => sy(Math.max(d.open, d.close)))
                .attr('height', d => Math.max(1, Math.abs(sy(d.open) - sy(d.close))))
                .attr('width', bandwidth)
                .attr('fill', d => (d.close >= d.open ? '#00b852' : '#ff4a4a'))
                .attr('stroke', d => (d.close >= d.open ? '#00b852' : '#ff4a4a'))
                .attr('stroke-width', 0.5);

            candleSelection.exit().remove();
        };

        const drawLtpLine = (sy: d3.ScaleLinear<number, number>) => {
            rootGroup.selectAll('.ltp-group').remove(); // Clean up previous lines outside clip mask

            if (data.length > 0) {
                const lastCandle = data[data.length - 1];
                const lastY = sy(lastCandle.close);
                const isLastUp = lastCandle.close >= lastCandle.open;
                const color = isLastUp ? '#00b852' : '#ff4a4a';

                if (lastY >= 0 && lastY <= innerHeight) {
                    const ltpG = rootGroup.append('g').attr('class', 'ltp-group');

                    ltpG.append('line')
                        .attr('x1', 0).attr('x2', innerWidth)
                        .attr('y1', lastY).attr('y2', lastY)
                        .attr('stroke', color)
                        .attr('stroke-dasharray', '4,4')
                        .attr('stroke-width', 1)
                        .attr('opacity', 0.8);

                    ltpG.append('rect')
                        .attr('x', innerWidth)
                        .attr('y', lastY - 10)
                        .attr('width', 60).attr('height', 20)
                        .attr('fill', color).attr('rx', 2);

                    ltpG.append('text')
                        .attr('x', innerWidth + 30)
                        .attr('y', lastY + 4)
                        .attr('fill', 'white')
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .attr('text-anchor', 'middle')
                        .text(lastCandle.close.toFixed(2));
                }
            }
        };

        let currentScaleX = x;
        let currentScaleY = y;

        const renderChart = () => {
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
            drawLtpLine(currentScaleY);
        }

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 150])
            .filter(e => !e.button)
            .on('zoom', (e) => {
                if (e.sourceEvent && e.sourceEvent.type !== 'zoom') {
                    // Check if user manually panned away from the right edge
                    const rightEdgeIndex = x.invert(e.transform.invertX(innerWidth));
                    if (rightEdgeIndex < data.length - 1) {
                        isTrackingEdgeRef.current = false;
                    } else {
                        isTrackingEdgeRef.current = true;
                    }
                }

                transformRef.current = e.transform;
                currentScaleX = e.transform.rescaleX(x);
                renderChart();
            });

        let yDragStartDomain: [number, number] | null = null;
        const yAxisZoom = d3.drag<SVGGElement, unknown>()
            .on("start", () => {
                isAutoPricedRef.current = false;
                yDragStartDomain = currentScaleY.domain() as [number, number];
            })
            .on("drag", (e) => {
                if (!yDragStartDomain) return;
                const factor = Math.exp(-e.dy * 0.01);
                const cy = currentScaleY.invert(innerHeight / 2);
                const dMin = cy - (cy - yDragStartDomain[0]) * factor;
                const dMax = cy + (yDragStartDomain[1] - cy) * factor;

                yDragStartDomain = [dMin, dMax];
                currentScaleY.domain(yDragStartDomain);

                currentScaleX = transformRef.current.rescaleX(x);
                renderChart();
            });

        // Add invisible hit rect for the Price axis dragging
        yAxisGroup.append('rect')
            .attr('x', 0).attr('y', 0)
            .attr('width', margin.right).attr('height', innerHeight)
            .attr('fill', 'transparent')
            .style('cursor', 'ns-resize')
            .call(yAxisZoom as any)
            .on("dblclick", () => {
                isAutoPricedRef.current = true;
                currentScaleX = transformRef.current.rescaleX(x);
                renderChart();
            });

        svg.call(zoom as any);

        // --- Core Auto-Tracking & Future Whitespace Logic ---
        const RIGHT_PADDING_CANDLES = 15; // Amount of future whitespace to leave on the right

        if (!transformRef.current || transformRef.current === d3.zoomIdentity) {
            // Initial Zoom setup (first time chart renders)
            const targetVisibleCandles = Math.min(data.length + RIGHT_PADDING_CANDLES, 150);
            const scale = 100 / targetVisibleCandles;
            const targetRightEdgeIndex = data.length - 1 + RIGHT_PADDING_CANDLES;

            // Formula to glue index `targetRightEdgeIndex` to pixel `innerWidth`
            const tx = innerWidth - scale * x(targetRightEdgeIndex);

            transformRef.current = d3.zoomIdentity.translate(tx, 0).scale(scale);
            svg.property("__zoom", transformRef.current);
            isTrackingEdgeRef.current = true;

        } else if (isTrackingEdgeRef.current) {
            // Auto Tracking for Streaming Data
            const k = transformRef.current.k;
            const targetRightEdgeIndex = data.length - 1 + RIGHT_PADDING_CANDLES;
            const tx = innerWidth - k * x(targetRightEdgeIndex);

            transformRef.current = d3.zoomIdentity.translate(tx, 0).scale(k);
            svg.property("__zoom", transformRef.current);
        }

        currentScaleX = transformRef.current.rescaleX(x);
        renderChart();

    }, [data, dimensions, ticker]);

    return (
        <div ref={containerRef} className="w-full h-full relative font-sans overflow-hidden">
            <svg ref={svgRef} className="w-full h-full absolute inset-0 block cursor-crosshair" />
        </div>
    );
}
