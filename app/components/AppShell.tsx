'use client';

import { useState } from 'react';
import Navbar from './Navbar';
import MarketWatch from './MarketWatch';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    const links = [
        { name: 'Dashboard', href: '/' },
        { name: 'Orders', href: '/orders' },
        { name: 'Positions', href: '/positions' },
        { name: 'Bids', href: '/bids' },
        { name: 'Funds', href: '/funds' },
        { name: 'Console', href: '/console' }
    ];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-[#f4f6f8] text-[#444]">
            <Navbar onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)} isSidebarOpen={isSidebarOpen} />

            <div className="flex h-[calc(100vh-60px)] w-full max-w-[1600px] mx-auto bg-white shadow-[0_0_15px_rgba(0,0,0,0.02)] border-x border-[#e0e0e0] relative">

                {/* Mobile Overlay */}
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/20 z-30 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar: Market Watch + Mobile Nav */}
                <div className={`
                    fixed md:relative
                    z-40
                    w-[85%] sm:w-[380px] md:w-[380px]
                    h-full
                    bg-white
                    border-r border-[#e0e0e0]
                    transition-transform duration-300 ease-in-out
                    flex flex-col
                    ${isSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}
                `}>
                    {/* Mobile Navigation Links */}
                    <div className="md:hidden border-b border-gray-100 bg-gray-50/50 p-4 shrink-0">
                        <div className="flex flex-col gap-1">
                            {links.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname === item.href
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                        }`}
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative h-full flex flex-col w-full">
                        <MarketWatch />

                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="md:hidden absolute top-2 right-2 p-2 text-gray-500 bg-white rounded-full shadow-md border border-gray-100 z-50 hover:bg-gray-50"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <main className="flex-1 h-full overflow-hidden bg-[#fbfbfb] relative w-full">
                    {children}
                </main>
            </div>
        </div>
    );
}
