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
    focusIndex?: number;
    onCandleClick?: (index: number) => void;
}

const AlgoRealtimeChart: React.FC<AlgoRealtimeChartProps> = ({ data, height, symbol, trades, focusIndex, onCandleClick }) => {
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
        svg.selectAll('*').remove(); // Clear previous drawings

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

        // ── Static Layers (Containers) ───────────────────────────────────────
        const gridG = chartArea.append('g').attr('class', 'grid');
        const adrG = chartArea.append('g').attr('class', 'adr-lines');
        const emaG = chartArea.append('g').attr('class', 'ema-lines');
        const gapG = chartArea.append('g').attr('class', 'gap-zones');
        const levelG = chartArea.append('g').attr('class', 'structural-levels');
        const swingG = chartArea.append('g').attr('class', 'swing-elements');
        const candleG = chartArea.append('g').attr('class', 'candles');
        const tradeG = chartArea.append('g').attr('class', 'trades');
        const xAxisG = mainG.append('g').attr('transform', `translate(0,${heightChart})`);
        const yAxisG = mainG.append('g').attr('transform', `translate(${widthChart},0)`);

        // ── Drawing Functions ───────────────────────────────────────────────

        const drawGrid = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            gridG.html('');
            gridG.selectAll('.v-grid').data(sx.ticks(10)).join('line')
                .attr('x1', d => sx(d)).attr('x2', d => sx(d))
                .attr('y1', 0).attr('y2', heightChart)
                .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);

            gridG.selectAll('.h-grid').data(sy.ticks(10)).join('line')
                .attr('x1', 0).attr('x2', widthChart)
                .attr('y1', d => sy(d)).attr('y2', d => sy(d))
                .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);
        };

        const drawADR = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const adrPoints = [
                { key: 'adr3h', color: '#FF0000' }, { key: 'adr2h', color: '#FF4000' },
                { key: 'adr1h', color: '#FF8000' }, { key: 'adr1l', color: '#80FF00' },
                { key: 'adr2l', color: '#00FF00' }, { key: 'adr3l', color: '#00FF80' },
                { key: 'open', color: '#808080' }
            ];
            adrG.selectAll('.adr-line').data(adrPoints).join('path')
                .attr('class', 'adr-line').attr('fill', 'none').attr('stroke', d => d.color)
                .attr('stroke-width', d => d.key === 'open' ? 2 : 1).attr('opacity', 0.5)
                .attr('d', d => {
                    const lineGen = d3.line<any>().defined(item => item.adr && item.adr[d.key] > 0)
                        .x((_, i) => sx(i)).y(item => sy(item.adr[d.key]));
                    return lineGen(data) as string;
                });
        };

        const drawEMA = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const emas = [
                { key: 'ema20', color: '#3b82f6', dash: '3,2' },
                { key: 'ema50', color: '#8b5cf6', dash: '0' }
            ];
            emaG.selectAll('.ema-line').data(emas).join('path')
                .attr('class', 'ema-line').attr('fill', 'none').attr('stroke', d => d.color)
                .attr('stroke-dasharray', d => d.dash).attr('opacity', 0.4)
                .attr('d', d => {
                    const lineGen = d3.line<any>().defined(item => item[d.key] > 0)
                        .x((_, i) => sx(i)).y(item => sy(item[d.key]));
                    return lineGen(data) as string;
                });
        };

        const drawStructuralLevels = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            levelG.html('');
            gapG.html('');
            const days: any[] = [];
            data.forEach((d, i) => {
                const date = new Date(d.time * 1000 + 330 * 60000).toISOString().split('T')[0];
                if (days.length === 0 || days[days.length - 1].date !== date) days.push({ date, candles: [d], start: i });
                else days[days.length - 1].candles.push(d);
            });

            days.forEach((day, idx) => {
                if (idx === 0) return;
                const prev = days[idx - 1];
                const pdh = d3.max(prev.candles, (c: any) => c.high)!;
                const pdl = d3.min(prev.candles, (c: any) => c.low)!;
                const pdc = prev.candles[prev.candles.length - 1].close;
                const openToday = day.candles[0].open;
                const start = day.start;
                const end = start + day.candles.length - 1;

                (levelG as any).append('line')
                    .attr('x1', sx(start)).attr('x2', sx(end))
                    .attr('y1', sy(pdh)).attr('y2', sy(pdh))
                    .attr('stroke', '#ef4444').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);

                (levelG as any).append('text')
                    .attr('x', sx(start)).attr('y', sy(pdh) - 5)
                    .attr('fill', '#ef4444').style('font-size', '9px').text('PDH');

                (levelG as any).append('line')
                    .attr('x1', sx(start)).attr('x2', sx(end))
                    .attr('y1', sy(pdl)).attr('y2', sy(pdl))
                    .attr('stroke', '#10b981').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);

                (levelG as any).append('text')
                    .attr('x', sx(start)).attr('y', sy(pdl) + 12)
                    .attr('fill', '#10b981').style('font-size', '9px').text('PDL');

                if (Math.abs(openToday - pdc) > 10) {
                    gapG.append('rect')
                        .attr('x', sx(start) as any)
                        .attr('width', Math.max(5, sx(start + 5) - sx(start)) as any)
                        .attr('y', sy(Math.max(openToday, pdc)) as any)
                        .attr('height', Math.abs(sy(openToday) - sy(pdc)) as any)
                        .attr('fill', openToday > pdc ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)');
                }
            });
        };

        const drawSwingsAndFakeouts = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            swingG.html('');
            const pivots: any[] = [];
            const str = 10;
            for (let i = str; i < data.length - str; i++) {
                const c = data[i];
                const win = data.slice(i - str, i + str + 1);
                if (win.every(x => c.high >= x.high)) pivots.push({ idx: i, type: 'high', val: c.high });
                if (win.every(x => c.low <= x.low)) pivots.push({ idx: i, type: 'low', val: c.low });
            }

            pivots.forEach(p => {
                let brIdx = -1;
                for (let j = p.idx + 1; j < data.length; j++) {
                    if ((p.type === 'high' && data[j].high > p.val) || (p.type === 'low' && data[j].low < p.val)) { brIdx = j; break; }
                }
                const endPos = brIdx === -1 ? data.length - 1 : brIdx;
                if (endPos - p.idx > 10 || brIdx === -1) {
                    swingG.append('line').attr('x1', sx(p.idx)).attr('x2', sx(endPos)).attr('y1', sy(p.val)).attr('y2', sy(p.val))
                        .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-dasharray', '2,2');
                }
                if (brIdx !== -1 && brIdx < data.length - 1) {
                    const cb = (p.type === 'high' && data[brIdx].close < p.val) || (p.type === 'low' && data[brIdx].close > p.val);
                    if (cb) {
                        swingG.append('circle').attr('cx', sx(brIdx)).attr('cy', sy(p.val)).attr('r', 6).attr('fill', 'none').attr('stroke', '#eab308').attr('stroke-width', 2);
                        swingG.append('text').attr('x', sx(brIdx) + 8).attr('y', sy(p.val) + 4).attr('fill', '#eab308').style('font-size', '8px').text('S/R');
                    }
                }
            });
        };

        const drawCandles = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            const bw = (sx(1) - sx(0)) * 0.8;
            const selection = candleG.selectAll('.candle').data(data, (d: any) => d.time);
            const enter = selection.enter().append('g').attr('class', 'candle');
            enter.append('line').attr('class', 'wick');
            enter.append('rect').attr('class', 'body');
            enter.append('rect').attr('class', 'click-region').attr('fill', 'transparent').style('cursor', 'pointer');

            const update = selection.merge(enter as any);
            update.attr('transform', (d, i) => `translate(${sx(i)}, 0)`)
                .style('display', (d, i) => {
                    const xP = sx(i);
                    return (xP >= -20 && xP <= widthChart + 20) ? null : 'none';
                });

            update.select('.wick').attr('x1', 0).attr('x2', 0).attr('y1', d => sy(d.high)).attr('y2', d => sy(d.low))
                .attr('stroke', d => d.close >= d.open ? '#10b981' : '#f43f5e');

            update.select('.body').attr('x', -bw / 2).attr('width', Math.max(1, bw))
                .attr('y', d => sy(Math.max(d.open, d.close)))
                .attr('height', d => Math.max(1, Math.abs(sy(d.open) - sy(d.close))))
                .attr('fill', d => d.close >= d.open ? '#10b981' : '#f43f5e');

            update.select('.click-region').attr('x', -Math.max(5, bw / 2)).attr('width', Math.max(10, bw))
                .attr('y', d => sy(d.high)).attr('height', d => Math.max(10, Math.abs(sy(d.low) - sy(d.high))))
                .on('click', (e, d) => {
                    if (onCandleClick) {
                        e.stopPropagation();
                        const idx = data.findIndex(x => x.time === d.time);
                        if (idx !== -1) onCandleClick(idx);
                    }
                });

            selection.exit().remove();
        };

        const drawTrades = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            if (!trades) return;
            const markers: any[] = [];
            trades.forEach(t => {
                const idx = data.findIndex(d => d.time === t.entryTimestamp);
                if (idx !== -1) markers.push({ idx, isLong: t.type === 'LONG', id: t.id, price: t.type === 'LONG' ? data[idx].low : data[idx].high });
            });
            tradeG.selectAll('.trade-marker').data(markers).join('path').attr('class', 'trade-marker')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(60) as any)
                .attr('fill', d => d.isLong ? '#10b981' : '#f43f5e')
                .attr('transform', d => `translate(${sx(d.idx)}, ${d.isLong ? sy(d.price) + 15 : sy(d.price) - 15}) rotate(${d.isLong ? 0 : 180})`);
        };

        const drawAxes = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            xAxisG.call(d3.axisBottom(sx).ticks(5).tickFormat(d => {
                const i = Number(d);
                if (!data[i]) return '';
                return d3.timeFormat('%H:%M')(new Date(data[i].time * 1000 + 330 * 60000));
            }) as any).select('.domain').remove();
            yAxisG.call(d3.axisRight(sy).ticks(10).tickFormat(d3.format('.1f')) as any).select('.domain').remove();
            xAxisG.selectAll('text').attr('fill', '#64748b').style('font-size', '10px');
            yAxisG.selectAll('text').attr('fill', '#64748b').style('font-size', '10px');
        };

        const redrawAll = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            drawGrid(sx, sy);
            drawADR(sx, sy);
            drawEMA(sx, sy);
            drawStructuralLevels(sx, sy);
            drawSwingsAndFakeouts(sx, sy);
            drawCandles(sx, sy);
            drawTrades(sx, sy);
            drawAxes(sx, sy);
        };

        // ── Interaction ─────────────────────────────────────────────────────
        let currentScaleX = x;
        let currentScaleY = y.copy();

        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
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

        svg.call(zoomBehavior as any);
        zoomBehaviorRef.current = zoomBehavior;

        // Y-axis drag
        const yDrag = d3.drag<SVGRectElement, unknown>().on('drag', (e) => {
            isAutoPricedRef.current = false;
            const factor = Math.pow(1.1, -e.dy / 10);
            const [min, max] = currentScaleY.domain();
            const center = currentScaleY.invert(e.y);
            currentScaleY.domain([center - (center - min) * factor, center + (max - center) * factor]);
            redrawAll(currentScaleX, currentScaleY);
        });

        const yArea = mainG.append('rect').attr('x', widthChart).attr('width', margin.right).attr('height', heightChart).attr('fill', 'transparent').style('cursor', 'ns-resize');
        yArea.call(yDrag as any);

        if (transformRef.current !== d3.zoomIdentity) svg.call(zoomBehavior.transform, transformRef.current);
        else if (focusIndex !== undefined && focusIndex >= 0) {
            const targetScale = 20;
            const targetX = widthChart / 2 - x(focusIndex) * targetScale;
            svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(targetX, 0).scale(targetScale));
        }
        else redrawAll(x, y);

    }, [data, dimensions, trades, onCandleClick, focusIndex]);

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#0a0c10]/40 rounded-3xl border border-white/5 backdrop-blur-sm cursor-crosshair">
                    <svg ref={svgRef} className="w-full h-full block" />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48 bg-[#0a0c10] border border-white/10 text-slate-200">
                <ContextMenuItem onClick={() => isAutoPricedRef.current = true} className="hover:bg-white/5 cursor-pointer">Reset Auto Price</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

export default AlgoRealtimeChart;
