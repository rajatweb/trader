'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Lock, CheckCircle, Info, ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTradingStore } from '@/lib/store';

// Mock list of brokers
const brokers = [
    {
        id: 'dhan',
        name: 'Dhan',
        description: 'Recommended for Options. Free API.',
        icon: <Zap size={20} className="text-[#888]" />,
        recommended: true,
        setupTime: '2 mins',
        active: true
    },
    {
        id: 'zerodha',
        name: 'Zerodha',
        description: 'Industry standard. Paid API (₹2000/mo).',
        icon: <div className="w-5 h-5 bg-orange-500 rounded-sm"></div>,
        active: false
    },
    {
        id: 'fyers',
        name: 'Fyers',
        description: 'Free API. Good for algo trading.',
        icon: <div className="w-5 h-5 bg-blue-500 rounded-sm"></div>,
        active: false
    },
];

export default function ProfilePage() {
    const { isConnected, brokerCredentials, connectBroker, disconnectBroker } = useTradingStore();
    const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
    const [credentials, setCredentials] = useState({ clientId: '', accessToken: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConnect = async () => {
        if (!credentials.clientId || !credentials.accessToken) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/dhan/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });

            const data = await response.json();

            if (data.success) {
                // Store in trading store (persists to localStorage automatically)
                connectBroker(credentials.clientId, credentials.accessToken);
                setSelectedBroker(null);
                setCredentials({ clientId: '', accessToken: '' });
            } else {
                setError(data.error || 'Connection failed');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = () => {
        disconnectBroker();
    };

    return (
        <div className="flex flex-col h-full bg-[#fbfbfb]">
            <div className="max-w-4xl mx-auto w-full pt-12 pb-20 px-6">

                {/* Header */}
                <div className="mb-10">
                    <h1 className="text-2xl font-light text-[#444] mb-2">Connect Broker</h1>
                    <p className="text-sm text-gray-500">Link your broker account to execute trades directly from the platform.</p>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Left: Active Connections */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Connected Card */}
                        {isConnected && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white border border-green-200 rounded-lg p-6 shadow-sm relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                                            <Zap size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-gray-800">Dhan Connected</h3>
                                            <p className="text-xs text-gray-500">Client ID: {brokerCredentials?.clientId}</p>
                                            <p className="text-xs text-green-600 mt-1">Ready to trade. API Token valid.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium bg-green-50 px-3 py-1 rounded-full">
                                            <CheckCircle size={14} /> Active
                                        </div>
                                        <button
                                            onClick={handleDisconnect}
                                            className="px-4 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Broker Selection List */}
                        {!isConnected && (
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                    <h2 className="text-sm font-semibold text-gray-700">Available Brokers</h2>
                                    <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded">Options Trading Friendly</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {brokers.map((broker) => (
                                        <div
                                            key={broker.id}
                                            onClick={() => broker.active && setSelectedBroker(broker.id)}
                                            className={`p-5 flex items-center justify-between group transition-colors ${broker.active ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60 cursor-not-allowed'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-gray-200">
                                                    {broker.icon}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-medium text-gray-800 flex items-center gap-2">
                                                        {broker.name}
                                                        {broker.recommended && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold tracking-wide">RECOMMENDED</span>}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mt-0.5">{broker.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {broker.active ? (
                                                    <button className="px-4 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors">Connect</button>
                                                ) : (
                                                    <span className="text-xs text-gray-400 font-medium">Coming Soon</span>
                                                )}
                                                <ChevronRight size={16} className="text-gray-300" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Right: Info / Help */}
                    <div className="space-y-6">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-5">
                            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                <Info size={16} /> Why Connect?
                            </h3>
                            <ul className="text-xs text-blue-700 space-y-2 list-disc list-inside opacity-80 leading-relaxed">
                                <li>Execute orders directly from charts.</li>
                                <li>Real-time portfolio sync.</li>
                                <li>Seamless option chain analytics.</li>
                                <li>One-click position management.</li>
                            </ul>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Security First</h3>
                            <div className="flex gap-3 text-xs text-gray-500 items-start">
                                <Lock size={32} className="text-gray-300 shrink-0" />
                                <p>Your API keys are encrypted locally and never stored on our servers. We use industry-standard encryption protocols.</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Connection Modal */}
            <AnimatePresence>
                {selectedBroker === 'dhan' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedBroker(null)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-lg shadow-xl w-full max-w-md relative z-10 overflow-hidden"
                        >
                            <div className="bg-[#4184f3] p-6 text-white text-center relative">
                                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                    <Zap size={32} />
                                </div>
                                <h2 className="text-xl font-semibold mb-1">Connect Dhan</h2>
                                <p className="text-blue-100 text-xs">Enter your API credentials to continue</p>
                            </div>

                            <div className="p-8 space-y-5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Client ID</label>
                                    <input
                                        type="text"
                                        value={credentials.clientId}
                                        onChange={(e) => setCredentials({ ...credentials, clientId: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:border-[#4184f3] focus:ring-1 focus:ring-[#4184f3] outline-none transition-all placeholder:text-gray-300"
                                        placeholder="e.g. 1100054321"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Access Token</label>
                                    <input
                                        type="password"
                                        value={credentials.accessToken}
                                        onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:border-[#4184f3] focus:ring-1 focus:ring-[#4184f3] outline-none transition-all placeholder:text-gray-300"
                                        placeholder="Paste your access token here"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1.5 text-right hover:text-[#4184f3] cursor-pointer transition-colors">Where do I find this?</p>

                                    {error && (
                                        <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 mt-2">{error}</p>
                                    )}
                                </div>

                                <button
                                    onClick={handleConnect}
                                    disabled={!credentials.clientId || !credentials.accessToken || isLoading}
                                    className="w-full bg-[#4184f3] hover:bg-blue-600 text-white font-semibold py-2.5 rounded shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none mt-4 flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Secure Connect'}
                                </button>

                                <button
                                    onClick={() => setSelectedBroker(null)}
                                    className="w-full text-xs text-gray-400 hover:text-gray-600 font-medium py-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
