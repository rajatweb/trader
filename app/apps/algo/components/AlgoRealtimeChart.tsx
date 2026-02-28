
'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AlgoSignal } from '@/lib/algo/types';
import { computeSuperTrend } from '@/lib/algo/supertrendStrategy';

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
    activeStrategy?: 'PDLS_VIX' | 'SL_HUNT' | 'SUPERTREND';
}

// ─────────────────────────────────────────────────────────────────────────────
// Swing Detection
// ─────────────────────────────────────────────────────────────────────────────

interface SwingLevel {
    index: number;
    price: number;
    type: 'HIGH' | 'LOW';
    strength: number; // how many bars on each side confirm it
}

function detectSwings(data: OHLCV[], lookback = 5): SwingLevel[] {
    const swings: SwingLevel[] = [];
    for (let i = lookback; i < data.length - lookback; i++) {
        const slice = data.slice(i - lookback, i + lookback + 1);
        const centerHigh = data[i].high;
        const centerLow = data[i].low;

        // Swing High: highest high in window
        if (centerHigh === Math.max(...slice.map(c => c.high))) {
            swings.push({ index: i, price: centerHigh, type: 'HIGH', strength: lookback });
        }
        // Swing Low: lowest low in window
        if (centerLow === Math.min(...slice.map(c => c.low))) {
            swings.push({ index: i, price: centerLow, type: 'LOW', strength: lookback });
        }
    }
    return swings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Equal High/Low Detection (within tolerance)
// ─────────────────────────────────────────────────────────────────────────────

interface EqualLevel {
    price: number;
    count: number;
    type: 'HIGH' | 'LOW';
    indices: number[];
}

function detectEqualLevels(swings: SwingLevel[], tol = 0.002): EqualLevel[] {
    const grouped: EqualLevel[] = [];
    const used = new Set<number>();

    swings.forEach((s, i) => {
        if (used.has(i)) return;
        const matches = swings.filter((s2, j) => !used.has(j) && s2.type === s.type && Math.abs(s2.price - s.price) / s.price < tol);
        if (matches.length >= 2) {
            matches.forEach((_, idx) => used.add(swings.indexOf(matches[idx])));
            grouped.push({
                price: matches.reduce((a, m) => a + m.price, 0) / matches.length,
                count: matches.length,
                type: s.type,
                indices: matches.map(m => m.index)
            });
        }
    });

    return grouped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's range detection
// ─────────────────────────────────────────────────────────────────────────────

function getTodayRange(data: OHLCV[]) {
    const today = new Date().toISOString().split('T')[0];
    const todayCandles = data.filter(c => {
        const d = new Date(c.time * 1000).toISOString().split('T')[0];
        return d === today;
    });
    if (todayCandles.length === 0) return { high: null, low: null, open: null, startIdx: -1 };
    return {
        high: Math.max(...todayCandles.map(c => c.high)),
        low: Math.min(...todayCandles.map(c => c.low)),
        open: todayCandles[0].open,
        startIdx: data.indexOf(todayCandles[0])
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const AlgoRealtimeChart: React.FC<AlgoRealtimeChartProps> = ({ data, signals = [], zones = [], height, symbol, activeStrategy = 'PDLS_VIX' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const isAutoPricedRef = useRef(true);

    // Overlay toggles
    const [showSwings, setShowSwings] = useState(true);
    const [showEqLvls, setShowEqLvls] = useState(true);
    const [showZones, setShowZones] = useState(true);
    const [showToday, setShowToday] = useState(true);
    const [showST, setShowST] = useState(true);  // SuperTrend

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

        const latestData = data.slice(-Math.min(data.length, 2000));
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

        // ── Pre-compute overlays ─────────────────────────────────────────────
        const recentData = data.slice(-120);            // last 2h of 1m candles
        const swings = detectSwings(recentData, 5);
        const eqLevels = detectEqualLevels(swings, 0.002);
        const todayRange = getTodayRange(data);

        // SuperTrend (7,3) on 5-min candles — only when SUPERTREND strategy active
        const stData = activeStrategy === 'SUPERTREND' ? computeSuperTrend(data) : [];

        // Map recentData indices back to full data indices
        const recentOffset = data.length - recentData.length;

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

        // ── Today's Session Band ─────────────────────────────────────────────
        const todayG = chartArea.append('g').attr('class', 'today-band');
        const drawToday = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            todayG.selectAll('*').remove();
            if (!showToday || todayRange.startIdx < 0 || !todayRange.high || !todayRange.low) return;

            // Today's session background band
            const xStart = sx(todayRange.startIdx);
            const xEnd = sx(data.length - 1);
            todayG.append('rect')
                .attr('x', xStart).attr('width', Math.max(0, xEnd - xStart))
                .attr('y', 0).attr('height', heightChart)
                .attr('fill', 'rgba(99,102,241,0.03)');

            // Today's Open line
            if (todayRange.open) {
                todayG.append('line')
                    .attr('x1', xStart).attr('x2', widthChart)
                    .attr('y1', sy(todayRange.open)).attr('y2', sy(todayRange.open))
                    .attr('stroke', '#818cf8').attr('stroke-dasharray', '3,4')
                    .attr('stroke-width', 1).attr('opacity', 0.6);
                todayG.append('text')
                    .attr('x', widthChart + 2).attr('y', sy(todayRange.open) + 3)
                    .attr('fill', '#818cf8').attr('font-size', '9px').attr('font-weight', 'bold')
                    .text(`Open ${todayRange.open.toFixed(0)}`);
            }

            // Today's High (Day High band)
            const dyH = sy(todayRange.high);
            todayG.append('line')
                .attr('x1', xStart).attr('x2', widthChart)
                .attr('y1', dyH).attr('y2', dyH)
                .attr('stroke', '#34d399').attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '6,3').attr('opacity', 0.7);
            todayG.append('text')
                .attr('x', widthChart + 2).attr('y', dyH + 3)
                .attr('fill', '#34d399').attr('font-size', '9px').attr('font-weight', 'bold')
                .text(`D.High ${todayRange.high.toFixed(0)}`);

            // Today's Low
            const dyL = sy(todayRange.low);
            todayG.append('line')
                .attr('x1', xStart).attr('x2', widthChart)
                .attr('y1', dyL).attr('y2', dyL)
                .attr('stroke', '#fb7185').attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '6,3').attr('opacity', 0.7);
            todayG.append('text')
                .attr('x', widthChart + 2).attr('y', dyL + 3)
                .attr('fill', '#fb7185').attr('font-size', '9px').attr('font-weight', 'bold')
                .text(`D.Low ${todayRange.low.toFixed(0)}`);
        };

        // ── PDLS Zones (PDH, PDL, Swings, Retail SL) ─────────────────────────
        const levelG = chartArea.append('g').attr('class', 'levels');
        const drawLevels = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            levelG.selectAll('*').remove();
            if (!showZones) return;

            const allZones = zones.filter(z => !z.description.includes('Retail')); // separate treatment

            allZones.forEach(zone => {
                if (!zone.price || zone.price <= 0) return;
                const yPos = sy(zone.price);
                if (yPos < -20 || yPos > heightChart + 20) return;

                const isPDH = zone.description === 'PDH';
                const isPDL = zone.description === 'PDL';
                const isPDC = zone.description === 'PDC';
                const isSH = zone.description === 'Swing High';
                const isSL = zone.description === 'Swing Low';
                const isWH = zone.description.includes('Weekly High');
                const isWL = zone.description.includes('Weekly Low');
                const isEqH = zone.description === 'Equal Highs';
                const isEqL = zone.description === 'Equal Lows';

                const color = isPDH || isWH ? '#f43f5e'
                    : isPDL || isWL ? '#10b981'
                        : isPDC ? '#818cf8'
                            : isSH ? '#fb923c'
                                : isSL ? '#4ade80'
                                    : isEqH ? '#fbbf24'
                                        : isEqL ? '#fbbf24'
                                            : '#64748b';

                const dashArray = isPDH || isPDL || isWH || isWL ? 'none' : '5,4';
                const strokeW = isWH || isWL ? 2.5 : isPDH || isPDL ? 2 : 1;
                const opacity = isWH || isWL ? 0.9 : isPDH || isPDL ? 0.75 : 0.5;
                const labelShort = zone.description.length > 14 ? zone.description.slice(0, 14) : zone.description;

                // Liquidity band (PDH/PDL ±0.05% zone)
                if (isPDH || isPDL) {
                    const bandH = Math.abs(sy(zone.price * 0.9995) - sy(zone.price)); // ~11pts
                    levelG.append('rect')
                        .attr('x', 0).attr('width', widthChart)
                        .attr('y', yPos - (isPDH ? bandH : 0))
                        .attr('height', bandH)
                        .attr('fill', color)
                        .attr('opacity', 0.06);
                }

                levelG.append('line')
                    .attr('x1', 0).attr('x2', widthChart)
                    .attr('y1', yPos).attr('y2', yPos)
                    .attr('stroke', color).attr('stroke-width', strokeW)
                    .attr('stroke-dasharray', dashArray)
                    .attr('opacity', opacity);

                // Label with price
                const labelText = `${zone.description} ${zone.price.toFixed(0)}`;
                levelG.append('text')
                    .attr('x', widthChart + 2).attr('y', yPos + 3)
                    .attr('fill', color).attr('font-size', isPDH || isPDL ? '9px' : '8px')
                    .attr('font-weight', 'bold')
                    .text(labelText);

                // Arrow/triangle at PDH/PDL to highlight liquidity
                if (isPDH) {
                    levelG.append('polygon')
                        .attr('points', `${widthChart - 8},${yPos - 6} ${widthChart},${yPos} ${widthChart - 8},${yPos + 6}`)
                        .attr('fill', color).attr('opacity', 0.6);
                } else if (isPDL) {
                    levelG.append('polygon')
                        .attr('points', `${widthChart - 8},${yPos - 6} ${widthChart},${yPos} ${widthChart - 8},${yPos + 6}`)
                        .attr('fill', color).attr('opacity', 0.6);
                }
            });

            // Retail SL Zones as faint bands
            zones.filter(z => z.description.includes('Retail')).forEach(zone => {
                if (!zone.price) return;
                const yPos = sy(zone.price);
                if (yPos < -20 || yPos > heightChart + 20) return;
                const isBull = zone.description.includes('Longs');
                levelG.append('rect')
                    .attr('x', 0).attr('width', widthChart)
                    .attr('y', yPos - 2).attr('height', 4)
                    .attr('fill', isBull ? '#fb923c' : '#a78bfa')
                    .attr('opacity', 0.15);
                levelG.append('text')
                    .attr('x', 8).attr('y', yPos - 3)
                    .attr('fill', isBull ? '#fb923c' : '#a78bfa')
                    .attr('font-size', '8px').attr('opacity', 0.7)
                    .text(isBull ? '⚡ Stop Hunt Zone (Shorts buy here)' : '⚡ Stop Hunt Zone (Longs sell here)');
            });
        };

        // ── Recent Swing High/Low markers ───────────────────────────────────
        const swingG = chartArea.append('g').attr('class', 'swings');
        const drawSwings = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            swingG.selectAll('*').remove();
            if (!showSwings) return;

            // Only draw last N swings to avoid clutter
            const recentSwings = swings.slice(-20);

            recentSwings.forEach((sw, i) => {
                const fullIdx = recentOffset + sw.index;
                const xPos = sx(fullIdx);
                const yPos = sy(sw.price);

                if (xPos < -20 || xPos > widthChart + 20) return;
                if (yPos < -20 || yPos > heightChart + 20) return;

                const isHigh = sw.type === 'HIGH';
                const color = isHigh ? '#fb923c' : '#34d399';
                const offset = isHigh ? -10 : 10;

                // Diamond marker
                swingG.append('polygon')
                    .attr('points', `${xPos},${yPos + offset - 5} ${xPos + 4},${yPos + offset} ${xPos},${yPos + offset + 5} ${xPos - 4},${yPos + offset}`)
                    .attr('fill', color).attr('opacity', 0.8);

                // Price label on significant swings
                if (i % 2 === 0) {
                    swingG.append('text')
                        .attr('x', xPos).attr('y', yPos + offset + (isHigh ? -8 : 16))
                        .attr('text-anchor', 'middle')
                        .attr('fill', color).attr('font-size', '8px').attr('font-weight', 'bold')
                        .attr('opacity', 0.9)
                        .text(sw.price.toFixed(0));
                }
            });
        };

        // ── Equal Highs / Equal Lows ─────────────────────────────────────────
        const eqG = chartArea.append('g').attr('class', 'equal-levels');
        const drawEqualLevels = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            eqG.selectAll('*').remove();
            if (!showEqLvls) return;

            eqLevels.forEach(eq => {
                const yPos = sy(eq.price);
                if (yPos < -20 || yPos > heightChart + 20) return;

                const color = '#fbbf24';
                const firstIdx = recentOffset + Math.min(...eq.indices);
                const lastIdx = recentOffset + Math.max(...eq.indices);
                const xStart = sx(firstIdx);
                const xEnd = Math.max(sx(lastIdx), xStart + 20);

                // Dashed line connecting equal level touches
                eqG.append('line')
                    .attr('x1', xStart).attr('x2', xEnd)
                    .attr('y1', yPos).attr('y2', yPos)
                    .attr('stroke', color)
                    .attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '3,3')
                    .attr('opacity', 0.7);

                // Label
                const label = `EQ ${eq.type === 'HIGH' ? 'H' : 'L'} ×${eq.count}`;
                eqG.append('text')
                    .attr('x', xEnd + 4).attr('y', yPos + 3)
                    .attr('fill', color).attr('font-size', '8px').attr('font-weight', 'bold')
                    .attr('opacity', 0.8)
                    .text(label);

                // Dot markers at each touch point
                eq.indices.forEach(idx => {
                    const xDot = sx(recentOffset + idx);
                    eqG.append('circle')
                        .attr('cx', xDot).attr('cy', yPos)
                        .attr('r', 2.5)
                        .attr('fill', color).attr('opacity', 0.9);
                });
            });
        };

        // ── SuperTrend Overlay ────────────────────────────────────────────────
        const stG = chartArea.append('g').attr('class', 'supertrend');
        const drawSuperTrend = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            stG.selectAll('*').remove();
            if (!showST || stData.length === 0) return;

            // Draw colored segments (green UP, red DOWN)
            let segStart = 0;
            while (segStart < stData.length) {
                const dir = stData[segStart].direction;
                let segEnd = segStart;
                while (segEnd < stData.length - 1 && stData[segEnd + 1].direction === dir) segEnd++;

                // Build path points for this segment
                const pts: [number, number][] = [];
                for (let k = segStart; k <= segEnd; k++) {
                    const xPos = sx(k);
                    if (stData[k].value <= 0) { segStart = segEnd + 1; continue; }
                    pts.push([xPos, sy(stData[k].value)]);
                }

                if (pts.length >= 2) {
                    const lineGen = d3.line<[number, number]>().x(d => d[0]).y(d => d[1]).curve(d3.curveMonotoneX);
                    stG.append('path')
                        .datum(pts)
                        .attr('d', lineGen)
                        .attr('stroke', dir === 'UP' ? '#10b981' : '#f43f5e')
                        .attr('stroke-width', 2)
                        .attr('fill', 'none')
                        .attr('opacity', 0.85)
                        .attr('stroke-linecap', 'round');
                }

                segStart = segEnd + 1;
            }

            // Flip circles + labels at direction change points
            stData.forEach((pt, i) => {
                if (!pt.flip || pt.value <= 0) return;
                const xPos = sx(i);
                const yPos = sy(pt.value);
                if (xPos < -10 || xPos > widthChart + 10) return;

                const isUp = pt.direction === 'UP';
                const color = isUp ? '#10b981' : '#f43f5e';
                const label = isUp ? '▲ CE' : '▼ PE';
                const offsetY = isUp ? 14 : -14;

                // Outer glow ring
                stG.append('circle')
                    .attr('cx', xPos).attr('cy', yPos)
                    .attr('r', 8)
                    .attr('fill', color).attr('opacity', 0.15);

                // Solid dot
                stG.append('circle')
                    .attr('cx', xPos).attr('cy', yPos)
                    .attr('r', 4)
                    .attr('fill', color).attr('stroke', '#0a0c10').attr('stroke-width', 1.5);

                // Label
                stG.append('text')
                    .attr('x', xPos).attr('y', yPos + offsetY)
                    .attr('text-anchor', 'middle')
                    .attr('fill', color)
                    .attr('font-size', '9px').attr('font-weight', 'bold')
                    .attr('opacity', 0.95)
                    .text(label);
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

        // ── Signal Markers with Target & SL lines ────────────────────────────
        const signalG = chartArea.append('g').attr('class', 'signals');
        const drawSignals = (sx: d3.ScaleLinear<number, number>, sy: d3.ScaleLinear<number, number>) => {
            signalG.selectAll('*').remove();

            signals.forEach(sig => {
                const index = data.findIndex(d => Math.abs(d.time - sig.timestamp / 1000) < 60);
                if (index === -1) return;

                const xPos = sx(index);
                const yPos = sy(sig.price);

                const color = sig.type === 'BUY' ? '#10b981' : '#f43f5e';
                const offset = sig.type === 'BUY' ? 18 : -18;

                // Triangle marker
                signalG.append('path')
                    .attr('d', d3.symbol().type(d3.symbolTriangle).size(120)())
                    .attr('transform', `translate(${xPos}, ${yPos + offset}) ${sig.type === 'SELL' ? 'rotate(180)' : ''}`)
                    .attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1);

                // Vertical entry line
                signalG.append('line')
                    .attr('x1', xPos).attr('x2', xPos)
                    .attr('y1', 0).attr('y2', heightChart)
                    .attr('stroke', color).attr('stroke-dasharray', '3,5')
                    .attr('stroke-width', 0.8).attr('opacity', 0.3);

                // Target line (green)
                if ((sig as any).targetPoints && sig.price > 0) {
                    const tpPrice = sig.price + ((sig as any).targetPoints ?? 50);
                    const tpY = sy(tpPrice);
                    const slPrice = sig.price - ((sig as any).slPoints ?? 30);
                    const slY = sy(slPrice);

                    // TP
                    signalG.append('line')
                        .attr('x1', xPos).attr('x2', widthChart)
                        .attr('y1', tpY).attr('y2', tpY)
                        .attr('stroke', '#10b981').attr('stroke-width', 1)
                        .attr('stroke-dasharray', '4,3').attr('opacity', 0.6);
                    signalG.append('text')
                        .attr('x', widthChart + 2).attr('y', tpY + 3)
                        .attr('fill', '#10b981').attr('font-size', '8px').attr('font-weight', 'bold')
                        .text(`TP ${tpPrice.toFixed(0)}`);

                    // SL
                    signalG.append('line')
                        .attr('x1', xPos).attr('x2', widthChart)
                        .attr('y1', slY).attr('y2', slY)
                        .attr('stroke', '#f43f5e').attr('stroke-width', 1)
                        .attr('stroke-dasharray', '4,3').attr('opacity', 0.6);
                    signalG.append('text')
                        .attr('x', widthChart + 2).attr('y', slY + 3)
                        .attr('fill', '#f43f5e').attr('font-size', '8px').attr('font-weight', 'bold')
                        .text(`SL ${slPrice.toFixed(0)}`);

                    // Shaded zone between SL and TP
                    const top = Math.min(tpY, slY);
                    const bottom = Math.max(tpY, slY);
                    signalG.append('rect')
                        .attr('x', xPos).attr('width', widthChart - xPos)
                        .attr('y', top).attr('height', bottom - top)
                        .attr('fill', color).attr('opacity', 0.04);
                }

                // Signal reason label
                signalG.append('text')
                    .attr('x', xPos + 6).attr('y', yPos + offset - 8)
                    .attr('fill', color).attr('font-size', '8px').attr('font-weight', 'bold')
                    .attr('opacity', 0.9)
                    .text(sig.reason.length > 24 ? sig.reason.slice(0, 24) + '…' : sig.reason);
            });
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
            drawToday(sx, sy);
            drawLevels(sx, sy);
            drawEqualLevels(sx, sy);
            drawSwings(sx, sy);
            drawSuperTrend(sx, sy);
            drawCandles(sx, sy);
            drawSignals(sx, sy);
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

    }, [data, signals, zones, dimensions, symbol, showSwings, showEqLvls, showZones, showToday, showST]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#0a0c10]/40 rounded-3xl border border-white/5 backdrop-blur-sm">
            {/* Top Bar */}
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{symbol}</span>
                </div>

                {/* Overlay toggles */}
                {[
                    { key: 'zones', label: 'PD Levels', active: showZones, set: setShowZones, color: 'text-rose-400 border-rose-500/30' },
                    { key: 'swings', label: 'Swings', active: showSwings, set: setShowSwings, color: 'text-amber-400 border-amber-500/30' },
                    { key: 'eq', label: 'EQ H/L', active: showEqLvls, set: setShowEqLvls, color: 'text-yellow-400 border-yellow-500/30' },
                    { key: 'today', label: 'Today', active: showToday, set: setShowToday, color: 'text-blue-400 border-blue-500/30' },
                    ...(activeStrategy === 'SUPERTREND' ? [
                        { key: 'st', label: 'SuperTrend', active: showST, set: setShowST, color: 'text-emerald-400 border-emerald-500/30' }
                    ] : []),
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => t.set(!t.active)}
                        className={`px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-widest transition-all ${t.active ? t.color + ' bg-white/5' : 'text-slate-600 border-white/5 opacity-50'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <svg ref={svgRef} className="w-full h-full block" />
        </div>
    );
};

export default AlgoRealtimeChart;
