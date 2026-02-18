'use client';

import { Bell, ShoppingBag, User, Plug, CheckCircle2, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTradingStore } from '@/lib/store';

interface NavbarProps {
    onToggleSidebar?: () => void;
    isSidebarOpen?: boolean;
}

export default function Navbar({ onToggleSidebar }: NavbarProps) {
    const pathname = usePathname();
    const { isConnected, brokerCredentials, disconnectBroker, performDailySettlement } = useTradingStore();
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        // Run daily settlement check on app start
        performDailySettlement();
    }, []);

    return (
        <nav className="h-[60px] bg-white border-b border-[#e0e0e0] flex items-center justify-between px-6 shadow-sm sticky top-0 z-50">

            {/* Index Summary */}
            {/* Mobile Menu Button */}
            <button
                className="md:hidden mr-4 p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={onToggleSidebar}
            >
                <Menu size={20} />
            </button>

            {/* Index Summary - Hidden on small mobile, visible on larger */}
            <div className="hidden sm:flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#444]">NIFTY 50</span>
                    <span className="text-emerald-500 font-medium">25682.75</span>
                    <span className="text-[#9b9b9b] text-xs">211.65 (0.83%)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#444]">NIFTY BANK</span>
                    <span className="text-emerald-500 font-medium">60945.10</span>
                    <span className="text-[#9b9b9b] text-xs">762.45 (1.27%)</span>
                </div>
            </div>

            {/* Logo */}


            {/* Navigation Links - Hidden on Mobile, Visible on Desktop */}
            <div className="hidden md:flex items-center gap-8 text-sm text-[#666]">
                {[
                    { name: 'Dashboard', href: '/' },
                    { name: 'Orders', href: '/orders' },
                    { name: 'Positions', href: '/positions' },
                    { name: 'Bids', href: '/bids' },
                    { name: 'Funds', href: '/funds' },
                    { name: 'Console', href: '/console' }
                ].map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`transition-colors hover:text-[#ff5722] ${pathname === item.href ? 'text-[#ff5722] font-semibold' : ''}`}
                    >
                        {item.name}
                    </Link>
                ))}

                <div className="flex items-center gap-4 border-l border-[#eee] pl-4 ml-2">
                    <Link href="/" className="hover:text-[#ff5722]"><ShoppingBag size={18} /></Link>
                    <button className="hover:text-[#ff5722] relative">
                        <Bell size={18} />
                        <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
                    </button>

                    {/* Broker Connection Status */}
                    {isConnected ? (
                        <div className="relative">
                            <button
                                onClick={() => setShowDropdown(!showDropdown)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                            >
                                <CheckCircle2 size={16} className="text-green-600" />
                                <span className="text-xs font-semibold text-green-700">
                                    {brokerCredentials?.clientId?.slice(0, 6)}...
                                </span>
                            </button>

                            {showDropdown && (
                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-xs text-gray-500">Client ID</p>
                                        <p className="text-sm font-semibold text-gray-800">{brokerCredentials?.clientId}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            disconnectBroker();
                                            setShowDropdown(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/profile"
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plug size={16} />
                            <span className="text-xs font-semibold">Connect Broker</span>
                        </Link>
                    )}

                    <Link href="/profile" className="flex items-center gap-2 hover:bg-gray-100 p-1 rounded cursor-pointer transition-colors">
                        <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold border border-purple-200">
                            <User size={14} />
                        </div>
                    </Link>
                </div>
            </div>
        </nav>
    );
}
