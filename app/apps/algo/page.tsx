
'use client';

import { useState, useEffect, useMemo } from 'react';
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
    BarChart3
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlgoStore } from '@/lib/store/algoStore';
import { useTradingStore } from '@/lib/store/tradingStore';
import { TradingStrategy } from '@/lib/algo/strategy';
import { useAlgoRunner } from '@/lib/algo/runner';
import AlgoRealtimeChart from './components/AlgoRealtimeChart';

export default function AlgoDashboard() {
    // Start the algo runner engine
    useAlgoRunner();
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
        resetStats
    } = useAlgoStore();

    const { brokerCredentials, addToWatchlist, watchlist: tradingWatchlist } = useTradingStore();
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [chartData, setChartData] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState('NIFTY');
    const [isMounted, setIsMounted] = useState(false);

    // Update time every second
    useEffect(() => {
        setIsMounted(true);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchHistoryAndPlan = async () => {
        if (!brokerCredentials) return;
        setIsLoading(true);
        try {
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 15);
            const fromDateStr = fromDate.toISOString().split('T')[0];

            let allZones: any[] = [];

            // Loop through configured symbols (NIFTY, BANKNIFTY)
            for (const symbol of config.symbols) {
                const securityId = symbol === 'NIFTY' ? '13' : '25';

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
                        toDate
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
            }

            setZones(allZones);
        } catch (err) {
            console.error("Plan fetch failed", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchIntradayData = async () => {
        if (!brokerCredentials) return;
        try {
            const securityId = selectedIndex === 'NIFTY' ? '13' : '25';
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 2); // Get 2 days of 1min data

            const res = await fetch('/api/dhan/historical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: brokerCredentials?.clientId,
                    accessToken: brokerCredentials?.accessToken,
                    securityId,
                    exchangeSegment: 'IDX_I',
                    instrument: 'INDEX',
                    fromDate: fromDate.toISOString().split('T')[0],
                    toDate
                })
            });

            const json = await res.json();
            if (json.success && json.data) {
                const formatted = (json.data.data || []).map((candle: any) => ({
                    time: candle.start_Time / 1000,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                }));
                setChartData(formatted);
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

    useEffect(() => {
        if (zones.length === 0 && brokerCredentials) {
            fetchHistoryAndPlan();
        }
    }, [brokerCredentials]);

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
                        <div className="hidden md:flex flex-col items-end px-4 border-r border-white/5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Available Capital</span>
                            <span className="text-sm font-mono font-bold text-white tracking-tight">{formatCurrency(config.initialCapital)}</span>
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

                {/* Left Panel: Plan & Live Feed */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* Real-time Chart */}
                    <section className="h-[450px] w-full mb-12">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                {['NIFTY', 'BANKNIFTY'].map(s => (
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
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Auto-Syncing</span>
                            </div>
                        </div>
                        <AlgoRealtimeChart
                            data={chartData}
                            signals={signals}
                            zones={zones}
                            symbol={selectedIndex}
                        />
                    </section>

                    {/* Zones / Daily Plan */}
                    <section className="bg-white/[0.03] border border-white/5 rounded-3xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div className="flex items-center gap-3">
                                <span className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                    <Layers size={18} />
                                </span>
                                <h2 className="font-bold text-white tracking-tight">Market Architecture <span className="text-slate-500 font-medium text-sm ml-2">(10-Day Analysis)</span></h2>
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
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">10-Day Sentiment</span>
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
                            ) : (
                                <div className="py-12 text-center">
                                    <AlertCircle className="mx-auto text-slate-700 mb-3" size={32} />
                                    <p className="text-sm text-slate-500 font-medium">No architectural mapping found. Initialize Dhan API.</p>
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
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-0.5">
                                                <div className="text-[9px] opacity-50 uppercase font-bold tracking-widest">Entry @ {pos.entryPrice.toFixed(1)}</div>
                                                <div className="text-lg font-mono font-black italic tracking-tighter">₹{pos.currentPrice.toFixed(1)}</div>
                                            </div>
                                            <div className={`text-xl font-mono font-black ${pos.pnl >= 0 ? 'text-emerald-300' : 'text-white'}`}>
                                                {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(1)}
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
                                <button className="w-full mt-6 bg-white text-blue-700 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-colors shadow-lg shadow-white/10">
                                    Manual Kill Switch
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
