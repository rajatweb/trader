'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTradingStore } from '@/lib/store';
import { ArrowLeft, Play, Pause, RefreshCw, BarChart2, Activity, ShieldAlert, Crosshair } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChartData } from './components/D3CandlestickChart';

// Dynamic import with no SSR to prevent hydrating D3 issues
const D3CandlestickChart = dynamic(() => import('./components/D3CandlestickChart'), {
    ssr: false,
    loading: () => <div className="flex-1 flex items-center justify-center text-gray-500 animate-pulse bg-gray-900 rounded-lg">Loading Chart Engine...</div>
});

// Sync any OHLC dataset to a strict 1-min grid from 09:15 to 15:30
function syncToTimeline(data: any, dateStr: string) {
    if (!data || !data.timestamp || data.timestamp.length === 0) return null;

    // Define market boundary (Dhan timestamps are SECONDS)
    const startTimeStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const startTs = new Date(`${startTimeStr} 09:15:00`).getTime() / 1000;
    const endTs = new Date(`${startTimeStr} 15:30:00`).getTime() / 1000;

    const timelineTS: number[] = [];
    for (let t = startTs; t <= endTs; t += 60) {
        timelineTS.push(t);
    }

    const dataMap = new Map();
    const isIndexData = data.timestamp[0] % 60 === 0 && (new Date(data.timestamp[0] * 1000).getMinutes() === 16);

    for (let i = 0; i < data.timestamp.length; i++) {
        // If it's Index data starting at 09:16, shift it to 09:15 to match Options start-time convention
        let ts = data.timestamp[i];
        if (isIndexData) ts -= 60;

        const minuteTs = Math.floor(ts / 60) * 60;
        dataMap.set(minuteTs, i);
    }

    const synced: any = {
        open: [], high: [], low: [], close: [], volume: [], timestamp: timelineTS,
        strike: [], spot: []
    };

    let lastValidClose = data.close[0] || data.open[0] || 0;
    let lastValidStrike = data.strike?.[0] || 0;
    let lastValidSpot = data.spot?.[0] || 0;

    timelineTS.forEach((ts) => {
        if (dataMap.has(ts)) {
            const idx = dataMap.get(ts);
            const o = data.open[idx] || lastValidClose;
            synced.open.push(o);
            synced.high.push(data.high[idx] || o);
            synced.low.push(data.low[idx] || o);
            synced.close.push(data.close[idx] || o);
            synced.volume.push(data.volume[idx] || 0);
            synced.strike.push(data.strike?.[idx] || lastValidStrike);
            synced.spot.push(data.spot?.[idx] || lastValidSpot);

            lastValidClose = synced.close[synced.close.length - 1];
            lastValidStrike = synced.strike[synced.strike.length - 1];
            lastValidSpot = synced.spot[synced.spot.length - 1];
        } else {
            // Fill Gap
            synced.open.push(lastValidClose);
            synced.high.push(lastValidClose);
            synced.low.push(lastValidClose);
            synced.close.push(lastValidClose);
            synced.volume.push(0);
            synced.strike.push(lastValidStrike);
            synced.spot.push(lastValidSpot);
        }
    });

    return synced;
}

