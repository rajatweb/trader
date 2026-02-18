'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, ChevronDown, RotateCcw, Edit2, Layers } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { useTradingStore, ProductType } from '@/lib/store';

interface OrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'Buy' | 'Sell';
    symbol: string;
    price: number;
    securityId?: string;
    exchange?: string;
    segment?: string;
    // Optional pre-fill for SL orders from positions
    prefilledOrderType?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
    prefilledQuantity?: number;
    prefilledTriggerPrice?: number;
    // For modifying existing orders
    existingOrderId?: string;
}

export default function OrderModal({
    isOpen,
    onClose,
    type,
    symbol,
    price,
    securityId,
    exchange,
    segment,
    prefilledOrderType,
    prefilledQuantity,
    prefilledTriggerPrice,
    existingOrderId
}: OrderModalProps) {
    const { placeOrder, calculateMargin, account, watchlist, cancelOrder, getInstrumentDetails } = useTradingStore();

    // State
    const [side, setSide] = useState(type);
    const [product, setProduct] = useState<ProductType>('MIS');
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'SL-M'>('MARKET');
    const [qty, setQty] = useState(1);
    const [limitPrice, setLimitPrice] = useState(price);
    const [triggerPrice, setTriggerPrice] = useState(0);
    const [isPlacing, setIsPlacing] = useState(false);
    const [error, setError] = useState('');
    const [mounted, setMounted] = useState(false);
    const dragControls = useDragControls();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Find instrument details from watchlist
    const instrument = watchlist.find(w => w.symbol === symbol);
    const finalSecurityId = securityId || instrument?.securityId || '';
    const finalExchange = exchange || instrument?.exchange || 'NSE';
    const finalSegment = segment || instrument?.segment || 'NSE_EQ';

    // Use live price if available, otherwise fallback to passed price
    const livePrice = instrument?.ltp || price;

    // Get instrument details including lot size
    const instrumentInfo = getInstrumentDetails(symbol, finalSegment);
    const lotSize = instrumentInfo.lotSize;

    // Detect segment type for validation
    const isEquity = finalSegment.includes('_EQ') || finalSegment === 'NSE_EQ' || finalSegment === 'BSE_EQ';
    const isOptions = finalSegment.includes('_FNO') || finalSegment.includes('NFO') || finalSegment.includes('BFO');

    useEffect(() => {
        if (isOpen) {
            setSide(type); // Reset to prop when opened
            setLimitPrice(Number(price.toFixed(2)));
            setError('');
            if (prefilledOrderType) setOrderType(prefilledOrderType);
            else setOrderType('MARKET');

            if (prefilledQuantity) setQty(prefilledQuantity);
            else setQty(1);

            if (prefilledTriggerPrice) setTriggerPrice(Number(prefilledTriggerPrice.toFixed(2)));
            else setTriggerPrice(0);
        }
    }, [isOpen, price, type, prefilledOrderType, prefilledQuantity, prefilledTriggerPrice]);

    // Use side instead of type for logic
    const isBuy = side === 'Buy';


    // ... existing logic ...

    // Get available products based on SIDE
    const getAvailableProducts = (): ProductType[] => {
        if (isEquity) {
            if (side === 'Sell') { // Changed from type
                return ['MIS'];
            } else {
                return ['CNC', 'MIS'];
            }
        } else if (isOptions) {
            return ['MIS', 'NRML'];
        } else {
            return ['MIS', 'NRML'];
        }
    };

    const availableProducts = getAvailableProducts();

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center font-sans pointer-events-none">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/40 pointer-events-auto transition-opacity" onClick={onClose} />

            {/* Draggable Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                drag
                dragControls={dragControls}
                dragMomentum={false}
                dragListener={false}
                className="bg-white w-[95%] sm:w-[480px] rounded-xl shadow-2xl overflow-hidden font-sans relative z-10 pointer-events-auto cursor-default text-slate-800 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >

                {/* Header with Toggle */}
                <div
                    className={`px-6 py-5 flex justify-between items-center ${isBuy ? 'bg-blue-600' : 'bg-red-500'} text-white transition-colors duration-300 cursor-grab active:cursor-grabbing`}
                    onPointerDown={(e) => {
                        dragControls.start(e);
                    }}
                >
                    <div className="flex flex-col">
                        <h2 className="text-lg font-bold tracking-tight">{symbol}</h2>
                        <div className="text-xs opacity-90 flex items-center gap-2 mt-1">
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide">{finalSegment.split('_')[1] || 'EQ'}</span>
                            <span className="font-mono text-sm">₹{livePrice.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Buy/Sell Toggle */}
                    <div className="bg-black/20 p-1 rounded-lg flex items-center gap-1 backdrop-blur-sm">
                        <button
                            onClick={() => setSide('Buy')}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${side === 'Buy' ? 'bg-white text-blue-600 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                        >
                            Buy
                        </button>
                        <button
                            onClick={() => setSide('Sell')}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${side === 'Sell' ? 'bg-white text-red-500 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                        >
                            Sell
                        </button>
                    </div>

                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors ml-2"><X size={20} /></button>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto">

                    {/* Top Row: Product & Tabs */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {availableProducts.map((prod) => (
                                <button
                                    key={prod}
                                    onClick={() => setProduct(prod as any)}
                                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${product === prod ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {prod === 'CNC' ? 'Delivery' : prod === 'MIS' ? 'Intraday' : 'Normal'}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2 text-[11px] font-medium text-blue-600 cursor-pointer hover:underline items-center">
                            <Layers size={14} />
                            <span>Market Depth</span>
                        </div>
                    </div>

                    {/* Main Inputs Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-6">

                        {/* Quantity */}
                        <div className="col-span-1">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Quantity ({instrumentInfo.isEquity ? 'Qty' : 'Lots'})</label>
                            <div className="relative group">
                                <input
                                    type="number"
                                    min="1"
                                    value={qty}
                                    onChange={(e) => setQty(Number(e.target.value))}
                                    className="w-full bg-gray-50 border border-gray-200 text-slate-800 text-lg font-semibold rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all hover:border-gray-300"
                                />
                                {!instrumentInfo.isEquity && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                                        {qty * lotSize} Qty
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Price */}
                        <div className="col-span-1">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Price</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    disabled={orderType === 'MARKET' || orderType === 'SL-M'}
                                    value={orderType === 'MARKET' || orderType === 'SL-M' ? 0 : limitPrice}
                                    onChange={(e) => setLimitPrice(Number(e.target.value))}
                                    placeholder={orderType === 'MARKET' ? "Market Price" : "0.00"}
                                    className={`w-full border text-lg font-semibold rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all 
                                        ${orderType === 'MARKET' || orderType === 'SL-M'
                                            ? 'bg-gray-100 border-transparent text-gray-400 cursor-not-allowed placeholder-gray-400'
                                            : 'bg-gray-50 border-gray-200 text-slate-800 hover:border-gray-300'}`}
                                />
                                {(orderType === 'MARKET' || orderType === 'SL-M') && (
                                    <div className="absolute inset-0 flex items-center px-3 text-gray-400 text-sm font-medium pointer-events-none">
                                        Market
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Trigger Price (Conditional) */}
                        {(orderType === 'SL' || orderType === 'SL-M') && (
                            <div className="col-span-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Trigger Price</label>
                                <input
                                    type="number"
                                    value={triggerPrice}
                                    onChange={(e) => setTriggerPrice(Number(e.target.value))}
                                    className="w-full bg-gray-50 border border-gray-200 text-slate-800 text-lg font-semibold rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all hover:border-gray-300"
                                />
                            </div>
                        )}
                    </div>

                    {/* Order Type Selector */}
                    <div className="mb-6">
                        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Order Type</label>
                        <div className="grid grid-cols-4 gap-2">
                            {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(ot => (
                                <button
                                    key={ot}
                                    onClick={() => setOrderType(ot as any)}
                                    className={`py-2 rounded-lg text-xs font-bold border transition-all 
                                        ${orderType === ot
                                            ? (isBuy ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700')
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    {ot}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Margin & Charges Info */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Required Margin</span>
                            <span className={`text-base font-bold ${isBuy ? 'text-blue-600' : 'text-red-500'}`}>
                                ₹{(() => {
                                    const orderData = {
                                        securityId: finalSecurityId,
                                        symbol,
                                        segment: finalSegment,
                                        side: (isBuy ? 'BUY' : 'SELL') as any,
                                        orderType: orderType as any,
                                        productType: product as any,
                                        quantity: qty,
                                        price: orderType === 'MARKET' ? livePrice : limitPrice,
                                    };
                                    // Safety check for calculation
                                    try {
                                        return calculateMargin(orderData as any).requiredMargin.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                                    } catch (e) { return '0.00'; }
                                })()}
                            </span>
                            <span className="text-[10px] text-gray-500 mt-1 font-medium">
                                + ₹{(() => {
                                    try {
                                        const charges = useTradingStore.getState().getEstimatedCharges({
                                            symbol,
                                            segment: finalSegment,
                                            productType: product,
                                            orderType: orderType,
                                            quantity: instrumentInfo.isEquity ? qty : qty * lotSize,
                                            price: orderType === 'MARKET' ? livePrice : limitPrice,
                                            side: (isBuy ? 'BUY' : 'SELL') as any,
                                            exchange: finalExchange
                                        });
                                        return charges.total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                                    } catch (e) { return '0.00'; }
                                })()} Charges
                            </span>
                        </div>

                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Available</span>
                            <span className="text-sm font-semibold text-gray-700">₹{account.availableMargin.toLocaleString('en-IN', { maximumFractionDigits: 0, compactDisplay: 'short' })}</span>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 bg-red-50 border border-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2">
                            <Info size={14} />
                            {error}
                        </div>
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                    <button
                        onClick={async () => {
                            if (!finalSecurityId) {
                                setError('Invalid instrument');
                                return;
                            }

                            setIsPlacing(true);
                            setError('');

                            try {
                                const orderData = {
                                    securityId: finalSecurityId,
                                    symbol,
                                    exchange: finalExchange as any,
                                    segment: finalSegment,
                                    side: (isBuy ? 'BUY' : 'SELL') as any,
                                    orderType: orderType as any,
                                    productType: product as any,
                                    quantity: instrumentInfo.isEquity ? qty : qty, // Pass raw quantity, store handles lot multiplication? 
                                    // Wait, implementation says: "quantity: qty". But UI says "Lots" for F&O.
                                    // Store expects "quantity" as LOTS for F&O in placeOrder?
                                    // Checked store: placeOrder -> calculateMargin uses (order.quantity * lotSize) if F&O.
                                    // So we shout pass LOTS if user input is lots.
                                    // Yes, `qty` here IS lots for options.
                                    price: orderType === 'MARKET' ? livePrice : limitPrice,
                                    triggerPrice: ['SL', 'SL-M'].includes(orderType) ? triggerPrice : undefined
                                };

                                // Validate margin
                                const marginCheck = calculateMargin(orderData);
                                if (!marginCheck.sufficient) {
                                    setError(`Insufficient margin! Need ₹${marginCheck.requiredMargin.toLocaleString()}`);
                                    setIsPlacing(false);
                                    return;
                                }

                                if (existingOrderId) cancelOrder(existingOrderId);

                                const orderId = placeOrder(orderData);
                                onClose();

                                // Reset
                                setQty(1);
                                setLimitPrice(price);
                                setTriggerPrice(0);
                                setOrderType('MARKET');
                            } catch (err: any) {
                                setError(err.message || 'Failed to place order');
                            } finally {
                                setIsPlacing(false);
                            }
                        }}
                        disabled={isPlacing}
                        className={`flex-1 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed
                            ${isBuy
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                                : 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 shadow-red-500/20'
                            }`}
                    >
                        {isPlacing ? 'Processing...' : (
                            <div className="flex items-center justify-center gap-2">
                                <span>{side} {symbol}</span>
                                {existingOrderId && <span className="text-xs bg-white/20 px-1 rounded">MODIFY</span>}
                            </div>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        className="px-6 py-3.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-white hover:text-gray-800 hover:border-gray-300 transition-all"
                    >
                        Cancel
                    </button>
                </div>

            </motion.div>
        </div>,
        document.body
    );
}
