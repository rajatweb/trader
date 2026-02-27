
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Play,
    Square,
    Activity,
    TrendingUp,
    TrendingDown,
    History,
    Target,
    Zap,
    Shield,
    Layers,
    ArrowLeft,
    RefreshCw,
    AlertCircle,
    ChevronRight,
    PieChart,
    Wallet,
    BarChart3,
    Volume2
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlgoStore } from '@/lib/store/algoStore';
import { useTradingStore } from '@/lib/store/tradingStore';
import { TradingStrategy } from '@/lib/algo/strategy';
import { useAlgoRunner } from '@/lib/algo/runner';
import AlgoRealtimeChart from './components/AlgoRealtimeChart';
import { playAlgoSound } from '@/lib/utils/sound';
import { useMarketFeed } from '@/lib/store/useMarketFeed';

export default function AlgoDashboard() {
    const {
        isRunning,
        setRunning,
        stats,
        activePositions,
        tradeHistory,
        zones,
        setZones,
        signals,
        config,
        resetStats,
        closePosition,
        activeStrategy,
        setActiveStrategy,
        liveVix,
        liveVix5dAvg,
        capitalUsed,
        availableCapital
    } = useAlgoStore();

    const { brokerCredentials, addToWatchlist, watchlist: tradingWatchlist, isConnected } = useTradingStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [chartData, setChartData] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState('BANKNIFTY');
    const [isMounted, setIsMounted] = useState(false);

    // Start the algo runner engine with LIVE chart data
    useAlgoRunner(chartData);
    useMarketFeed();

    const handleManualKill = () => {
        activePositions.forEach(pos => {
            closePosition(pos.symbol, pos.currentPrice);
            playAlgoSound('EXIT');
        });
    };

    useEffect(() => {
        if (activePositions.length > 0) {
            console.log("[DEBUG] Active Positions Grid Render:", activePositions);
            console.log("[DEBUG] Watchlist from TradingStore:", useTradingStore.getState().watchlist.filter(w => w.segment === 'NSE_FNO'));
        }
    }, [activePositions]);

    const lastFetchTime = useRef<number>(0);
    const hasInitialized = useRef<boolean>(false);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Memoized index item to avoid redundant chart updates from other watchlist changes
    const indexItem = useMemo(() => {
        const symbol = selectedIndex;
        return tradingWatchlist.find(w =>
            w.symbol.includes(symbol) &&
            !w.symbol.includes('CE') &&
            !w.symbol.includes('PE')
        );
    }, [tradingWatchlist, selectedIndex]);

    // Ensure the index + India VIX are in the watchlist so the WebSocket tracks them
    useEffect(() => {
        if (brokerCredentials && isConnected) {
            // BANKNIFTY Spot Index
            const bnSecurityId = '25';
            if (!tradingWatchlist.find(w => w.securityId === bnSecurityId)) {
                addToWatchlist({
                    securityId: bnSecurityId,
                    symbol: selectedIndex,
                    exchange: 'NSE',
                    segment: 'IDX_I',
                    ltp: 0,
                    change: 0,
                    changePercent: 0
                });
            }
            // India VIX – securityId 21, segment IDX_I (from Dhan instrument master)
            const vixSecurityId = '21';
            if (!tradingWatchlist.find(w => w.securityId === vixSecurityId)) {
                addToWatchlist({
                    securityId: vixSecurityId,
                    symbol: 'India VIX',
                    exchange: 'NSE',
                    segment: 'IDX_I',
                    ltp: 0,
                    change: 0,
                    changePercent: 0
                });
            }
        }
    }, [selectedIndex, brokerCredentials, isConnected, tradingWatchlist.length]);

    // Live Chart Sync: Update the last candle with real-time LTP using Exchange Time (LTT)
    useEffect(() => {
        if (chartData.length === 0 || !indexItem || !indexItem.ltp || indexItem.ltp < 1000) return;

        setChartData(prev => {
            if (prev.length === 0) return prev;
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];

            // Use Exchange Time (LTT) if available, fallback to System Time
            const nowTs = indexItem.ltt || Math.floor(Date.now() / 1000);
            const currentMinuteStart = Math.floor(nowTs / 60) * 60;

            // Roll over to new minute if Exchange time says so
            if (currentMinuteStart > last.time) {
                const newCandle = {
                    time: currentMinuteStart,
                    open: indexItem.ltp!,
                    high: indexItem.ltp!,
                    low: indexItem.ltp!,
                    close: indexItem.ltp!,
                    volume: 0
                };
                return [...prev, newCandle];
            }

            // Update current forming candle
            const needsUpdate = last.close !== indexItem.ltp ||
                indexItem.ltp! > last.high ||
                (last.low > 0 && indexItem.ltp! < last.low);

            if (!needsUpdate) return prev;
            if (last.close > 0 && indexItem.ltp < last.close * 0.5) return prev;

            const updatedCandle = {
                ...last,
                close: indexItem.ltp!,
                high: Math.max(last.high, indexItem.ltp!),
                low: Math.min(last.low || indexItem.ltp!, indexItem.ltp!)
            };

            const newData = [...prev];
            newData[lastIdx] = updatedCandle;
            return newData;
        });
    }, [indexItem?.ltp, indexItem?.ltt, chartData]);
    useEffect(() => {
        setIsMounted(true);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchHistoryAndPlan = async () => {
        if (!brokerCredentials) return;
        setIsLoading(true);
        setError(null);
        try {
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 5);
            const fromDateStr = fromDate.toISOString().split('T')[0];
            console.log(`[Algo] Analyzing Architecture from ${fromDateStr} to ${toDate}`);

            let allZones: any[] = [];

            // Scan only the currently selected symbol
            const symbol = selectedIndex;
            const securityId = '25'; // BANKNIFTY

            // 1. Fetch Historical Data for Zones
            const res = await fetch('/api/dhan/historical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    securityId,
                    exchangeSegment: 'IDX_I',
                    instrument: 'INDEX',
                    fromDate: fromDateStr,
                    toDate,
                    interval: '1D'
                })
            });

            const json = await res.json();
            let lastSpot = 0;
            if (json.success && json.data) {
                const formatted = Array.isArray(json.data) ? json.data : (json.data.data || []);
                const analyzedZones = TradingStrategy.identifyZones(formatted);
                // Tag zones with symbol
                const taggedZones = analyzedZones.map(z => ({
                    ...z,
                    description: `${symbol}: ${z.description}`
                }));
                allZones = [...allZones, ...taggedZones];
                if (formatted.length > 0) {
                    lastSpot = formatted[formatted.length - 1].close;
                }
            }

            // 2. Fetch Option Chain for ATM Selection
            const expiryRes = await fetch('/api/dhan/option-chain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    underlyingScrip: securityId,
                    underlyingSeg: 'IDX_I'
                })
            });

            const expiryJson = await expiryRes.json();
            if (expiryJson.success && expiryJson.data && expiryJson.data.length > 0) {
                const nearestExpiry = expiryJson.data[0];

                // MANDATORY: Wait 3.5s before requesting the full chain (1 req / 3s limit)
                await sleep(3500);

                const chainRes = await fetch('/api/dhan/option-chain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials?.clientId,
                        accessToken: brokerCredentials?.accessToken,
                        underlyingScrip: securityId,
                        underlyingSeg: 'IDX_I',
                        expiry: nearestExpiry
                    })
                });

                const chainJson = await chainRes.json();
                if (chainJson.success && chainJson.data) {
                    const atmStrike = TradingStrategy.getATMStrike(lastSpot || 22000, symbol);
                    const ceContract = TradingStrategy.findContract(chainJson.data, atmStrike, 'CALL');
                    const peContract = TradingStrategy.findContract(chainJson.data, atmStrike, 'PUT');

                    if (ceContract || peContract) {
                        useAlgoStore.getState().setMonitoredContracts(symbol, { ce: ceContract, pe: peContract });

                        // Proactively add to trading watchlist for live feed
                        [ceContract, peContract].forEach(c => {
                            if (c && !tradingWatchlist.find(w => w.securityId === String(c.securityId))) {
                                addToWatchlist({
                                    securityId: String(c.securityId),
                                    symbol: `${symbol} ${c.strike_price} ${c.oc_type === 'CALL' ? 'CE' : 'PE'}`,
                                    exchange: 'NSE',
                                    segment: 'NSE_FNO',
                                    ltp: 0,
                                    change: 0,
                                    changePercent: 0
                                });
                            }
                        });
                    }
                }
            }


            setZones(allZones);
        } catch (err: any) {
            console.error("Plan fetch failed", err);
            setError(err.message || "Failed to analyze market architecture. Please check your Dhan connection.");
            hasInitialized.current = false; // Allow retry
        } finally {
            setIsLoading(false);
        }
    };

    const fetchIntradayData = async () => {
        if (!brokerCredentials) return;
        try {
            const securityId = '25'; // BANKNIFTY
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 5); // Get 5 days of 1min data

            const res = await fetch('/api/dhan/intraday', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    securityId,
                    exchangeSegment: 'IDX_I',
                    instrument: 'INDEX',
                    interval: '1',
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate
                })
            });

            const json = await res.json();
            console.log("[Intraday] Raw response:", json);

            if (json.success && json.data) {
                const rawData = Array.isArray(json.data) ? json.data : (json.data.data || []);
                console.log(`[Intraday] Received ${rawData.length} candles`);

                const formatted = rawData.map((candle: any) => {
                    const ts = candle.start_Time || candle.time || candle.timestamp || candle.start_time;
                    const numTs = Number(ts);

                    if (!ts || isNaN(numTs) || numTs === 0) return null;

                    const open = Number(candle.open);
                    const high = Number(candle.high);
                    const low = Number(candle.low);
                    const close = Number(candle.close);

                    // Skip invalid or 0-price data which breaks chart scaling
                    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || open <= 0) return null;

                    return {
                        time: numTs > 10000000000 ? numTs / 1000 : numTs, // Standardize to seconds (threshold 10B)
                        open, high, low, close,
                        volume: Number(candle.volume) || 0
                    };
                }).filter(Boolean);

                console.log(`[Intraday] Formatted ${formatted.length} candles`);

                // Merge Logic: Use fresh data but preserve the "active" forming candle if it's more recent
                setChartData(prev => {
                    if (prev.length === 0) return formatted;
                    const lastInPrev = prev[prev.length - 1];
                    const lastInFormatted = formatted[formatted.length - 1];

                    // If our local state has a newer candle than what the API just returned,
                    // keep our local candle as the tip so the LTP doesn't jump back to stale API data
                    if (lastInPrev.time > lastInFormatted.time) {
                        return [...formatted, lastInPrev];
                    }

                    // If they are on the same minute, we let the fresh data through, 
                    // and the WebSocket effect will immediately re-apply the live LTP in the next tick.
                    return formatted;
                });
            }
        } catch (err) {
            console.error("Intraday fetch failed", err);
        }
    };

    useEffect(() => {
        if (brokerCredentials) {
            fetchIntradayData();
            const interval = setInterval(fetchIntradayData, 60000); // Refresh every minute
            return () => clearInterval(interval);
        }
    }, [brokerCredentials, selectedIndex]);

    // Auto-initialize zones/contracts on page load
    useEffect(() => {
        if (brokerCredentials && !hasInitialized.current && zones.length === 0) {
            hasInitialized.current = true;
            fetchHistoryAndPlan();
        }
    }, [brokerCredentials, zones.length]);

    // Auto-refresh contracts when algo starts (in case they weren't loaded, or strike needs roll)
    const contractsLoadedRef = useRef(false);
    useEffect(() => {
        if (!isRunning || !brokerCredentials) return;
        const symbol = selectedIndex;
        const hasContracts = !!(useAlgoStore.getState().monitoredContracts[symbol]?.ce ||
            useAlgoStore.getState().monitoredContracts[symbol]?.pe);
        if (!hasContracts && !contractsLoadedRef.current) {
            contractsLoadedRef.current = true;
            console.log('[AlgoRunner] Contracts missing — auto-fetching on algo start...');
            fetchHistoryAndPlan();
        }
        if (!isRunning) contractsLoadedRef.current = false;
    }, [isRunning, brokerCredentials, selectedIndex]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="min-h-screen bg-[#0a0c10] text-slate-200 font-sans selection:bg-blue-500/30 overflow-x-hidden">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0c10]/70 border-b border-white/5">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/apps" className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3 mb-0.5">
                                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                                    Zenith Auto-Trade
                                </h1>
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
                                    {isRunning ? 'System Active' : 'System Idle'}
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">Market Protocol v2.4 • {isMounted ? currentTime.toLocaleTimeString() : '--:--:--'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Strategy Selector */}
                        <div className="hidden md:flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                            <button
                                onClick={() => { if (!isRunning) setActiveStrategy('PDLS_VIX'); }}
                                title={isRunning ? 'Stop algo before switching' : 'PDLS-VIX Liquidity Reversal'}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all ${activeStrategy === 'PDLS_VIX'
                                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                PDLS-VIX
                            </button>
                            <button
                                onClick={() => { if (!isRunning) setActiveStrategy('SL_HUNT'); }}
                                title={isRunning ? 'Stop algo before switching' : 'SL Hunt Reversal'}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all ${activeStrategy === 'SL_HUNT'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                SL Hunt
                            </button>
                        </div>

                        {/* Live Capital Meter */}
                        <div className="hidden md:flex flex-col gap-1 px-4 border-r border-white/5 min-w-[160px]">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Capital</span>
                                <span className="text-[9px] font-bold text-slate-500">
                                    ₹{(config.initialCapital / 1000).toFixed(0)}K total
                                </span>
                            </div>
                            {/* Bar */}
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                        width: `${Math.min(100, (capitalUsed / config.initialCapital) * 100).toFixed(1)}%`,
                                        background: capitalUsed > config.initialCapital * 0.7
                                            ? 'linear-gradient(90deg,#f43f5e,#fb7185)'
                                            : 'linear-gradient(90deg,#3b82f6,#6366f1)'
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono font-bold text-rose-400">
                                    {capitalUsed > 0 ? `₹${(capitalUsed / 1000).toFixed(1)}K used` : 'Idle'}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-emerald-400">
                                    ₹{(availableCapital / 1000).toFixed(1)}K free
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setRunning(!isRunning)}
                            className={`group h-11 px-6 rounded-xl flex items-center gap-3 font-bold transition-all shadow-lg ${isRunning
                                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 px-8'
                                }`}
                        >
                            {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                            {isRunning ? 'TERMINATE ALGO' : 'INITIATE ALGO'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-6 pb-24">

                {/* Statistics Grid */}
                <div className="col-span-12 grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Day Realized P&L', value: stats.totalPnl, icon: Wallet, color: stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400', suffix: 'P&L' },
                        { label: 'Win Rate', value: stats.totalTrades > 0 ? (stats.winningTrades / stats.totalTrades * 100).toFixed(1) : '0', icon: Target, color: 'text-blue-400', suffix: '%' },
                        { label: 'Total Trades', value: stats.totalTrades, icon: Activity, color: 'text-purple-400', suffix: 'Trades' },
                        { label: 'Est. Brokerage', value: stats.totalBrokerage, icon: Shield, color: 'text-amber-400', suffix: 'Fees' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.05] transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2.5 bg-white/5 rounded-xl group-hover:scale-110 transition-transform">
                                    <stat.icon size={20} className={stat.color} />
                                </div>
                                <div className="h-1 w-8 bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full bg-gradient-to-r from-transparent to-current transition-all duration-1000 ${stat.color}`} style={{ width: '60%' }}></div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</span>
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-2xl font-mono font-black ${stat.color}`}>
                                        {typeof stat.value === 'number' && stat.label.includes('P&L') ? (stat.value >= 0 ? '+' : '') : ''}
                                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">{stat.suffix}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Real-time Strategy Architecture Panel ── */}
                {(() => {
                    const vixCond = liveVix > 25 ? 'AVOID' : liveVix < 10 ? 'AVOID' : liveVix >= liveVix5dAvg * 1.03 ? 'GOOD' : liveVix <= liveVix5dAvg * 0.97 ? 'AVOID' : 'NEUTRAL';
                    const vixItem = tradingWatchlist.find(w => w.securityId === '21');
                    const bnItem = tradingWatchlist.find(w => w.securityId === '25');
                    const lastSignal = signals[0];
                    const pdhZone = zones.find(z => z.description === 'PDH');
                    const pdlZone = zones.find(z => z.description === 'PDL');

                    const nodes = [
                        {
                            label: 'WebSocket Feed',
                            value: isConnected ? 'LIVE' : 'OFFLINE',
                            sub: isConnected ? `${tradingWatchlist.length} instruments tracked` : 'Not connected',
                            color: isConnected ? 'emerald' : 'rose',
                            dot: isConnected,
                        },
                        {
                            label: 'India VIX',
                            value: vixItem?.ltp ? vixItem.ltp.toFixed(2) : (liveVix > 0 ? liveVix.toFixed(2) : '--'),
                            sub: `Condition: ${vixCond} · 5d avg: ${liveVix5dAvg.toFixed(2)}`,
                            color: vixCond === 'GOOD' ? 'emerald' : vixCond === 'AVOID' ? 'rose' : 'amber',
                            dot: vixCond === 'GOOD',
                        },
                        {
                            label: 'BankNifty Spot',
                            value: bnItem?.ltp ? bnItem.ltp.toFixed(0) : '--',
                            sub: `Chg: ${bnItem?.changePercent !== undefined ? (bnItem.changePercent > 0 ? '+' : '') + bnItem.changePercent.toFixed(2) + '%' : '--'}`,
                            color: (bnItem?.changePercent ?? 0) >= 0 ? 'blue' : 'rose',
                            dot: !!bnItem?.ltp,
                        },
                        {
                            label: 'Liquidity Zones',
                            value: zones.length > 0 ? `${zones.length} Zones` : 'Building...',
                            sub: pdhZone && pdlZone ? `PDH: ${pdhZone.price.toFixed(0)} · PDL: ${pdlZone.price.toFixed(0)}` : 'Warmup pending',
                            color: zones.length > 0 ? 'violet' : 'slate',
                            dot: zones.length > 0,
                        },
                        {
                            label: 'Signal Engine',
                            value: activeStrategy === 'PDLS_VIX' ? 'PDLS-VIX' : 'SL-Hunt',
                            sub: lastSignal ? `Last: ${lastSignal.reason.slice(0, 32)}…` : 'No signal yet',
                            color: activeStrategy === 'PDLS_VIX' ? 'violet' : 'blue',
                            dot: isRunning,
                        },
                        {
                            label: 'Capital Deployed',
                            value: capitalUsed > 0 ? `₹${(capitalUsed / 1000).toFixed(1)}K` : 'Idle',
                            sub: `Free: ₹${(availableCapital / 1000).toFixed(1)}K · ${capitalUsed > 0 ? ((capitalUsed / config.initialCapital) * 100).toFixed(0) + '% used' : '0% used'}`,
                            color: capitalUsed > config.initialCapital * 0.7 ? 'rose' : capitalUsed > 0 ? 'amber' : 'emerald',
                            dot: capitalUsed > 0,
                        },
                    ];

                    const colorMap: Record<string, string> = {
                        emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
                        rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
                        blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
                        amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
                        violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
                        slate: 'border-white/10 bg-white/3 text-slate-400',
                    };
                    const dotMap: Record<string, string> = {
                        emerald: 'bg-emerald-400', rose: 'bg-rose-400', blue: 'bg-blue-400',
                        amber: 'bg-amber-400', violet: 'bg-violet-400', slate: 'bg-slate-500',
                    };

                    return (
                        <div className="col-span-12">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-px flex-1 bg-white/5" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Market Architecture · Real-time Node Status</span>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {nodes.map((node, i) => (
                                    <div key={i} className={`rounded-2xl border p-4 ${colorMap[node.color]} transition-all`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">{node.label}</span>
                                            <div className={`w-1.5 h-1.5 rounded-full ${node.dot ? dotMap[node.color] + ' animate-pulse' : 'bg-slate-700'}`} />
                                        </div>
                                        <div className="text-base font-mono font-black tracking-tight mb-1">{node.value}</div>
                                        <div className="text-[9px] opacity-60 leading-tight">{node.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Flow line connecting the nodes visually */}
                            <div className="flex items-center gap-1 mt-3 px-2 overflow-hidden">
                                {['Dhan WS', '→', 'VIX Filter', '→', 'PDLS Zones', '→', 'Signal Engine', '→', 'Risk Guard', '→', 'Trade Exec'].map((step, i) => (
                                    <span key={i} className={`text-[9px] font-bold tracking-widest ${step === '→' ? 'text-white/10' :
                                        isRunning ? 'text-slate-400' : 'text-slate-700'
                                        }`}>{step}</span>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* ── Full-width Real-time Chart ── */}
                <div className="col-span-12">
                    <section className="h-[580px] w-full">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                {['BANKNIFTY'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSelectedIndex(s)}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selectedIndex === s ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <RefreshCw
                                    size={14}
                                    className={`text-slate-500 cursor-pointer hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
                                    onClick={fetchIntradayData}
                                />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">Auto-Syncing</span>
                                <button
                                    onClick={() => playAlgoSound('NOTIFICATION')}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all border border-white/5"
                                    title="Test Notification Sound"
                                >
                                    <Volume2 size={12} />
                                </button>
                            </div>
                        </div>
                        <AlgoRealtimeChart
                            data={chartData}
                            signals={signals}
                            zones={zones}
                            symbol={selectedIndex}
                            height={540}
                        />
                    </section>
                </div>

                {/* Left Panel: Plan & Live Feed */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* Zones / Daily Plan */}
                    <section className="bg-white/[0.03] border border-white/5 rounded-3xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div className="flex items-center gap-3">
                                <span className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                    <Layers size={18} />
                                </span>
                                <h2 className="font-bold text-white tracking-tight">Market Architecture <span className="text-slate-500 font-medium text-sm ml-2">(Market Analysis)</span></h2>
                            </div>
                            <button
                                onClick={fetchHistoryAndPlan}
                                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-all active:rotate-180 duration-500"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                        <div className="p-6">
                            {/* Algo Logic Snippet */}
                            <div className="mb-6 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 relative overflow-hidden">
                                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Zap size={12} /> Institutional Intelligence Mode
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Market Sentiment</span>
                                        <span className={`text-xs font-black ${(zones[0] as any)?.metadata?.sentiment === 'BULLISH' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {(zones[0] as any)?.metadata?.sentiment || 'ANALYZING...'}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Retail Bias</span>
                                        <span className="text-xs font-black text-blue-400">
                                            {(zones[0] as any)?.metadata?.retailBias || 'Neutral'}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Profit Target</span>
                                        <span className="text-xs font-black text-emerald-400">₹10,000 / day</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed pr-8">
                                    Scanning for <span className="text-white font-bold">Liquidity Gaps</span> beyond PDH/PDL.
                                    Analysis indicates Smart Money will likely hunt {(zones[0] as any)?.metadata?.sentiment === 'BULLISH' ? 'below PDL' : 'above PDH'} today using SL hunting of retail participants.
                                </p>
                            </div>

                            {isLoading ? (
                                <div className="py-12 flex flex-col items-center gap-4">
                                    <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Scanning Historical Nodes...</p>
                                </div>
                            ) : zones.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {zones.map((zone, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-blue-500/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-1 h-10 rounded-full ${zone.type === 'RESISTANCE' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'}`}></div>
                                                <div>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{zone.description}</span>
                                                    <h4 className="text-sm font-bold text-white">{zone.type} ZONE</h4>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-mono font-black text-white">₹{zone.price.toFixed(1)}</span>
                                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                                    <div className="w-8 h-1 bg-white/10 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{ width: `${zone.strength * 100}%` }}></div>
                                                    </div>
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase">Power</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : error ? (
                                <div className="py-12 text-center text-rose-400">
                                    <AlertCircle className="mx-auto mb-3" size={32} />
                                    <p className="text-sm font-medium">{error}</p>
                                    <button
                                        onClick={fetchHistoryAndPlan}
                                        className="mt-4 px-6 py-2 bg-blue-500 rounded-full text-white text-xs font-bold hover:bg-blue-600 transition-all uppercase tracking-widest"
                                    >
                                        Retry Analysis
                                    </button>
                                </div>
                            ) : !brokerCredentials ? (
                                <div className="py-12 text-center">
                                    <Shield className="mx-auto text-slate-700 mb-3" size={32} />
                                    <p className="text-sm text-slate-500 font-medium mb-4 text-balance">Dhan API connection required for architectural analysis.</p>
                                    <Link href="/profile" className="px-6 py-2 bg-slate-800 rounded-full text-white text-xs font-bold hover:bg-slate-700 transition-all uppercase tracking-widest border border-white/5">
                                        Initialize API Keys
                                    </Link>
                                </div>
                            ) : zones.length === 0 ? (
                                <div className="py-12 text-center">
                                    <Activity className="mx-auto text-slate-700 mb-3 animate-pulse" size={32} />
                                    <p className="text-sm text-slate-500 font-medium mb-4">No mapping identified for today's session yet.</p>
                                    <button
                                        onClick={fetchHistoryAndPlan}
                                        className="px-6 py-2 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold hover:bg-blue-500/20 transition-all uppercase tracking-widest border border-blue-500/20"
                                    >
                                        Run Scan
                                    </button>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-500">
                                    <Activity className="mx-auto mb-3 opacity-20" size={32} />
                                    <p className="text-sm font-medium italic opacity-60">Ready for market session...</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Trade History / Logs */}
                    <section className="bg-white/[0.03] border border-white/5 rounded-3xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                                    <History size={18} />
                                </span>
                                <h2 className="font-bold text-white tracking-tight">Protocol Logs</h2>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase bg-white/5 px-2 py-1 rounded-md">Real-time Activity</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-white/[0.01]">
                                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocol</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry / Exit</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Performance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {tradeHistory.map((trade, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors uppercase">{trade.symbol}</span>
                                                    <p className="text-[10px] font-bold text-slate-500 font-mono mt-0.5">{new Date(trade.closedAt).toLocaleTimeString()}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tight ${trade.type === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                    {trade.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3 font-mono text-xs">
                                                    <span className="text-slate-400">{trade.entryPrice.toFixed(1)}</span>
                                                    <ChevronRight size={12} className="text-slate-600" />
                                                    <span className="text-white font-bold">{trade.exitPrice?.toFixed(1) || '--'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="inline-flex flex-col items-end">
                                                    <span className={`text-sm font-black font-mono ${trade.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {trade.netPnl >= 0 ? '+' : ''}{trade.netPnl.toFixed(1)}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">Net INR</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {tradeHistory.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-16 text-center">
                                                <p className="text-slate-600 font-medium italic">No trade execution logs found for the current session.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                {/* Right Panel: Active Positions & System Info */}
                <div className="col-span-12 lg:col-span-4 space-y-6">

                    {/* Active Positions Card */}
                    <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] p-6 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 text-white/10 group-hover:scale-125 transition-transform duration-700">
                            <Zap size={120} />
                        </div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-bold tracking-widest uppercase opacity-70">Active Engagements</h3>
                                <div className="px-2 py-1 bg-white/20 backdrop-blur-md rounded-lg text-[9px] font-black">{activePositions.length} POS</div>
                            </div>

                            <div className="space-y-4">
                                {activePositions.map((pos, i) => (
                                    <div key={i} className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 group/item hover:bg-white/15 transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-black text-xs uppercase tracking-tight">{pos.symbol}</h4>
                                                <p className="text-[10px] opacity-60 font-bold uppercase">{pos.type} • Qty {pos.quantity}</p>
                                            </div>
                                            <div className="p-1 px-2 rounded-full bg-emerald-400 text-emerald-950 text-[10px] font-black animate-pulse">LIVE</div>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-white/5 pb-3 mb-3">
                                            <div className="space-y-0.5">
                                                <div className="text-[9px] opacity-50 uppercase font-bold tracking-widest">Entry @ {pos.entryPrice.toFixed(1)}</div>
                                                <div className="text-lg font-mono font-black italic tracking-tighter text-blue-300">LTP ₹{pos.currentPrice.toFixed(1)}</div>
                                            </div>
                                            <div className={`text-xl font-mono font-black ${pos.pnl >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                                                {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(1)}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center bg-black/10 p-2 rounded-lg border border-white/5">
                                            <div className="text-center w-1/2 border-r border-white/10 pr-2">
                                                <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Target</div>
                                                <div className="text-[11px] font-mono font-black text-emerald-400">
                                                    ₹{pos.target?.toFixed(1) || (pos.entryPrice * 1.4).toFixed(1)}
                                                </div>
                                            </div>
                                            <div className="text-center w-1/2 pl-2">
                                                <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Stop Loss</div>
                                                <div className="text-[11px] font-mono font-black text-rose-400">
                                                    ₹{pos.sl?.toFixed(1) || (pos.entryPrice * 0.8).toFixed(1)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {activePositions.length === 0 && (
                                    <div className="py-12 border border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center">
                                        <BarChart3 size={32} className="opacity-20 mb-3" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">System Neutral</p>
                                    </div>
                                )}
                            </div>

                            {activePositions.length > 0 && (
                                <button
                                    onClick={handleManualKill}
                                    className="w-full mt-6 bg-rose-500/10 text-rose-500 border border-rose-500/30 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-lg hover:shadow-rose-500/50"
                                >
                                    Emergency Kill Switch
                                </button>
                            )}
                        </div>
                    </section>

                    {/* System Config Snippet */}
                    <section className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <PieChart size={18} className="text-blue-400" />
                            <h3 className="font-bold text-white tracking-tight text-sm">Deployment config</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-slate-500 font-medium">Risk Factor</span>
                                <span className="text-xs font-bold text-white uppercase">{config.maxRiskPerTrade}% / Trade</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-slate-500 font-medium">Duty Cycle</span>
                                <span className="text-xs font-bold text-white uppercase font-mono">{config.startTime} - {config.endTime}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-slate-500 font-medium">Instruments</span>
                                <div className="flex gap-1.5">
                                    {config.symbols.map((s, i) => (
                                        <span key={i} className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded text-blue-400 border border-blue-500/20">{s}</span>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={resetStats}
                                className="w-full mt-4 py-3 rounded-2xl border border-white/5 text-[10px] font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest"
                            >
                                Reset Session Metrics
                            </button>
                        </div>
                    </section>

                </div>
            </main>

            {/* Float Bottom Signal Monitor */}
            <AnimatePresence>
                {signals.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-6"
                    >
                        <div className="bg-[#1a1c23] border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${signals[0].type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : signals[0].type === 'SELL' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                    {signals[0].type === 'BUY' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-black text-white">{signals[0].type} INITIATED</span>
                                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono">1m AGO</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium truncate italic">"{signals[0].reason}"</p>
                                </div>
                            </div>
                            <div className="h-10 w-px bg-white/5"></div>
                            <div className="text-right shrink-0">
                                <span className="text-lg font-mono font-black text-white">₹{signals[0].price.toFixed(1)}</span>
                                <div className="text-[9px] font-bold text-slate-600 uppercase">Signal Node</div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
