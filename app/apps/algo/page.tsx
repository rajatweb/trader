'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Square, ArrowLeft, RefreshCw, Activity, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlgoStore } from '@/lib/store/algoStore';
import { useTradingStore } from '@/lib/store/tradingStore';
import { useAlgoRunner } from '@/lib/algo/runner';
import { calculateADRx3 } from '@/lib/algo/adrIndicator';
import AlgoRealtimeChart from './components/AlgoRealtimeChart';
import { useMarketFeed } from '@/lib/store/useMarketFeed';

const INSTRUMENTS = [
    { name: 'NIFTY 50', symbol: 'NIFTY', id: '13', exch: 'IDX_I' },
    { name: 'BANKNIFTY', symbol: 'BANKNIFTY', id: '25', exch: 'IDX_I' },
    { name: 'SENSEX', symbol: 'SENSEX', id: '51', exch: 'IDX_I' }
];

export default function AlgoDashboard() {
    const {
        isRunning,
        setRunning,
        stats,
        liveVix,
        activePositions,
        tradeHistory
    } = useAlgoStore();

    const { brokerCredentials, addToWatchlist, watchlist: tradingWatchlist, isConnected } = useTradingStore();
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [chartData, setChartData] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState('BANKNIFTY');
    const [isMounted, setIsMounted] = useState(false);

    const currentInst = INSTRUMENTS.find(i => i.name === selectedIndex) || INSTRUMENTS[1];

    // Start the algo runner engine with LIVE chart data
    useAlgoRunner(chartData);
    useMarketFeed();

    const fetchIntradayData = async (forceInit = false) => {
        if (!brokerCredentials) return;
        setIsLoading(true);
        try {
            const securityId = currentInst.id;

            // Format dates as YYYY-MM-DD HH:MM:SS as per Dhan Intraday docs
            const today = new Date();
            const toDateStr = `${today.toISOString().split('T')[0]} 15:30:00`;

            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 30);
            const fromDateStr = `${pastDate.toISOString().split('T')[0]} 09:00:00`;

            const res = await fetch('/api/dhan/intraday', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    securityId,
                    exchangeSegment: currentInst.exch,
                    instrument: 'INDEX',
                    interval: '1', // 1 Minute explicitly
                    fromDate: fromDateStr,
                    toDate: toDateStr
                })
            });

            const json = await res.json();

            if (json.success && json.data) {
                const rawData = Array.isArray(json.data) ? json.data : (json.data.data || []);

                const finalData = rawData.map((c: any) => {
                    const ts = Number(c.start_Time || c.time || c.timestamp || c.start_time);
                    if (!ts || isNaN(ts) || ts === 0) return null;
                    const open = Number(c.open), high = Number(c.high), low = Number(c.low), close = Number(c.close);
                    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || open <= 0) return null;

                    return {
                        time: ts > 10000000000 ? ts / 1000 : ts,
                        open, high, low, close,
                        volume: Number(c.volume) || 0
                    };
                }).filter(Boolean);

                // Sort ensuring strictly ascending sequence
                finalData.sort((a: any, b: any) => a.time - b.time);

                // Run ADR calculation over the full 30-day context dataset
                const dataWithAdr = calculateADRx3(finalData);

                if (forceInit) {
                    setChartData(dataWithAdr);
                } else {
                    setChartData(prev => {
                        if (prev.length === 0) return dataWithAdr;
                        const lastInPrev = prev[prev.length - 1];
                        const lastInFormatted = dataWithAdr[dataWithAdr.length - 1];

                        if (lastInPrev && lastInFormatted && lastInPrev.time > lastInFormatted.time) {
                            return [...dataWithAdr, lastInPrev];
                        }
                        return dataWithAdr;
                    });
                }
            }
        } catch (err) {
            console.error("Intraday chart fetch failed", err);
        } finally {
            setIsLoading(false);
        }
    };

    const indexItem = useMemo(() => {
        return tradingWatchlist.find(w =>
            w.symbol.includes(currentInst.symbol) &&
            !w.symbol.includes('CE') &&
            !w.symbol.includes('PE')
        );
    }, [tradingWatchlist, currentInst]);

    useEffect(() => {
        if (brokerCredentials && isConnected) {
            if (!tradingWatchlist.find(w => w.securityId === currentInst.id)) {
                addToWatchlist({
                    securityId: currentInst.id,
                    symbol: currentInst.name,
                    exchange: 'NSE',
                    segment: currentInst.exch,
                    ltp: 0,
                    change: 0,
                    changePercent: 0
                });
            }
        }
    }, [selectedIndex, brokerCredentials, isConnected, tradingWatchlist.length]);

    useEffect(() => {
        if (chartData.length === 0 || !indexItem || !indexItem.ltp || indexItem.ltp < 100) return;

        setChartData(prev => {
            if (prev.length === 0) return prev;

            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];

            // Use the broker feed's tick timestamp, fallback to local clock
            const nowTs = indexItem.ltt || Math.floor(Date.now() / 1000);

            // Align purely to the minute boundary
            // This cleanly handles 1-minute chart progression
            const currentMinuteStart = Math.floor(nowTs / 60) * 60;

            if (currentMinuteStart > last.time) {
                // Time has progressed to a new minute, construct a fresh candle
                const newCandle = {
                    time: currentMinuteStart,
                    open: indexItem.ltp,
                    high: indexItem.ltp,
                    low: indexItem.ltp,
                    close: indexItem.ltp,
                    volume: indexItem.volume || 1
                };
                return [...prev, newCandle];
            }

            // Still in the current minute, update the active tail candle
            const needsUpdate = last.close !== indexItem.ltp ||
                indexItem.ltp > last.high ||
                (last.low > 0 && indexItem.ltp < last.low);

            if (!needsUpdate) return prev;

            // Sanity check preventing absurd glitches pushing to 0
            if (last.close > 0 && indexItem.ltp < last.close * 0.5) return prev;

            const updatedCandle = {
                ...last,
                close: indexItem.ltp,
                high: Math.max(last.high, indexItem.ltp),
                low: Math.min(last.low || indexItem.ltp, indexItem.ltp),
                volume: Math.max(last.volume, indexItem.volume || 1)
            };

            const newData = [...prev];
            newData[lastIdx] = updatedCandle;
            return newData;
        });
    }, [indexItem?.ltp, indexItem?.ltt, indexItem?.volume, chartData]);

    useEffect(() => {
        if (brokerCredentials) {
            setChartData([]);
            fetchIntradayData(true);
            const interval = setInterval(() => fetchIntradayData(false), 60000);
            return () => clearInterval(interval);
        }
    }, [brokerCredentials, selectedIndex]);

    useEffect(() => {
        setIsMounted(true);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const compPos = activePositions.filter(p => p.symbol.includes(currentInst.symbol));
    const compTrades = tradeHistory.filter(t => t.symbol.includes(currentInst.symbol));

    const compFloatingPnl = compPos.reduce((acc, p) => acc + p.pnl, 0);
    const compRealizedPnl = compTrades.reduce((acc, t) => acc + t.netPnl, 0);
    const compTotalPnl = compFloatingPnl + compRealizedPnl;

    // Total stats across all instruments
    const overallFloatingPnl = activePositions.reduce((acc, p) => acc + p.pnl, 0);
    const overallTotalPnl = stats.totalPnl + overallFloatingPnl;

    return (
        <div className="h-screen bg-[#0a0c10] text-slate-200 font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Header */}
            <header className="z-40 backdrop-blur-md bg-[#0a0c10]/70 border-b border-white/5 flex-shrink-0">
                <div className="max-w-full mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/apps" className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                                    Zenith Algo Pro
                                </h1>
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
                                    {isRunning ? 'Active' : 'Idle'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-8">
                            <div className="text-right">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{currentInst.name} P&L</div>
                                <div className={`text-sm font-mono font-black ${compTotalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {compTotalPnl >= 0 ? '+' : ''}{compTotalPnl.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                </div>
                            </div>
                            <div className="text-right border-l border-white/5 pl-6">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{currentInst.name} Pos</div>
                                <div className="text-sm font-mono font-black text-amber-400">{compPos.length}</div>
                            </div>
                            <div className="text-right border-l border-white/5 pl-6">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{currentInst.name} Trades</div>
                                <div className="text-sm font-mono font-black text-blue-400">{compTrades.length}</div>
                            </div>
                            <div className="text-right border-l border-white/5 pl-6 bg-white/[0.03] px-4 py-2 rounded-xl">
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Overall P&L</div>
                                <div className={`text-sm font-mono font-black ${overallTotalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {overallTotalPnl >= 0 ? '+' : ''}{overallTotalPnl.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                </div>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-white/5"></div>

                        <button
                            onClick={() => setRunning(!isRunning)}
                            className={`group h-10 px-6 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg ${isRunning
                                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                }`}
                        >
                            {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            <span className="text-xs tracking-wide">{isRunning ? 'TERMINATE' : 'START ALGO'}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 min-h-0 relative flex p-4 gap-4">

                {/* ── Left Side: Full Chart Area ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">
                    {/* ── Top Bar within Chart Area ── */}
                    <div className="flex items-center justify-between px-2 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                {INSTRUMENTS.map(s => (
                                    <button
                                        key={s.name}
                                        onClick={() => setSelectedIndex(s.name)}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selectedIndex === s.name ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                {currentInst.name} · 1m · Live Feed
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                                <Activity size={12} className="text-blue-400" />
                                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                                    VIX: {liveVix > 0 ? liveVix.toFixed(2) : '--'}
                                </span>
                            </div>
                            <button
                                onClick={() => fetchIntradayData(true)}
                                className={`p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all ${isLoading ? 'animate-spin' : ''}`}
                                title="Force Refresh Data"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>

                    {/* ── Main Chart ── */}
                    <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden relative group">
                        <AlgoRealtimeChart
                            data={chartData}
                            symbol={currentInst.name}
                        />
                    </div>
                </div>

                {/* ── Right Side: Trade Execution & Positions Sidebar ── */}
                <div className="hidden lg:flex flex-col flex-shrink-0 w-[400px] gap-4">

                    {/* Active Engagements Panel */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 flex-col flex h-[45%] flex-shrink-0">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-emerald-400" />
                                <h3 className="text-xs font-bold tracking-widest uppercase text-white">{currentInst.name} Active Engagements</h3>
                            </div>
                            <div className="px-2 py-0.5 bg-white/5 rounded-lg text-[10px] font-black text-slate-300">
                                {compPos.length} POS
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {compPos.map((pos, i) => (
                                <div key={i} className="bg-[#0a0c10] rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-black text-xs uppercase tracking-tight text-white">{pos.symbol}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase">{pos.type} • Qty {pos.quantity}</p>
                                        </div>
                                        <div className={`text-sm font-mono font-black border px-2 py-1 rounded-lg ${pos.pnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(1)}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end border-t border-white/5 pt-3 mt-1">
                                        <div>
                                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest leading-none mb-1">Entry</div>
                                            <div className="text-[11px] font-mono font-bold text-slate-300">₹{pos.entryPrice.toFixed(1)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest leading-none mb-1">LTP</div>
                                            <div className={`text-[12px] font-mono font-black ${pos.currentPrice > pos.entryPrice ? 'text-emerald-400' : 'text-rose-400'}`}>₹{pos.currentPrice.toFixed(1)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {compPos.length === 0 && (
                                <div className="h-full border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-slate-600 p-6">
                                    <Activity size={24} className="opacity-40 mb-3" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-center opacity-60">System Neutral<br />No Active {currentInst.name} Positions</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Trade Execution Logs Panel */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-3xl flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
                            <h3 className="text-xs font-bold tracking-widest text-white uppercase flex items-center gap-2">
                                <Volume2 size={14} className="text-slate-500" /> {currentInst.name} Logs
                            </h3>
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                            <div className="space-y-2">
                                {compTrades.map((trade, i) => (
                                    <div key={i} className="p-4 bg-[#0a0c10]/50 hover:bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between group transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${trade.type === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                    {trade.type}
                                                </span>
                                                <span className="text-[10px] font-bold text-white uppercase">{trade.symbol}</span>
                                            </div>
                                            <p className="text-[9px] text-slate-500 font-mono tracking-tight ml-[34px]">
                                                {new Date(trade.closedAt).toLocaleTimeString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-[12px] font-mono font-black ${trade.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {trade.netPnl >= 0 ? '+' : ''}{trade.netPnl.toFixed(1)}
                                            </div>
                                            <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">Net INR</div>
                                        </div>
                                    </div>
                                ))}
                                {compTrades.length === 0 && (
                                    <div className="py-12 flex flex-col items-center justify-center text-slate-600 h-full">
                                        <p className="text-[10px] font-bold tracking-widest uppercase opacity-40">No session logs for {currentInst.name}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                </div>
            </main>
        </div>
    );
}
