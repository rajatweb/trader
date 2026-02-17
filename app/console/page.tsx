'use client';

import { useTradingStore, TradeLog, DailyStats } from '@/lib/store/tradingStore';
import {
    BarChart3,
    Calendar,
    TrendingUp,
    TrendingDown,
    FileText,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    Download
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

export default function ConsolePage() {
    const { tradeHistory, dailyStats, account } = useTradingStore();
    const [selectedView, setSelectedView] = useState<'pnl' | 'tradebook'>('pnl');
    const [timeRange, setTimeRange] = useState<'1M' | '3M' | 'CUSTOM'>('1M');
    const [customRange, setCustomRange] = useState<{ from: string, to: string }>({
        from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    // Get the actual range dates
    const range = useMemo(() => {
        const to = new Date();
        const from = new Date();

        if (timeRange === '1M') {
            from.setMonth(to.getMonth() - 1);
        } else if (timeRange === '3M') {
            from.setMonth(to.getMonth() - 3);
        } else {
            return {
                from: new Date(customRange.from),
                to: new Date(customRange.to + 'T23:59:59')
            };
        }

        return { from, to };
    }, [timeRange, customRange]);

    // Filter data based on range
    const filteredTradeHistory = useMemo(() => {
        return tradeHistory.filter(trade => {
            const date = new Date(trade.timestamp);
            return date >= range.from && date <= range.to;
        });
    }, [tradeHistory, range]);

    const filteredDailyStats = useMemo(() => {
        return dailyStats.filter(stat => {
            const date = new Date(stat.date);
            return date >= range.from && date <= range.to;
        });
    }, [dailyStats, range]);

    // Calculate stats for the selected period
    const totalRealizedPnl = useMemo(() => {
        return filteredTradeHistory.reduce((acc, trade) => acc + trade.realizedPnl, 0);
    }, [filteredTradeHistory]);

    const stats = useMemo(() => {
        const sorted = [...filteredDailyStats].sort((a, b) => b.date.localeCompare(a.date));
        const profitDays = sorted.filter(s => s.realizedPnl > 0).length;
        const lossDays = sorted.filter(s => s.realizedPnl < 0).length;
        const totalDays = sorted.length;

        return {
            sorted,
            profitDays,
            lossDays,
            totalDays,
            winRate: totalDays > 0 ? (profitDays / totalDays) * 100 : 0
        };
    }, [filteredDailyStats]);

    // Generate heatmap data for the entire selected range
    const heatmapDays = useMemo(() => {
        const days = [];
        const startDate = new Date(range.from);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(range.to);
        endDate.setHours(0, 0, 0, 0);

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayStats = dailyStats.find(s => s.date === dateStr);
            days.push({
                date: dateStr,
                pnl: dayStats?.realizedPnl || 0,
                hasData: !!dayStats
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return days;
    }, [dailyStats, range]);

    // Group heatmap data by month
    const groupedHeatmapData = useMemo(() => {
        const monthsMap: Map<string, { label: string, days: typeof heatmapDays }> = new Map();

        heatmapDays.forEach(day => {
            const date = new Date(day.date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });

            if (!monthsMap.has(key)) {
                monthsMap.set(key, { label, days: [] });
            }
            monthsMap.get(key)!.days.push(day);
        });

        return Array.from(monthsMap.values());
    }, [heatmapDays]);

    return (
        <div className="flex-1 bg-[#fbfbfb] h-full overflow-y-auto p-4 md:p-8 text-[#444]">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Console</h1>
                        <p className="text-sm text-gray-500 mt-1">View your trading performance and historical reports</p>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-100">
                            {[
                                { id: '1M', label: '1 Month' },
                                { id: '3M', label: '3 Months' },
                                { id: 'CUSTOM', label: 'Custom' },
                            ].map((range) => (
                                <button
                                    key={range.id}
                                    onClick={() => setTimeRange(range.id as any)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeRange === range.id ? 'bg-[#387ed1] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>

                        {timeRange === 'CUSTOM' && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm"
                            >
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-gray-400 font-bold uppercase ml-1">From</span>
                                    <input
                                        type="date"
                                        value={customRange.from}
                                        onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                                        className="text-xs border-none focus:ring-0 p-1"
                                    />
                                </div>
                                <div className="w-[1px] h-6 bg-gray-100 mx-1" />
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-gray-400 font-bold uppercase ml-1">To</span>
                                    <input
                                        type="date"
                                        value={customRange.to}
                                        onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                                        className="text-xs border-none focus:ring-0 p-1"
                                    />
                                </div>
                            </motion.div>
                        )}

                        <div className="flex items-center gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-100">
                            <button
                                onClick={() => setSelectedView('pnl')}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${selectedView === 'pnl' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                P&L Report
                            </button>
                            <button
                                onClick={() => setSelectedView('tradebook')}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${selectedView === 'tradebook' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Tradebook
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Realized P&L</span>
                            <div className={`p-1.5 rounded-lg ${totalRealizedPnl >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                <TrendingUp size={16} />
                            </div>
                        </div>
                        <div className={`text-2xl font-bold ${totalRealizedPnl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                            {totalRealizedPnl >= 0 ? '+' : ''}{totalRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Across {filteredTradeHistory.length} trades</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Charges</span>
                            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                                <FileText size={16} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">₹0.00</div>
                        <p className="text-[10px] text-gray-400 mt-1">Dhan Brokerage Savings</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Win Rate</span>
                            <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                                <BarChart3 size={16} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.winRate.toFixed(1)}%</div>
                        <p className="text-[10px] text-gray-400 mt-1">{stats.profitDays} Green / {stats.lossDays} Red days</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Net Realized</span>
                            <div className={`p-1.5 rounded-lg ${totalRealizedPnl >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                <TrendingUp size={16} />
                            </div>
                        </div>
                        <div className={`text-2xl font-bold ${totalRealizedPnl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                            {totalRealizedPnl >= 0 ? '+' : ''}{totalRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Post charges</p>
                    </div>
                </div>

                {selectedView === 'pnl' ? (
                    <div className="space-y-6">
                        {/* Heatmap Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <Calendar size={18} className="text-[#387ed1]" />
                                    P&L Heatmap (Monthly Breakdown)
                                </h3>
                                <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 bg-gray-50 border border-gray-100 rounded-sm" />
                                        <span>No Trade</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 bg-[#26a69a]/20 border border-[#26a69a]/30 rounded-sm" />
                                        <span>Profit</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 bg-[#d43725]/20 border border-[#d43725]/30 rounded-sm" />
                                        <span>Loss</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {groupedHeatmapData.map((month, mIdx) => (
                                    <div key={mIdx} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-50 pb-2">
                                            {month.label}
                                        </h4>
                                        <div className="grid grid-cols-7 gap-1.5">
                                            {/* Fill empty spaces for day alignment if needed would go here, 
                                                but for simple visualization we just list the days */}
                                            {month.days.map((day, dIdx) => {
                                                const dateObj = new Date(day.date);
                                                return (
                                                    <div key={dIdx} className="relative group">
                                                        <div
                                                            className={`w-full aspect-square rounded-sm border transition-all duration-200 cursor-default ${!day.hasData ? 'bg-gray-50 border-gray-100' :
                                                                    day.pnl > 0 ? 'bg-[#26a69a]/20 border-[#26a69a]/40 hover:bg-[#26a69a]/40' :
                                                                        day.pnl < 0 ? 'bg-[#d43725]/20 border-[#d43725]/40 hover:bg-[#d43725]/40' :
                                                                            'bg-gray-100 border-gray-200'
                                                                }`}
                                                        />

                                                        {/* Advanced Tooltip */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                                            <div className="bg-[#1a1a1a] text-white p-2 rounded shadow-2xl border border-gray-800 flex flex-col gap-1 min-w-[120px]">
                                                                <div className="text-[9px] font-bold text-gray-400 border-b border-gray-800 pb-1 mb-1">
                                                                    {dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </div>
                                                                <div className="flex items-center justify-between gap-4">
                                                                    <span className="text-[10px]">Realized P&L</span>
                                                                    <span className={`text-[10px] font-bold ${day.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        ₹{day.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="w-2 h-2 bg-[#1a1a1a] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-gray-800" />
                                                        </div>
                                                        <span className="absolute inset-0 flex items-center justify-center text-[7px] text-gray-300 font-medium pointer-events-none group-hover:hidden">
                                                            {dateObj.getDate()}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Daily Breakdown Table */}
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-gray-800">Daily Breakdown</h3>
                                <button className="text-xs text-[#387ed1] font-bold hover:underline">Download CSV</button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-[#fcfcfc] text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Date</th>
                                            <th className="px-6 py-3 text-right">Trades</th>
                                            <th className="px-6 py-3 text-right">Realized P&L</th>
                                            <th className="px-6 py-3 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {stats.sorted.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm">
                                                    No trading activity recorded yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            stats.sorted.map((day, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 text-[13px] font-medium text-gray-700">
                                                        {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-6 py-4 text-[13px] text-gray-600 text-right">{day.tradeCount}</td>
                                                    <td className={`px-6 py-4 text-[13px] font-bold text-right ${day.realizedPnl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                                        {day.realizedPnl >= 0 ? '+' : ''}{day.realizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${day.realizedPnl >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                            {day.realizedPnl >= 0 ? 'PROFIT' : 'LOSS'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Tradebook View */
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-sm font-bold text-gray-800">Completed Trades</h3>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search symbol..."
                                        className="pl-8 pr-4 py-1.5 text-xs border border-gray-100 rounded-md focus:outline-none focus:ring-1 focus:ring-[#387ed1]"
                                    />
                                </div>
                                <button className="p-1.5 border border-gray-100 rounded-md text-gray-500 hover:bg-gray-50 transition-colors">
                                    <Filter size={16} />
                                </button>
                                <button className="p-1.5 border border-gray-100 rounded-md text-gray-500 hover:bg-gray-50 transition-colors">
                                    <Download size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[#fcfcfc] text-[10px] uppercase text-gray-400 font-bold border-b border-gray-50">
                                    <tr>
                                        <th className="px-6 py-3">Time</th>
                                        <th className="px-6 py-3">Symbol</th>
                                        <th className="px-6 py-3">Type</th>
                                        <th className="px-6 py-3 text-right">Qty</th>
                                        <th className="px-6 py-3 text-right">Buy Price</th>
                                        <th className="px-6 py-3 text-right">Sell Price</th>
                                        <th className="px-6 py-3 text-right">P&L</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredTradeHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                                                No completed trades found for this period.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTradeHistory.map((trade, i) => (
                                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-[12px] text-gray-500 whitespace-nowrap">
                                                    {new Date(trade.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[13px] font-bold text-gray-800">{trade.symbol}</span>
                                                        <span className="text-[10px] text-gray-400 uppercase">{trade.exchange} • {trade.productType}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trade.type === 'LONG_CLOSE' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                        {trade.type === 'LONG_CLOSE' ? 'LONG' : 'SHORT'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-[13px] text-gray-600 text-right">{trade.quantity}</td>
                                                <td className="px-6 py-4 text-[13px] text-gray-600 text-right">{trade.buyPrice.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-[13px] text-gray-600 text-right">{trade.sellPrice.toFixed(2)}</td>
                                                <td className={`px-6 py-4 text-[13px] font-bold text-right ${trade.realizedPnl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                                    <div className="flex flex-col items-end">
                                                        <span>{trade.realizedPnl >= 0 ? '+' : ''}{trade.realizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                        <span className="text-[10px] text-gray-400 font-normal">
                                                            ({((trade.realizedPnl / (trade.buyPrice * trade.quantity * trade.lotSize)) * 100).toFixed(2)}%)
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
