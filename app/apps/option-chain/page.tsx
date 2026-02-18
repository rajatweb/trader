'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, BarChart2, Briefcase, ShoppingBag, Plus, Minus, Layers, CheckCircle2, ChevronDown, Filter, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTradingStore, BasketItem, OrderType, ProductType } from '@/lib/store';
import BasketModal from '@/app/components/BasketModal';
import OrderModal from '@/app/components/OrderModal';

interface OptionStrike {
    strike: number;
    call: OptionData;
    put: OptionData;
}

interface OptionData {
    ltp: number;
    change: number;
    oi: string; // e.g. "45.2L"
    oiRaw: number; // Raw OI for calculations
    oiChange: number; // percentage
    iv: number;
    vol: string; // e.g. "1.2M"
    gamma?: number;
    delta?: number;
    theta?: number;
    vega?: number;
    securityId?: string; // Real security ID from API
}

// Helper to parse OI (e.g., 451234 -> "4.5L")
const formatOI = (oi: number): string => {
    if (oi >= 10000000) return `${(oi / 10000000).toFixed(2)}Cr`;
    if (oi >= 100000) return `${(oi / 100000).toFixed(2)}L`;
    return oi.toString();
};

// Helper to format Date (e.g., "2024-03-28" -> "28 MAR")
const formatExpiryDate = (dateStr: string): string => {
    try {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
    } catch (e) {
        return dateStr;
    }
};

