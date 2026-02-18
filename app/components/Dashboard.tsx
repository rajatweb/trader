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
        <div className="flex-1 h-full overflow-y-auto p-6 md:p-12 custom-scrollbar">

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


        </div>
    );
}
