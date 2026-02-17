'use client';

import { PieChart, Info, Briefcase, Activity, Droplets, ChevronRight } from 'lucide-react';

import { useTradingStore } from '@/lib/store';
import { useMemo } from 'react';

export default function Dashboard() {
    const { account, positions } = useTradingStore();

    // Calculate real-time margin usage and P&L
    const metrics = useMemo(() => {
        const totalUsedMargin = positions.reduce((acc, pos) => {
            // Simple approximation: Price * Qty (this would ideally use the span margin calculator)
            return acc + (Math.abs(pos.quantity) * pos.ltp);
        }, 0);

        return {
            usedMargin: totalUsedMargin,
            openingBalance: account.totalCapital, // Assuming totalCapital is set at start of day/settlement
            available: account.availableMargin
        };
    }, [account, positions]);

    return (
        <div className="flex-1 h-full overflow-y-auto p-12 custom-scrollbar">

            {/* Header Greeting */}
            <div className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-light text-[#444] tracking-tight">Hi, Rajat</h1>
                    <div className="h-0.5 w-8 bg-[#e0e0e0] mt-3"></div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-light text-[#666]">Equity</div>
                    <div className="text-xl font-medium text-[#444] tracking-tight">
                        ₹{(metrics.available / 100000).toFixed(2)}L
                    </div>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-b border-[#e0e0e0] pb-12 mb-10">

                {/* Equity Summary */}
                <div className="flex flex-col gap-6 md:pr-12 md:border-r border-[#eee]">
                    <div className="flex items-center gap-2 text-[#444] text-[16px] font-light opacity-90">
                        <div className="w-8 h-8 rounded-full bg-[#f0f4f9] flex items-center justify-center text-[#666]">
                            <PieChart size={16} strokeWidth={1.5} />
                        </div>
                        Equity
                    </div>

                    <div className="flex justify-between items-end mt-2 pl-2">
                        <div>
                            <div className="text-[42px] font-light text-[#333] tracking-tighter leading-none">
                                {(metrics.available / 100000).toFixed(2)}L
                            </div>
                            <div className="text-[11px] text-[#9b9b9b] mt-2 uppercase font-medium tracking-wide">Margin available</div>
                        </div>

                        <div className="text-right flex flex-col gap-1.5 text-sm">
                            <div className="flex justify-end gap-4 items-center group cursor-default">
                                <span className="text-[#9b9b9b] font-light text-xs">Margins used</span>
                                <span className="text-[#444] font-medium font-mono">
                                    {metrics.usedMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex justify-end gap-4 items-center group cursor-default">
                                <span className="text-[#9b9b9b] font-light text-xs">Opening balance</span>
                                <span className="text-[#444] font-medium font-mono">
                                    {(metrics.openingBalance / 100000).toFixed(2)}L
                                </span>
                            </div>
                            <div className="mt-2 text-[#387ed1] text-[11px] font-semibold cursor-pointer flex items-center justify-end gap-1 hover:text-blue-700 transition">
                                <Info size={12} /> View statement <ChevronRight size={10} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Commodity Summary */}
                <div className="flex flex-col gap-6 pl-4">
                    <div className="flex items-center gap-2 text-[#444] text-[16px] font-light opacity-90">
                        <div className="w-8 h-8 rounded-full bg-[#f0f4f9] flex items-center justify-center text-[#666]">
                            <Droplets size={16} strokeWidth={1.5} />
                        </div>
                        Commodity
                    </div>

                    <div className="flex justify-between items-end mt-2 pl-2">
                        <div>
                            <div className="text-[42px] font-light text-[#333] tracking-tighter leading-none">0</div>
                            <div className="text-[11px] text-[#9b9b9b] mt-2 uppercase font-medium tracking-wide">Margin available</div>
                        </div>

                        <div className="text-right flex flex-col gap-1.5 text-sm">
                            <div className="flex justify-end gap-4 items-center group cursor-default">
                                <span className="text-[#9b9b9b] font-light text-xs">Margins used</span>
                                <span className="text-[#444] font-medium font-mono">0</span>
                            </div>
                            <div className="flex justify-end gap-4 items-center group cursor-default">
                                <span className="text-[#9b9b9b] font-light text-xs">Opening balance</span>
                                <span className="text-[#444] font-medium font-mono">0</span>
                            </div>
                            <div className="mt-2 text-[#387ed1] text-[11px] font-semibold cursor-pointer flex items-center justify-end gap-1 hover:text-blue-700 transition">
                                <Info size={12} /> View statement <ChevronRight size={10} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Empty State */}
            <div className="flex flex-col items-center justify-center py-16 gap-6 text-center border-b border-[#eee] pb-16 mb-10">
                <div className="w-20 h-20 border border-[#eee] rounded-full border-dashed flex items-center justify-center bg-white shadow-sm">
                    <Briefcase size={32} className="text-[#ddd]" strokeWidth={1.2} />
                </div>
                <div className="max-w-md">
                    <h3 className="text-[#444] font-medium mb-1">No holdings</h3>
                    <p className="text-[#777] text-[13px] font-light leading-relaxed">
                        You don't have any stocks in your DEMAT yet. Get started with absolutely free equity investments.
                    </p>
                </div>
                <button className="bg-[#387ed1] hover:bg-blue-600 text-white px-6 py-2 rounded-[3px] text-xs font-semibold shadow-sm transition-all transform hover:-translate-y-0.5 tracking-wide uppercase">
                    Start investing
                </button>
            </div>

            {/* Bottom Metrics Section */}
            <div className="grid grid-cols-2 gap-12 mt-4">

                {/* Market Overview Graph Placeholder */}
                <div>
                    <div className="flex items-center gap-2 text-[#666] text-xs font-semibold uppercase tracking-wider mb-4 opacity-80">
                        <Activity size={14} /> Market overview
                    </div>
                    <div className="h-40 border border-[#e0e0e0] rounded bg-white relative overflow-hidden flex items-end opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                        <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
                            <path d="M0 30 Q 10 25, 20 32 T 40 20 T 60 25 T 80 15 T 100 10 L 100 40 L 0 40 Z" fill="#e3f2fd" />
                            <path d="M0 30 Q 10 25, 20 32 T 40 20 T 60 25 T 80 15 T 100 10" stroke="#387ed1" strokeWidth="0.5" fill="none" />
                        </svg>
                    </div>
                </div>

                {/* Positions Placeholder */}
                <div>
                    <div className="flex items-center gap-2 text-[#666] text-xs font-semibold uppercase tracking-wider mb-4 opacity-80">
                        <Briefcase size={14} /> Positions (1)
                    </div>
                    <div className="border border-[#e0e0e0] bg-white rounded p-4 hover:shadow-sm transition-shadow cursor-pointer">
                        <div className="flex items-center gap-3 text-xs mb-3">
                            <span className="bg-[#fff3e0] text-[#ff5722] px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border border-[#ffe0b2]">MIS</span>
                            <span className="text-[#999] font-medium">NSE</span>
                            <span className="flex-1 text-right text-[10px] text-[#ccc]">12:28:45</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-[#444]">BANKNIFTY FEB 60500 PE</span>
                            <span className="text-rose-500 font-mono text-base font-medium">-1,194.00</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
