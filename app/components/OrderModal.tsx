'use client';

import { useState, useEffect } from 'react';
import { X, Info, ChevronDown, RotateCcw, Edit2, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
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

    const [tab, setTab] = useState('Regular');
    const [product, setProduct] = useState('INTRADAY');
    const [orderType, setOrderType] = useState('MARKET');
    const [qty, setQty] = useState(1);
    const [limitPrice, setLimitPrice] = useState(price);
    const [triggerPrice, setTriggerPrice] = useState(0);
    const [isPlacing, setIsPlacing] = useState(false);
    const [error, setError] = useState('');

    // Update limit price when modal opens or price changes
    useEffect(() => {
        if (isOpen) {
            setLimitPrice(price);
            setError('');

            // Pre-fill SL order details if provided
            if (prefilledOrderType) {
                setOrderType(prefilledOrderType);
            } else {
                setOrderType('MARKET');
            }

            if (prefilledQuantity) {
                setQty(prefilledQuantity);
            } else {
                setQty(1);
            }

            if (prefilledTriggerPrice) {
                setTriggerPrice(prefilledTriggerPrice);
            } else {
                setTriggerPrice(0);
            }
        }
    }, [isOpen, price, prefilledOrderType, prefilledQuantity, prefilledTriggerPrice]);

    // Find instrument details from watchlist
    const instrument = watchlist.find(w => w.symbol === symbol);
    const finalSecurityId = securityId || instrument?.securityId || '';
    const finalExchange = exchange || instrument?.exchange || 'NSE';
    const finalSegment = segment || instrument?.segment || 'NSE_EQ';

    // Get instrument details including lot size
    const instrumentInfo = getInstrumentDetails(symbol, finalSegment);
    const lotSize = instrumentInfo.lotSize;
    const totalQuantity = instrumentInfo.isEquity ? qty : qty * lotSize;

    // Detect segment type for validation
    const isEquity = finalSegment.includes('_EQ') || finalSegment === 'NSE_EQ' || finalSegment === 'BSE_EQ';
    const isOptions = finalSegment.includes('_FNO') || finalSegment.includes('NFO') || finalSegment.includes('BFO');

    // Get available product types based on segment and side
    const getAvailableProducts = (): ProductType[] => {
        if (isEquity) {
            if (type === 'Sell') {
                // Equity SELL: Only MIS (no CNC short selling)
                return ['MIS'];
            } else {
                // Equity BUY: CNC and MIS
                return ['CNC', 'MIS'];
            }
        } else if (isOptions) {
            // Options: MIS and NRML (no CNC for F&O)
            return ['MIS', 'NRML'];
        } else {
            // Futures/Commodity: MIS and NRML
            return ['MIS', 'NRML'];
        }
    };

    const availableProducts = getAvailableProducts();

    // Validate and adjust product if current selection is invalid
    useEffect(() => {
        if (!availableProducts.includes(product as any)) {
            setProduct(availableProducts[0] as any);
        }
    }, [type, finalSegment]);

    if (!isOpen) return null;

    const isBuy = type === 'Buy';

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 pointer-events-none">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-auto" onClick={onClose} />

            {/* Draggable Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                drag
                dragMomentum={false}
                className="bg-white w-[600px] rounded-lg shadow-xl overflow-hidden font-sans relative z-10 pointer-events-auto cursor-grab active:cursor-grabbing text-[#444]"
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <div className={`px-6 py-4 flex justify-between items-start ${isBuy ? 'bg-[#4184f3]' : 'bg-[#ff5722]'} text-white`}>
                    <div>
                        <h2 className="text-base font-semibold tracking-wide mb-1">{symbol}</h2>
                        <div className="text-xs opacity-90 flex items-center gap-1">
                            <span className="opacity-80">NFO</span>
                            <span className="font-medium text-sm">₹{price.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-5 bg-black/20 rounded-full relative cursor-pointer">
                            <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 right-0.5 shadow-sm"></div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-gray-200 bg-white px-2">
                    <div className="flex text-[13px] font-medium text-gray-500">
                        {['Quick', 'Regular', 'Iceberg'].map(v => (
                            <button
                                key={v}
                                onClick={() => setTab(v)}
                                className={`px-5 py-3 relative transition-colors hover:text-[#4184f3] ${tab === v ? 'text-[#4184f3]' : ''}`}
                            >
                                {v}
                                {tab === v && <div className={`absolute bottom-0 left-0 w-full h-[2px] ${isBuy ? 'bg-[#4184f3]' : 'bg-[#ff5722]'}`}></div>}
                            </button>
                        ))}
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-600">
                        <Edit2 size={12} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">

                    {/* Product Selection */}
                    <div className="flex items-center justify-between mb-8 text-[13px]">
                        <div className="flex gap-8">
                            {availableProducts.map((prod) => {
                                const productLabels: Record<string, { name: string; code: string }> = {
                                    'CNC': { name: 'Delivery', code: 'CNC' },
                                    'MIS': { name: 'Intraday', code: 'MIS' },
                                    'NRML': { name: 'Normal', code: 'NRML' }
                                };

                                const label = productLabels[prod];

                                return (
                                    <label key={prod} className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${product === prod ? (isBuy ? 'border-[#4184f3]' : 'border-[#ff5722]') : 'border-gray-300 group-hover:border-gray-400'}`}>
                                            {product === prod && <div className={`w-2.5 h-2.5 rounded-full ${isBuy ? 'bg-[#4184f3]' : 'bg-[#ff5722]'}`}></div>}
                                        </div>
                                        <input type="radio" className="hidden" checked={product === prod} onChange={() => setProduct(prod)} />
                                        <span className={product === prod ? 'text-gray-800' : 'text-gray-600'}>
                                            {label.name} <span className="text-gray-400">{label.code}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="text-[#4184f3] cursor-pointer flex items-center gap-1 hover:text-blue-700">
                            Advanced <ChevronDown size={14} />
                        </div>
                    </div>

                    {/* Inputs Row */}
                    <div className="flex gap-4 mb-2">
                        {/* Qty Input */}
                        <div className="w-[140px]">
                            <div className="relative border border-gray-300 rounded bg-white hover:border-gray-400 transition-colors">
                                <label className="absolute top-2 left-3 text-[11px] text-gray-400 font-medium">Qty.</label>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setQty(Number(e.target.value))}
                                    className="w-full h-[58px] pt-5 pl-3 pr-10 bg-transparent text-lg text-[#333] focus:outline-none focus:ring-1 focus:ring-[#4184f3] rounded"
                                />
                                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    <Layers size={16} />
                                </div>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1 pl-1">
                                {instrumentInfo.isEquity
                                    ? `${qty} ${qty === 1 ? 'share' : 'shares'}`
                                    : `${qty} ${qty === 1 ? 'lot' : 'lots'} = ${totalQuantity} qty (Lot size: ${lotSize})`
                                }
                            </div>
                        </div>

                        {/* Price Input - Show for LIMIT and SL, hide for MARKET and SL-M */}
                        {(orderType === 'LIMIT' || orderType === 'SL') && (
                            <div className="flex-1">
                                <div className="relative border border-gray-300 rounded bg-white hover:border-gray-400 transition-colors">
                                    <label className="absolute top-2 left-3 text-[11px] text-gray-400 font-medium">Price</label>
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={limitPrice}
                                        onChange={(e) => setLimitPrice(Number(e.target.value))}
                                        className="w-full h-[58px] pt-5 pl-3 bg-transparent text-lg text-[#333] focus:outline-none focus:ring-1 focus:ring-[#4184f3] rounded"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Trigger Input - Show for SL and SL-M only */}
                        {(orderType === 'SL' || orderType === 'SL-M') && (
                            <div className="flex-1">
                                <div className="relative border border-gray-300 rounded bg-white hover:border-gray-400 transition-colors">
                                    <label className="absolute top-2 left-3 text-[11px] text-gray-400 font-medium">Trigger price</label>
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={triggerPrice}
                                        onChange={(e) => setTriggerPrice(Number(e.target.value))}
                                        className="w-full h-[58px] pt-5 pl-3 bg-transparent text-lg text-[#333] focus:outline-none focus:ring-1 focus:ring-[#4184f3] rounded"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Order Type Selection */}
                    <div className="flex items-center justify-between mb-2 mt-6 text-[13px]">
                        <div className="flex gap-6">
                            {['MARKET', 'LIMIT'].map(ot => (
                                <label key={ot} className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${orderType === ot ? (isBuy ? 'border-[#4184f3]' : 'border-[#ff5722]') : 'border-gray-300 group-hover:border-gray-400'}`}>
                                        {orderType === ot && <div className={`w-2.5 h-2.5 rounded-full ${isBuy ? 'bg-[#4184f3]' : 'bg-[#ff5722]'}`}></div>}
                                    </div>
                                    <input type="radio" className="hidden" checked={orderType === ot} onChange={() => setOrderType(ot)} />
                                    <span className={orderType === ot ? 'text-gray-800' : 'text-gray-600'}>{ot === 'MARKET' ? 'Market' : 'Limit'}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex gap-6">
                            {['SL', 'SL-M'].map(ot => (
                                <label key={ot} className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${orderType === ot ? (isBuy ? 'border-[#4184f3]' : 'border-[#ff5722]') : 'border-gray-300 group-hover:border-gray-400'}`}>
                                        {orderType === ot && <div className={`w-2.5 h-2.5 rounded-full ${isBuy ? 'bg-[#4184f3]' : 'bg-[#ff5722]'}`}></div>}
                                    </div>
                                    <input type="radio" className="hidden" checked={orderType === ot} onChange={() => setOrderType(ot)} />
                                    <span className={orderType === ot ? 'text-gray-800' : 'text-gray-600'}>{ot}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
                            {error}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[#fbfbfb] border-t border-gray-200 flex items-center justify-between">
                    <div className="flex gap-8 text-[13px]">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Margin Required</span>
                            <span className={`text-base font-semibold ${isBuy ? 'text-[#4184f3]' : 'text-[#ff5722]'}`}>
                                ₹{(() => {
                                    const orderData = {
                                        securityId: finalSecurityId,
                                        symbol,
                                        exchange: finalExchange as any,
                                        segment: finalSegment,
                                        side: (isBuy ? 'BUY' : 'SELL') as any,
                                        orderType: orderType as any,
                                        productType: product as any,
                                        quantity: qty,
                                        price: orderType === 'MARKET' ? price : limitPrice,
                                        triggerPrice: ['SL', 'SL-M'].includes(orderType) ? triggerPrice : undefined
                                    };
                                    const marginCheck = calculateMargin(orderData);
                                    return marginCheck.requiredMargin.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                                })()}
                            </span>
                        </div>

                        <div className="flex flex-col group relative cursor-help">
                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider border-b border-dotted border-gray-400">Idx. Charges</span>
                            <span className="text-sm font-medium text-gray-600">
                                ₹{(() => {
                                    const charges = useTradingStore.getState().getEstimatedCharges({
                                        symbol,
                                        segment: finalSegment,
                                        productType: product,
                                        orderType: orderType,
                                        quantity: instrumentInfo.isEquity ? qty : qty * lotSize,
                                        price: orderType === 'MARKET' ? price : limitPrice,
                                        side: (isBuy ? 'BUY' : 'SELL') as any,
                                        exchange: finalExchange
                                    });
                                    return charges.total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                                })()}
                            </span>
                            {/* Tooltip for Charges Breakdown */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-800 text-white text-xs rounded p-2 hidden group-hover:block z-50 shadow-lg">
                                {(() => {
                                    const charges = useTradingStore.getState().getEstimatedCharges({
                                        symbol,
                                        segment: finalSegment,
                                        productType: product,
                                        orderType: orderType,
                                        quantity: instrumentInfo.isEquity ? qty : qty * lotSize,
                                        price: orderType === 'MARKET' ? price : limitPrice,
                                        side: (isBuy ? 'BUY' : 'SELL') as any,
                                        exchange: finalExchange
                                    });
                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between"><span>Brokerage:</span><span>₹{charges.brokerage.toFixed(2)}</span></div>
                                            <div className="flex justify-between"><span>STT:</span><span>₹{charges.stt.toFixed(2)}</span></div>
                                            <div className="flex justify-between"><span>Exch Txn:</span><span>₹{charges.exchangeTxn.toFixed(2)}</span></div>
                                            <div className="flex justify-between"><span>GST:</span><span>₹{charges.gst.toFixed(2)}</span></div>
                                            <div className="flex justify-between"><span>SEBI:</span><span>₹{charges.sebi.toFixed(2)}</span></div>
                                            <div className="flex justify-between"><span>Stamp Duty:</span><span>₹{charges.stampDuty.toFixed(2)}</span></div>
                                            <div className="border-t border-gray-600 pt-1 mt-1 flex justify-between font-bold">
                                                <span>Total:</span><span>₹{charges.total.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Available</span>
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-medium text-gray-700">₹{account.availableMargin.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                <RotateCcw size={12} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {/* Exit at Market - Only show for existing SL orders */}
                        {existingOrderId && (
                            <button
                                onClick={async () => {
                                    setIsPlacing(true);
                                    try {
                                        // Cancel the existing SL order
                                        cancelOrder(existingOrderId);

                                        // Place market order to exit immediately
                                        const marketOrderData = {
                                            securityId: finalSecurityId,
                                            symbol,
                                            exchange: finalExchange as any,
                                            segment: finalSegment,
                                            side: (isBuy ? 'BUY' : 'SELL') as any,
                                            orderType: 'MARKET' as any,
                                            productType: product as any,
                                            quantity: qty,
                                            price: price,
                                            triggerPrice: undefined
                                        };

                                        placeOrder(marketOrderData);
                                        onClose();
                                    } catch (err: any) {
                                        setError(err.message || 'Failed to exit at market');
                                    } finally {
                                        setIsPlacing(false);
                                    }
                                }}
                                disabled={isPlacing}
                                className="px-6 py-2.5 rounded text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-50"
                            >
                                Exit at Market
                            </button>
                        )}

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
                                        quantity: qty,
                                        price: orderType === 'MARKET' ? price : limitPrice,
                                        triggerPrice: ['SL', 'SL-M'].includes(orderType) ? triggerPrice : undefined
                                    };

                                    // Validate margin
                                    const marginCheck = calculateMargin(orderData);
                                    if (!marginCheck.sufficient) {
                                        setError(`Insufficient margin! Need ₹${marginCheck.requiredMargin.toLocaleString()}, have ₹${marginCheck.availableMargin.toLocaleString()}`);
                                        setIsPlacing(false);
                                        return;
                                    }

                                    // If modifying existing order, cancel it first
                                    if (existingOrderId) {
                                        cancelOrder(existingOrderId);
                                    }

                                    // Place order
                                    const orderId = placeOrder(orderData);

                                    // Close modal on success
                                    onClose();

                                    // Reset form
                                    setQty(1);
                                    setLimitPrice(price);
                                    setTriggerPrice(0);
                                    setOrderType('MARKET');
                                    setProduct('MIS');
                                } catch (err: any) {
                                    setError(err.message || 'Failed to place order');
                                } finally {
                                    setIsPlacing(false);
                                }
                            }}
                            disabled={isPlacing}
                            className={`px-8 py-2.5 rounded text-sm font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isBuy ? 'bg-[#4184f3] hover:bg-blue-600' : 'bg-[#ff5722] hover:bg-red-600'}`}
                        >
                            {isPlacing ? 'Placing...' : existingOrderId ? 'Modify Order' : type}
                        </button>
                        <button onClick={onClose} className="px-6 py-2.5 rounded border border-gray-300 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>

            </motion.div>
        </div>
    );
}
