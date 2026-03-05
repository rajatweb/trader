import { useEffect, useRef, useState } from 'react';
import { useAlgoStore } from '../store/algoStore';
import { useTradingStore } from '../store/tradingStore';
import { playAlgoSound } from '../utils/sound';
import { TradingStrategy } from './strategy';
import { TradingPlan } from './types';
import { calculateADRx2, CandleWithAdr } from './adrIndicator';
import { aiEngine } from './aiEngine';

export function useAlgoRunner(chartData: any[] = []) {
    const {
        isRunning,
        config,
        activePositions,
        addPosition
    } = useAlgoStore();

    const { brokerCredentials } = useTradingStore();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const chartDataRef = useRef(chartData);
    const tradingPlanRef = useRef<TradingPlan | null>(null);
    const lastExitTimeRef = useRef<number>(0);

    // Keep chart data ref current
    useEffect(() => {
        chartDataRef.current = chartData;
    }, [chartData]);

    // Handle Start/Stop and Plan Generation
    useEffect(() => {
        if (!isRunning || !brokerCredentials) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            tradingPlanRef.current = null;
            return;
        }

        console.log(`[AlgoRunner] Started. Computing Pre-Market Analysis...`);

        // Hydrate AI Brain from saved weights
        if (!aiEngine.getHydrationStatus()) {
            fetch('/ml_weights.json').then(res => res.json()).then(json => {
                if (json && Object.keys(json).length > 0) {
                    aiEngine.importWeights(json);
                }
            }).catch(() => console.log(`[AlgoRunner] No pre-trained weights found. Using fresh brain.`));
        }

        const initialPlan = TradingStrategy.runPreMarketAnalysis(chartDataRef.current);

        if (initialPlan) {
            console.log(`[AlgoRunner] Plan Generated! Trend: ${initialPlan.trend}. Reason: ${initialPlan.reasoning}`);
            tradingPlanRef.current = initialPlan;
        } else {
            console.warn(`[AlgoRunner] Failed to generate a trading plan due to insufficient data. Waiting for more candles.`);
        }

        intervalRef.current = setInterval(async () => {
            const now = new Date();
            const tStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            const algoState = useAlgoStore.getState();
            const tradingState = useTradingStore.getState();

            const curPositions = algoState.activePositions;
            const watchlist = tradingState.watchlist;
            const latestCandles = chartDataRef.current;

            // ── 1. Hard stop: end-time ──────────────────────────────────────
            const hardStop = tStr >= config.endTime;

            if (hardStop) {
                if (curPositions.length > 0) {
                    curPositions.forEach(pos => {
                        algoState.closePosition(pos.symbol, pos.currentPrice);
                        playAlgoSound('EXIT');
                    });
                }
                lastExitTimeRef.current = Date.now();
                return;
            }

            // ── 2. Update active position prices ────────────────────────────
            curPositions.forEach(pos => {
                const match = watchlist.find(w =>
                    String(w.securityId) === String((pos as any).id) ||
                    w.symbol === pos.symbol
                );
                if (match && match.ltp > 0) {
                    algoState.updatePrices(String((pos as any).id) || pos.symbol, match.ltp);
                }
            });

            // ── 3. Strategy Execution (ADR Sniper) ──────────────────────────
            if (curPositions.length > 0) return; // Prevent multiple entries if holding
            if (!tradingPlanRef.current) {
                // Try again if we missed it initially
                tradingPlanRef.current = TradingStrategy.runPreMarketAnalysis(latestCandles);
                if (!tradingPlanRef.current) return;
            }

            if (latestCandles.length < 2) return;

            const currentCandle = latestCandles[latestCandles.length - 1];
            const indexType = (config.symbols[0] === 'BANKNIFTY' || config.symbols[0] === 'NIFTY') ? config.symbols[0] : 'BANKNIFTY';

            let tradesTodayCount = 0; // Keeping simple, logic in real strat handles limits

            const signal = TradingStrategy.checkAiSignal(latestCandles, latestCandles.length - 1, indexType as any, tradesTodayCount, tradingPlanRef.current || undefined);

            if (signal.type !== 'NONE') {
                console.log(`[AlgoRunner] SIGNAL GENERATED: ${signal.type} | ${signal.reason}`);
                playAlgoSound('ENTRY');

                // Example Option Execution Placeholder Setup:
                // Selecting Strike Price based on Action
                const indexName = config.symbols[0] || 'NIFTY';
                const lot = config.lotSize[indexName] || 50;

                const isCall = signal.type === 'BUY';

                // Enforce 5-minute cool-down between trades
                const minsSinceExit = (Date.now() - lastExitTimeRef.current) / 60000;
                if (minsSinceExit < 5) {
                    return;
                }

                // Select an In-The-Money Strike that hasn't been traded yet today
                const targetStrike = TradingStrategy.getUntradedITMStrike(
                    currentCandle.close,
                    indexName,
                    isCall,
                    algoState.tradeHistory,
                    curPositions,
                    1 // 1 level ITM
                );

                if (!targetStrike) {
                    console.warn(`[AlgoRunner] Could not find an untraded ITM strike for ${isCall ? 'CE' : 'PE'}`);
                    return;
                }

                const optSymbol = `${indexName} ${targetStrike} ${isCall ? 'CE' : 'PE'}`;

                // Calculate QTY
                const rawPremiumAssume = 100; // Place holder if we don't have option chain fetch inline yet
                const qtyToBuy = TradingStrategy.calculateQuantity(config.initialCapital, rawPremiumAssume, lot);

                addPosition({
                    symbol: optSymbol,
                    type: isCall ? 'LONG' : 'LONG', // Option buying is always a LONG position on the contract itself
                    entryPrice: rawPremiumAssume,
                    currentPrice: rawPremiumAssume,
                    quantity: qtyToBuy,
                    pnl: 0,
                    id: Math.random().toString(), // MOCK ID until integrated with broker API
                    sl: signal.slPoints ? rawPremiumAssume - signal.slPoints : undefined,
                    target: signal.targetPoints ? rawPremiumAssume + signal.targetPoints : undefined,
                    timestamp: Date.now()
                });
            }

        }, 3000); // Check every 3 seconds

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                lastExitTimeRef.current = Date.now(); // Record exit for potential resume
            }
        };

    }, [isRunning, brokerCredentials, config]);
}
