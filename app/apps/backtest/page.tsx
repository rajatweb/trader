'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Play, RefreshCw, TrendingUp, TrendingDown,
    BarChart3, Target, ShieldAlert, Calendar, Activity,
    ChevronDown, ChevronUp, Download, AlertCircle, Zap,
    CheckCircle2, XCircle, Clock, Layers
} from 'lucide-react';
import Link from 'next/link';
import { useTradingStore } from '@/lib/store/tradingStore';
import { runBacktest, BacktestResult, BacktestTrade } from '@/lib/algo/backtester';
import AlgoRealtimeChart from '../algo/components/AlgoRealtimeChart';

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
    label: string; value: string; sub?: string;
    color?: 'emerald' | 'rose' | 'blue' | 'amber' | 'violet' | 'slate';
    icon?: React.ElementType;
}) {
    const colors = {
        emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
        rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
        blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
        amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
        violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
        slate: 'border-white/10 bg-white/[0.03] text-slate-300',
    };
    return (
        <div className={`rounded-2xl border p-4 ${colors[color]}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</span>
                {Icon && <Icon size={14} className="opacity-40" />}
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{value}</div>
            {sub && <div className="text-[10px] opacity-50 mt-1">{sub}</div>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
    const { brokerCredentials } = useTradingStore();

    // Date range: default last 2 months
    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const [fromDate, setFromDate] = useState(twoMonthsAgo.toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(today.toISOString().split('T')[0]);

    const [status, setStatus] = useState<'idle' | 'fetching' | 'running' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const [candles, setCandles] = useState<any[]>([]);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [activeMonth, setActiveMonth] = useState<string | null>(null);
    const [expandTrades, setExpandTrades] = useState(false);

    // Convert result signals to AlgoRealtimeChart-compatible signal format
    const chartSignals = result?.signalCandles.map(sc => ({
        type: sc.trade.type === 'LONG' ? 'BUY' as const : 'SELL' as const,
        price: sc.trade.entrySpot,
        symbol: 'BANKNIFTY',
        reason: sc.trade.signal,
        strength: 1,
        timestamp: (result.allCandles[sc.index]?.time ?? 0) * 1000,
        targetPoints: 50,
        slPoints: 30,
    })) ?? [];

    // ── Fetch data in weekly chunks (Dhan 1m limit) ───────────────────────
    const fetchAndRun = useCallback(async () => {
        if (!brokerCredentials) { setErrorMsg('Connect your broker first.'); setStatus('error'); return; }
        setStatus('fetching');
        setProgress(0);
        setResult(null);
        setErrorMsg('');

        try {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const allCandles: any[] = [];

            // Split into weekly chunks
            const chunks: { f: string; t: string }[] = [];
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
                        securityId: '25', // BANKNIFTY
                        exchangeSegment: 'IDX_I',
                        instrument: 'INDEX',
                        interval: '1',
                        fromDate: chunk.f,
                        toDate: chunk.t
                    })
                });
                const json = await res.json();
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

                // Rate limit: 1 req / 3s
                if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 3200));
            }

            if (allCandles.length === 0) {
                setErrorMsg('No candle data returned. Check your Dhan credentials and date range.');
                setStatus('error');
                return;
            }

            // Dedupe and sort
            const seen = new Set<number>();
            const deduped = allCandles
                .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
                .sort((a, b) => a.time - b.time);

            setCandles(deduped);
            setProgress(85);
            setStatus('running');

            // Run backtest in next tick so React can update UI
            await new Promise(r => setTimeout(r, 50));
            const bt = runBacktest(deduped);
            setResult(bt);
            setProgress(100);
            setStatus('done');

            if (bt.monthResults.length > 0) {
                setActiveMonth(bt.monthResults[bt.monthResults.length - 1].month);
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Backtest failed.');
            setStatus('error');
        }
    }, [brokerCredentials, fromDate, toDate]);

    // ── Trades for active month ────────────────────────────────────────────
    const activeTrades: BacktestTrade[] = result
        ? (activeMonth ? result.trades.filter(t => t.date.startsWith(activeMonth)) : result.trades)
        : [];

    const activeMonthResult = result?.monthResults.find(m => m.month === activeMonth);

    // ── Equity curve data ─────────────────────────────────────────────────
    const equityCurve = result?.trades.reduce((acc, t) => {
        const prev = acc[acc.length - 1] ?? 0;
        acc.push(prev + t.netPnl);
        return acc;
    }, [] as number[]) ?? [];

    const peakEquity = Math.max(0, ...equityCurve);
    const finalEquity = equityCurve[equityCurve.length - 1] ?? 0;

    return (
        <div className="min-h-screen bg-[#0a0c10] text-slate-200 font-sans">
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[35%] h-[35%] bg-violet-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-blue-600/8 blur-[100px] rounded-full" />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0c10]/70 border-b border-white/5">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/apps" className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft size={18} />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                <BarChart3 size={16} className="text-violet-400" />
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-white leading-none">PDLS-VIX Backtester</h1>
                                <p className="text-[10px] text-slate-500 mt-0.5">BankNifty · 1-Minute · Index-Point P&L</p>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                            <Calendar size={12} className="text-slate-500" />
                            <input
                                type="date"
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                                className="bg-transparent text-[11px] font-mono text-slate-300 outline-none w-28"
                            />
                            <span className="text-slate-600 text-xs">→</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                                className="bg-transparent text-[11px] font-mono text-slate-300 outline-none w-28"
                            />
                        </div>
                        <button
                            onClick={fetchAndRun}
                            disabled={status === 'fetching' || status === 'running'}
                            className="h-9 px-5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-violet-500/20"
                        >
                            {(status === 'fetching' || status === 'running')
                                ? <><RefreshCw size={13} className="animate-spin" /> {status === 'fetching' ? 'Fetching...' : 'Running...'}</>
                                : <><Play size={13} fill="currentColor" /> Run Backtest</>
                            }
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-6 pb-24 space-y-6">

                {/* ── Progress / Error / Idle state ────────────────────────── */}
                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="p-5 bg-violet-500/10 rounded-3xl">
                            <BarChart3 size={40} className="text-violet-400" />
                        </div>
                        <h2 className="text-white font-bold text-lg">Ready to Backtest</h2>
                        <p className="text-slate-500 text-sm text-center max-w-md">
                            Select a date range (up to 2 months) and click "Run Backtest".<br />
                            The engine fetches real 1-min BANKNIFTY data from Dhan and runs the full PDLS-VIX strategy logic.
                        </p>
                        <div className="flex gap-3 mt-2">
                            {['9:30–11:30 window', 'PDH/PDL sweeps', '50pt TP · 30pt SL', '2 lots fixed'].map(t => (
                                <span key={t} className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-1 rounded-full">{t}</span>
                            ))}
                        </div>
                    </div>
                )}

                {(status === 'fetching' || status === 'running') && (
                    <div className="flex flex-col items-center justify-center py-16 gap-5">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-2 border-violet-500/20 flex items-center justify-center">
                                <BarChart3 size={28} className="text-violet-400 animate-pulse" />
                            </div>
                            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="30" fill="none" stroke="#7c3aed" strokeWidth="2"
                                    strokeDasharray={`${progress * 1.885} 188.5`} strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className="text-white font-bold">
                                {status === 'fetching' ? `Fetching historical data… ${progress}%` : 'Running PDLS-VIX strategy…'}
                            </div>
                            <p className="text-slate-500 text-xs mt-1">
                                {status === 'fetching' ? 'Downloading 1-min BANKNIFTY candles from Dhan API' : 'Simulating entries, exits, and daily risk state'}
                            </p>
                        </div>
                        <div className="w-64 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex items-center gap-4 p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                        <AlertCircle size={20} className="text-rose-400 flex-shrink-0" />
                        <div>
                            <div className="text-rose-400 font-bold text-sm">Backtest Failed</div>
                            <div className="text-rose-400/70 text-xs mt-0.5">{errorMsg}</div>
                        </div>
                        <button onClick={fetchAndRun} className="ml-auto text-xs text-rose-400 hover:text-white transition-colors">Retry →</button>
                    </div>
                )}

                {/* ── Results ─────────────────────────────────────────────── */}
                {status === 'done' && result && (
                    <>
                        {/* Top KPI row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                            <StatCard label="Net P&L" value={fmtPnl(result.netPnl)} sub={`${result.totalTrades} trades`}
                                color={result.netPnl >= 0 ? 'emerald' : 'rose'} icon={result.netPnl >= 0 ? TrendingUp : TrendingDown} />
                            <StatCard label="Win Rate" value={`${result.winRate}%`} sub={`${result.wins}W / ${result.losses}L`}
                                color={result.winRate >= 55 ? 'emerald' : result.winRate >= 45 ? 'amber' : 'rose'} icon={Target} />
                            <StatCard label="Profit Factor" value={result.profitFactor >= 999 ? '∞' : String(result.profitFactor)}
                                sub="Gross Win / Gross Loss" color={result.profitFactor >= 1.5 ? 'emerald' : result.profitFactor >= 1 ? 'amber' : 'rose'} icon={BarChart3} />
                            <StatCard label="Max Drawdown" value={fmtPnl(-result.maxDrawdown)} sub="Peak to trough"
                                color="rose" icon={ShieldAlert} />
                            <StatCard label="Avg Win" value={fmtPnl(result.avgWin)} sub="Per winning trade"
                                color="emerald" icon={TrendingUp} />
                            <StatCard label="Avg Loss" value={fmtPnl(result.avgLoss)} sub="Per losing trade"
                                color="rose" icon={TrendingDown} />
                            <StatCard label="Max Consec. Loss" value={String(result.consecutiveLosses)} sub="In a row"
                                color={result.consecutiveLosses >= 3 ? 'rose' : 'amber'} icon={Activity} />
                            <StatCard label="Brokerage" value={fmtPnl(result.totalBrokerage)} sub="Total charges"
                                color="slate" icon={Layers} />
                        </div>

                        {/* Chart */}
                        <div className="flex flex-col" style={{ height: 520 }}>
                            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">BANKNIFTY · 1 min · {candles.length.toLocaleString()} candles</span>
                                    <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                                        {result.trades.length} signals marked
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0">
                                {/* <AlgoRealtimeChart
                                    data={candles}
                                    signals={""}
                                    zones={[]}
                                    symbol="BANKNIFTY"
                                /> */}
                            </div>
                        </div>

                        {/* Equity Curve mini bar chart */}
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Equity Curve</span>
                                <span className={`text-sm font-black font-mono ${finalEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {fmtPnl(finalEquity)}
                                </span>
                            </div>
                            <div className="h-24 flex items-end gap-0.5">
                                {equityCurve.map((v, i) => {
                                    const max = Math.max(Math.abs(peakEquity), Math.abs(Math.min(...equityCurve)));
                                    const pct = max > 0 ? Math.abs(v) / max : 0;
                                    const h = Math.max(2, pct * 96);
                                    return (
                                        <div key={i} className="flex-1 flex flex-col justify-end" title={`Trade ${i + 1}: ${fmtPnl(v)}`}>
                                            <div
                                                className={`rounded-sm transition-all ${v >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                                                style={{ height: h }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Monthly grid */}
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-px flex-1 bg-white/5" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Monthly Performance</span>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {result.monthResults.map(m => (
                                    <button
                                        key={m.month}
                                        onClick={() => setActiveMonth(activeMonth === m.month ? null : m.month)}
                                        className={`text-left rounded-2xl border p-4 transition-all hover:bg-white/5 ${activeMonth === m.month
                                            ? 'border-violet-500/40 bg-violet-500/5'
                                            : 'border-white/5 bg-white/[0.02]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-white">{m.label}</span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${m.winRate >= 60 ? 'bg-emerald-500/15 text-emerald-400' :
                                                m.winRate >= 45 ? 'bg-amber-500/15 text-amber-400' :
                                                    'bg-rose-500/15 text-rose-400'
                                                }`}>{m.winRate}% WR</span>
                                        </div>
                                        <div className={`text-2xl font-black font-mono mb-1 ${m.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {fmtPnl(m.netPnl)}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            {[
                                                { l: 'Trades', v: String(m.trades) },
                                                { l: 'Wins', v: String(m.wins), c: 'text-emerald-400' },
                                                { l: 'Loss', v: String(m.losses), c: 'text-rose-400' },
                                            ].map(x => (
                                                <div key={x.l} className="bg-white/5 rounded-lg p-1.5 text-center">
                                                    <div className={`text-xs font-bold ${x.c ?? 'text-white'}`}>{x.v}</div>
                                                    <div className="text-[8px] text-slate-600">{x.l}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Day breakdown bar */}
                                        <div className="mt-3 flex items-center gap-1">
                                            <div className="h-1 rounded-full bg-emerald-500/60 transition-all" style={{ flex: m.profitableDays }} />
                                            <div className="h-1 rounded-full bg-rose-500/40 transition-all" style={{ flex: m.totalDays - m.profitableDays }} />
                                        </div>
                                        <div className="text-[8px] text-slate-600 mt-1">{m.profitableDays}/{m.totalDays} profitable days</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Trade Log */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock size={14} className="text-slate-500" />
                                    <span className="text-sm font-bold text-white">
                                        Trade Log {activeMonth ? `— ${result.monthResults.find(m => m.month === activeMonth)?.label}` : '— All Trades'}
                                    </span>
                                    <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">{activeTrades.length} trades</span>
                                </div>
                                <button
                                    onClick={() => setExpandTrades(!expandTrades)}
                                    className="text-slate-500 hover:text-white transition-colors p-1"
                                >
                                    {expandTrades ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                            </div>

                            {/* Always show last 10 visible trades, toggle to expand */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            {['Date', 'Entry', 'Exit', 'Type', 'Signal', 'Entry Spot', 'Exit Spot', 'Points', 'Net P&L', 'Exit Reason'].map(h => (
                                                <th key={h} className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(expandTrades ? activeTrades : activeTrades.slice(0, 20)).map(t => (
                                            <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                                <td className="px-4 py-2.5 font-mono text-slate-400">{t.date.slice(5)}</td>
                                                <td className="px-4 py-2.5 font-mono text-slate-300">{t.entryTime}</td>
                                                <td className="px-4 py-2.5 font-mono text-slate-300">{t.exitTime}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${t.type === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                        {t.type === 'LONG' ? 'CE BUY' : 'PE BUY'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate" title={t.signal}>{t.signal}</td>
                                                <td className="px-4 py-2.5 font-mono text-slate-300">{fmt(t.entrySpot)}</td>
                                                <td className="px-4 py-2.5 font-mono text-slate-300">{fmt(t.exitSpot)}</td>
                                                <td className={`px-4 py-2.5 font-mono font-bold ${t.points >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {fmtPts(t.points)}
                                                </td>
                                                <td className={`px-4 py-2.5 font-mono font-bold ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {fmtPnl(t.netPnl)}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`text-[9px] font-bold ${t.exitReason === 'TARGET' ? 'text-emerald-400' :
                                                        t.exitReason === 'SL' ? 'text-rose-400' :
                                                            t.exitReason === 'EODCLOSE' ? 'text-amber-400' :
                                                                'text-slate-500'
                                                        }`}>{t.exitReason}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {activeTrades.length > 20 && !expandTrades && (
                                    <div className="px-4 py-3 text-center">
                                        <button onClick={() => setExpandTrades(true)} className="text-[10px] text-slate-500 hover:text-white transition-colors">
                                            Show all {activeTrades.length} trades ↓
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
