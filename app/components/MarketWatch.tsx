'use client';

import React, { useState, useEffect } from 'react';
import { Search, MoreHorizontal, TrendingUp, TrendingDown, RefreshCcw, Trash2 } from 'lucide-react';
import { Reorder } from 'framer-motion';
import Link from 'next/link';
import OrderModal from './OrderModal';
import { useTradingStore, useMarketFeed, WatchlistItem } from '@/lib/store';

export default function MarketWatch() {
    const {
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        reorderWatchlist,
        isConnected,
        feedStatus
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
        <div className="flex flex-col h-full bg-white w-full relative">
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
            {(feedStatus === 'CONNECTING' || feedStatus === 'DISCONNECTED') && isConnected && (
                <div className={`border-b px-3 py-1.5 text-xs flex items-center gap-2 ${feedStatus === 'CONNECTING' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                    'bg-red-50 border-red-200 text-red-800'
                    }`}>
                    <div className={`w-2 h-2 rounded-full ${feedStatus === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                    {feedStatus === 'CONNECTING' ? 'Connecting to live feed...' : 'Feed Disconnected'}
                </div>
            )}
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
        <div className="group relative flex justify-between items-center px-4 py-3.5 border-b border-[#f3f3f3] hover:bg-[#fbfbfb] cursor-grab active:cursor-grabbing transition-colors bg-white">

            {/* Symbol Info */}
            <div className="flex flex-col gap-0.5">
                <span className={`text-[13px] font-medium leading-none ${item.isIndex ? 'text-[#333] font-bold' : (item.change < 0 ? 'text-[#d43725]' : 'text-[#333]')}`}>
                    {item.symbol}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-[#9b9b9b]">
                    <span className="uppercase font-bold tracking-wider">{item.exchange}</span>
                    {!item.isIndex && <span className="w-1 h-1 rounded-full bg-[#ccc]"></span>}
                </div>
            </div>

            {/* Price Info */}
            <div className="flex gap-3 items-center">
                <div className="flex flex-col items-end gap-0.5 w-[72px]"> {/* Fixed width for stability */}
                    <span className={`text-[11px] font-medium tabular-nums ${isPositive ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                        {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}
                    </span>
                    <span className={`text-[10px] opacity-80 tabular-nums ${isPositive ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                        {item.changePercent.toFixed(2)}%
                    </span>
                </div>

                <span className={`text-[13px] font-semibold tracking-wide w-20 text-right tabular-nums ${isPositive ? 'text-[#26a69a]' : 'text-[#d43725]'}`}>
                    {item.ltp.toFixed(2)}
                </span>

                <div className="w-4 flex justify-center">
                    {isPositive ? <TrendingUp size={12} className="text-[#26a69a]" strokeWidth={2.5} /> : <TrendingDown size={12} className="text-[#d43725]" strokeWidth={2.5} />}
                </div>
            </div>

            {/* Hover Actions Overlay - Absolute positioned over the whole row but only visible on hover */}
            <div className="absolute inset-0 bg-[#fbfbfb] bg-opacity-95 flex items-center justify-end px-4 gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 pointer-events-none group-hover:pointer-events-auto">
                <div className="flex gap-1 items-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal('Buy', item); }}
                        className="bg-[#4184f3] text-white px-3 py-1.5 rounded text-[11px] font-bold hover:bg-blue-600 transition shadow-sm"
                    >
                        B
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal('Sell', item); }}
                        className="bg-[#ff5722] text-white px-3 py-1.5 rounded text-[11px] font-bold hover:bg-red-600 transition shadow-sm"
                    >
                        S
                    </button>
                    {/* <button className="text-[#666] p-1.5 hover:bg-gray-200 rounded transition border border-transparent hover:border-gray-300 ml-1">
                        <MoreHorizontal size={16} />
                    </button> */}
                    <Link
                        href={`/apps/option-chain?symbol=${item.symbol.split(' ')[0]}`}
                        className="text-[#666] p-1.5 hover:bg-gray-200 rounded transition border border-transparent hover:border-gray-300 ml-1 flex items-center justify-center font-bold text-[10px]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        OC
                    </Link>
                    <button
                        className="text-[#666] p-1.5 hover:text-red-500 hover:bg-red-50 rounded transition border border-transparent hover:border-red-100 ml-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(item.securityId);
                        }}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

        </div>
    );
}
