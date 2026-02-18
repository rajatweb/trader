'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Download, Settings, PieChart, ChevronDown, MoreVertical, TrendingUp, Info, Plus, Trash2, BarChart2, Bell, ExternalLink, Activity, ShoppingBag, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTradingStore, Position } from '@/lib/store';
import OrderModal from '@/app/components/OrderModal';

export default function PositionsPage() {
    const { positions, account, closePosition } = useTradingStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Order Modal state for SL orders
    const [orderModalConfig, setOrderModalConfig] = useState({
        isOpen: false,
        type: 'Sell' as 'Buy' | 'Sell',
        symbol: '',
        price: 0,
        securityId: '',
        exchange: 'NSE' as 'NSE' | 'BSE' | 'MCX',
        segment: '',
        prefilledOrderType: 'SL' as 'MARKET' | 'LIMIT' | 'SL' | 'SL-M',
        prefilledQuantity: 0,
        prefilledTriggerPrice: 0
    });

    const totalPnL = positions.reduce((acc, curr) => acc + curr.totalPnl, 0);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuId(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const filteredPositions = positions.filter(pos =>
        pos.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-white text-[#444]">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-3 border-b border-gray-100 bg-white gap-4 md:gap-0">
                <h1 className="text-xl font-light text-[#444] flex items-center gap-2">
                    Positions <span className="text-gray-400 font-light text-lg">({positions.length})</span>
                </h1>

                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={13} />
                        <input
                            type="text"
                            placeholder="Search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 pr-4 py-1 border border-gray-200 rounded-sm text-xs text-[#444] focus:outline-none focus:border-gray-400 w-full md:w-48 bg-white placeholder:text-gray-400"
                        />
                    </div>
                    <div className="hidden md:flex gap-4 text-xs font-medium text-[#387ed1]">
                        <button className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                            <PieChart size={12} strokeWidth={2.5} /> Analytics
                        </button>
                        <button className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                            <Settings size={12} strokeWidth={2.5} /> Settings
                        </button>
                        <button className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                            <Download size={12} strokeWidth={2.5} /> Download
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-0">

                {filteredPositions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Activity size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">No open positions</p>
                        <p className="text-xs mt-2">Place an order to see your positions here</p>
                    </div>
                ) : (
                    <>
                        {/* Positions Table */}
                        <div className="w-full overflow-x-auto pointer-events-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#fcfcfc] text-gray-500 text-[11px] border-b border-gray-100">
                                    <tr>
                                        <th className="px-5 py-3 w-10 font-medium border-b border-gray-100"><input type="checkbox" className="accent-[#387ed1] w-3 h-3" /></th>
                                        <th className="px-3 py-3 font-medium border-b border-gray-100">Product</th>
                                        <th className="px-3 py-3 font-medium border-b border-gray-100">Instrument</th>
                                        <th className="px-3 py-3 font-medium text-right border-b border-gray-100">Qty.</th>
                                        <th className="px-3 py-3 font-medium text-right border-b border-gray-100">Avg.</th>
                                        <th className="px-3 py-3 font-medium text-right border-b border-gray-100">LTP</th>
                                        <th className="px-3 py-3 font-medium text-right border-b border-gray-100">P&L</th>
                                        <th className="px-5 py-3 font-medium text-right border-b border-gray-100">Chg.</th>
                                        <th className="w-10 border-b border-gray-100"></th> {/* Menu Column */}
                                    </tr>
                                </thead>
                                <tbody className="text-xs text-[#444]">
                                    {filteredPositions.map((pos) => {
                                        const avgPrice = pos.quantity > 0 ? pos.avgBuyPrice : pos.avgSellPrice;
                                        const changePercent = avgPrice > 0 ? ((pos.ltp - avgPrice) / avgPrice) * 100 : 0;

                                        return (
                                            <tr key={pos.securityId} className={`hover:bg-[#f9f9f9] transition-colors border-b border-gray-50 bg-white group relative ${pos.quantity === 0 ? 'opacity-60 bg-gray-50' : ''}`}>
                                                <td className="px-5 py-3"><input type="checkbox" className="accent-[#387ed1] w-3 h-3" disabled={pos.quantity === 0} /></td>
                                                <td className="px-3 py-3">
                                                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-[2px] uppercase tracking-wide font-medium">{pos.productType}</span>
                                                </td>
                                                <td className={`px-3 py-3 font-medium text-[13px] ${pos.quantity === 0 ? 'text-gray-400' : 'text-[#444]'}`}>
                                                    {pos.symbol} <span className="text-[10px] text-gray-400 uppercase font-normal ml-1">{pos.exchange}</span>
                                                </td>
                                                <td className={`px-3 py-3 text-right font-medium ${pos.quantity === 0 ? 'text-gray-400' : (pos.quantity > 0 ? 'text-[#387ed1]' : 'text-[#ff5722]')}`}>
                                                    <div className="flex flex-col items-end">
                                                        <span>{Math.abs(pos.quantity)}</span>
                                                        {pos.lotSize > 1 && (
                                                            <span className="text-[10px] text-gray-400 font-normal">
                                                                ({Math.abs(pos.quantity / pos.lotSize)} {Math.abs(pos.quantity / pos.lotSize) === 1 ? 'lot' : 'lots'})
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-right text-gray-600">{avgPrice.toFixed(2)}</td>
                                                <td className={`px-3 py-3 text-right ${pos.quantity === 0 ? 'text-gray-500 font-medium' : 'text-gray-900'}`}>{pos.ltp.toFixed(2)}</td>
                                                <td className={`px-3 py-3 text-right font-medium ${pos.quantity === 0 ? 'text-gray-400' : (pos.totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]')}`}>
                                                    {pos.totalPnl >= 0 ? '+' : ''}{pos.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-5 py-3 text-right text-gray-400 text-[11px]">
                                                    {pos.quantity !== 0 ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '-'}
                                                </td>
                                                {/* Action Menu Cell */}
                                                <td className="px-2 py-3 text-right relative w-10">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveMenuId(activeMenuId === pos.securityId ? null : pos.securityId);
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:bg-blue-50 hover:text-[#387ed1] rounded transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <MoreVertical size={14} />
                                                    </button>

                                                    {/* Dropdown Menu */}
                                                    <AnimatePresence>
                                                        {activeMenuId === pos.securityId && (
                                                            <div
                                                                ref={menuRef}
                                                                className="absolute right-8 top-8 z-50 w-[180px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.1)] border border-gray-100 rounded-[3px] py-1 text-left origin-top-right"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {/* Header Actions - Only show for open positions */}
                                                                {pos.quantity !== 0 ? (
                                                                    <div className="flex items-center justify-around px-3 py-2 border-b border-gray-50 mb-1">
                                                                        <button
                                                                            onClick={() => {
                                                                                const isLong = pos.quantity > 0;
                                                                                const suggestedTrigger = isLong
                                                                                    ? pos.ltp * 0.98  // 2% below for long
                                                                                    : pos.ltp * 1.02; // 2% above for short

                                                                                setOrderModalConfig({
                                                                                    isOpen: true,
                                                                                    type: isLong ? 'Sell' : 'Buy', // Opposite of position
                                                                                    symbol: pos.symbol,
                                                                                    price: pos.ltp,
                                                                                    securityId: pos.securityId,
                                                                                    exchange: pos.exchange as any,
                                                                                    segment: pos.segment,
                                                                                    prefilledOrderType: 'SL',
                                                                                    prefilledQuantity: Math.abs(pos.quantity / pos.lotSize),
                                                                                    prefilledTriggerPrice: Number(suggestedTrigger.toFixed(2))
                                                                                });
                                                                                setActiveMenuId(null);
                                                                            }}
                                                                            className="flex flex-col items-center gap-1 text-[10px] font-medium text-[#666] hover:text-orange-600 p-1 rounded hover:bg-orange-50 transition-colors"
                                                                        >
                                                                            <Shield size={14} strokeWidth={2} />
                                                                            <span>Add SL</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                closePosition(pos.securityId);
                                                                                setActiveMenuId(null);
                                                                            }}
                                                                            className="flex flex-col items-center gap-1 text-[10px] font-medium text-[#666] hover:text-[#ff5722] p-1 rounded hover:bg-gray-50 transition-colors"
                                                                        >
                                                                            <Trash2 size={14} strokeWidth={2} />
                                                                            <span>Exit Pos</span>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="px-4 py-2 text-[11px] text-gray-400 italic border-b border-gray-50 mb-1">
                                                                        Position closed
                                                                    </div>
                                                                )}

                                                                {/* List Items - Only keep functional ones */}
                                                                <div className="flex flex-col py-1">
                                                                    {[
                                                                        { label: 'View Chart', icon: <Activity size={13} />, link: '#' },
                                                                        { label: 'Option Chain', icon: <ExternalLink size={13} />, link: '/apps/option-chain' },
                                                                    ].map((item, i) => (
                                                                        <button
                                                                            key={i}
                                                                            onClick={() => {
                                                                                if (item.link !== '#') window.location.href = item.link;
                                                                                setActiveMenuId(null);
                                                                            }}
                                                                            className="px-4 py-2 text-[12px] text-[#444] hover:bg-[#f5f5f5] hover:text-[#387ed1] flex items-center gap-3 transition-colors w-full text-left font-normal"
                                                                        >
                                                                            <span className="text-gray-400 w-4">{item.icon}</span>
                                                                            {item.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </AnimatePresence>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Total Row */}
                                    <tr className="bg-white">
                                        <td colSpan={6} className="px-3 py-4 text-right font-medium text-gray-500 text-[13px]">Total P&L</td>
                                        <td className={`px-3 py-4 text-right font-semibold text-[15px] ${totalPnL >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                                            {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

            </div>

            {/* Order Modal for SL Orders */}
            <OrderModal
                isOpen={orderModalConfig.isOpen}
                onClose={() => setOrderModalConfig(prev => ({ ...prev, isOpen: false }))}
                type={orderModalConfig.type}
                symbol={orderModalConfig.symbol}
                price={orderModalConfig.price}
                securityId={orderModalConfig.securityId}
                exchange={orderModalConfig.exchange}
                segment={orderModalConfig.segment}
                prefilledOrderType={orderModalConfig.prefilledOrderType}
                prefilledQuantity={orderModalConfig.prefilledQuantity}
                prefilledTriggerPrice={orderModalConfig.prefilledTriggerPrice}
            />
        </div>
    );
}
