'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTradingStore } from '@/lib/store';

interface BrokerConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function BrokerConnectModal({ isOpen, onClose }: BrokerConnectModalProps) {
    const { connectBroker } = useTradingStore();
    const [clientId, setClientId] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleConnect = async () => {
        if (!clientId.trim() || !accessToken.trim()) {
            setError('Please enter both Client ID and Access Token');
            return;
        }

        setIsConnecting(true);
        setError('');

        try {
            // Validate credentials with Dhan API
            const response = await fetch('/api/dhan/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, accessToken })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to connect');
            }

            // Store credentials in trading store
            connectBroker(clientId, accessToken);

            // Close modal
            onClose();

            // Reset form
            setClientId('');
            setAccessToken('');
        } catch (err: any) {
            setError(err.message || 'Connection failed. Please check your credentials.');
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                >
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Connect Broker</h2>
                    <p className="text-sm text-gray-500 mt-1">Enter your Dhan credentials to start trading</p>
                </div>

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Client ID
                        </label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="e.g., 1001234567"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isConnecting}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Access Token
                        </label>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="Enter your access token"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isConnecting}
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-xs">
                        <p className="font-semibold mb-1">How to get your credentials:</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Login to Dhan web platform</li>
                            <li>Go to Settings → API</li>
                            <li>Generate Access Token</li>
                            <li>Copy Client ID and Token here</li>
                        </ol>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                        disabled={isConnecting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            'Connect'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
