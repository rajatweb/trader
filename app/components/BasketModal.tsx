'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, Info, CheckCircle2, Layers } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useTradingStore, WatchlistItem, ProductType, OrderType, BasketItem } from '@/lib/store';

interface BasketModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function BasketModal({ isOpen, onClose }: BasketModalProps) {
    // Destructure addToWatchlist as well
    const { watchlist, addToWatchlist, getInstrumentDetails, calculateMargin, placeOrder, account, basket, addToBasket: storeAddToBasket, removeFromBasket, updateBasketItem, clearBasket } = useTradingStore();

    // Remove local basket state
    // const [basketItems, setBasketItems] = useState<BasketItem[]>([]); 
    const basketItems = basket; // Map global basket to local variable for easier refactor

    const [searchQuery, setSearchQuery] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionStatus, setExecutionStatus] = useState<'IDLE' | 'SUCCESS'>('IDLE');
    const [mounted, setMounted] = useState(false);

    const [searchResults, setSearchResults] = useState<any[]>([]); // Store API results
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // API Search Effect
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.length >= 2) {
                setIsSearching(true);
                try {
                    const res = await fetch(`/api/dhan/instruments/search?q=${encodeURIComponent(searchQuery)}`);
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
    }, [searchQuery]);

    // SYNC BASKET PRICES WITH WATCHLIST (REMOVED - HANDLED IN STORE)
    // useEffect(() => { ... }, [watchlist]); 


    const addToBasket = (item: any) => {
        const symbol = item.symbol || item.tradingSymbol || item.name;
        const segment = item.segment;
        const exchange = item.exchange;
        const securityId = String(item.securityId);

        // Check watchlist
        let watchlistItem = watchlist.find(w => w.securityId === securityId);

        // Auto-add to watchlist if not present to start tracking price
        if (!watchlistItem) {
            const newWatchlistItem: WatchlistItem = {
                securityId,
                symbol,
                exchange,
                segment,
                ltp: item.ltp || 0, // Initial might be 0
                prevClose: item.prevClose || 0,
                change: 0,
                changePercent: 0
            };
            addToWatchlist(newWatchlistItem);
            watchlistItem = newWatchlistItem;
        }

        const ltp = watchlistItem.ltp;

        const newItem: BasketItem = {
            id: Math.random().toString(36).substr(2, 9),
            securityId,
            symbol,
            exchange,
            segment,
            side: 'SELL',
            productType: 'MIS',
            orderType: 'MARKET',
            quantity: 1,
            price: ltp,
            ltp: ltp
        };
        storeAddToBasket(newItem);
        setSearchQuery('');
        setSearchResults([]);
    };

    // Removed local helpers, using store actions directly in render or wrapper
    const handleUpdateItem = (id: string, updates: Partial<BasketItem>) => {
        updateBasketItem(id, updates);
    };



    // Calculate Margin for the ENTIRE BASKET
    const totalRequiredMargin = basketItems.reduce((acc, item) => {
        // Use LTP if price is 0 (Market Order)
        const priceForMargin = item.price > 0 ? item.price : (item.ltp > 0 ? item.ltp : 0);

        const margin = calculateMargin({
            securityId: item.securityId,
            symbol: item.symbol,
            segment: item.segment,
            side: item.side,
            orderType: item.orderType,
            productType: item.productType,
            quantity: item.quantity,
            price: priceForMargin,
            exchange: item.exchange
        });

        return acc + margin.requiredMargin;
    }, 0);

    const checkHedgeBenefit = () => {
        const symbols = new Set(basketItems.map(i => i.symbol.split(' ')[0]));
        let hasHedge = false;
        symbols.forEach(sym => {
            const buys = basketItems.filter(i => i.symbol.includes(sym) && i.side === 'BUY');
            const sells = basketItems.filter(i => i.symbol.includes(sym) && i.side === 'SELL');
            if (buys.length > 0 && sells.length > 0) hasHedge = true;
        });
        return hasHedge;
    };

    const executeBasket = async () => {
        // Validation: Check for 0 price/ltp for MARKET orders
        // If LIMIT order, price must be > 0. If MARKET, LTP must be > 0 (or we assume risk it executes at market)
        // But for paper trading execution logic, we need a price.

        setIsExecuting(true);

        for (const item of basketItems) {
            // Determine execution price
            const executionPrice = item.orderType === 'MARKET' ? item.ltp : item.price;

            // If executionPrice is 0 (no LTP available yet), we might face issues.
            // But placeOrder handles paper trading by looking up watchlist too.
            // Since we added to watchlist, hopefully it has LTP now.

            placeOrder({
                securityId: item.securityId,
                symbol: item.symbol,
                exchange: item.exchange,
                segment: item.segment,
                side: item.side,
                orderType: item.orderType,
                productType: item.productType,
                quantity: item.quantity,
                price: executionPrice
            });
            await new Promise(r => setTimeout(r, 100));
        }

        setExecutionStatus('SUCCESS');
        setTimeout(() => {
            setIsExecuting(false);
            setExecutionStatus('IDLE');
            clearBasket();
            onClose();
        }, 1500);
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center font-sans">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/40 pointer-events-auto transition-opacity" onClick={onClose} />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-[90%] md:w-[800px] h-[80vh] rounded-xl shadow-2xl flex flex-col pointer-events-auto z-10 overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Basket Order</h2>
                        <p className="text-xs text-gray-500">Build and execute multi-leg strategies</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20} /></button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                    {/* Left: Search & Watchlist */}
                    <div className="w-full md:w-1/3 border-r border-gray-100 flex flex-col bg-[#fbfbfb]">
                        <div className="p-4 border-b border-gray-100">
                            <input
                                type="text"
                                placeholder="Search to add..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {isSearching ? (
                                <div className="p-4 text-center text-xs text-gray-500">Searching...</div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map(item => (
                                    <div key={item.securityId} className="px-4 py-3 hover:bg-gray-100 border-b border-gray-100 cursor-pointer flex justify-between items-center group"
                                        onClick={() => addToBasket(item)}
                                    >
                                        <div>
                                            <div className="text-sm font-semibold text-gray-700">{item.symbol || item.tradingSymbol || item.name}</div>
                                            <div className="text-xs text-gray-500">{item.exchange} {item.segment}</div>
                                        </div>
                                        <button className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"><Plus size={18} /></button>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-xs text-gray-400">
                                    {searchQuery ? 'No results found' : 'Search to find symbols'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Basket Items */}
                    <div className="w-full md:w-2/3 flex flex-col bg-white">
                        <div className="flex-1 overflow-y-auto p-4">
                            {basketItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                                    <Layers size={48} className="mb-2" />
                                    <p className="text-sm font-medium">Your basket is empty</p>
                                    <p className="text-xs">Add items from the left to verify margin</p>
                                </div>
                            ) : (
                                <Reorder.Group axis="y" values={basketItems} onReorder={() => { }} className="space-y-3">
                                    {basketItems.map((item) => (
                                        <Reorder.Item key={item.id} value={item} className="cursor-grab active:cursor-grabbing">
                                            <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-3 relative hover:border-blue-300 transition-colors bg-white shadow-sm select-none">
                                                {/* Row 1: Title & Remove */}
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm text-gray-800">{item.symbol}</span>
                                                        <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">{item.exchange}</span>
                                                    </div>
                                                    <button onClick={() => removeFromBasket(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                                </div>

                                                {/* Row 2: Controls */}
                                                <div className="grid grid-cols-12 gap-2 items-center">
                                                    {/* Side */}
                                                    <div className="col-span-3">
                                                        <div className="flex bg-gray-100 rounded p-0.5">
                                                            <button
                                                                className={`flex-1 text-[10px] font-bold py-1 rounded ${item.side === 'BUY' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                onClick={() => handleUpdateItem(item.id, { side: 'BUY' })}
                                                            >BUY</button>
                                                            <button
                                                                className={`flex-1 text-[10px] font-bold py-1 rounded ${item.side === 'SELL' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                onClick={() => handleUpdateItem(item.id, { side: 'SELL' })}
                                                            >SELL</button>
                                                        </div>
                                                    </div>

                                                    {/* Product */}
                                                    <div className="col-span-2">
                                                        <select
                                                            className="w-full text-xs border border-gray-200 rounded px-1 py-1.5 bg-gray-50 font-medium"
                                                            value={item.productType}
                                                            onChange={(e) => handleUpdateItem(item.id, { productType: e.target.value as ProductType })}
                                                        >
                                                            <option value="MIS">Intraday</option>
                                                            <option value="NRML">Normal</option>
                                                        </select>
                                                    </div>

                                                    {/* Qty */}
                                                    <div className="col-span-2">
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                value={item.quantity}
                                                                min="1"
                                                                onChange={(e) => handleUpdateItem(item.id, { quantity: Number(e.target.value) })}
                                                                className="w-full text-xs text-center border border-gray-200 rounded px-1 py-1.5 font-bold focus:border-blue-500 outline-none"
                                                            />
                                                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-1 text-[9px] text-gray-400">Lots</span>
                                                        </div>
                                                    </div>

                                                    {/* Type */}
                                                    <div className="col-span-2">
                                                        <select
                                                            className="w-full text-xs border border-gray-200 rounded px-1 py-1.5 bg-gray-50 font-medium"
                                                            value={item.orderType}
                                                            onChange={(e) => handleUpdateItem(item.id, { orderType: e.target.value as OrderType })}
                                                        >
                                                            <option value="MARKET">MKT</option>
                                                            <option value="LIMIT">LMT</option>
                                                        </select>
                                                    </div>

                                                    {/* Price */}
                                                    <div className="col-span-3">
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                value={item.orderType === 'MARKET' ? 0 : item.price}
                                                                disabled={item.orderType === 'MARKET'}
                                                                onChange={(e) => handleUpdateItem(item.id, { price: Number(e.target.value) })}
                                                                className={`w-full text-xs text-right border border-gray-200 rounded px-2 py-1.5 font-mono ${item.orderType === 'MARKET' ? 'bg-gray-100 text-gray-400' : 'bg-white font-bold'}`}
                                                                placeholder={item.orderType === 'MARKET' ? "MKT" : "0.00"}
                                                            />
                                                            {item.orderType === 'MARKET' && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-400 pointer-events-none">AT MKT</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>
                            )}
                        </div>

                        {/* Footer Summary */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wide">Required Margin</span>
                                    <div className="flex items-end gap-2">
                                        <span className="text-xl font-bold text-gray-800">₹{totalRequiredMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                        {checkHedgeBenefit() && <span className="text-[10px] text-green-600 font-bold bg-green-100 px-1.5 py-0.5 rounded mb-1">HEDGE BENEFIT ACTIVE</span>}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wide">Available</span>
                                    <span className="text-sm font-semibold text-gray-700">₹{account.availableMargin.toLocaleString('en-IN', { maximumFractionDigits: 0, compactDisplay: 'short' })}</span>
                                </div>
                            </div>

                            <button
                                onClick={executeBasket}
                                disabled={basketItems.length === 0 || isExecuting || totalRequiredMargin > account.availableMargin}
                                className={`w-full py-3 rounded-lg font-bold text-sm tracking-wide shadow transition-all flex items-center justify-center gap-2
                                    ${executionStatus === 'SUCCESS' ? 'bg-green-600 text-white' : ''}
                                    ${basketItems.length === 0 || totalRequiredMargin > account.availableMargin
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                        : 'bg-black text-white hover:bg-gray-800 hover:shadow-lg'}`}
                            >
                                {isExecuting ? (
                                    <span className="animate-pulse">Placing Orders...</span>
                                ) : executionStatus === 'SUCCESS' ? (
                                    <>
                                        <CheckCircle2 size={18} />
                                        Executed Successfully
                                    </>
                                ) : (
                                    `Execute Basket (${basketItems.length})`
                                )}
                            </button>
                            {totalRequiredMargin > account.availableMargin && (
                                <div className="text-[10px] text-red-500 font-bold text-center mt-2 flex items-center justify-center gap-1">
                                    <Info size={12} />
                                    Insufficient Margin
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div >
        </div >,
        document.body
    );
}
