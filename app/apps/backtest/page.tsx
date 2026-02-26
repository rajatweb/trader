'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    ArrowLeft,
    Play,
    Settings,
    Calendar,
    BarChart3,
    History,
    TrendingUp,
    Percent,
    Target,
    ShieldAlert,
    ChevronRight,
    Search,
    Download,
    Share2,
    Filter,
    ChevronLeft,
    ChevronRight as ChevronRightIcon,
    FastForward,
    Rewind,
    Plus,
    Minus,
    Layers,
    Clock,
    Activity,
    RefreshCw,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    X
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

import D3Chart, { OHLCV } from './components/D3Chart';

import { useTradingStore } from '@/lib/store/tradingStore';

interface Instrument {
    exchange: string;
    segment: string;
    securityId: string;
    symbol: string;
    tradingSymbol: string;
}

const MOCK_HISTORICAL_CHAIN = [
    { strike: 22000, ce_ltp: 450.5, pe_ltp: 12.3, ce_oi: '45L', pe_oi: '2L' },
    { strike: 22100, ce_ltp: 380.2, pe_ltp: 25.8, ce_oi: '32L', pe_oi: '5L' },
    { strike: 22200, ce_ltp: 315.0, pe_ltp: 48.5, ce_oi: '28L', pe_oi: '12L' },
    { strike: 22300, ce_ltp: 245.8, pe_ltp: 92.4, ce_oi: '55L', pe_oi: '45L' }, // ATM
    { strike: 22400, ce_ltp: 185.3, pe_ltp: 155.0, ce_oi: '12L', pe_oi: '65L' },
    { strike: 22500, ce_ltp: 125.1, pe_ltp: 220.8, ce_oi: '8L', pe_oi: '38L' },
    { strike: 22600, ce_ltp: 85.5, pe_ltp: 310.2, ce_oi: '3L', pe_oi: '25L' },
];

