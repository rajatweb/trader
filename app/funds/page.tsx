'use client';

import { Wallet, PieChart, RotateCcw } from 'lucide-react';
import { useTradingStore } from '@/lib/store';
import { useState } from 'react';

export default function FundsPage() {
    const { account, addFunds, reset } = useTradingStore();
    const [customAmount, setCustomAmount] = useState('100000');
    const [isAdding, setIsAdding] = useState(false);

    const handleAddFunds = () => {
        const value = parseFloat(customAmount);
        if (!value || value <= 0) return;
        addFunds(value);
        setIsAdding(false);
    };

    const handleReset = () => {
        if (confirm('Are you sure you want to reset your entire account? This will clear all orders, positions, and reset your balance.')) {
            reset();
        }
    };

    return (
        <div className="flex-1 bg-[#f9f9f9] h-full overflow-y-auto p-4 md:p-8 text-[#444]">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-8 max-w-5xl gap-4 md:gap-0">
                <h1 className="text-xl font-light text-[#444] flex items-center gap-2">
                    Funds
                </h1>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors bg-white border border-red-100 px-3 py-1.5 rounded shadow-sm w-full md:w-auto justify-center"
                >
                    <RotateCcw size={14} /> Reset Account
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">

                {/* Equity Card */}
                <div className="bg-white border border-gray-200 rounded p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-2 text-lg font-light">
                            <PieChart size={20} className="text-gray-400" /> Equity
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Available margin</span>
                            <span className="text-3xl font-light text-[#387ed1]">₹{(account.availableMargin / 100000).toFixed(2)}L</span>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8 text-sm">
                        <div className="flex justify-between py-2 border-b border-gray-50">
                            <span className="text-gray-500">Total capital</span>
                            <span className="text-[#444]">₹{account.totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-50">
                            <span className="text-gray-500">Available margin</span>
                            <span className="text-[#444]">₹{account.availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-50">
                            <span className="text-gray-500">Used margin</span>
                            <span className="text-[#444]">₹{account.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-50">
                            <span className="text-gray-500">Margin utilization</span>
                            <span className={`${account.marginUtilization > 80 ? 'text-red-600' : 'text-[#444]'}`}>
                                {account.marginUtilization.toFixed(2)}%
                            </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-50">
                            <span className="text-gray-500">Total P&L</span>
                            <span className={account.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {account.totalPnl >= 0 ? '+' : ''}₹{account.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 pt-4 border-t border-gray-100">
                        {!isAdding ? (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full bg-[#387ed1] hover:bg-blue-600 text-white py-2.5 rounded text-sm font-medium flex justify-center items-center gap-2 transition-colors shadow-sm"
                            >
                                <span className="text-lg leading-none">+</span> Add Funds
                            </button>
                        ) : (
                            <div className="flex gap-2 w-full animate-in fade-in zoom-in duration-200">
                                <input
                                    type="number"
                                    value={customAmount}
                                    onChange={(e) => setCustomAmount(e.target.value)}
                                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#387ed1]"
                                    placeholder="Enter amount"
                                    autoFocus
                                />
                                <button
                                    onClick={handleAddFunds}
                                    className="bg-[#387ed1] hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 text-center">
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest">Paper Trading Mode</span>
                    </div>
                </div>

                {/* Commodity Card */}
                <div className="bg-white border border-gray-200 rounded p-6 shadow-sm opacity-60">
                    <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-2 text-lg font-light">
                            <span className="text-gray-400">●</span> Commodity
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Available margin</span>
                            <span className="text-3xl font-light text-[#444]">0</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-4">
                        <p>Activate commodity segment to trade.</p>
                        <button className="px-4 py-2 border border-[#387ed1] text-[#387ed1] rounded text-xs font-semibold hover:bg-blue-50 transition">Activate now</button>
                    </div>
                </div>

            </div>

            {/* Alert / Info */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 flex gap-2 items-start max-w-5xl">
                <span className="font-bold">Note:</span>
                <p>This is a dummy application. "Add Funds" simply increases your virtual balance for testing purposes.</p>
            </div>

        </div>
    );
}
