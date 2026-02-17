'use client';

import { useState } from 'react';
import { Download, PieChart, TrendingUp, Search } from 'lucide-react';

const holdings = [
    { instrument: 'RELIANCE', qty: 50, avg: 2450.00, ltp: 2950.40, dayChange: 1.5, curVal: 147520, pl: 25020, plPercent: 20.42 },
    { instrument: 'TATASTEEL', qty: 200, avg: 110.50, ltp: 145.50, dayChange: 2.3, curVal: 29100, pl: 7000, plPercent: 31.67 },
    { instrument: 'HDFCBANK', qty: 100, avg: 1550.00, ltp: 1420.10, dayChange: -0.5, curVal: 142010, pl: -12990, plPercent: -8.38 },
];

export default function HoldingsPage() {
    const totalInv = holdings.reduce((acc, curr) => acc + (curr.qty * curr.avg), 0);
    const curVal = holdings.reduce((acc, curr) => acc + (curr.qty * curr.ltp), 0);
    const totalPL = curVal - totalInv;
    const totalPLPercent = (totalPL / totalInv) * 100;
    const dayPL = holdings.reduce((acc, curr) => acc + (curr.qty * (curr.ltp * (curr.dayChange / 100))), 0);

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header Stats */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
                <h1 className="text-xl font-light text-[#444] flex items-center gap-2">
                    Holdings <span className="text-gray-400">({holdings.length})</span>
                </h1>

                <div className="flex gap-12 text-sm">
                    <div className="text-right">
                        <div className="text-[#9b9b9b] text-xs font-medium uppercase tracking-wide mb-1">Total investment</div>
                        <div className="text-lg font-medium text-[#444]">₹{totalInv.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[#9b9b9b] text-xs font-medium uppercase tracking-wide mb-1">Current value</div>
                        <div className="text-lg font-medium text-[#444]">₹{curVal.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[#9b9b9b] text-xs font-medium uppercase tracking-wide mb-1">Day's P&L</div>
                        <div className={`text-lg font-medium ${dayPL >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                            {dayPL >= 0 ? '+' : ''}{dayPL.toFixed(2)} <span className="text-xs">({((dayPL / curVal) * 100).toFixed(2)}%)</span>
                        </div>
                    </div>
                    <div className="text-right pl-4 border-l border-gray-200">
                        <div className="text-[#9b9b9b] text-xs font-medium uppercase tracking-wide mb-1">Total P&L</div>
                        <div className={`text-xl font-medium ${totalPL >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                            {totalPL >= 0 ? '+' : ''}{totalPL.toLocaleString()} <span className="text-xs">({totalPLPercent.toFixed(2)}%)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-8 py-4 flex justify-between items-center bg-[#fcfcfc] border-b border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                    <input
                        type="text"
                        placeholder="Filter holdings"
                        className="pl-9 pr-4 py-1.5 border border-gray-200 rounded text-sm text-gray-600 focus:outline-none focus:border-gray-400 w-64 bg-white"
                    />
                </div>
                <div className="flex gap-6 text-xs text-[#387ed1] font-medium cursor-pointer">
                    <span className="flex items-center gap-1 hover:text-blue-700"><PieChart size={14} className="text-[#999]" /> Analytics</span>
                    <span className="flex items-center gap-1 hover:text-blue-700"><Download size={14} className="text-[#999]" /> Download</span>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f9f9f9] text-gray-500 border-b border-gray-200 sticky top-0 z-10">
                        <tr>
                            <th className="px-8 py-3 font-medium border-b hover:bg-[#eee] cursor-pointer transition">Instrument</th>
                            <th className="px-4 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">Qty.</th>
                            <th className="px-4 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">Avg. Cost</th>
                            <th className="px-4 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">LTP</th>
                            <th className="px-4 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">Cur. Val</th>
                            <th className="px-4 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">P&L</th>
                            <th className="px-8 py-3 font-medium text-right border-b hover:bg-[#eee] cursor-pointer transition">Net Chg.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {holdings.map((stock, idx) => (
                            <tr key={idx} className="hover:bg-[#fcfcfc] transition-colors group text-[#444]">
                                <td className="px-8 py-3 font-medium text-xs">{stock.instrument}</td>
                                <td className="px-4 py-3 text-right">{stock.qty}</td>
                                <td className="px-4 py-3 text-right">{stock.avg.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right font-medium">
                                    <span className={stock.dayChange >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}>{stock.ltp.toFixed(2)}</span>
                                    <span className="text-[10px] text-gray-400 ml-1">({stock.dayChange}%)</span>
                                </td>
                                <td className="px-4 py-3 text-right">{stock.curVal.toLocaleString()}</td>
                                <td className={`px-4 py-3 text-right font-medium ${stock.pl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                    {stock.pl >= 0 ? '+' : ''}{stock.pl.toLocaleString()}
                                </td>
                                <td className={`px-8 py-3 text-right ${stock.plPercent >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                    {stock.plPercent.toFixed(2)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
