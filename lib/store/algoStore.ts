
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AlgoSignal, TradingZone, AlgoStats, AlgoConfig } from '../algo/types';
import { TradingStrategy } from '../algo/strategy';

interface AlgoPosition {
    id: string; // FNO token ID
    symbol: string;
    type: 'LONG' | 'SHORT';
    entryPrice: number;
    quantity: number;
    currentPrice: number;
    pnl: number;
    timestamp: number;
    target?: number;       // Absolute price target (option premium)
    sl?: number;           // Absolute price stop-loss (option premium)
    targetPoints?: number; // Index-point target
    slPoints?: number;     // Index-point SL
}

interface AlgoStore {
    isRunning: boolean;
    activeStrategy: 'SL_HUNT' | 'PDLS_VIX' | 'SUPERTREND';
    liveVix: number;
    liveVix5dAvg: number;
    config: AlgoConfig;
    stats: AlgoStats;
    zones: TradingZone[];
    signals: AlgoSignal[];
    activePositions: AlgoPosition[];
    tradeHistory: any[];
    monitoredContracts: Record<string, { ce?: any, pe?: any }>;

    // Capital tracking (computed live)
    capitalUsed: number;       // Premium cost of all open positions (entryPrice × qty)
    availableCapital: number;  // initialCapital - capitalUsed + unrealised PnL

    // Actions
    setRunning: (running: boolean) => void;
    setActiveStrategy: (strategy: 'SL_HUNT' | 'PDLS_VIX' | 'SUPERTREND') => void;
    setLiveVix: (vix: number) => void;
    updateConfig: (config: Partial<AlgoConfig>) => void;
    addSignal: (signal: AlgoSignal) => void;
    addPosition: (pos: AlgoPosition) => void;
    closePosition: (symbol: string, exitPrice: number) => void;
    setZones: (zones: TradingZone[]) => void;
    resetStats: () => void;
    updatePrices: (symbol: string, price: number) => void;
    setMonitoredContracts: (symbol: string, contracts: { ce?: any, pe?: any }) => void;
}

export const useAlgoStore = create<AlgoStore>()(
    persist(
        (set, get) => ({
            isRunning: false,
            activeStrategy: 'PDLS_VIX' as 'SL_HUNT' | 'PDLS_VIX' | 'SUPERTREND',
            liveVix: 14,
            liveVix5dAvg: 14,
            capitalUsed: 0,
            availableCapital: 100000,
            config: {
                initialCapital: 100000,
                maxRiskPerTrade: 1,
                symbols: ['BANKNIFTY'],
                startTime: '09:15',  // PDLS warmup starts at 9:15
                endTime: '14:45',    // PDLS ends at 14:45
                lotSize: {
                    'BANKNIFTY': 30   // 2 lots × 15 = 30 qty
                }
            },
            stats: {
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                totalPnl: 0,
                totalBrokerage: 0,
                netPnl: 0
            },
            zones: [],
            signals: [],
            activePositions: [],
            tradeHistory: [],
            monitoredContracts: {},

            setRunning: (running) => set({ isRunning: running }),

            setActiveStrategy: (strategy) => set({ activeStrategy: strategy }),

            setLiveVix: (vix) => set((state) => {
                // Rolling 5-day average: simple EMA-like blend
                const prev5d = state.liveVix5dAvg;
                const newAvg = prev5d === 14 ? vix : prev5d * 0.8 + vix * 0.2;
                return { liveVix: vix, liveVix5dAvg: parseFloat(newAvg.toFixed(2)) };
            }),

            updateConfig: (newConfig) => set((state) => ({
                config: { ...state.config, ...newConfig }
            })),

            addSignal: (signal) => set((state) => ({
                signals: [signal, ...state.signals].slice(0, 50)
            })),

            addPosition: (pos) => set((state) => {
                // Capital cost of new trade (premium × qty)
                const tradeCost = pos.entryPrice * pos.quantity;
                const newUsed = state.capitalUsed + tradeCost;
                const newAvail = state.config.initialCapital - newUsed;

                // Block entry if not enough capital
                if (newAvail < 0) {
                    console.warn(`[AlgoStore] Insufficient capital – need ₹${tradeCost.toFixed(0)}, only ₹${(state.config.initialCapital - state.capitalUsed).toFixed(0)} free`);
                    return state;
                }

                return {
                    activePositions: [...state.activePositions, pos],
                    capitalUsed: newUsed,
                    availableCapital: newAvail,
                    stats: {
                        ...state.stats,
                        totalTrades: state.stats.totalTrades + 1
                    }
                };
            }),

            closePosition: (symbol, exitPrice) => set((state) => {
                const pos = state.activePositions.find(p => p.symbol === symbol);
                if (!pos) return state;

                const pnl = pos.type === 'LONG'
                    ? (exitPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - exitPrice) * pos.quantity;

                // Simple brokerage calc: 40 rs per round trip + taxes (rough estimate)
                const brokerage = 60 + (Math.abs(pnl) * 0.001);

                const tradeCost = pos.entryPrice * pos.quantity;

                const updatedHistory = [{
                    ...pos,
                    exitPrice,
                    pnl,
                    brokerage,
                    netPnl: pnl - brokerage,
                    closedAt: Date.now()
                }, ...state.tradeHistory];

                const newCapitalUsed = Math.max(0, state.capitalUsed - tradeCost);
                const newAvailCapital = state.config.initialCapital - newCapitalUsed + (state.stats.netPnl + (pnl - brokerage));

                return {
                    activePositions: state.activePositions.filter(p => p.symbol !== symbol),
                    tradeHistory: updatedHistory,
                    capitalUsed: newCapitalUsed,
                    availableCapital: Math.max(0, newAvailCapital),
                    stats: {
                        ...state.stats,
                        totalPnl: state.stats.totalPnl + pnl,
                        totalBrokerage: state.stats.totalBrokerage + brokerage,
                        netPnl: state.stats.netPnl + (pnl - brokerage),
                        winningTrades: pnl > 0 ? state.stats.winningTrades + 1 : state.stats.winningTrades,
                        losingTrades: pnl <= 0 ? state.stats.losingTrades + 1 : state.stats.losingTrades
                    }
                };
            }),

            setZones: (zones) => set({ zones }),

            resetStats: () => set((state) => ({
                stats: {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    totalPnl: 0,
                    totalBrokerage: 0,
                    netPnl: 0
                },
                capitalUsed: 0,
                availableCapital: state.config.initialCapital,
                tradeHistory: [],
                signals: [],
                activePositions: [],
                monitoredContracts: {}
            })),

            updatePrices: (identifier: string, price: number) => set((state) => ({
                activePositions: state.activePositions.map(p => {
                    // Match by EXACT ID or EXACT Symbol to prevent Spot overlapping Options
                    if (String(p.id) === String(identifier) || p.symbol === identifier) {
                        const newPnl = p.type === 'LONG' ? (price - p.entryPrice) * p.quantity : (p.entryPrice - price) * p.quantity;
                        return { ...p, currentPrice: price, pnl: newPnl };
                    }
                    return p;
                })
            })),

            setMonitoredContracts: (symbol: string, contracts: { ce?: any, pe?: any }) => set((state) => ({
                monitoredContracts: {
                    ...state.monitoredContracts,
                    [symbol]: contracts
                }
            }))
        }),
        {
            name: 'algo-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
