'use client';

import { useState } from 'react';
import { Gavel, Clock, History } from 'lucide-react';

export default function BidsPage() {
    const [activeTab, setActiveTab] = useState('Auctions');

    const tabs = ['Auctions', 'IPO', 'Govt. Securities'];

    return (
        <div className="flex flex-col h-full bg-white text-[#444]">
            {/* Sub-navigation */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
                <div className="flex gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`text-sm font-medium transition-colors ${activeTab === tab ? 'text-[#ff5722] border-b-2 border-[#ff5722] pb-1' : 'text-gray-500 hover:text-[#ff5722]'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 flex flex-col items-center justify-center text-center">
                {activeTab === 'Auctions' && (
                    <div className="max-w-md">
                        <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Gavel size={40} className="text-[#ff5722]" />
                        </div>
                        <h2 className="text-xl text-[#333] mb-2 font-medium">No active auctions</h2>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            There are currently no active auctions available for bidding. Please check back later during market hours.
                        </p>
                        <button className="mt-8 px-6 py-2 border border-[#387ed1] text-[#387ed1] rounded text-sm hover:bg-blue-50 transition">
                            View history
                        </button>
                    </div>
                )}

                {activeTab === 'IPO' && (
                    <div className="max-w-md">
                        <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <History size={40} className="text-[#387ed1]" />
                        </div>
                        <h2 className="text-xl text-[#333] mb-2 font-medium">No open IPOs</h2>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            There are no ongoing initial public offerings at the moment. Upcoming IPOs will be listed here.
                        </p>
                        <button className="mt-8 px-6 py-2 border border-[#387ed1] text-[#387ed1] rounded text-sm hover:bg-blue-50 transition">
                            Upcoming IPOs
                        </button>
                    </div>
                )}

                {activeTab === 'Govt. Securities' && (
                    <div className="max-w-md">
                        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Clock size={40} className="text-[#26a69a]" />
                        </div>
                        <h2 className="text-xl text-[#333] mb-2 font-medium">Market Closed</h2>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            Orders for Government Securities (G-Secs) can only be placed between 9:00 AM and 5:00 PM on trading days.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
