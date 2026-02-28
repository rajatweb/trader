'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Play, RefreshCw, TrendingUp, TrendingDown,
    BarChart3, Target, ShieldAlert, Calendar as CalendarIcon, Activity,
    ChevronDown, ChevronUp, Download, AlertCircle, Zap,
    CheckCircle2, XCircle, Clock, Layers, Database
} from 'lucide-react';
import Link from 'next/link';
import { useTradingStore } from '@/lib/store/tradingStore';
import { runBacktest, BacktestResult, BacktestTrade } from '@/lib/algo/backtester';
import AlgoRealtimeChart from '../algo/components/AlgoRealtimeChart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number, dec = 0) {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: dec }).format(v);
}
function fmtPnl(v: number) {
    const s = v >= 0 ? '+' : '';
    return `${s}₹${fmt(Math.abs(v))}`;
}
function fmtPts(v: number) {
    const s = v >= 0 ? '+' : '';
    return `${s}${v.toFixed(1)} pts`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'slate', icon: Icon }: {
    label: string; value: string; sub?: string; color?: string; icon?: any;
}) {
    const colors: any = {
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
        amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
        slate: 'bg-slate-500/10 border-slate-500/20 text-slate-400'
    };

    return (
        <div className={`p-4 rounded-2xl border ${colors[color]} flex flex-col gap-1 transition-all hover:scale-[1.02]`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
                {Icon && <Icon size={14} className="opacity-50" />}
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{value}</div>
            {sub && <div className="text-[10px] font-bold opacity-50 truncate">{sub}</div>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
    const { brokerCredentials } = useTradingStore();
    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 1);

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: twoMonthsAgo,
        to: today
    });

    const [status, setStatus] = useState<'idle' | 'fetching' | 'running' | 'training' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [trainingProgress, setTrainingProgress] = useState(0);
    const [trainingStage, setTrainingStage] = useState<'DISCOVERY' | 'LEARNING'>('DISCOVERY');
    const [errorMsg, setErrorMsg] = useState('');
    const [isCached, setIsCached] = useState(false);

    const [candles, setCandles] = useState<any[]>([]);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [activeMonth, setActiveMonth] = useState<string | null>(null);
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const [expandTrades, setExpandTrades] = useState(false);
    const [instrument, setInstrument] = useState<'25' | '13'>('25'); // 25 = BANKNIFTY, 13 = NIFTY
    const [trainDays, setTrainDays] = useState<number>(0);
    const [isTrainingSession, setIsTrainingSession] = useState(false);

    const executeSequence = async (isTrainingMode = false) => {
        if (!dateRange?.from || !dateRange?.to) return;
        if (!brokerCredentials || !brokerCredentials.clientId || !brokerCredentials.accessToken) {
            setErrorMsg('Dhan Credentials Missing! Go to Algo page and connect your broker first.');
            setStatus('error');
            return;
        }

        setIsTrainingSession(isTrainingMode);
        setStatus('fetching');
        setProgress(0);
        setIsCached(false);
        setResult(null);
        setActiveDay(null);
        setActiveMonth(null);

        try {
            const allCandles: any[] = [];
            const from = dateRange.from;
            const to = dateRange.to;

            // Chunks of 7 days
            const chunks: { f: string, t: string }[] = [];
            const cur = new Date(from);
            while (cur < to) {
                const chunkEnd = new Date(cur);
                chunkEnd.setDate(chunkEnd.getDate() + 6);
                if (chunkEnd > to) chunkEnd.setTime(to.getTime());
                chunks.push({
                    f: cur.toISOString().split('T')[0],
                    t: chunkEnd.toISOString().split('T')[0]
                });
                cur.setDate(cur.getDate() + 7);
            }

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                setProgress(Math.round((i / chunks.length) * 80));

                const res = await fetch('/api/dhan/intraday', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        securityId: instrument,
                        exchangeSegment: 'IDX_I',
                        instrument: 'INDEX',
                        interval: '1',
                        fromDate: chunk.f,
                        toDate: chunk.t
                    })
                });
                const json = await res.json();
                if (json.source === 'cache') setIsCached(true);

                if (json.success && json.data) {
                    const formatted = Array.isArray(json.data) ? json.data : (json.data.data || []);
                    formatted.forEach((c: any) => {
                        const ts = Number(c.timestamp || c.start_Time || 0);
                        const time = ts > 1e10 ? ts / 1000 : ts;
                        if (!time || time < 1000) return;
                        const open = Number(c.open);
                        const high = Number(c.high);
                        const low = Number(c.low);
                        const close = Number(c.close);
                        if (isNaN(open) || open <= 0) return;
                        allCandles.push({ time, open, high, low, close, volume: Number(c.volume) || 0 });
                    });
                }

                if (i < chunks.length - 1 && json.source !== 'cache') {
                    await new Promise(r => setTimeout(r, 3200));
                }
            }

            if (allCandles.length === 0) {
                setErrorMsg('No candle data returned.');
                setStatus('error');
                return;
            }

            const seen = new Set<number>();
            const deduped = allCandles
                .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
                .sort((a, b) => a.time - b.time);

            setStatus('running');
            setProgress(90);

            const trainModeLimit = isTrainingMode ? 9999 : 0;
            const savedWeights = localStorage.getItem(`ai_weights_${instrument}`) || undefined;

            const bt = await runBacktest(deduped, {
                qty: instrument === '25' ? 15 : 25,
                trainDays: trainModeLimit,
                preTrainedModel: savedWeights,
                indexType: instrument === '25' ? 'BANKNIFTY' : 'NIFTY',
                onProgress: (stage, p) => {
                    if (stage === 'TRAINING') {
                        setStatus('training');
                        setTrainingProgress(p);
                        setTrainingStage('LEARNING');
                    } else {
                        setTrainingStage('DISCOVERY');
                    }
                }
            });

            setResult(bt);
            setProgress(100);
            setStatus('done');

            if (isTrainingMode && bt.trainedModelJSON) {
                localStorage.setItem(`ai_weights_${instrument}`, bt.trainedModelJSON);
            }

        } catch (e: any) {
            setErrorMsg(e.message || 'Backtest Failed');
            setStatus('error');
        }
    };

    const activeTrades = result?.trades.filter(t => {
        if (activeDay) return t.date === activeDay;
        if (activeMonth) return t.date.startsWith(activeMonth);
        return true;
    }) || [];

    const activeMonthResult = result?.monthResults.find(m => m.month === activeMonth);
    const equityCurve = result?.trades.reduce((acc: number[], t) => {
        const last = acc.length > 0 ? acc[acc.length - 1] : 0;
        acc.push(last + t.netPnl);
        return acc;
    }, []) || [];
    const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1] : 0;
    const peakEquity = Math.max(0, ...equityCurve);

    return (
        <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-violet-500/30">
            <header className="sticky top-0 z-40 bg-[#06080a]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/apps/algo" className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-white font-black text-xl tracking-tight">AI Backtester <span className="text-violet-500 text-xs ml-1 px-2 py-0.5 bg-violet-500/10 rounded-full font-bold uppercase tracking-widest">v2.0</span></h1>
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-0.5">Validate Strategy Performance & Train Models</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={instrument}
                        onChange={(e) => setInstrument(e.target.value as any)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:border-violet-500/50 transition-all cursor-pointer"
                    >
                        <option value="25">BANKNIFTY</option>
                        <option value="13">NIFTY</option>
                    </select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all">
                                <CalendarIcon size={14} className="text-violet-400" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                            {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Select range</span>
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-[#0a0c10] border-white/10" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                                className="bg-[#0a0c10] text-slate-200"
                            />
                        </PopoverContent>
                    </Popover>

                    <button
                        onClick={() => executeSequence(true)}
                        disabled={status !== 'idle' && status !== 'done' && status !== 'error'}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
                    >
                        <Zap size={14} fill="currentColor" />
                        Train AI Engine
                    </button>

                    <button
                        onClick={() => executeSequence(false)}
                        disabled={status !== 'idle' && status !== 'done' && status !== 'error'}
                        className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50"
                    >
                        <Play size={14} fill="currentColor" />
                        Run Backtest
                    </button>
                </div>
            </header>

            <main className="p-4 max-w-full mx-auto flex flex-col gap-4 overflow-hidden h-[calc(100vh-100px)]">
                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="p-5 bg-violet-500/10 rounded-3xl">
                            <BarChart3 size={40} className="text-violet-400" />
                        </div>
                        <h2 className="text-white font-bold text-lg">Ready to Backtest</h2>
                        <p className="text-slate-500 text-sm text-center max-w-md">
                            Select a date range (up to 2 months) and click "Run Backtest".<br />
                            The engine fetches real 1-min data from Dhan and runs the full ADR Sniper strategy logic.
                        </p>
                    </div>
                )}

                {(status === 'fetching' || status === 'running' || status === 'training') && (
                    <div className="flex flex-col items-center justify-center h-full gap-5">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full border-2 border-white/5 flex items-center justify-center">
                                {status === 'training' ? <Zap size={32} className="text-amber-400 animate-pulse" /> : <BarChart3 size={28} className="text-violet-400 animate-pulse" />}
                            </div>
                            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="30" fill="none" stroke="#7c3aed" strokeWidth="2"
                                    strokeDasharray={`${(status === 'training' ? trainingProgress : progress) * 1.885} 188.5`} strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className="text-white font-bold text-lg">
                                {status === 'fetching' && (isCached ? `Pulling from Redis Cache… ${progress}%` : `Fetching Data… ${progress}%`)}
                                {status === 'running' && `AI Pattern Discovery…`}
                                {status === 'training' && `Neural Network Learning… ${trainingProgress}%`}
                            </div>
                            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
                                {status === 'fetching' && (isCached ? `Lightning fast retrieval from local Upstash Redis instance.` : `Downloading 1-min ${instrument === '25' ? 'BANKNIFTY' : 'NIFTY'} candles from Dhan API`)}
                                {status === 'running' && `Scanning for high-alpha ADR & EMA setups in historical data`}
                                {status === 'training' && `Optimizing model weights via Adam Optimizer.`}
                            </p>
                        </div>
                        <div className="w-64 h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div className={`h-full transition-all duration-300 rounded-full ${status === 'training' ? 'bg-amber-500' : 'bg-violet-600'}`}
                                style={{ width: `${status === 'training' ? trainingProgress : progress}%` }} />
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex items-center gap-4 p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl mx-auto max-w-3xl mt-20">
                        <AlertCircle size={20} className="text-rose-400 flex-shrink-0" />
                        <div>
                            <div className="text-rose-400 font-bold text-sm">Backtest Failed</div>
                            <div className="text-rose-400/70 text-xs mt-0.5">{errorMsg}</div>
                        </div>
                        <button onClick={() => executeSequence(false)} className="ml-auto text-xs text-rose-400 hover:text-white transition-colors">Retry →</button>
                    </div>
                )}

                {status === 'done' && result && (
                    <div className="flex flex-col lg:flex-row gap-4 h-full">
                        {/* LEFT VISUAL PANEL */}
                        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white/[0.02] border border-white/5 rounded-3xl p-4 gap-3">
                            <div className="flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        {instrument === '25' ? 'BANKNIFTY' : 'NIFTY'} · 1 MIN · {activeDay ? activeDay.slice(5) : (activeMonth ? activeMonth : 'ALL')}
                                    </span>
                                    <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                        {activeTrades.length} SIGNALS
                                    </span>
                                    {isCached && (
                                        <div className="flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                            <Database size={10} /> Redis Cached
                                        </div>
                                    )}
                                </div>
                                {activeDay && (
                                    <button onClick={() => setActiveDay(null)} className="text-[10px] ml-2 font-bold px-3 py-1 rounded-full border border-rose-500/50 text-rose-400 hover:bg-rose-500/10 transition-colors uppercase">
                                        Reset Filter
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-[#0a0c10] border border-white/5 relative">
                                {activeDay ? (
                                    <AlgoRealtimeChart
                                        data={(() => {
                                            const days = [...new Set(result.allCandles.map((c: any) => new Date(c.time * 1000 + 330 * 60000).toISOString().split('T')[0]))].sort();
                                            const currentIdx = days.indexOf(activeDay);
                                            const prevDay = currentIdx > 0 ? days[currentIdx - 1] : null;

                                            return result.allCandles.filter((c: any) => {
                                                const d = new Date(c.time * 1000 + 330 * 60000).toISOString().split('T')[0];
                                                return d === activeDay || d === prevDay;
                                            });
                                        })()}
                                        symbol={instrument === '25' ? 'BANKNIFTY' : 'NIFTY'}
                                        trades={activeTrades}
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                            <BarChart3 size={40} className="mx-auto text-slate-800 mb-4" />
                                            <div className="text-sm font-bold text-slate-500">Pick a Day on the right to view its Intraday sequence</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT METRICS LOG */}
                        <div className="w-[400px] xl:w-[450px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2 pb-2 custom-scrollbar">
                            {isTrainingSession ? (
                                <div className="flex flex-col gap-4">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-emerald-500/20 rounded-xl">
                                                <Zap size={20} className="text-emerald-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-white font-black text-lg">Brain Training Complete</h3>
                                                <p className="text-emerald-400/70 text-[10px] font-bold uppercase tracking-widest">Alpha Pattern Discovery Phase Done</p>
                                            </div>
                                        </div>
                                        <p className="text-slate-400 text-xs leading-relaxed">
                                            The Neural Network has finished scanning the historical data. It has analyzed ADR zones, wick shapes, and EMA spreads to find high-probability entry points. Weights have been saved and will be used automatically in your next backtest.
                                        </p>
                                    </div>

                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Activity size={12} /> AI Thinking Logs
                                            </div>
                                            <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-slate-400">Showing {result.trainingLogs?.length || 0} latest events</span>
                                        </div>
                                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                            {(result.trainingLogs || []).map((log, i) => (
                                                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] font-mono flex items-start gap-3">
                                                    <span className="text-slate-600">[{i + 1}]</span>
                                                    <span className={log.includes('Level') ? 'text-emerald-400' : 'text-slate-400'}>{log}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                        <StatCard label="Net P&L" value={fmtPnl(result.netPnl)} sub={`${result.totalTrades} Trades`} color={result.netPnl >= 0 ? 'emerald' : 'rose'} />
                                        <StatCard label="Win Rate" value={`${result.winRate}%`} sub={`${result.wins}W / ${result.losses}L`} color={result.winRate >= 55 ? 'emerald' : 'rose'} />
                                        <StatCard label="Drawdown" value={fmtPnl(-result.maxDrawdown)} sub="Peak to trough" color="rose" />
                                        <StatCard label="Avg Win" value={fmtPnl(result.avgWin)} sub="Per Winner" color="emerald" />
                                    </div>

                                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3 text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                            <span>Equity Curve</span>
                                            <span className={finalEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                {fmtPnl(finalEquity)}
                                            </span>
                                        </div>
                                        <div className="h-20 flex items-end gap-[1px] relative overflow-hidden bg-white/5 rounded-lg p-1">
                                            {equityCurve.map((v, i) => {
                                                const maxAbs = Math.max(...equityCurve.map(Math.abs), 1);
                                                const heightPct = (Math.abs(v) / maxAbs) * 100;
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col justify-end h-full">
                                                        <div
                                                            className={`w-full rounded-t-[1px] transition-all duration-500 ${v >= 0 ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                                                            style={{ height: `${Math.max(4, heightPct)}%` }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2">Monthly Filter</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {result.monthResults.map(m => (
                                                    <button key={m.month} onClick={() => setActiveMonth(activeMonth === m.month ? null : m.month)}
                                                        className={`text-left rounded-xl border p-3 transition-all hover:bg-white/5 ${activeMonth === m.month ? 'border-violet-500/40 bg-violet-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[11px] font-bold text-white">{m.label}</span>
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${m.winRate >= 60 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{m.winRate}%</span>
                                                        </div>
                                                        <div className={`text-lg font-black font-mono mb-2 ${m.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPnl(m.netPnl)}</div>
                                                        <div className="text-[8px] text-slate-500 flex justify-between uppercase">
                                                            <span>Trades: {m.trades}</span>
                                                            <span>{m.totalDays} Days</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {activeMonth && (
                                            <div>
                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2 flex justify-between">
                                                    <span>Day Viewer — {activeMonthResult?.label}</span>
                                                    <button onClick={() => setActiveMonth(null)} className="text-[9px] text-violet-400 hover:text-white">Close</button>
                                                </div>
                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {result.dayResults.filter(d => d.date.startsWith(activeMonth)).map(d => (
                                                        <button key={d.date} onClick={() => setActiveDay(activeDay === d.date ? null : d.date)}
                                                            className={`rounded-lg border p-1 text-center transition-all hover:bg-white/5 ${activeDay === d.date ? 'border-violet-500/50 bg-violet-500/10 border-solid' : 'border-white/5 bg-white/[0.02] border-dashed'}`}>
                                                            <div className="text-[8px] font-bold text-slate-500 mb-0.5">{d.date.slice(8)}</div>
                                                            <div className={`text-[9px] font-black font-mono tracking-tighter ${d.dayNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{d.dayNetPnl === 0 ? '-' : (d.dayNetPnl > 0 ? '+' : '') + fmt(d.dayNetPnl)}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden mt-1 flex flex-col min-h-0">
                                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01] flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <Clock size={12} className="text-slate-500" />
                                                <span className="text-[11px] font-bold text-white uppercase tracking-widest">Trade Log {activeDay ? `(${activeDay.slice(8)})` : activeMonth ? `(${activeMonthResult?.label})` : ''}</span>
                                            </div>
                                            <span className="text-[9px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded-full">{activeTrades.length} records</span>
                                        </div>
                                        <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                                            <table className="w-full text-[10px]">
                                                <thead className="sticky top-0 z-10">
                                                    <tr className="border-b border-white/5 bg-[#0a0c10]">
                                                        {['Time', 'Dir', 'Signal', 'Net PnL'].map(h => (
                                                            <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeTrades.slice(0, 50).map(t => (
                                                        <tr key={t.id} onClick={() => { setActiveMonth(t.date.slice(0, 7)); setActiveDay(t.date); }}
                                                            className="border-b border-white/[0.03] hover:bg-violet-500/5 cursor-pointer transition-colors">
                                                            <td className="px-3 py-2 font-mono text-slate-400">
                                                                <div className="leading-none">{t.entryTime}</div>
                                                                <div className="text-[8px] text-slate-600 mt-1">{t.date.slice(5)}</div>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className={`px-1 py-0.5 rounded text-[8px] font-monospace font-black ${t.type === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{t.type === 'LONG' ? 'CE' : 'PE'}</span>
                                                                <div className="text-[8px] text-slate-500 mt-1 uppercase">{t.exitReason}</div>
                                                            </td>
                                                            <td className="px-3 py-2 text-[9px] text-slate-300 font-bold">
                                                                {t.mlConfidence !== undefined && (
                                                                    <span className={`px-1.5 py-[1px] rounded-[3px] text-[8px] font-bold mr-1.5 ${t.mlConfidence >= 0.6 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>ML: {Math.round(t.mlConfidence * 100)}%</span>
                                                                )}
                                                                {t.signal}
                                                            </td>
                                                            <td className={`px-3 py-2 font-mono font-bold text-right ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPnl(t.netPnl)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
