'use client';

import { useState, useEffect } from 'react';
import { X, AlertTriangle, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingStore, Position } from '@/lib/store';

interface SLOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: Position | null;
}

export default function SLOrderModal({ isOpen, onClose, position }: SLOrderModalProps) {
    const { placeOrder, account } = useTradingStore();

    const [slType, setSlType] = useState<'SL' | 'SL-M'>('SL');
    const [triggerPrice, setTriggerPrice] = useState(0);
    const [limitPrice, setLimitPrice] = useState(0);
    const [isPlacing, setIsPlacing] = useState(false);
    const [error, setError] = useState('');

    // Initialize prices when modal opens
    useEffect(() => {
        if (isOpen && position) {
            // For long positions: SL should be below current price
            // For short positions: SL should be above current price
            const isLong = position.quantity > 0;
            const currentPrice = position.ltp;

            // Set trigger price 2% away from current price
            const suggestedTrigger = isLong
                ? currentPrice * 0.98  // 2% below for long
                : currentPrice * 1.02; // 2% above for short

            setTriggerPrice(Number(suggestedTrigger.toFixed(2)));
            setLimitPrice(Number(suggestedTrigger.toFixed(2)));
            setError('');
        }
    }, [isOpen, position]);

    if (!isOpen || !position) return null;

    const isLong = position.quantity > 0;
    const quantity = Math.abs(position.quantity);
    const avgPrice = isLong ? position.avgBuyPrice : position.avgSellPrice;

    // Validate SL prices
    const validatePrices = () => {
        if (triggerPrice <= 0) {
            return 'Trigger price must be greater than 0';
        }

        if (slType === 'SL' && limitPrice <= 0) {
            return 'Limit price must be greater than 0';
        }

        // For long positions: trigger should be below current price
        // For short positions: trigger should be above current price
        if (isLong && triggerPrice >= position.ltp) {
            return 'For long positions, trigger price must be below current price';
        }

        if (!isLong && triggerPrice <= position.ltp) {
            return 'For short positions, trigger price must be above current price';
        }

        // For SL orders: limit price should be near trigger price
        if (slType === 'SL') {
            if (isLong && limitPrice > triggerPrice) {
                return 'For long positions, limit price should be at or below trigger price';
            }
            if (!isLong && limitPrice < triggerPrice) {
                return 'For short positions, limit price should be at or above trigger price';
            }
        }

        return null;
    };

    const handlePlaceSL = async () => {
        const validationError = validatePrices();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsPlacing(true);
        setError('');

        try {
            // Place SL order (opposite side of position)
            const slOrder = {
                securityId: position.securityId,
                symbol: position.symbol,
                exchange: position.exchange as any,
                segment: position.segment,
                side: (isLong ? 'SELL' : 'BUY') as any,
                orderType: slType as any,
                productType: position.productType as any,
                quantity,
                price: slType === 'SL' ? limitPrice : triggerPrice,
                triggerPrice
            };

            placeOrder(slOrder);

            // Close modal on success
            setTimeout(() => {
                setIsPlacing(false);
                onClose();
            }, 500);
        } catch (err) {
            setError('Failed to place SL order. Please try again.');
            setIsPlacing(false);
        }
    };

    const potentialLoss = isLong
        ? (avgPrice - triggerPrice) * quantity
        : (triggerPrice - avgPrice) * quantity;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-lg shadow-2xl w-[480px] max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                            <TrendingDown className="text-red-600" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Place Stop Loss</h2>
                            <p className="text-xs text-gray-500">{position.symbol}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {/* Position Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <div className="text-gray-500 text-xs mb-1">Position</div>
                                <div className={`font-semibold ${isLong ? 'text-blue-600' : 'text-red-600'}`}>
                                    {isLong ? 'LONG' : 'SHORT'} {quantity}
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-500 text-xs mb-1">Avg Price</div>
                                <div className="font-semibold text-gray-800">₹{(isLong ? position.avgBuyPrice : position.avgSellPrice).toFixed(2)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500 text-xs mb-1">Current LTP</div>
                                <div className="font-semibold text-gray-800">₹{position.ltp.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    {/* SL Type Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">Stop Loss Type</label>
                        <div className="flex gap-4">
                            <label className="flex-1 cursor-pointer">
                                <div className={`p-4 border-2 rounded-lg transition-all ${slType === 'SL' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${slType === 'SL' ? 'border-red-500' : 'border-gray-300'}`}>
                                            {slType === 'SL' && <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>}
                                        </div>
                                        <input type="radio" className="hidden" checked={slType === 'SL'} onChange={() => setSlType('SL')} />
                                        <span className="font-semibold text-sm">SL (Limit)</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Limit order placed when trigger hits</p>
                                </div>
                            </label>

                            <label className="flex-1 cursor-pointer">
                                <div className={`p-4 border-2 rounded-lg transition-all ${slType === 'SL-M' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${slType === 'SL-M' ? 'border-red-500' : 'border-gray-300'}`}>
                                            {slType === 'SL-M' && <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>}
                                        </div>
                                        <input type="radio" className="hidden" checked={slType === 'SL-M'} onChange={() => setSlType('SL-M')} />
                                        <span className="font-semibold text-sm">SL-M (Market)</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Market order placed when trigger hits</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Price Inputs */}
                    <div className="space-y-4 mb-6">
                        {/* Trigger Price */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Trigger Price <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                                <input
                                    type="number"
                                    step="0.05"
                                    value={triggerPrice}
                                    onChange={(e) => setTriggerPrice(Number(e.target.value))}
                                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="0.00"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {isLong ? 'Order triggers when price falls to this level' : 'Order triggers when price rises to this level'}
                            </p>
                        </div>

                        {/* Limit Price (only for SL) */}
                        {slType === 'SL' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Limit Price <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={limitPrice}
                                        onChange={(e) => setLimitPrice(Number(e.target.value))}
                                        className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Maximum price you're willing to {isLong ? 'sell' : 'buy'} at
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Potential Loss Warning */}
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-red-800 mb-1">Potential Loss</div>
                                <div className="text-lg font-bold text-red-600">₹{potentialLoss.toFixed(2)}</div>
                                <p className="text-xs text-red-700 mt-1">
                                    This is the approximate loss if SL is triggered at the trigger price
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePlaceSL}
                            disabled={isPlacing}
                            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPlacing ? 'Placing...' : `Place ${slType} Order`}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
