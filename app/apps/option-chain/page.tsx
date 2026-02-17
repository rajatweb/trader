'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw, BarChart2 } from 'lucide-react';
import Link from 'next/link';

interface Strike {
    strike: number;
    call: { ltp: number; change: number; oi: string; iv: number; vol: string };
    put: { ltp: number; change: number; oi: string; iv: number; vol: string };
}

const mockStrikes: Strike[] = [
    { strike: 22000, call: { ltp: 245.50, change: 12.5, oi: '45.2L', iv: 14.2, vol: '1.2M' }, put: { ltp: 45.20, change: -10.5, oi: '12.1L', iv: 15.6, vol: '0.8M' } },
    { strike: 22050, call: { ltp: 210.10, change: 10.2, oi: '32.5L', iv: 14.1, vol: '1.0M' }, put: { ltp: 58.60, change: -8.2, oi: '15.4L', iv: 15.4, vol: '0.9M' } },
    { strike: 22100, call: { ltp: 175.40, change: 8.5, oi: '28.1L', iv: 14.0, vol: '0.5M' }, put: { ltp: 75.10, change: -5.4, oi: '18.9L', iv: 15.2, vol: '1.1M' } },
    { strike: 22150, call: { ltp: 145.20, change: 5.1, oi: '55.4L', iv: 13.9, vol: '2.5M' }, put: { ltp: 95.40, change: -2.1, oi: '42.2L', iv: 15.0, vol: '2.2M' } }, // ATM
    { strike: 22200, call: { ltp: 115.60, change: -2.4, oi: '65.2L', iv: 13.8, vol: '1.8M' }, put: { ltp: 125.20, change: 5.4, oi: '22.1L', iv: 14.9, vol: '0.6M' } },
    { strike: 22250, call: { ltp: 92.10, change: -5.2, oi: '45.1L', iv: 13.7, vol: '1.1M' }, put: { ltp: 155.40, change: 10.2, oi: '10.5L', iv: 14.8, vol: '0.4M' } },
    { strike: 22300, call: { ltp: 72.50, change: -8.5, oi: '35.6L', iv: 13.6, vol: '0.7M' }, put: { ltp: 195.10, change: 15.5, oi: '5.2L', iv: 14.7, vol: '0.3M' } },
];

