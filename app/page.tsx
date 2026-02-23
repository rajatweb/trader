'use client';

import { useState } from 'react';
import Dashboard from "./components/Dashboard";
import MarketWatch from "./components/MarketWatch";
import PositionsPage from "./positions/page";
import OrdersPage from "./orders/page";
import BrokerConnectModal from "./components/BrokerConnectModal";
import { List, Briefcase, Clock, User, Link as LinkIcon, LogOut } from 'lucide-react';
import { useTradingStore } from '@/lib/store';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'positions' | 'orders' | 'profile'>('watchlist');
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const { isConnected, disconnectBroker } = useTradingStore();

  return (
    <div className="h-full w-full bg-white md:bg-transparent flex flex-col">
      {/* Desktop View */}
      <div className="hidden md:block h-full">
        <Dashboard />
      </div>

      {/* Mobile View */}
      <div className="md:hidden flex flex-col h-full bg-white relative">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'watchlist' && <MarketWatch />}
          {activeTab === 'positions' && <PositionsPage />}
          {activeTab === 'orders' && <OrdersPage />}
          {activeTab === 'profile' && (
            <div className="p-6 flex flex-col items-center justify-center h-full bg-gray-50">
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <User size={40} />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-gray-800">Hi, Rajat</h2>
              <p className="text-sm text-gray-500 mb-8">
                {isConnected ? 'Connected to Broker' : 'Not Connected'}
              </p>

              {!isConnected ? (
                <button
                  onClick={() => setIsBrokerModalOpen(true)}
                  className="bg-blue-600 outline-none text-white px-8 py-3 rounded-lg font-medium shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:bg-blue-700 transition w-full max-w-xs justify-center"
                >
                  <LinkIcon size={18} />
                  Connect Broker
                </button>
              ) : (
                <button
                  onClick={() => disconnectBroker()}
                  className="bg-red-50 text-red-600 border border-red-200 px-8 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-red-100 transition w-full max-w-xs justify-center"
                >
                  <LogOut size={18} />
                  Disconnect Broker
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Navigation Tabs */}
        <div className="flex border-t border-gray-200 bg-white pb-safe pt-1 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-50">
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`flex-1 py-2 flex flex-col items-center gap-1 ${activeTab === 'watchlist' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <List size={22} className={activeTab === 'watchlist' ? 'animate-bounce-short' : ''} />
            <span className="text-[10px] font-medium">Watchlist</span>
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-2 flex flex-col items-center gap-1 ${activeTab === 'positions' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Briefcase size={22} />
            <span className="text-[10px] font-medium">Positions</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2 flex flex-col items-center gap-1 ${activeTab === 'orders' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Clock size={22} />
            <span className="text-[10px] font-medium">Orders</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-2 flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <User size={22} />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </div>
      </div>

      <BrokerConnectModal isOpen={isBrokerModalOpen} onClose={() => setIsBrokerModalOpen(false)} />
    </div>
  );
}
