import { MarketSnapshot } from './ml';

export interface AlgoSignal {
    type: 'BUY' | 'SELL' | 'NONE';
    price: number;
    symbol: string;
    reason: string;
    strength: number; // 0 to 1
    timestamp: number;
    target?: number; // Optional dynamically calculated target price multiplier
    sl?: number;     // Optional dynamically calculated stop loss multiplier
    targetPoints?: number; // Optional absolute points for TP (e.g., 45)
    slPoints?: number;     // Optional absolute points for SL (e.g., 30)
    features?: MarketSnapshot; // Legacy name, now Snapshot
    snapshot?: MarketSnapshot; // Current name
}

export interface TradingZone {
    price: number;
    type: 'SUPPORT' | 'RESISTANCE' | 'PIVOT';
    strength: number;
    description: string;
}

export interface TradingPlan {
    trend: 'SUPER_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'SUPER_BEARISH';
    maxTradesAllowed: number;
    maxDailyLossPoints: number;
    maxDailyProfitPoints: number;
    allowedDirections: ('BUY' | 'SELL')[];
    reasoning: string;
    generatedAt: number;
}

export interface AlgoConfig {
    initialCapital: number;
    maxRiskPerTrade: number; // Percentage
    symbols: string[];
    startTime: string; // "09:16"
    endTime: string;   // "15:00"
    lotSize: Record<string, number>;
}

export interface AlgoStats {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
    totalBrokerage: number;
    netPnl: number;
}