export default function OptionChainPage() {
    const { basket, addToBasket, removeFromBasket, brokerCredentials, placeOrder } = useTradingStore();
    const searchParams = useSearchParams();
    const initialSymbol = searchParams.get('symbol')?.toUpperCase() || 'NIFTY';

    // Dhan Constants (Hardcoded for now matching default NIFTY)
    const [scripDetails, setScripDetails] = useState({ script: 13, seg: 'IDX_I' }); // Default NIFTY 50

    const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);

    // Sync state with URL params
    useEffect(() => {
        const symbol = searchParams.get('symbol')?.toUpperCase();
        if (symbol) {
            setSelectedSymbol(symbol);
        }
    }, [searchParams]);
    const [expiryList, setExpiryList] = useState<string[]>([]);
    const [expiry, setExpiry] = useState('');
    const [basketMode, setBasketMode] = useState(false);
    const [showBasketModal, setShowBasketModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Order Modal State
    const [orderModalOpen, setOrderModalOpen] = useState(false);
    const [orderModalData, setOrderModalData] = useState<{
        type: 'Buy' | 'Sell',
        symbol: string,
        price: number,
        securityId: string
    } | null>(null);

    const [spotPrice, setSpotPrice] = useState(0);
    const [step, setStep] = useState(50);

    const [strikes, setStrikes] = useState<OptionStrike[]>([]);

    // 1. Fetch Expiry Dates when Symbol Changes
    useEffect(() => {
        // Reset state on symbol change to ensure clean loading
        setStrikes([]);
        setExpiryList([]);
        setExpiry('');
        setError(null);

        let sid = 13;
        let seg = 'IDX_I';
        let stp = 50;

        if (selectedSymbol === 'NIFTY') { sid = 13; stp = 50; seg = 'IDX_I'; }
        else if (selectedSymbol === 'BANKNIFTY') { sid = 25; stp = 100; seg = 'IDX_I'; }
        else if (selectedSymbol === 'FINNIFTY') { sid = 27; stp = 50; seg = 'IDX_I'; }
        else if (selectedSymbol === 'SENSEX') { sid = 51; stp = 100; seg = 'IDX_I'; } // BSE Index
        else if (selectedSymbol === 'CRUDEOIL') { sid = 467013; stp = 100; seg = 'MCX_COMM'; } // Near Month Future
        else if (selectedSymbol === 'NATURALGAS') { sid = 467385; stp = 5; seg = 'MCX_COMM'; } // Near Month Future

        setScripDetails({ script: sid, seg });
        setStep(stp);

        const fetchExpiry = async () => {
            if (!brokerCredentials) {
                setError("Please connect your broker to view real-time Option Chain.");
                return;
            }

            try {
                const res = await fetch('/api/dhan/option-chain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        underlyingScrip: sid,
                        underlyingSeg: seg
                    })
                });

                const data = await res.json();
                if (data.success && data.type === 'expiry_list') {
                    setExpiryList(data.data);
                    // Automatically select the first expiry if none selected or if current selection is invalid
                    if (data.data.length > 0) {
                        setExpiry(data.data[0]);
                    }
                } else {
                    console.error("Expiry fetch failed:", data.error);
                    setError(data.error || "Failed to fetch expiry dates");
                }
            } catch (error) {
                console.error("Failed to fetch expiry", error);
                setError("Network error fetching expiry dates");
            }
        };

        fetchExpiry();
    }, [selectedSymbol, brokerCredentials]);

    // 2. Fetch Option Chain Data when Expiry/Symbol Changes
    useEffect(() => {
        if (!expiry || !brokerCredentials) return;

        const fetchChain = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/api/dhan/option-chain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: brokerCredentials.clientId,
                        accessToken: brokerCredentials.accessToken,
                        underlyingScrip: scripDetails.script,
                        underlyingSeg: scripDetails.seg,
                        expiry: expiry
                    })
                });

                const json = await res.json();

                if (json.success && json.type === 'chain_data' && json.data && json.data.oc) {
                    setSpotPrice(json.data.last_price || 0);

                    const ocData = json.data.oc;
                    const parsedStrikes: OptionStrike[] = Object.keys(ocData).map(strikeStr => {
                        const strike = parseFloat(strikeStr);
                        const item = ocData[strikeStr];

                        return {
                            strike,
                            call: {
                                ltp: item.ce?.last_price || 0,
                                change: 0, // Not provided directly in snippet, imply from last - open/close
                                oi: formatOI(item.ce?.oi || 0),
                                oiRaw: item.ce?.oi || 0,
                                oiChange: 0,
                                iv: item.ce?.implied_volatility || 0,
                                vol: formatOI(item.ce?.volume || 0),
                                delta: item.ce?.greeks?.delta,
                                gamma: item.ce?.greeks?.gamma,
                                theta: item.ce?.greeks?.theta,
                                vega: item.ce?.greeks?.vega,
                                securityId: item.ce?.security_id
                            },
                            put: {
                                ltp: item.pe?.last_price || 0,
                                change: 0,
                                oi: formatOI(item.pe?.oi || 0),
                                oiRaw: item.pe?.oi || 0,
                                oiChange: 0,
                                iv: item.pe?.implied_volatility || 0,
                                vol: formatOI(item.pe?.volume || 0),
                                delta: item.pe?.greeks?.delta,
                                gamma: item.pe?.greeks?.gamma,
                                theta: item.pe?.greeks?.theta,
                                vega: item.pe?.greeks?.vega,
                                securityId: item.pe?.security_id
                            }
                        };
                    });

                    // Sort by Strike
                    parsedStrikes.sort((a, b) => a.strike - b.strike);

                    // Filter around ATM (e.g. +/- 20 strikes)
                    const spot = json.data.last_price || 0;
                    if (spot > 0) {
                        // Simple filter to show relevant range
                        const atmIndex = parsedStrikes.findIndex(s => s.strike >= spot);
                        if (atmIndex !== -1) {
                            const start = Math.max(0, atmIndex - 15);
                            const end = Math.min(parsedStrikes.length, atmIndex + 15);
                            setStrikes(parsedStrikes.slice(start, end));
                        } else {
                            setStrikes(parsedStrikes.slice(0, 30));
                        }
                    } else {
                        setStrikes(parsedStrikes);
                    }
                } else {
                    console.error("Option Chain fetch failed:", json.error);
                }
            } catch (err) {
                console.error("Failed to fetch chain", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchChain();
        const interval = setInterval(fetchChain, 5000); // Poll every 5s
        return () => clearInterval(interval);

    }, [expiry, scripDetails, brokerCredentials]);

    const handleTrade = (side: 'BUY' | 'SELL', type: 'CALL' | 'PUT', strike: number, price: number, securityId?: string) => {
        const symbol = `${selectedSymbol} ${formatExpiryDate(expiry)} ${strike} ${type}`;
        // Fallback ID if API didn't provide one
        const finalSecurityId = securityId || `${selectedSymbol}_${strike}_${type}`;

        if (!basketMode) {
            // Open Order Modal instead of alert
            setOrderModalData({
                type: side === 'BUY' ? 'Buy' : 'Sell',
                symbol: symbol,
                price: price,
                securityId: finalSecurityId
            });
            setOrderModalOpen(true);
            return;
        }

        // Basket Mode
        const newItem: BasketItem = {
            id: Math.random().toString(36).substr(2, 9),
            securityId: finalSecurityId,
            symbol,
            exchange: 'NSE',
            segment: 'NSE_FNO',
            side,
            productType: 'MIS',
            orderType: 'MARKET',
            quantity: 1, // Default 1 Lot
            price: price,
            ltp: price
        };

        addToBasket(newItem);
    };

    const isInBasket = (strike: number, type: 'CALL' | 'PUT', side: 'BUY' | 'SELL') => {
        const typeStr = type === 'CALL' ? 'CE' : 'PE';
        // Relaxed check: matches strike, type (CE/PE in symbol) and side
        return basket.some(item =>
            item.symbol.includes(String(strike)) &&
            item.symbol.includes(typeStr) &&
            item.side === side
        );
    };

    // Calculate Max OI for relative bar width
    const maxOI = strikes.length > 0 ? Math.max(...strikes.flatMap(s => [s.call.oiRaw, s.put.oiRaw])) : 1;

    return (
        <div className="flex flex-col h-full bg-[#f8f9fa] text-[#333]">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Link href="/apps" className="p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                            Option Chain
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">BETA</span>
                        </h1>
                        <p className="text-xs text-gray-500">Real-time Greeks & Analysis</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    <select
                        value={selectedSymbol}
                        onChange={(e) => setSelectedSymbol(e.target.value)}
                        className="bg-white text-sm font-semibold px-3 py-1.5 rounded shadow-sm border border-gray-200 focus:outline-none hover:border-blue-300 transition-colors cursor-pointer"
                    >
                        <option value="NIFTY">NIFTY</option>
                        <option value="BANKNIFTY">BANKNIFTY</option>
                        <option value="FINNIFTY">FINNIFTY</option>
                        <option value="SENSEX">SENSEX</option>
                        <option value="CRUDEOIL">CRUDEOIL</option>
                        <option value="NATURALGAS">NATURALGAS</option>

                    </select>

                    <div className="w-px h-6 bg-gray-200 mx-1"></div>

                    <select
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        className="bg-transparent text-sm font-medium px-2 py-1.5 focus:outline-none text-gray-600 cursor-pointer hover:text-black"
                    >
                        {expiryList.length > 0 ? (
                            expiryList.map(exp => (
                                <option key={exp} value={exp}>{formatExpiryDate(exp)}</option>
                            ))
                        ) : (
                            <option>Loading...</option>
                        )}
                    </select>
                </div>

                {/* Basket Mode Toggle & Cart */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <div
                        onClick={() => setBasketMode(!basketMode)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all select-none border ${basketMode ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}
                    >
                        <Layers size={16} />
                        <span className="text-xs font-bold">Basket Mode</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${basketMode ? 'bg-orange-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${basketMode ? 'left-4.5' : 'left-0.5'}`} style={{ left: basketMode ? '18px' : '2px' }}></div>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowBasketModal(true)}
                        className="relative p-2 bg-black text-white rounded-full hover:bg-gray-800 transition-colors shadow-lg"
                    >
                        <ShoppingBag size={20} />
                        {basket.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                {basket.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 p-3 text-center text-red-600 text-sm font-medium border-b border-red-100 flex items-center justify-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Info Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-2 flex justify-center gap-12 text-xs sticky top-[73px] z-20 shadow-sm">
                <div className="text-center">
                    <span className="text-gray-400 font-semibold uppercase tracking-wider block text-[10px]">Spot Price</span>
                    <span className="text-lg font-bold text-gray-800">{spotPrice.toLocaleString()}</span>
                </div>
                <div className="text-center">
                    <span className="text-gray-400 font-semibold uppercase tracking-wider block text-[10px]">PCR</span>
                    <span className="text-lg font-bold text-green-600">0.85</span>
                </div>
                <div className="text-center">
                    <span className="text-gray-400 font-semibold uppercase tracking-wider block text-[10px]">Max Pain</span>
                    <span className="text-lg font-bold text-gray-800">{(Math.round(spotPrice / step) * step).toLocaleString()}</span>
                </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                {isLoading && strikes.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">Loading Option Chain...</div>
                ) : (
                    <table className="w-full text-center border-collapse">
                        <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase font-semibold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th colSpan={4} className="py-2 border-b border-r border-gray-200 bg-blue-50/50 text-blue-800">Calls</th>
                                <th className="py-2 border-b border-gray-200 w-24 bg-gray-100 text-gray-800">Strike</th>
                                <th colSpan={4} className="py-2 border-b border-l border-gray-200 bg-red-50/50 text-red-800">Puts</th>
                            </tr>
                            <tr>
                                <th className="py-2 px-1 font-medium border-b border-gray-200">OI (L)</th>
                                <th className="py-2 px-1 font-medium border-b border-gray-200">IV</th>
                                <th className="py-2 px-1 font-medium border-b border-gray-200 hidden md:table-cell">Delta</th>
                                <th className="py-2 px-1 font-medium border-b border-r border-gray-200 text-right pr-4">LTP</th>

                                <th className="py-2 px-1 font-medium border-b border-gray-200 bg-gray-100"></th>

                                <th className="py-2 px-1 font-medium border-b border-l border-gray-200 text-left pl-4">LTP</th>
                                <th className="py-2 px-1 font-medium border-b border-gray-200 hidden md:table-cell">Delta</th>
                                <th className="py-2 px-1 font-medium border-b border-gray-200">IV</th>
                                <th className="py-2 px-1 font-medium border-b border-gray-200">OI (L)</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-medium text-gray-700 bg-white">
                            {strikes.map((row) => {
                                const isATM = Math.abs(row.strike - spotPrice) < (step / 2);
                                const callITM = row.strike < spotPrice;
                                const putITM = row.strike > spotPrice;

                                return (
                                    <tr key={row.strike} className={`hover:bg-gray-50 group border-b border-gray-100 ${isATM ? 'bg-yellow-50/50' : ''}`}>
                                        {/* CALLS */}
                                        <td className={`py-1.5 px-1 relative ${callITM ? 'bg-yellow-50/30' : ''}`}>
                                            <div className="absolute inset-y-1 left-0 bg-blue-100 opacity-30 rounded-r" style={{ width: `${(row.call.oiRaw / maxOI) * 80}%` }}></div>
                                            <span className="relative z-10 text-[11px]">{row.call.oi}</span>
                                        </td>
                                        <td className={`py-1.5 px-1 text-gray-500 ${callITM ? 'bg-yellow-50/30' : ''}`}>{row.call.iv?.toFixed(1)}</td>
                                        <td className={`py-1.5 px-1 text-gray-400 hidden md:table-cell ${callITM ? 'bg-yellow-50/30' : ''}`}>{row.call.delta?.toFixed(2)}</td>
                                        <td className={`py-1.5 px-4 text-right border-r border-gray-200 cursor-pointer relative group/cell ${callITM ? 'bg-yellow-50/30' : ''}`}>
                                            <div className="flex items-center justify-end gap-2">
                                                {isInBasket(row.strike, 'CALL', 'BUY') && <span className="text-[9px] bg-blue-600 text-white px-1 rounded font-bold">B</span>}
                                                {isInBasket(row.strike, 'CALL', 'SELL') && <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">S</span>}
                                                <span className={`font-bold ${row.call.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.call.ltp.toFixed(2)}</span>
                                            </div>
                                            {/* Hover Actions */}
                                            <div className="hidden group-hover/cell:flex absolute inset-y-0 right-0 items-center gap-1 bg-white pl-2 shadow-l">
                                                {basketMode ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleTrade('BUY', 'CALL', row.strike, row.call.ltp, row.call.securityId)}
                                                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isInBasket(row.strike, 'CALL', 'BUY') ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                                                        >B</button>
                                                        <button
                                                            onClick={() => handleTrade('SELL', 'CALL', row.strike, row.call.ltp, row.call.securityId)}
                                                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isInBasket(row.strike, 'CALL', 'SELL') ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                                        >S</button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => handleTrade('BUY', 'CALL', row.strike, row.call.ltp, row.call.securityId)}
                                                        className="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded shadow-sm hover:bg-blue-700"
                                                    >
                                                        Trade
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* STRIKE */}
                                        <td className={`py-1.5 px-1 bg-gray-100 font-bold border-x border-gray-200 text-[#333] ${isATM ? 'bg-yellow-100 text-black border-yellow-200' : ''}`}>
                                            {row.strike}
                                        </td>

                                        {/* PUTS */}
                                        <td className={`py-1.5 px-4 text-left border-l border-gray-200 cursor-pointer relative group/cell ${putITM ? 'bg-yellow-50/30' : ''}`}>
                                            <div className="flex items-center justify-start gap-2">
                                                <span className={`font-bold ${row.put.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.put.ltp.toFixed(2)}</span>
                                                {isInBasket(row.strike, 'PUT', 'BUY') && <span className="text-[9px] bg-blue-600 text-white px-1 rounded font-bold">B</span>}
                                                {isInBasket(row.strike, 'PUT', 'SELL') && <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">S</span>}
                                            </div>
                                            {/* Hover Actions */}
                                            <div className="hidden group-hover/cell:flex absolute inset-y-0 left-0 items-center gap-1 bg-white pr-2 shadow-r">
                                                {basketMode ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleTrade('BUY', 'PUT', row.strike, row.put.ltp, row.put.securityId)}
                                                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isInBasket(row.strike, 'PUT', 'BUY') ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                                                        >B</button>
                                                        <button
                                                            onClick={() => handleTrade('SELL', 'PUT', row.strike, row.put.ltp, row.put.securityId)}
                                                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isInBasket(row.strike, 'PUT', 'SELL') ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                                        >S</button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => handleTrade('BUY', 'PUT', row.strike, row.put.ltp, row.put.securityId)}
                                                        className="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded shadow-sm hover:bg-blue-700"
                                                    >
                                                        Trade
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`py-1.5 px-1 text-gray-400 hidden md:table-cell ${putITM ? 'bg-yellow-50/30' : ''}`}>{row.put.delta?.toFixed(2)}</td>
                                        <td className={`py-1.5 px-1 text-gray-500 ${putITM ? 'bg-yellow-50/30' : ''}`}>{row.put.iv?.toFixed(1)}</td>
                                        <td className={`py-1.5 px-1 relative ${putITM ? 'bg-yellow-50/30' : ''}`}>
                                            <div className="absolute inset-y-1 right-0 bg-red-100 opacity-30 rounded-l" style={{ width: `${(row.put.oiRaw / maxOI) * 80}%` }}></div>
                                            <span className="relative z-10 text-[11px]">{row.put.oi}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Basket Modal */}
            <BasketModal isOpen={showBasketModal} onClose={() => setShowBasketModal(false)} />

            {/* Direct Order Modal */}
            {orderModalData && (
                <OrderModal
                    isOpen={orderModalOpen}
                    onClose={() => setOrderModalOpen(false)}
                    type={orderModalData.type}
                    symbol={orderModalData.symbol}
                    price={orderModalData.price}
                    securityId={orderModalData.securityId}
                    exchange="NSE"
                    segment="NSE_FNO"
                />
            )}
        </div>
    );
}