export default function BacktestDashboard() {
    const { brokerCredentials } = useTradingStore();
    const [isLoading, setIsLoading] = useState(false);
    const [backtestData, setBacktestData] = useState<any>(null);
    const [spotBacktestData, setSpotBacktestData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Form settings
    const [symbol, setSymbol] = useState('25'); // 13=NIFTY, 25=BANKNIFTY
    const [date, setDate] = useState('2024-03-01');
    const [strike, setStrike] = useState('ATM');
    const [optionType, setOptionType] = useState('CALL');

    // Simulator State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [speedMs, setSpeedMs] = useState(500);

    // Paper Trade State
    const [position, setPosition] = useState(0);
    const [avgPrice, setAvgPrice] = useState(0);
    const [realizedPnl, setRealizedPnl] = useState(0);
    const [tradeLog, setTradeLog] = useState<any[]>([]);

    const lotSize = symbol === '13' ? 50 : 15;
    const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const resetSimulation = () => {
        setIsPlaying(false);
        setCurrentIndex(0);
        setPosition(0);
        setAvgPrice(0);
        setRealizedPnl(0);
        setTradeLog([]);
    };

    const handleFetchData = async () => {
        if (!brokerCredentials) {
            setError('Please connect your broker first.');
            return;
        }

        setIsLoading(true);
        setError(null);
        resetSimulation();
        setBacktestData(null);
        setSpotBacktestData(null);

        try {
            // Parallel fetch for both Option and Spot data
            const [optFetch, spotFetch] = await Promise.all([
                fetch('/api/dhan/rolling-options', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        params: {
                            exchangeSegment: "NSE_FNO",
                            interval: "1",
                            securityId: symbol,
                            instrument: "OPTIDX",
                            expiryFlag: "WEEK",
                            expiryCode: 1,
                            strike: strike,
                            drvOptionType: optionType,
                            requiredData: ["open", "high", "low", "close", "volume", "timestamp", "strike", "spot"],
                            fromDate: date,
                            toDate: date
                        }
                    })
                }),
                fetch('/api/dhan/intraday', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        params: {
                            securityId: symbol,
                            exchangeSegment: "IDX_I",
                            instrument: "INDEX",
                            interval: "1",
                            fromDate: `${date} 09:15:00`,
                            toDate: `${date} 15:30:00`
                        }
                    })
                })
            ]);

            const optRes = await optFetch.json();
            const spotRes = await spotFetch.json();

            if (optRes.success && optRes.data && optRes.data.data) {
                const ceOrPe = optionType === 'CALL' ? 'ce' : 'pe';
                const rawOpt = optRes.data.data[ceOrPe];
                if (rawOpt && rawOpt.timestamp && rawOpt.timestamp.length > 0) {
                    setBacktestData(syncToTimeline(rawOpt, date));
                } else {
                    setError('No active option data for this strike/date.');
                }
            } else {
                setError(optRes.error || 'Failed to fetch option data.');
            }

            if (spotRes.success && spotRes.data) {
                const rawSpot = spotRes.data.data || spotRes.data;
                if (rawSpot && rawSpot.timestamp && rawSpot.timestamp.length > 0) {
                    setSpotBacktestData(syncToTimeline(rawSpot, date));
                }
            }

            setCurrentIndex(0);
        } catch (err: any) {
            console.error(err);
            setError('Network Error: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Engine Step Logic
    useEffect(() => {
        if (isPlaying && backtestData && currentIndex < backtestData.timestamp.length - 1) {
            playIntervalRef.current = setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
            }, speedMs);
        } else if (currentIndex >= (backtestData?.timestamp?.length || 0) - 1) {
            setIsPlaying(false);
        }

        return () => {
            if (playIntervalRef.current) clearTimeout(playIntervalRef.current);
        };
    }, [isPlaying, currentIndex, backtestData, speedMs]);

    const handlePlayPause = () => {
        if (!backtestData) return;
        if (currentIndex >= backtestData.timestamp.length - 1) {
            setCurrentIndex(0);
        }
        setIsPlaying(!isPlaying);
    };

    const getCurrentPrice = () => {
        if (!backtestData) return 0;
        return backtestData.close[currentIndex] || 0;
    };

    const handleBuy = () => {
        if (!backtestData) return;
        const p = getCurrentPrice();
        const time = new Date(backtestData.timestamp[currentIndex] * 1000).toLocaleTimeString();

        if (position < 0) {
            const pnl = (avgPrice - p) * lotSize;
            setRealizedPnl(prev => prev + pnl);
            setPosition(0);
            setAvgPrice(0);
            setTradeLog(prev => [{ time, action: 'COVER', price: p, pnl }, ...prev]);
        } else {
            if (position === 0) setAvgPrice(p);
            else setAvgPrice(((avgPrice * position) + p) / (position + 1));
            setPosition(prev => prev + 1);
            setTradeLog(prev => [{ time, action: 'BUY', price: p, pnl: 0 }, ...prev]);
        }
    };

    const handleSell = () => {
        if (!backtestData) return;
        const p = getCurrentPrice();
        const time = new Date(backtestData.timestamp[currentIndex] * 1000).toLocaleTimeString();

        if (position > 0) {
            const pnl = (p - avgPrice) * lotSize;
            setRealizedPnl(prev => prev + pnl);
            setPosition(0);
            setAvgPrice(0);
            setTradeLog(prev => [{ time, action: 'SELL', price: p, pnl }, ...prev]);
        } else {
            if (position === 0) setAvgPrice(p);
            else setAvgPrice(((avgPrice * Math.abs(position)) + p) / (Math.abs(position) + 1));
            setPosition(prev => prev - 1);
            setTradeLog(prev => [{ time, action: 'SHORT', price: p, pnl: 0 }, ...prev]);
        }
    };

    // Calculate Active PnL
    let currentUnrealizedPnl = 0;
    if (position > 0) {
        currentUnrealizedPnl = (getCurrentPrice() - avgPrice) * (position * lotSize);
    } else if (position < 0) {
        currentUnrealizedPnl = (avgPrice - getCurrentPrice()) * (Math.abs(position) * lotSize);
    }
    const netPnl = realizedPnl + currentUnrealizedPnl;

    // Derived Option Chart Data
    const chartData: ChartData[] = useMemo(() => {
        if (!backtestData) return [];
        const sliceEnd = currentIndex + 1;
        const count = Math.min(sliceEnd, backtestData.timestamp?.length || 0);

        return Array.from({ length: count }).map((_, i) => {
            const o = backtestData.open[i] || 0;
            return {
                index: i,
                date: new Date(backtestData.timestamp[i] * 1000),
                open: o,
                high: backtestData.high[i] || o,
                low: backtestData.low[i] || o,
                close: backtestData.close[i] || o,
                volume: backtestData.volume?.[i] || 0
            };
        });
    }, [backtestData, currentIndex]);

    // Derived Spot Chart Data
    const spotChartData: ChartData[] = useMemo(() => {
        if (!spotBacktestData) return [];
        const sliceEnd = currentIndex + 1;
        const count = Math.min(sliceEnd, spotBacktestData.timestamp?.length || 0);

        return Array.from({ length: count }).map((_, i) => {
            const o = spotBacktestData.open[i] || 0;
            return {
                index: i,
                date: new Date(spotBacktestData.timestamp[i] * 1000),
                open: o,
                high: spotBacktestData.high[i] || o,
                low: spotBacktestData.low[i] || o,
                close: spotBacktestData.close[i] || o,
                volume: spotBacktestData.volume?.[i] || 0
            };
        });
    }, [spotBacktestData, currentIndex]);

    // Limited recent strikes for timeline
    const recentTicks = useMemo(() => {
        if (!backtestData) return [];
        const start = Math.max(0, currentIndex - 4); // show only last 5
        const ticks = [];
        for (let i = currentIndex; i >= start; i--) {
            ticks.push({
                time: new Date(backtestData.timestamp[i] * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                realStrike: backtestData.strike[i],
                spot: backtestData.spot[i],
                close: backtestData.close[i]
            });
        }
        return ticks;
    }, [backtestData, currentIndex]);

    return (
        <div className="bg-[#0f1118] min-h-screen text-gray-300 font-sans flex flex-col h-screen overflow-hidden">

            {/* Dark Sleek Header & Config Bar */}
            <header className="bg-[#181a25] border-b border-[#2b3040] py-3 px-6 shadow-md flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-4 border-r border-[#2b3040] pr-6 mr-2">
                    <Link href="/apps" className="p-2 hover:bg-[#2b3040] rounded-full text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                            <Activity size={16} className="text-blue-500" />
                            Sim Engine
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded ml-1">V2.0 PRO</span>
                        </h1>
                    </div>
                </div>

                <div className="flex gap-4 items-center flex-1">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Asset</label>
                        <select
                            value={symbol} onChange={(e) => setSymbol(e.target.value)}
                            className="bg-[#0f1118] border border-[#2b3040] rounded text-xs px-2 py-1 outline-none hover:border-blue-500 font-semibold text-gray-200"
                        >
                            <option value="13">NIFTY</option>
                            <option value="25">BANKNIFTY</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Date</label>
                        <input
                            type="date" value={date} onChange={(e) => setDate(e.target.value)}
                            className="bg-[#0f1118] border border-[#2b3040] rounded text-xs px-2 py-1 outline-none text-gray-200 hover:border-blue-500 font-semibold"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Type</label>
                        <select
                            value={optionType} onChange={(e) => setOptionType(e.target.value)}
                            className="bg-[#0f1118] border border-[#2b3040] rounded text-xs px-2 py-1 outline-none hover:border-blue-500 font-semibold text-gray-200"
                        >
                            <option value="CALL">CE</option>
                            <option value="PUT">PE</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Strike</label>
                        <select
                            value={strike} onChange={(e) => setStrike(e.target.value)}
                            className="bg-[#0f1118] border border-[#2b3040] rounded text-xs px-2 py-1 outline-none hover:border-blue-500 font-semibold text-gray-200"
                        >
                            <option value="ATM">ATM (At the money)</option>
                            {[1, 2, 3, 4, 5, 6, 7].map(offset => (
                                <option key={`ATM-${offset}`} value={`ATM-${offset}`}>
                                    {optionType === 'CALL' ? `ITM ${offset}` : `OTM ${offset}`}
                                </option>
                            ))}
                            {[1, 2, 3, 4, 5, 6, 7].map(offset => (
                                <option key={`ATM+${offset}`} value={`ATM+${offset}`}>
                                    {optionType === 'CALL' ? `OTM ${offset}` : `ITM ${offset}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleFetchData}
                        disabled={isLoading}
                        className="bg-blue-600/20 text-blue-400 border border-blue-600/50 px-4 py-1.5 ml-auto text-xs font-bold focus:outline-none rounded hover:bg-blue-600 hover:text-white transition disabled:opacity-50 flex items-center"
                    >
                        {isLoading ? <RefreshCw size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
                        {isLoading ? 'LOADING...' : 'LOAD ENGINE'}
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-500/10 text-red-500 p-2 text-center text-xs border-b border-red-500/20 shadow-inner">
                    <ShieldAlert size={14} className="inline mr-2" />
                    {error}
                </div>
            )}

            {/* Split Workspace */}
            <main className="flex flex-1 overflow-hidden">

                {/* Left Panel: Scalping Charts */}
                <div className="flex-1 border-r border-[#2b3040] p-4 flex flex-col gap-4 bg-[#0f1118] relative overflow-y-auto">
                    {/* Floating Info Header over chart */}
                    {backtestData && (
                        <div className="absolute top-6 left-6 z-10 flex gap-4 bg-[#181a25]/80 backdrop-blur-md px-4 py-2 rounded border border-[#2b3040] shadow-xl">
                            <div>
                                <span className="text-[10px] text-gray-500 uppercase font-bold block">Asset / Option</span>
                                <span className="text-sm text-gray-200 font-bold">{symbol === '13' ? 'NIFTY' : 'BANKNIFTY'} | {optionType} {strike}</span>
                            </div>
                            <div className="border-l border-[#2b3040] pl-4">
                                <span className="text-[10px] text-gray-500 uppercase font-bold block">Interval</span>
                                <span className="text-sm text-gray-200 font-bold font-mono">1m</span>
                            </div>
                            <div className="border-l border-[#2b3040] pl-4 text-center">
                                <span className="text-[10px] text-gray-500 uppercase font-bold block">Spot</span>
                                <span className="text-sm text-blue-400 font-bold font-mono">
                                    {spotBacktestData?.close[currentIndex]?.toFixed(2) || backtestData?.spot?.[currentIndex]?.toFixed(2) || '---'}
                                </span>
                            </div>
                            <div className="border-l border-[#2b3040] pl-4 text-center">
                                <span className="text-[10px] text-gray-500 uppercase font-bold block">Option LTP</span>
                                <span className="text-sm text-yellow-400 font-bold font-mono">
                                    {backtestData.close[currentIndex]?.toFixed(2) || '---'}
                                </span>
                            </div>
                        </div>
                    )}

                    {!backtestData ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                            <BarChart2 size={64} className="mb-4" />
                            <p className="text-lg font-bold tracking-widest uppercase">Waiting for Data</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
                            {/* Spot Chart */}
                            <div className="h-1/2 min-h-[300px] bg-[#181a25] rounded-xl border border-[#2b3040] p-1 overflow-hidden shadow-inner relative group">
                                <div className="absolute top-2 right-4 z-10 text-[9px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-blue-500 transition">Spot Layout (Underlying)</div>
                                <D3CandlestickChart
                                    data={spotChartData}
                                    ticker={symbol === '13' ? 'NIFTY SPOT' : 'BANKNIFTY SPOT'}
                                />
                            </div>

                            {/* Option Chart */}
                            <div className="h-1/2 min-h-[300px] bg-[#181a25] rounded-xl border border-[#2b3040] p-1 overflow-hidden shadow-inner relative group">
                                <div className="absolute top-2 right-4 z-10 text-[9px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-yellow-500 transition">Option Layout ({optionType} {strike})</div>
                                <D3CandlestickChart
                                    data={chartData}
                                    ticker={`${symbol === '25' ? 'BN' : 'NF'}-${strike}`}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Trading Terminal */}
                <div className="w-[380px] bg-[#13151c] flex flex-col shrink-0">

                    {/* Transport Controls */}
                    <div className="p-4 border-b border-[#2b3040] bg-[#181a25]">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></span>
                                    Environment Time
                                </span>
                                <div className="text-3xl font-mono text-white font-bold tracking-tight mt-1">
                                    {backtestData ? new Date(backtestData.timestamp[currentIndex] * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                                </div>
                            </div>

                            <button
                                onClick={handlePlayPause}
                                disabled={!backtestData}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all bg-[#2b3040] border border-[#3e445b] hover:bg-[#3e445b] disabled:opacity-30 ${isPlaying ? '!bg-amber-500/20 text-amber-500 border-amber-500/50' : 'text-green-400'}`}
                            >
                                {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current ml-1" />}
                            </button>
                        </div>

                        <div className="bg-[#0f1118] px-3 py-2 rounded border border-[#2b3040] flex items-center gap-3">
                            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Speed</span>
                            <input
                                type="range" min="50" max="1500" step="50"
                                value={speedMs}
                                onChange={(e) => setSpeedMs(Number(e.target.value))}
                                className="flex-1 h-1 bg-[#2b3040] rounded appearance-none cursor-pointer accent-blue-500"
                                style={{ direction: 'rtl' }}
                                disabled={!backtestData}
                            />
                            <span className="text-xs font-mono font-bold text-gray-400 w-12 text-right">{speedMs}ms</span>
                        </div>
                    </div>

                    {/* Trade Execution */}
                    <div className="p-4 border-b border-[#2b3040]">
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <button
                                onClick={handleBuy}
                                disabled={!backtestData || (!isPlaying && position === 0)}
                                className="bg-[#00B852]/10 hover:bg-[#00B852]/20 border border-[#00B852]/50 text-[#00B852] font-bold py-3.5 rounded shadow-[0_0_15px_rgba(0,184,82,0.1)] transition-all disabled:opacity-20 uppercase tracking-widest text-xs"
                            >
                                BUY
                            </button>
                            <button
                                onClick={handleSell}
                                disabled={!backtestData || (!isPlaying && position === 0)}
                                className="bg-[#FF4A4A]/10 hover:bg-[#FF4A4A]/20 border border-[#FF4A4A]/50 text-[#FF4A4A] font-bold py-3.5 rounded shadow-[0_0_15px_rgba(255,74,74,0.1)] transition-all disabled:opacity-20 uppercase tracking-widest text-xs"
                            >
                                SELL
                            </button>
                        </div>

                        {/* Summary Widget */}
                        <div className="bg-[#181a25] rounded border border-[#2b3040] p-4 text-xs">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-gray-500 uppercase font-bold">Position</span>
                                <span className={`font-bold font-mono px-2 py-0.5 rounded ${position > 0 ? 'bg-blue-500/20 text-blue-400' : position < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-500'}`}>
                                    {position === 0 ? 'FLAT' : position > 0 ? `LONG [${position * lotSize}]` : `SHORT [${Math.abs(position) * lotSize}]`}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-gray-500 uppercase font-bold">Avg Price</span>
                                <span className="font-mono font-semibold text-gray-300">₹{avgPrice.toFixed(2)}</span>
                            </div>
                            <div className="pt-3 border-t border-[#2b3040] flex justify-between items-center">
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Gross PnL</span>
                                <span className={`text-base font-bold font-mono ${netPnl > 0 ? 'text-[#00B852]' : netPnl < 0 ? 'text-[#FF4A4A]' : 'text-gray-500'}`}>
                                    {netPnl >= 0 ? '+' : ''}₹{netPnl.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Limited Timeline (Recent ticks) */}
                    <div className="border-b border-[#2b3040] p-4 bg-[#181a25]">
                        <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Crosshair size={12} /> Recent Pricing Tracker
                        </h3>
                        <div className="space-y-1">
                            {recentTicks.length === 0 ? (
                                <div className="text-[10px] text-gray-600 italic">No data</div>
                            ) : (
                                recentTicks.map((tick, i) => (
                                    <div key={i} className={`flex justify-between px-2 py-1 rounded text-[10px] font-mono ${i === 0 ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300' : 'text-gray-500'}`}>
                                        <span className="opacity-70">{tick.time}</span>
                                        <span className={i === 0 ? 'text-gray-300' : ''}>S:<span className="font-semibold">{tick.realStrike}</span></span>
                                        <span className={i === 0 ? 'text-yellow-400 font-bold' : ''}>₹{tick.close.toFixed(2)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Trade Executions */}
                    <div className="flex-1 overflow-hidden flex flex-col p-4 bg-[#0f1118]">
                        <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 px-1">Ledger</h3>
                        <div className="flex-1 overflow-auto pr-1">
                            {tradeLog.length === 0 ? (
                                <div className="text-center text-[10px] text-gray-600 mt-4 uppercase tracking-widest">No entries</div>
                            ) : (
                                <ul className="space-y-2">
                                    {tradeLog.map((log, i) => (
                                        <li key={i} className="text-[10px] bg-[#181a25] px-2 py-2 rounded border border-[#2b3040] flex flex-wrap shadow-sm">
                                            <div className="w-full flex justify-between mb-1 opacity-70 border-b border-[#2b3040]/50 pb-1">
                                                <span className="font-mono">{log.time}</span>
                                                <span className={`font-bold uppercase tracking-wider ${log.action === 'BUY' || log.action === 'COVER' ? 'text-[#00B852]' : 'text-[#FF4A4A]'}`}>{log.action}</span>
                                            </div>
                                            <div className="w-full flex justify-between pt-0.5 items-end">
                                                <span className="font-mono text-gray-300">@{log.price.toFixed(2)}</span>
                                                {log.pnl !== 0 && (
                                                    <span className={`font-mono font-bold ${log.pnl > 0 ? 'text-[#00B852]' : 'text-[#FF4A4A]'}`}>
                                                        {log.pnl > 0 ? '+' : ''}{log.pnl.toFixed(0)}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
