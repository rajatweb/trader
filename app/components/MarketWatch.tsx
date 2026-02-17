'use client';

import React, { useState, useEffect } from 'react';
import { Search, MoreHorizontal, TrendingUp, TrendingDown, RefreshCcw, Trash2 } from 'lucide-react';
import { Reorder } from 'framer-motion';
import OrderModal from './OrderModal';
import { useTradingStore, useMarketFeed, WatchlistItem } from '@/lib/store';

export default function MarketWatch() {
    const {
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        reorderWatchlist,
        isConnected
    } = useTradingStore();

    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Initialize market feed
    useMarketFeed();

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'Buy' as 'Buy' | 'Sell',
        symbol: '',
        price: 0,
        securityId: '',
        exchange: 'NSE' as 'NSE' | 'BSE' | 'MCX',
        segment: ''
    });

    // Search Effect
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (search.length >= 2) {
                setIsSearching(true);
                try {
                    const res = await fetch(`/api/dhan/instruments/search?q=${encodeURIComponent(search)}`);
                    const data = await res.json();
                    setSearchResults(data.results || []);
                } catch (error) {
                    console.error("Search failed", error);
                    setSearchResults([]);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    const handleAddToWatchlist = (instrument: any) => {
        // Check if already exists
        if (watchlist.some(w => w.securityId === String(instrument.securityId))) return;

        const newItem: WatchlistItem = {
            securityId: String(instrument.securityId),
            symbol: instrument.symbol || instrument.tradingSymbol || instrument.name,
            exchange: instrument.exchange as 'NSE' | 'BSE' | 'MCX',
            segment: instrument.segment,
            ltp: 0,
            change: 0,
            changePercent: 0,
            isIndex: instrument.segment === 'IDX_I'
        };

        addToWatchlist(newItem);
        setSearch('');
    };

    const handleOpenModal = (type: 'Buy' | 'Sell', item: WatchlistItem) => {
        setModalConfig({
            isOpen: true,
            type,
            symbol: item.symbol,
            price: item.ltp,
            securityId: item.securityId,
            exchange: item.exchange,
            segment: item.segment
        });
    };

    return (
        <div className="flex flex-col h-full bg-white border-r border-[#e0e0e0] w-[380px] shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.02)] z-10 relative">
            <OrderModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                type={modalConfig.type}
                symbol={modalConfig.symbol}
                price={modalConfig.price}
                securityId={modalConfig.securityId}
                exchange={modalConfig.exchange}
                segment={modalConfig.segment}
            />

            {/* Connection Status */}
            {!isConnected && watchlist.length > 0 && (
                <div className="bg-yellow-50 border-b border-yellow-200 px-3 py-1.5 text-xs text-yellow-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                    Connect broker for live prices
                </div>
            )}

            {/* Search Header - Fixed at Top */}
            <div className="p-3 border-b border-[#e0e0e0] flex gap-2 bg-white sticky top-0 z-20">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#999] group-focus-within:text-[#444] transition-colors" size={15} strokeWidth={2} />
                    <input
                        type="text"
                        placeholder="Search eg: infy bse, nifty fut, index fund, etc"
                        className="w-full bg-[#f9f9f9] border border-[#eee] text-[#333] pl-9 pr-4 py-2 rounded focus:outline-none focus:border-[#e0e0e0] focus:shadow-sm focus:bg-white text-[13px] transition-all placeholder:text-[#999] font-medium"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {isSearching ? (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#999]">
                            <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#999] text-[10px] font-mono px-1 border border-[#eee] rounded bg-white">
                            {watchlist.length} / 50
                        </div>
                    )}
                </div>
            </div>

            {/* List - Scrollable Area */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                {search ? (
                    // Search Results List
                    <div className="flex flex-col">
                        {searchResults.length > 0 ? (
                            searchResults.map((item, idx) => {
                                const isAdded = watchlist.some(w => w.securityId === String(item.securityId));
                                return (
                                    <div
                                        key={`${item.securityId}_${idx}`}
                                        onClick={() => !isAdded && handleAddToWatchlist(item)}
                                        className={`flex justify-between items-center px-4 py-3 border-b border-[#f3f3f3] hover:bg-[#fbfbfb] cursor-pointer transition-colors ${isAdded ? 'opacity-50 cursor-default' : ''}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-medium text-[#333]">{item.tradingSymbol}</span>
                                            <div className="flex gap-2">
                                                <span className="text-[10px] text-[#999]">{item.exchange}</span>
                                                <span className="text-[10px] text-[#999]">{item.segment}</span>
                                            </div>
                                        </div>
                                        {isAdded ? (
                                            <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">Added</span>
                                        ) : (
                                            <button className="text-[#4184f3] hover:bg-blue-50 p-1 rounded">
                                                <MoreHorizontal size={16} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            !isSearching && (
                                <div className="p-8 text-center text-[#999] text-xs">
                                    No results found for "{search}"
                                </div>
                            )
                        )}
                    </div>
                ) : (
                    // Watchlist logic (Reorderable)
                    watchlist.length > 0 ? (
                        <Reorder.Group axis="y" values={watchlist} onReorder={reorderWatchlist} className="flex flex-col">
                            {watchlist.filter(item => item.securityId).map(item => (
                                <Reorder.Item key={item.securityId} value={item}>
                                    <WatchlistItemRow
                                        item={item}
                                        handleOpenModal={handleOpenModal}
                                    />
                                </Reorder.Item>
                            ))}
                        </Reorder.Group>
                    ) : (
                        <div className="p-12 text-center text-[#999] text-xs font-medium flex flex-col items-center gap-2">
                            <Search size={24} className="opacity-20 mb-2" />
                            <p>Search & add instruments</p>
                        </div>
                    )
                )}
            </div>

            {/* Footer - Fixed at Bottom */}
            <div className="border-t border-[#e0e0e0] bg-white p-2 px-3 flex justify-between items-center text-xs">
                <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map(num => (
                        <button
                            key={num}
                            className={`w-6 h-6 flex items-center justify-center rounded-[2px] transition-colors text-[11px] font-medium ${num === 1 ? 'bg-[#f0f0f0] text-[#333] border border-[#ddd]' : 'text-[#666] hover:bg-[#f5f5f5]'}`}
                        >
                            {num}
                        </button>
                    ))}
                </div>
                <button className="p-1.5 text-[#666] hover:text-[#333] hover:bg-[#f0f0f0] rounded transition-colors" title="Settings">
                    <RefreshCcw size={12} />
                </button>
            </div>
        </div>
    );
}

function WatchlistItemRow({ item, handleOpenModal }: {
    item: WatchlistItem,
    handleOpenModal: (type: 'Buy' | 'Sell', item: WatchlistItem) => void
}) {
    const { removeFromWatchlist } = useTradingStore();
    const isPositive = item.change >= 0;

    return (
        <div
            className="group flex justify-between items-center px-4 py-3.5 border-b border-[#f3f3f3] hover:bg-[#fbfbfb] cursor-grab active:cursor-grabbing transition-colors relative bg-white"
        >
            {/* Hover Actions Overlay */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white shadow-sm border border-[#eee] rounded overflow-hidden z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); handleOpenModal('Buy', item); }}
                    className="bg-[#4184f3] text-white w-8 h-7 flex items-center justify-center text-[11px] font-bold hover:bg-blue-600 transition"
                >
                    B
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); handleOpenModal('Sell', item); }}
                    className="bg-[#ff5722] text-white w-8 h-7 flex items-center justify-center text-[11px] font-bold hover:bg-red-600 transition"
                >
                    S
                </button>
                <button className="text-[#666] w-7 h-7 flex items-center justify-center hover:bg-gray-100 border-l border-[#eee] transition"><MoreHorizontal size={14} /></button>
                <button
                    className="text-[#666] w-7 h-7 flex items-center justify-center hover:text-red-500 hover:bg-gray-100 border-l border-[#eee] transition"
                    onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(item.securityId);
                    }}
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Symbol Info */}
            <div className="flex flex-col gap-0.5 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
                <span className={`text-[13px] font-medium leading-none ${item.isIndex ? 'text-[#333] font-bold' : (item.change < 0 ? 'text-[#d43725]' : 'text-[#333]')}`}>
                    {item.symbol}
                </span>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#9b9b9b] uppercase font-bold tracking-wider">{item.exchange}</span>
                    {!item.isIndex && <span className="w-1 h-1 rounded-full bg-[#ccc]"></span>}
                </div>
            </div>

            {/* Price Info */}
            <div className={`flex gap-3 items-center group-hover:opacity-20 transition-opacity duration-200 pointer-events-none`}>
                <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-[11px] font-medium ${item.change >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                        {item.change.toFixed(2)}
                    </span>
                    <span className={`text-[10px] opacity-80 ${item.change >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                        {item.changePercent.toFixed(2)}%
                    </span>
                </div>

                <span className={`text-[13px] font-semibold tracking-wide w-20 text-right ${item.change >= 0 ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                    {item.ltp.toFixed(2)}
                </span>

                <div className="w-2 flex justify-center">
                    {isPositive ? <TrendingUp size={12} className="text-[#26a69a]" strokeWidth={2.5} /> : <TrendingDown size={12} className="text-[#d43725]" strokeWidth={2.5} />}
                </div>
            </div>
        </div>
    );
}
