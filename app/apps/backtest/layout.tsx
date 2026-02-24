import React from 'react';

export const metadata = {
    title: 'Backtest Simulator | NextTrade Pro',
};

// We create a custom layout for the backtest simulator to completely overwrite the AppShell
// so that it gets its own full-screen, focused layout independent of the main app.
export default function BacktestLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="w-full h-screen bg-[#0f1118] text-gray-300 font-sans overflow-hidden">
            {children}
        </div>
    );
}