export default function ManualBacktestPage() {
    const { brokerCredentials } = useTradingStore();
    const [currentTime, setCurrentTime] = useState("");
    const [spotPrice, setSpotPrice] = useState(0);
    const [chartData, setChartData] = useState<OHLCV[]>([]);
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Config States
    const [selectDate, setSelectDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedInst, setSelectedInst] = useState<Instrument>({
        exchange: 'NSE',
        segment: 'IDX_I',
        securityId: '13',
        symbol: 'NIFTY 50',
        tradingSymbol: 'NIFTY'
    });

    const [activePositions, setActivePositions] = useState<any[]>([]);
    const [rollingData, setRollingData] = useState<Record<string, { ce: any[], pe: any[] }>>({});
    const [simPositions, setSimPositions] = useState<any[]>([]);
    const [tradeLogs, setTradeLogs] = useState<{ time: string, msg: string, color: string }[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [strikeOffset, setStrikeOffset] = useState(0); // 0 = ATM, -1 = ATM-1, etc.

    const formatRollingData = (raw: any, fallbackStrike?: number) => {
        if (!raw || !raw.timestamp || !raw.close) return [];

        const getTs = (val: any) => {
            const n = Number(val);
            return n > 20000000000 ? n / 1000 : n;
        };

        const step = selectedInst.symbol.includes('BANK') ? 100 : 50;

        return raw.timestamp.map((t: number, i: number) => {
            const s = Number(raw.strike ? raw.strike[i] : (fallbackStrike || 0));
            return {
                time: getTs(t),
                close: Number(raw.close[i] || 0),
                // If strike is missing/NaN, we can't easily infer it here without spot, 
                // but let's at least ensure it's not NaN
                strike: isNaN(s) ? (fallbackStrike || 0) : s
            };
        });
    };

    useEffect(() => {
        if (!brokerCredentials) return;
        fetchHistory();
    }, [selectDate, selectedInst, brokerCredentials]);

    // Auto Play Logic
    useEffect(() => {
        let timer: any;
        if (isPlaying && playbackIndex < chartData.length - 1) {
            timer = setInterval(() => {
                setPlaybackIndex(prev => prev + 1);
            }, 1000); // 1 candle per second
        } else if (playbackIndex >= chartData.length - 1) {
            setIsPlaying(false);
        }
        return () => clearInterval(timer);
    }, [isPlaying, playbackIndex, chartData.length]);

    const fetchHistory = async () => {
        setIsLoading(true);
        setPlaybackIndex(0);
        setIsPlaying(false);
        try {
            // Fetch previous 2 days + selected day for continuity
            const targetDate = new Date(selectDate);
            const fromDate = new Date(targetDate);
            fromDate.setDate(fromDate.getDate() - 3); // 3 days ago

            const res = await fetch('/api/dhan/historical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    securityId: selectedInst.securityId,
                    exchangeSegment: selectedInst.segment,
                    instrument: selectedInst.segment.includes('IDX') ? 'INDEX' : 'EQUITY',
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate: selectDate
                })
            });

            const json = await res.json();

            if (json.success && json.data) {
                // Dhan can return data directly or nested in a 'data' field
                let raw = json.data;
                if (raw.data && (Array.isArray(raw.data) || typeof raw.data === 'object')) {
                    raw = raw.data;
                }

                let formatted: OHLCV[] = [];

                const getTimestamp = (val: any) => {
                    if (typeof val === 'string') return new Date(val).getTime() / 1000;
                    if (typeof val === 'number') {
                        // Dhan sometimes returns seconds, sometimes milliseconds
                        return val > 20000000000 ? val / 1000 : val;
                    }
                    return 0;
                };

                if (Array.isArray(raw)) {
                    formatted = raw.map((d: any) => ({
                        time: getTimestamp(d.start_Time || d.timestamp || d.timeStamp || d.time),
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                        volume: d.volume || 0
                    }));
                } else if (raw && typeof raw === 'object') {
                    const timeKey = ['start_Time', 'timestamp', 'timeStamp', 'time'].find(k => Array.isArray(raw[k]));
                    if (timeKey) {
                        const times = raw[timeKey];
                        for (let i = 0; i < times.length; i++) {
                            formatted.push({
                                time: getTimestamp(times[i]),
                                open: raw.open?.[i] || 0,
                                high: raw.high?.[i] || 0,
                                low: raw.low?.[i] || 0,
                                close: raw.close?.[i] || 0,
                                volume: raw.volume?.[i] || 0
                            });
                        }
                    }
                }

                if (formatted.length > 0) {
                    setChartData(formatted);

                    // Match the selected date (IST)
                    const targetDateStr = selectDate; // YYYY-MM-DD
                    const openIndex = formatted.findIndex(d => {
                        const date = new Date(d.time * 1000);
                        // Convert to Indian local date string for comparison
                        const dStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
                        const h = date.getHours();
                        const m = date.getMinutes();
                        return dStr === targetDateStr && (h > 9 || (h === 9 && m >= 15));
                    });

                    setPlaybackIndex(openIndex !== -1 ? openIndex : 0);

                    // Also fetch Rolling Option Data (ATM) for the selected period
                    fetchRollingData();
                } else {
                    setChartData([]);
                    setPlaybackIndex(0);
                }
            } else {
                setChartData([]);
                setPlaybackIndex(0);
            }
        } catch (err) {
            console.error("Failed to fetch historical data", err);
            setChartData([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRollingData = async () => {
        if (!brokerCredentials) return;
        try {
            const targetDate = new Date(selectDate);
            const fromDate = new Date(targetDate);
            fromDate.setDate(fromDate.getDate() - 1);

            // Fetch ATM only initially for the display panel
            const res = await fetch('/api/dhan/rolling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials.clientId,
                    accessToken: brokerCredentials.accessToken,
                    securityId: selectedInst.securityId,
                    exchangeSegment: 'NSE_FNO',
                    instrument: 'OPTIDX',
                    expiryFlag: 'MONTH',
                    expiryCode: 1,
                    strike: 'ATM',
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate: selectDate
                })
            });

            const json = await res.json();
            if (json.success && json.data?.data) {
                const ceRaw = json.data.data.ce;
                const peRaw = json.data.data.pe;

                const atmData = {
                    ce: formatRollingData(ceRaw),
                    pe: formatRollingData(peRaw)
                };

                setRollingData({ 'ATM': atmData });

                // Proactively cache the neighbors to reduce 'Fetch on Buy' latency
                // We do this with a significant delay to avoid 429 on page load
                const neighbors = ['ATM-1', 'ATM-2', 'ATM+1', 'ATM+2'];
                for (const strike of neighbors) {
                    await new Promise(r => setTimeout(r, 1000));
                    fetchSpecificRelStrike(strike);
                }
            }
        } catch (err) {
            console.error("Failed to fetch initial rolling data", err);
        }
    };

    const fetchSpecificRelStrike = async (rel: string) => {
        if (!brokerCredentials) return;
        try {
            const targetDate = new Date(selectDate);
            const fromDate = new Date(targetDate);
            fromDate.setDate(fromDate.getDate() - 1);

            const res = await fetch('/api/dhan/rolling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials.clientId,
                    accessToken: brokerCredentials.accessToken,
                    securityId: selectedInst.securityId,
                    exchangeSegment: 'NSE_FNO',
                    instrument: 'OPTIDX',
                    expiryFlag: 'WEEK',
                    expiryCode: 1,
                    strike: rel,
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate: selectDate
                })
            });
            const json = await res.json();
            if (json.success && json.data?.data) {
                setRollingData(prev => ({
                    ...prev,
                    [rel]: {
                        ce: formatRollingData(json.data.data.ce),
                        pe: formatRollingData(json.data.data.pe)
                    }
                }));
            }
        } catch (e) { }
    };

    const fetchSpecificStrike = async (strikeValue: number) => {
        if (rollingData[strikeValue]) return rollingData[strikeValue];
        if (!brokerCredentials) return null;

        try {
            const targetDate = new Date(selectDate);
            const fromDate = new Date(targetDate);
            fromDate.setDate(fromDate.getDate() - 1);

            const res = await fetch('/api/dhan/rolling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials.clientId,
                    accessToken: brokerCredentials.accessToken,
                    securityId: selectedInst.securityId,
                    exchangeSegment: 'NSE_FNO',
                    instrument: 'OPTIDX',
                    expiryFlag: 'WEEK',
                    expiryCode: 1,
                    strike: strikeValue?.toString() || 'ATM',
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate: selectDate
                })
            });

            const json = await res.json();
            if (json.success && json.data?.data) {
                const data = {
                    ce: formatRollingData(json.data.data.ce, strikeValue),
                    pe: formatRollingData(json.data.data.pe, strikeValue)
                };

                setRollingData(prev => ({ ...prev, [strikeValue]: data }));
                return data;
            }
        } catch (err) {
            console.error(`Failed to fetch specific strike ${strikeValue}`, err);
        }
        return null;
    };

    // Derived States
    const currentCandle = chartData[playbackIndex];
    const visibleData = chartData.slice(0, playbackIndex + 1);

    // Locked Strike Price Finder
    const getOptionPrice = (type: 'CE' | 'PE', lockedStrike?: number) => {
        if (!currentCandle) return 0;

        // If we are tracking a fixed strike: Search all cached data for this absolute strike
        if (lockedStrike) {
            for (const key in rollingData) {
                const leg = type === 'CE' ? rollingData[key].ce : rollingData[key].pe;
                const match = leg.find((d: any) => Math.abs(d.time - currentCandle.time) < 65);
                if (match && Math.abs(match.strike - lockedStrike) < 5) {
                    return match.close;
                }
            }
            return 0;
        }

        // Default Display (for the panel) - uses world strikeOffset
        const relKey = strikeOffset === 0 ? 'ATM' : strikeOffset > 0 ? `ATM+${strikeOffset}` : `ATM${strikeOffset}`;
        const atm = rollingData[relKey] || rollingData['ATM'];
        if (!atm) return 0;
        const data = type === 'CE' ? atm.ce : atm.pe;
        const match = data.find((d: any) => Math.abs(d.time - currentCandle.time) < 65);
        return match ? match.close : 0;
    };

    const currentCEPrice = getOptionPrice('CE') || 0;
    const currentPEPrice = getOptionPrice('PE') || 0;

    useEffect(() => {
        if (currentCandle) {
            setSpotPrice(currentCandle.close);
            const d = new Date(currentCandle.time * 1000);
            setCurrentTime(d.toTimeString().split(' ')[0].slice(0, 5));
        }
    }, [currentCandle]);

    const handleBuyTrade = async (type: 'CE' | 'PE') => {
        setIsExecuting(true);
        try {
            // 1. Identify current target strike price based on selection
            const relKey = strikeOffset === 0 ? 'ATM' : strikeOffset > 0 ? `ATM+${strikeOffset}` : `ATM${strikeOffset}`;
            const targetData = rollingData[relKey] || rollingData['ATM'];
            const match = targetData?.[type.toLowerCase() as 'ce' | 'pe']?.find((d: any) => Math.abs(d.time - currentCandle.time) < 65);

            // Robust strike identification
            let entryStrike = match?.strike;
            if (typeof entryStrike !== 'number') {
                // Fallback: Calculate nearest strike based on spot
                const step = selectedInst.symbol.includes('BANK') ? 100 : 50;
                entryStrike = Math.round(spotPrice / step) * step;
            }

            // 2. Fetch the FULL historical day data for this specific strike if not cached
            const strikeData = await fetchSpecificStrike(entryStrike);

            // 3. Get the price from the newly loaded data
            let price = getOptionPrice(type, entryStrike);

            // If the state hasn't updated yet, try to find it in the just-returned data
            if (price === 0 && strikeData) {
                const leg = type === 'CE' ? strikeData.ce : strikeData.pe;
                const matchPrice = leg.find((d: any) => Math.abs(d.time - currentCandle.time) < 65);
                price = matchPrice ? matchPrice.close : 0;
            }

            if (price === 0) throw new Error("Could not find price for strike");

            const newPos = {
                id: Date.now(),
                symbol: `${selectedInst.tradingSymbol} ${entryStrike} ${type}`,
                type,
                qty: selectedInst.symbol.includes('BANK') ? 15 : 50,
                avg: price,
                strike: entryStrike,
                time: currentTime
            };

            setSimPositions(prev => [...prev, newPos]);
            setTradeLogs(prev => [{
                time: currentTime,
                msg: `Executed: ${newPos.symbol} @ ${price.toFixed(2)}`,
                color: 'text-blue-600'
            }, ...prev]);
        } catch (err) {
            console.error("Trade execution failed", err);
        } finally {
            setIsExecuting(false);
        }
    };

    const handleSquareOff = (id: number) => {
        const pos = simPositions.find(p => p.id === id);
        if (!pos) return;
        const exitPrice = getOptionPrice(pos.type, pos.strike);
        const pnl = (exitPrice - pos.avg) * pos.qty;

        setSimPositions(prev => prev.filter(p => p.id !== id));
        setTradeLogs(prev => [{
            time: currentTime,
            msg: `Sold ${pos.symbol} @ ${exitPrice.toFixed(2)} (P&L: ₹${pnl.toFixed(2)})`,
            color: pnl >= 0 ? 'text-green-600' : 'text-rose-600'
        }, ...prev]);
    };

    const calculateTotalPnL = () => {
        return simPositions.reduce((acc, pos) => {
            const currentPrice = getOptionPrice(pos.type, pos.strike);
            return acc + (currentPrice - pos.avg) * pos.qty;
        }, 0);
    };

    const handleStepForward = () => {
        if (playbackIndex < chartData.length - 1) {
            setPlaybackIndex(prev => prev + 1);
        }
    };

    const handleStepBack = () => {
        if (playbackIndex > 0) {
            setPlaybackIndex(prev => prev - 1);
        }
    };

    const handleFastForward = () => {
        setPlaybackIndex(Math.min(chartData.length - 1, playbackIndex + 10));
    };

    const handleRewind = () => {
        setPlaybackIndex(Math.max(0, playbackIndex - 10));
    };

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-800 font-sans selection:bg-blue-100">
            {/* Top Command Bar */}
            <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <Link href="/apps" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-wider uppercase">Manual SIM</span>
                            <h1 className="text-sm font-semibold text-slate-700 uppercase">
                                {selectedInst.symbol} • {new Date(selectDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200/50">
                    <button onClick={handleRewind} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-slate-500 transition-all"><Rewind size={16} /></button>
                    <button onClick={handleStepBack} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-slate-500 transition-all"><ChevronLeft size={16} /></button>

                    <div className="px-4 py-1.5 bg-white shadow-sm rounded-lg border border-slate-200 flex flex-col items-center justify-center min-w-[140px]">
                        <span className="text-[10px] font-bold text-slate-400 leading-none mb-0.5 uppercase tracking-tighter">Current Candle</span>
                        <span className="text-xs font-mono font-bold text-slate-700 leading-none">{currentTime || '--:--'}</span>
                    </div>

                    <button onClick={handleStepForward} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-slate-700 transition-all"><ChevronRightIcon size={16} /></button>
                    <button onClick={handleFastForward} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-slate-700 transition-all"><FastForward size={16} /></button>

                    <div className="w-px h-6 bg-slate-200 mx-1"></div>

                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${isPlaying ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                        {isPlaying ? <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div> : <Play size={12} fill="currentColor" />}
                        {isPlaying ? 'PAUSE' : 'AUTO REPLAY'}
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Spot Price</span>
                        <span className="text-sm font-mono font-bold text-slate-800">₹{spotPrice.toFixed(2)}</span>
                    </div>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors border border-slate-200">
                        <Settings size={18} />
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Configuration & Replay Log */}
                <aside className="w-[280px] bg-white border-r border-slate-200 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Simulator Config</h3>
                        <Activity size={14} className="text-blue-500" />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        <section className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Instrument & Date</label>
                            <div className="space-y-2">
                                <input
                                    type="date"
                                    value={selectDate}
                                    onChange={(e) => setSelectDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium outline-none"
                                />
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                                    value={selectedInst.securityId}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '13') setSelectedInst({ exchange: 'NSE', segment: 'IDX_I', securityId: '13', symbol: 'NIFTY 50', tradingSymbol: 'NIFTY' });
                                        if (val === '25') setSelectedInst({ exchange: 'NSE', segment: 'IDX_I', securityId: '25', symbol: 'BANKNIFTY', tradingSymbol: 'BANKNIFTY' });
                                    }}
                                >
                                    <option value="13">NIFTY 50</option>
                                    <option value="25">BANKNIFTY</option>
                                </select>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Simulator Stats</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-[9px] font-bold text-slate-400 block mb-1">TOTAL P&L</span>
                                    <span className={`text-sm font-bold ${calculateTotalPnL() >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                                        ₹{calculateTotalPnL().toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-[9px] font-bold text-slate-400 block mb-1">OPEN POS</span>
                                    <span className="text-sm font-bold text-slate-600">{simPositions.length}</span>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Action Log</label>
                                <span onClick={() => setTradeLogs([])} className="text-[9px] text-blue-500 font-bold hover:underline cursor-pointer">Clear</span>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                {tradeLogs.map((log, i) => (
                                    <div key={i} className="flex gap-2 text-[10px] leading-tight group border-b border-slate-50 pb-1">
                                        <span className="text-slate-400 font-mono italic shrink-0">{log.time}</span>
                                        <span className={`font-medium ${log.color}`}>{log.msg}</span>
                                    </div>
                                ))}
                                {tradeLogs.length === 0 && <span className="text-[10px] text-slate-300 italic">No activity yet...</span>}
                            </div>
                        </section>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-200">
                        <button className="w-full bg-white border border-slate-200 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            <Download size={14} />
                            EXPORT RESULTS
                        </button>
                    </div>
                </aside>

                {/* Center Content: Full Page Chart */}
                <main className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] p-4 gap-4 overflow-hidden">
                    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="h-10 border-b border-slate-100 flex items-center justify-between px-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={14} className="text-blue-500" />
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Index Spot Chart</span>
                            </div>
                            <div className="flex gap-1">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">1m</span>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 relative bg-white overflow-hidden">
                            {isLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fetching Market History...</span>
                                    </div>
                                </div>
                            ) : !isLoading && chartData.length === 0 ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
                                    <div className="text-center">
                                        <AlertCircle className="mx-auto text-slate-300 mb-2" size={32} />
                                        <h3 className="text-xs font-bold text-slate-600">No Data Available</h3>
                                        <p className="text-[10px] text-slate-400 mt-1">Try another date or check your connection.</p>
                                    </div>
                                </div>
                            ) : null}
                            <D3Chart key={`${selectedInst.securityId}-${selectDate}`} data={visibleData} />
                        </div>
                    </div>
                </main>

                {/* Right Panel: Expired Options Execution & Positions */}
                <aside className="w-[320px] bg-white border-l border-slate-200 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Execution Panel</h3>
                        <div className="flex gap-1">
                            <div className={`w-2 h-2 rounded-full ${rollingData['ATM']?.ce?.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Option Buying Section */}
                        <section className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Select Strike Type</label>
                                <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    {[-2, -1, 0, 1, 2].map((offset) => (
                                        <button
                                            key={offset}
                                            onClick={() => setStrikeOffset(offset)}
                                            className={`py-1.5 text-[9px] font-bold rounded-lg transition-all ${strikeOffset === offset
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:bg-white/50'
                                                }`}
                                        >
                                            {offset === 0 ? 'ATM' : offset > 0 ? `OTM+${offset}` : `ITM${offset}`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">
                                    Current Strike: <span className="text-blue-600">
                                        {(() => {
                                            const relKey = strikeOffset === 0 ? 'ATM' : strikeOffset > 0 ? `ATM+${strikeOffset}` : `ATM${strikeOffset}`;
                                            const data = rollingData[relKey]?.ce;
                                            const match = data?.find((d: any) => Math.abs(d.time - (currentCandle?.time || 0)) < 65);

                                            if (match && !isNaN(match.strike) && match.strike > 0) {
                                                return match.strike;
                                            }

                                            // Fallback calculation if data hasn't loaded yet
                                            const step = selectedInst.symbol.includes('BANK') ? 100 : 50;
                                            const atm = Math.round(spotPrice / step) * step;
                                            return atm + (strikeOffset * step);
                                        })()}
                                    </span>
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-3 relative">
                                {isExecuting && (
                                    <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center backdrop-blur-[1px]">
                                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                                <button
                                    onClick={() => handleBuyTrade('CE')}
                                    disabled={isExecuting}
                                    className="group relative bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-2xl p-4 transition-all disabled:opacity-50"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase font-mono">
                                            {strikeOffset === 0 ? 'ATM' : strikeOffset > 0 ? `OTM+${strikeOffset}` : `ITM${strikeOffset}`} CE
                                        </span>
                                        <ArrowUpRight size={14} className="text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                    </div>
                                    <div className="text-lg font-mono font-black text-emerald-700">₹{currentCEPrice.toFixed(1)}</div>
                                    <div className="text-[9px] font-bold text-emerald-500/70 mt-1 uppercase tracking-tighter">Buy Call</div>
                                </button>

                                <button
                                    onClick={() => handleBuyTrade('PE')}
                                    disabled={isExecuting}
                                    className="group relative bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl p-4 transition-all disabled:opacity-50"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-rose-600 uppercase font-mono">
                                            {strikeOffset === 0 ? 'ATM' : strikeOffset > 0 ? `ITM${strikeOffset}` : `OTM+${strikeOffset}`} PE
                                        </span>
                                        <ArrowDownRight size={14} className="text-rose-400 group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform" />
                                    </div>
                                    <div className="text-lg font-mono font-black text-rose-700">₹{currentPEPrice.toFixed(1)}</div>
                                    <div className="text-[9px] font-bold text-rose-500/70 mt-1 uppercase tracking-tighter">Buy Put</div>
                                </button>
                            </div>
                        </section>

                        {/* Active Positions */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Active Positions ({simPositions.length})</label>
                                {simPositions.length > 0 && <button onClick={() => simPositions.forEach(p => handleSquareOff(p.id))} className="text-[9px] font-bold text-rose-500 hover:underline">Square Off All</button>}
                            </div>

                            <div className="space-y-3">
                                {simPositions.map((pos) => {
                                    const currentPrice = getOptionPrice(pos.type, pos.strike);
                                    const pnl = (currentPrice - pos.avg) * pos.qty;
                                    return (
                                        <div key={pos.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{pos.symbol}</h4>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase">{pos.time} • {pos.strike}</p>
                                                </div>
                                                <button onClick={() => handleSquareOff(pos.id)} className="p-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-lg transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="space-y-1">
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Entry @ ₹{pos.avg.toFixed(2)}</div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">LTP @ ₹{currentPrice.toFixed(2)}</div>
                                                </div>
                                                <div className={`text-sm font-mono font-black ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {simPositions.length === 0 && (
                                    <div className="border-2 border-dashed border-slate-100 rounded-2xl p-8 text-center">
                                        <Activity size={24} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">No Active Trades</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </aside>
            </div>
        </div>
    );
}