export default function OptionChainPage() {
    const [selectedSymbol, setSelectedSymbol] = useState('NIFTY');
    const [expiry, setExpiry] = useState('28 MAR');

    return (
        <div className="flex flex-col h-full bg-white text-[#444]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
                <div className="flex items-center gap-4">
                    <Link href="/apps" className="text-gray-400 hover:text-[#387ed1] transition-colors p-2 rounded hover:bg-gray-100">
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 className="text-lg font-medium text-[#444] flex items-center gap-2">
                        Option Chain
                    </h1>

                    <div className="flex gap-2">
                        <select
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-sm px-3 py-1.5 rounded focus:outline-none focus:border-blue-400 text-gray-700 font-medium"
                        >
                            <option value="NIFTY">NIFTY 50</option>
                            <option value="BANKNIFTY">BANKNIFTY</option>
                        </select>
                        <select
                            value={expiry}
                            onChange={(e) => setExpiry(e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-sm px-3 py-1.5 rounded focus:outline-none focus:border-blue-400 text-gray-700 font-medium"
                        >
                            <option>28 MAR</option>
                            <option>04 APR</option>
                            <option>11 APR</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-6 text-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">Spot Price</span>
                        <span className="font-medium text-[#26a69a]">22,150.05</span>
                    </div>
                    <div className="flex flex-col items-end border-l border-gray-100 pl-6">
                        <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">IV Rank</span>
                        <span className="font-medium text-[#444]">14.2%</span>
                    </div>
                    <div className="flex flex-col items-end border-l border-gray-100 pl-6">
                        <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">PCR</span>
                        <span className="font-medium text-[#26a69a]">1.25</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-[#fcfcfc]">
                <table className="w-full text-center text-xs border-collapse">
                    <thead className="bg-[#f2f2f2] text-gray-500 font-medium sticky top-0 z-10 shadow-sm border-b border-gray-200">
                        <tr className="text-[10px] uppercase tracking-wide">
                            <th colSpan={5} className="py-2 border-r border-gray-200 text-center font-bold text-[#666]">CALLS</th>
                            <th className="py-2 bg-white border-b border-gray-200 w-24"></th>
                            <th colSpan={5} className="py-2 border-l border-gray-200 text-center font-bold text-[#666]">PUTS</th>
                        </tr>
                        <tr className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">
                            {/* CALLS HEADER */}
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">OI</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">Chg%</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">Vol</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">IV</th>
                            <th className="py-2 px-1 font-normal border-b border-r border-gray-200 hover:bg-gray-200 cursor-pointer text-[#444]">LTP</th>

                            {/* STRIKE HEADER */}
                            <th className="py-2 px-2 border-b border-gray-200 bg-[#eef] text-[#333] font-bold">Strike</th>

                            {/* PUTS HEADER */}
                            <th className="py-2 px-1 font-normal border-b border-l border-gray-200 hover:bg-gray-200 cursor-pointer text-[#444]">LTP</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">IV</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">Vol</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">Chg%</th>
                            <th className="py-2 px-1 font-normal border-b border-gray-200 hover:bg-gray-200 cursor-pointer">OI</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {mockStrikes.map((row) => {
                            const isATM = row.strike === 22150;
                            const callITM = row.strike < 22150;
                            const putITM = row.strike > 22150;

                            return (
                                <tr key={row.strike} className={`hover:bg-[#f0f9ff] transition-colors group border-b border-gray-100 ${isATM ? 'bg-[#fffae6]' : ''}`}>

                                    {/* CALLS DATA */}
                                    <td className={`py-1.5 px-1 border-r border-dashed border-gray-100 ${callITM ? 'bg-[#fff9c4]/30' : ''} text-[#444] relative`}>
                                        <div className="absolute top-1 bottom-1 left-0 bg-blue-100 opacity-50" style={{ width: '40%' }}></div>
                                        <span className="relative z-10">{row.call.oi}</span>
                                    </td>
                                    <td className={`py-1.5 px-1 border-r border-dashed border-gray-100 ${callITM ? 'bg-[#fff9c4]/30' : ''} ${row.call.change >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                        {row.call.change}%
                                    </td>
                                    <td className={`py-1.5 px-1 border-r border-dashed border-gray-100 ${callITM ? 'bg-[#fff9c4]/30' : ''} text-gray-500`}>
                                        {row.call.vol}
                                    </td>
                                    <td className={`py-1.5 px-1 border-r border-dashed border-gray-100 ${callITM ? 'bg-[#fff9c4]/30' : ''} text-gray-500`}>
                                        {row.call.iv}
                                    </td>
                                    <td className={`py-1.5 px-1 border-r border-gray-200 font-medium ${callITM ? 'bg-[#fff9c4]/30' : ''} text-[#333] cursor-pointer hover:bg-blue-50 relative group/cell`}>
                                        {row.call.ltp.toFixed(2)}
                                        <div className="hidden group-hover/cell:flex absolute right-0 top-0 bottom-0 items-center pr-1 bg-white shadow-sm z-10">
                                            <button className="bg-[#387ed1] text-white px-1.5 rounded text-[9px] mr-1 hover:bg-blue-600">B</button>
                                            <button className="bg-[#ff5722] text-white px-1.5 rounded text-[9px] hover:bg-red-600">S</button>
                                        </div>
                                    </td>

                                    {/* STRIKE PRICE */}
                                    <td className={`py-1.5 px-4 font-bold ${isATM ? 'text-black bg-[#e3f2fd]' : 'text-[#444] bg-[#f8f9fa]'} border-x border-gray-200`}>
                                        {row.strike}
                                    </td>

                                    {/* PUTS DATA */}
                                    <td className={`py-1.5 px-1 border-l border-gray-200 font-medium ${putITM ? 'bg-[#fff9c4]/30' : ''} text-[#333] cursor-pointer hover:bg-blue-50 relative group/cell`}>
                                        {row.put.ltp.toFixed(2)}
                                        <div className="hidden group-hover/cell:flex absolute left-0 top-0 bottom-0 items-center pl-1 bg-white shadow-sm z-10">
                                            <button className="bg-[#387ed1] text-white px-1.5 rounded text-[9px] mr-1 hover:bg-blue-600">B</button>
                                            <button className="bg-[#ff5722] text-white px-1.5 rounded text-[9px] hover:bg-red-600">S</button>
                                        </div>
                                    </td>
                                    <td className={`py-1.5 px-1 border-l border-dashed border-gray-100 ${putITM ? 'bg-[#fff9c4]/30' : ''} text-gray-500`}>
                                        {row.put.iv}
                                    </td>
                                    <td className={`py-1.5 px-1 border-l border-dashed border-gray-100 ${putITM ? 'bg-[#fff9c4]/30' : ''} text-gray-500`}>
                                        {row.put.vol}
                                    </td>
                                    <td className={`py-1.5 px-1 border-l border-dashed border-gray-100 ${putITM ? 'bg-[#fff9c4]/30' : ''} ${row.put.change >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                        {row.put.change}%
                                    </td>
                                    <td className={`py-1.5 px-1 border-l border-dashed border-gray-100 ${putITM ? 'bg-[#fff9c4]/30' : ''} text-[#444] relative`}>
                                        <div className="absolute top-1 bottom-1 right-0 bg-red-50 opacity-50" style={{ width: '30%' }}></div>
                                        <span className="relative z-10">{row.put.oi}</span>
                                    </td>

                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="p-2 border-t border-gray-200 bg-gray-50 text-[10px] text-center text-gray-500">
                Data is delayed by 15 mins.
            </div>
        </div>
    );
}
