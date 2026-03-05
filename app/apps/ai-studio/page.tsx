'use client';

import { useState } from 'react';
import {
    ArrowLeft, BarChart3, TrendingUp, TrendingDown,
    Calendar as CalendarIcon, Download, AlertCircle, Zap,
    CheckCircle2, XCircle, Brain, RefreshCw, Tag, Trash2, Edit3
} from 'lucide-react';
import Link from 'next/link';
import { useTradingStore } from '@/lib/store/tradingStore';
import { TradingStrategy } from '@/lib/algo/strategy';
import { aiEngine, MLTrainingData } from '@/lib/algo/aiEngine';
import AlgoRealtimeChart from '../algo/components/AlgoRealtimeChart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

// Note-based classification exclusively.

export default function AIStudioPage() {
    const { brokerCredentials } = useTradingStore();
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: oneWeekAgo,
        to: today
    });

    const [status, setStatus] = useState<'idle' | 'fetching' | 'ready' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [isCached, setIsCached] = useState(false);
    const [instrument, setInstrument] = useState<'25' | '13'>('25'); // 25 = BANKNIFTY, 13 = NIFTY

    const [candles, setCandles] = useState<any[]>([]);

    // Manual Feature Labelling State
    const [trainingDataset, setTrainingDataset] = useState<MLTrainingData[]>([]);
    const [selectedCandleIdx, setSelectedCandleIdx] = useState<number | null>(null);
    const [userNote, setUserNote] = useState('');

    const handleCandleClick = (idx: number) => {
        // Can't extract features if it's the first 15 candles
        if (idx < 15) {
            alert('Cannot label first 15 candles due to lack of historical data.');
            return;
        }
        setSelectedCandleIdx(idx);
    };

    const handleClassify = () => {
        if (selectedCandleIdx === null) return;
        if (!userNote.trim()) {
            alert('Please describe the market behavior in the note!');
            return;
        }

        const snapshot = TradingStrategy.buildFeatures(candles, selectedCandleIdx, userNote);
        if (!snapshot || !snapshot.mlFeatures) {
            alert('Could not extract mathematical features.');
            return;
        }

        const noteDetails = TradingStrategy.parseNote(userNote);

        const newData: MLTrainingData = {
            input: snapshot.mlFeatures,
            output: { success: noteDetails.success },
            meta: {
                timestamp: candles[selectedCandleIdx].time,
                caseId: 100,
                caseName: noteDetails.detectedName,
                userNote: userNote.trim()
            }
        };

        setTrainingDataset(prev => [...prev, newData]);
        setSelectedCandleIdx(null);
        setUserNote('');
    };

    const handleDeleteData = (timestamp: number) => {
        setTrainingDataset(prev => prev.filter(d => d.meta?.timestamp !== timestamp));
    };

    const handleEditData = (timestamp: number) => {
        const item = trainingDataset.find(d => d.meta?.timestamp === timestamp);
        const candleIdx = candles.findIndex(c => c.time === timestamp);
        if (item && candleIdx !== -1) {
            setSelectedCandleIdx(candleIdx);
            setUserNote(item.meta?.userNote || '');
            // Remove the old one so it's replaced on save
            handleDeleteData(timestamp);
        }
    };
    const fetchDataset = async () => {
        if (!dateRange?.from || !dateRange?.to) return;
        if (!brokerCredentials || !brokerCredentials.clientId || !brokerCredentials.accessToken) {
            setErrorMsg('Dhan Credentials Missing! Go to Algo page and connect your broker first.');
            setStatus('error');
            return;
        }

        setStatus('fetching');
        setProgress(0);
        setIsCached(false);
        setCandles([]);
        setTrainingDataset([]);

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
                setProgress(Math.round((i / chunks.length) * 100));

                const res = await fetch('/api/dhan/intraday', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        securityId: instrument,
                        exchangeSegment: 'IDX_I',
                        instrument: 'INDEX',
                        interval: '5',
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

            setCandles(deduped);
            setStatus('ready');
            setProgress(100);

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Error executing backtest sequence');
            setStatus('error');
        }
    };

    const handleCompileAI = async () => {
        if (trainingDataset.length === 0) return;

        try {
            const stats = aiEngine.trainModel(trainingDataset);
            console.log('Training stats:', stats);

            const rawWeights = aiEngine.exportWeights();
            const res = await fetch('/api/save-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weights: rawWeights,
                    metrics: {
                        error: stats.error,
                        iterations: stats.iterations,
                        samples: trainingDataset.length
                    }
                })
            });

            if (res.ok) {
                alert('Neural Network Compiled & Weights saved successfully!');
            } else {
                alert('Failed to save weights');
            }
        } catch (e) {
            console.error(e);
            alert('Error compiling AI');
        }
    };

    return (
        <div className="h-screen bg-[#0a0c10] text-slate-200 font-sans selection:bg-violet-500/30 overflow-hidden flex flex-col">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Header */}
            <header className="z-40 backdrop-blur-md bg-[#0a0c10]/70 border-b border-white/5 flex-shrink-0">
                <div className="max-w-full mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/apps" className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
                                <Brain size={18} className="text-violet-400" />
                                AI Studio <span className="text-slate-500 font-medium">Manual Training</span>
                            </h1>
                            <p className="text-xs text-slate-500">Label candlesticks directly on the chart to teach the AI Engine.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-[#0a0c10] border border-white/10 rounded-xl p-1">
                            <button
                                onClick={() => setInstrument('25')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${instrument === '25' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                BANKNIFTY
                            </button>
                            <button
                                onClick={() => setInstrument('13')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${instrument === '13' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                NIFTY
                            </button>
                        </div>

                        <div className="bg-[#0a0c10] border border-white/10 rounded-xl flex items-center px-3 py-2 gap-2 text-sm text-slate-300">
                            <CalendarIcon size={14} className="text-violet-400" />
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="hover:text-white transition-colors">
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y")
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
                        </div>

                        <button
                            onClick={fetchDataset}
                            disabled={status === 'fetching'}
                            className="h-10 px-6 bg-white text-black hover:bg-slate-200 rounded-xl text-xs tracking-wide font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {status === 'fetching' ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                            FETCH CHART
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 min-h-0 relative flex flex-col p-4 gap-4">
                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 mt-20">
                        <div className="p-5 bg-violet-500/10 rounded-3xl">
                            <Brain size={40} className="text-violet-400" />
                        </div>
                        <h2 className="text-white font-bold text-lg">AI Studio (Manual Setup Labelling)</h2>
                        <p className="text-slate-500 text-sm text-center max-w-md">
                            Fetch a continuous chart across multiple days. <br />
                            Click on any candlestick to extract its mathematical patterns and label it.
                        </p>
                    </div>
                )}

                {status === 'fetching' && (
                    <div className="flex flex-col items-center justify-center h-full gap-5 mt-20">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full border-2 border-white/5 flex items-center justify-center">
                                <BarChart3 size={28} className="text-violet-400 animate-pulse" />
                            </div>
                            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="30" fill="none" stroke="#7c3aed" strokeWidth="2"
                                    strokeDasharray={`${progress * 1.885} 188.5`} strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className="text-white font-bold text-lg">
                                {isCached ? `Pulling from Redis Cache... ${progress}%` : `Fetching Data... ${progress}%`}
                            </div>
                            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
                                Downloading 5-min {instrument === '25' ? 'BANKNIFTY' : 'NIFTY'} continuous session data.
                            </p>
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex items-center gap-4 p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl mx-auto max-w-3xl mt-20">
                        <AlertCircle size={20} className="text-rose-400 flex-shrink-0" />
                        <div>
                            <div className="text-rose-400 font-bold text-sm">Fetch Failed</div>
                            <div className="text-rose-400/70 text-xs mt-0.5">{errorMsg}</div>
                        </div>
                        <button onClick={fetchDataset} className="ml-auto text-xs text-rose-400 hover:text-white transition-colors">Retry →</button>
                    </div>
                )}

                {status === 'ready' && candles.length > 0 && (
                    <div className="flex-1 flex gap-4 min-h-0">
                        {/* ── Left Side: Full Chart Area ── */}
                        <div className="flex-1 min-w-0 flex flex-col gap-4 relative">
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-6 py-3 bg-violet-600/90 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl">
                                <div className="flex items-center gap-3 text-sm font-bold text-white">
                                    <Zap size={16} className="text-amber-400" />
                                    <span>Click a candle to label it</span>
                                </div>
                            </div>

                            <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden relative group">
                                <AlgoRealtimeChart
                                    data={candles}
                                    symbol={instrument === '25' ? 'BANKNIFTY' : 'NIFTY'}
                                    onCandleClick={handleCandleClick}
                                    trades={trainingDataset.map(d => ({
                                        id: d.meta?.timestamp,
                                        entryTimestamp: d.meta?.timestamp,
                                        type: d.output.success === 1 ? 'LONG' : 'SHORT',
                                        exitReason: 'LABEL'
                                    }))}
                                />

                                {/* Classification Overlay Modal */}
                                {selectedCandleIdx !== null && candles[selectedCandleIdx] && (
                                    <div className="absolute inset-0 bg-[#0a0c10]/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                                        <section className="w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                                            <div className="p-6 border-b border-white/5 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
                                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                    <Tag className="w-5 h-5 text-blue-400" />
                                                    Classify Market Scenario
                                                </h3>
                                                <p className="text-sm text-slate-400 mt-1">
                                                    Candle at {new Date(candles[selectedCandleIdx].time * 1000 + 330 * 60000).toLocaleString()}
                                                </p>
                                            </div>

                                            <div className="p-6">
                                                <div className="mb-6">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                                                        Explain Market Logic
                                                    </label>
                                                    <textarea
                                                        value={userNote}
                                                        onChange={(e) => setUserNote(e.target.value)}
                                                        placeholder="e.g. 'closing price break with big red candle and market reverse happen this is high probability trade to buy'"
                                                        className="w-full h-32 bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 transition-all resize-none shadow-inner"
                                                        autoFocus
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        onClick={handleClassify}
                                                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] hover:from-violet-500 hover:to-indigo-500 transition-all shadow-[0_10px_30px_rgba(124,58,237,0.3)] active:scale-[0.98] flex items-center justify-center gap-2"
                                                    >
                                                        <Brain size={16} />
                                                        Train AI with Observation
                                                    </button>

                                                    <button
                                                        onClick={() => setSelectedCandleIdx(null)}
                                                        className="w-full py-3 rounded-xl bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 hover:text-slate-300 transition-all"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Right Side: Compilation Sidebar ── */}
                        <aside className="hidden lg:flex flex-col w-[380px] gap-4">
                            <section className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex flex-col min-h-0">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                                    <h2 className="text-xs font-bold tracking-widest uppercase text-slate-400">Review Board</h2>
                                </div>

                                <div className="bg-[#0a0c10] border border-white/5 rounded-2xl p-6 mb-6 flex flex-col items-center">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Labeled Data</span>
                                    <span className="text-5xl font-black text-white">{trainingDataset.length}</span>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
                                    {trainingDataset.length === 0 ? (
                                        <div className="h-40 flex flex-col items-center justify-center text-center opacity-30 grayscale p-6">
                                            <Brain size={48} className="mb-4" />
                                            <p className="text-xs font-medium leading-relaxed">Choose some candles for the AI to analyze patterns.</p>
                                        </div>
                                    ) : (
                                        trainingDataset.map((d: any, i) => (
                                            <div
                                                key={i}
                                                className="w-full flex items-center justify-between p-4 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-2xl transition-all group relative"
                                            >
                                                <div
                                                    className="text-left cursor-pointer flex-1 min-w-0"
                                                    onClick={() => {
                                                        const idx = candles.findIndex(c => c.time === d.meta.timestamp);
                                                        if (idx !== -1) handleCandleClick(idx);
                                                    }}
                                                >
                                                    <div className="text-[9px] font-bold text-slate-500 font-mono tracking-tight">
                                                        {new Date(d.meta.timestamp * 1000 + 330 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className="text-xs font-bold text-white mt-0.5 truncate pr-2">
                                                        {d.meta.caseName}
                                                    </div>
                                                    {d.meta.userNote && (
                                                        <div className="text-[10px] text-slate-400 mt-1 italic truncate pr-2 opacity-70">
                                                            "{d.meta.userNote}"
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${d.output.success === 1 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'} group-hover:hidden transition-all duration-200`}>
                                                        {d.output.success === 1 ? 'VALID' : 'NOISE'}
                                                    </div>
                                                    <div className="hidden group-hover:flex items-center gap-1.5 animate-in slide-in-from-right-2 duration-200">
                                                        <button
                                                            onClick={() => handleEditData(d.meta.timestamp)}
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                                                            title="Edit Entry"
                                                        >
                                                            <Edit3 size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteData(d.meta.timestamp)}
                                                            className="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                                                            title="Delete Entry"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <button
                                    onClick={handleCompileAI}
                                    disabled={trainingDataset.length === 0}
                                    className="w-full py-5 bg-violet-600 hover:bg-violet-700 disabled:opacity-30 disabled:grayscale text-white rounded-2xl font-black uppercase tracking-[0.1em] text-xs transition-all shadow-[0_0_25px_rgba(124,58,237,0.4)]"
                                >
                                    Compile Hybrid Brain
                                </button>
                            </section>
                        </aside>
                    </div>
                )}
            </main>
        </div>
    );
}
