
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
    target?: number;
    sl?: number;
}

interface AlgoStore {
    isRunning: boolean;
    config: AlgoConfig;
    stats: AlgoStats;
    zones: TradingZone[];
    signals: AlgoSignal[];
    activePositions: AlgoPosition[];
    tradeHistory: any[];
    monitoredContracts: Record<string, { ce?: any, pe?: any }>; // symbol -> {ce, pe}

    // Actions
    setRunning: (running: boolean) => void;
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
            config: {
                initialCapital: 100000,
                maxRiskPerTrade: 1,
                symbols: ['BANKNIFTY'],
                startTime: '09:16',
                endTime: '15:00',
                lotSize: {
                    'BANKNIFTY': 30
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

            updateConfig: (newConfig) => set((state) => ({
                config: { ...state.config, ...newConfig }
            })),

            addSignal: (signal) => set((state) => ({
                signals: [signal, ...state.signals].slice(0, 50)
            })),

            addPosition: (pos) => set((state) => ({
                activePositions: [...state.activePositions, pos],
                stats: {
                    ...state.stats,
                    totalTrades: state.stats.totalTrades + 1
                }
            })),

            closePosition: (symbol, exitPrice) => set((state) => {
                const pos = state.activePositions.find(p => p.symbol === symbol);
                if (!pos) return state;

                const pnl = pos.type === 'LONG'
                    ? (exitPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - exitPrice) * pos.quantity;

                // Simple brokerage calc: 40 rs per round trip + taxes (rough estimate)
                const brokerage = 60 + (Math.abs(pnl) * 0.001);

                const updatedHistory = [{
                    ...pos,
                    exitPrice,
                    pnl,
                    brokerage,
                    netPnl: pnl - brokerage,
                    closedAt: Date.now()
                }, ...state.tradeHistory];

                return {
                    activePositions: state.activePositions.filter(p => p.symbol !== symbol),
                    tradeHistory: updatedHistory,
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

            resetStats: () => set({
                stats: {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    totalPnl: 0,
                    totalBrokerage: 0,
                    netPnl: 0
                },
                tradeHistory: [],
                signals: [],
                activePositions: [],
                monitoredContracts: {}
            }),

            updatePrices: (identifier, price) => set((state) => ({
                activePositions: state.activePositions.map(p => {
                    // Match by EXACT ID or EXACT Symbol to prevent Spot overlapping Options
                    if (String(p.id) === String(identifier) || p.symbol === identifier) {
                        const newPnl = p.type === 'LONG' ? (price - p.entryPrice) * p.quantity : (p.entryPrice - price) * p.quantity;
                        return { ...p, currentPrice: price, pnl: newPnl };
                    }
                    return p;
                })
            })),

            setMonitoredContracts: (symbol, contracts) => set((state) => ({
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
