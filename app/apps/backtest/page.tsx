'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Play, RefreshCw, TrendingUp, TrendingDown,
    BarChart3, Target, ShieldAlert, Calendar as CalendarIcon, Activity,
    ChevronDown, ChevronUp, Download, AlertCircle, Zap,
    CheckCircle2, XCircle, Clock, Layers
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

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: twoMonthsAgo,
        to: today
    });

    const [status, setStatus] = useState<'idle' | 'fetching' | 'running' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const [candles, setCandles] = useState<any[]>([]);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [activeMonth, setActiveMonth] = useState<string | null>(null);
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const [expandTrades, setExpandTrades] = useState(false);
    const [instrument, setInstrument] = useState<'25' | '13'>('25'); // 25 = BANKNIFTY, 13 = NIFTY

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
        if (!dateRange?.from || !dateRange?.to) { setErrorMsg('Select a valid date range.'); setStatus('error'); return; }

        setStatus('fetching');
        setProgress(0);
        setResult(null);
        setErrorMsg('');

        try {
            const from = dateRange.from;
            const to = dateRange.to;
            const fromDateStr = from.toISOString().split('T')[0];
            const toDateStr = to.toISOString().split('T')[0];
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
                        securityId: instrument, // 25=BNF, 13=NIFTY
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
            // Assuming default quantity: 30 for BNF (2 lots of 15), 50 for NIFTY (2 lots of 25)
            const qty = instrument === '25' ? 30 : 50;
            const bt = runBacktest(deduped, { qty });
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
    }, [brokerCredentials, dateRange]);

    // ── Trades for active month & day ────────────────────────────────────────────
    const activeTrades: BacktestTrade[] = result
        ? result.trades.filter(t => {
            if (activeDay) return t.date === activeDay;
            if (activeMonth) return t.date.startsWith(activeMonth);
            return true;
        })
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
        <div className="h-screen flex flex-col bg-[#0a0c10] text-slate-200 font-sans overflow-hidden">
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[35%] h-[35%] bg-violet-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-blue-600/8 blur-[100px] rounded-full" />
            </div>

            {/* Header */}
            <header className="flex-shrink-0 z-40 backdrop-blur-md bg-[#0a0c10]/70 border-b border-white/5">
                <div className="w-full px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/apps" className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft size={18} />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                <BarChart3 size={16} className="text-violet-400" />
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-white leading-none">ADR Sniper Backtester</h1>
                                <p className="text-[10px] text-slate-500 mt-0.5">{instrument === '25' ? 'BankNifty' : 'Nifty'} · 1-Minute · Option Premium Mimic</p>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-3">
                        <select
                            value={instrument}
                            onChange={(e) => setInstrument(e.target.value as '25' | '13')}
                            className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-xl px-3 py-2 outline-none"
                        >
                            <option value="25">BANKNIFTY</option>
                            <option value="13">NIFTY</option>
                        </select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-300 hover:bg-white/10 transition-colors outline-none text-[11px] font-mono whitespace-nowrap">
                                    <CalendarIcon size={12} className="text-slate-500" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "MMM dd, yyyy")} - {format(dateRange.to, "MMM dd, yyyy")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "MMM dd, yyyy")
                                        )
                                    ) : (
                                        <span>Pick a date range</span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
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

            <main className={`flex-1 min-h-0 ${status === 'done' ? 'flex p-4 gap-4' : 'overflow-y-auto max-w-7xl mx-auto px-6 py-6 w-full'}`}>

                {/* ── Progress / Error / Idle state ────────────────────────── */}
                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="p-5 bg-violet-500/10 rounded-3xl">
                            <BarChart3 size={40} className="text-violet-400" />
                        </div>
                        <h2 className="text-white font-bold text-lg">Ready to Backtest</h2>
                        <p className="text-slate-500 text-sm text-center max-w-md">
                            Select a date range (up to 2 months) and click "Run Backtest".<br />
                            The engine fetches real 1-min data from Dhan and runs the full ADR Sniper strategy logic.
                        </p>
                        <div className="flex gap-3 mt-2">
                            {['9:15–15:15 window', 'Dynamic Pre-Market Bias', 'ITM Strike Avoidance Logic', '2 lots fixed'].map(t => (
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
                                {status === 'fetching' ? `Fetching historical data… ${progress}%` : 'Running ADR Sniper strategy…'}
                            </div>
                            <p className="text-slate-500 text-xs mt-1">
                                {status === 'fetching' ? `Downloading 1-min ${instrument === '25' ? 'BANKNIFTY' : 'NIFTY'} candles from Dhan API` : 'Simulating entries, exits, and daily risk state'}
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
                        {/* LEFT VISUAL PANEL */}
                        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white/[0.02] border border-white/5 rounded-2xl p-4 gap-3">
                            <div className="flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        {instrument === '25' ? 'BANKNIFTY' : 'NIFTY'} · 1 MIN · {activeDay ? activeDay.slice(5) : (activeMonth ? activeMonth : 'ALL')}
                                    </span>
                                    <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                                        {activeTrades.length} SIGNALS MARKED
                                    </span>
                                    {activeDay && (
                                        <button
                                            onClick={() => setActiveDay(null)}
                                            className="text-[10px] ml-2 font-bold px-3 py-1 rounded-full border border-rose-500/50 text-rose-400 hover:bg-rose-500/10 transition-colors uppercase"
                                        >
                                            Reset Filter
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-[#0a0c10] border border-white/5 relative">
                                {activeDay && (
                                    <AlgoRealtimeChart
                                        data={result.allCandles.filter((c: any) => {
                                            const d = new Date(c.time * 1000 + 330 * 60000).toISOString().split('T')[0];
                                            return d === activeDay;
                                        })}
                                        symbol={instrument === '25' ? 'BANKNIFTY' : 'NIFTY'}
                                        trades={activeTrades}
                                    />
                                )}
                                {!activeDay && (
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
                        <div className="w-[450px] xl:w-[500px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2 pb-6 custom-scrollbar">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                <StatCard label="Net P&L" value={fmtPnl(result.netPnl)} sub={`${result.totalTrades} Trades`} color={result.netPnl >= 0 ? 'emerald' : 'rose'} />
                                <StatCard label="Win Rate" value={`${result.winRate}%`} sub={`${result.wins}W / ${result.losses}L`} color={result.winRate >= 55 ? 'emerald' : result.winRate >= 45 ? 'amber' : 'rose'} />
                                <StatCard label="Drawdown" value={fmtPnl(-result.maxDrawdown)} sub="Peak to trough" color="rose" />
                                <StatCard label="Avg Win" value={fmtPnl(result.avgWin)} sub="Per Winner" color="emerald" />
                            </div>

                            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Equity Curve</span>
                                    <span className={`text-xs font-black font-mono ${finalEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {fmtPnl(finalEquity)}
                                    </span>
                                </div>
                                <div className="h-16 flex items-end gap-[1px]">
                                    {equityCurve.map((v, i) => {
                                        const max = Math.max(Math.abs(peakEquity), Math.abs(Math.min(...equityCurve)));
                                        const pct = max > 0 ? Math.abs(v) / max : 0;
                                        const h = Math.max(2, pct * 64);
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

                            <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2">Monthly Filter</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {result.monthResults.map(m => (
                                        <button
                                            key={m.month}
                                            onClick={() => setActiveMonth(activeMonth === m.month ? null : m.month)}
                                            className={`text-left rounded-xl border p-3 transition-all hover:bg-white/5 ${activeMonth === m.month
                                                ? 'border-violet-500/40 bg-violet-500/5'
                                                : 'border-white/5 bg-white/[0.02]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[11px] font-bold text-white">{m.label}</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${m.winRate >= 60 ? 'bg-emerald-500/15 text-emerald-400' :
                                                    m.winRate >= 45 ? 'bg-amber-500/15 text-amber-400' :
                                                        'bg-rose-500/15 text-rose-400'
                                                    }`}>{m.winRate}%</span>
                                            </div>
                                            <div className={`text-lg font-black font-mono mb-2 ${m.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {fmtPnl(m.netPnl)}
                                            </div>
                                            <div className="text-[8px] text-slate-500 flex justify-between uppercase">
                                                <span>Trades: {m.trades}</span>
                                                <span>{m.profitableDays}/{m.totalDays} Days Profit</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activeMonth && (
                                <div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2">Day Viewer — {activeMonthResult?.label}</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {result.dayResults.filter(d => d.date.startsWith(activeMonth)).map(d => (
                                            <button
                                                key={d.date}
                                                onClick={() => setActiveDay(activeDay === d.date ? null : d.date)}
                                                className={`rounded-xl border p-2 text-center transition-all hover:bg-white/5 ${activeDay === d.date ? 'border-violet-500/50 bg-violet-500/10 border-solid' : 'border-white/5 bg-white/[0.02] border-dashed'}`}
                                            >
                                                <div className="text-[9px] font-bold text-slate-400 mb-0.5">{d.date.slice(5)}</div>
                                                <div className={`text-[11px] font-black font-mono tracking-tighter ${d.dayNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {d.dayNetPnl > 0 ? '+' : ''}{fmt(d.dayNetPnl)}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden mt-1">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                                    <div className="flex items-center gap-2">
                                        <Clock size={12} className="text-slate-500" />
                                        <span className="text-[11px] font-bold text-white uppercase tracking-widest">Trade Log {activeDay ? `(${activeDay.slice(5)})` : activeMonth ? `(${activeMonthResult?.label})` : ''}</span>
                                    </div>
                                    <span className="text-[9px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded-full">{activeTrades.length} records</span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-black/20">
                                                {['Time', 'Dir', 'Signal', 'Net PnL'].map(h => (
                                                    <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeTrades.slice(0, 50).map(t => (
                                                <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                                    <td className="px-3 py-2 font-mono text-slate-400">
                                                        <div className="leading-none">{t.entryTime}</div>
                                                        <div className="text-[8px] text-slate-600 mt-1">{t.date.slice(5)}</div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`px-1 py-0.5 rounded text-[8px] font-monospace font-black ${t.type === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                            {t.type === 'LONG' ? 'CE' : 'PE'}
                                                        </span>
                                                        <div className="text-[8px] text-slate-500 mt-1 lowercase truncate w-10">{t.exitReason}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-[9px] text-slate-500 max-w-[120px] truncate" title={t.signal}>
                                                        {t.signal}
                                                    </td>
                                                    <td className={`px-3 py-2 font-mono font-bold text-right ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {fmtPnl(t.netPnl)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {activeTrades.length > 50 && (
                                                <tr>
                                                    <td colSpan={4} className="px-3 py-3 text-center text-slate-600 font-bold text-[9px] bg-black/10">
                                                        +{activeTrades.length - 50} older trades hidden
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
