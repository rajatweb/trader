import { useEffect, useRef } from 'react';
import { useAlgoStore } from '../store/algoStore';
import { useTradingStore } from '../store/tradingStore';
import { playAlgoSound } from '../utils/sound';

export function useAlgoRunner(chartData: any[] = []) {
    const {
        isRunning,
        config,
        activePositions,
    } = useAlgoStore();

    const { brokerCredentials } = useTradingStore();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const chartDataRef = useRef(chartData);

    // Keep chart data ref current
    useEffect(() => {
        chartDataRef.current = chartData;
    }, [chartData]);

    useEffect(() => {
        if (!isRunning || !brokerCredentials) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        console.log(`[AlgoRunner] Started — waiting for indicator injection...`);

        intervalRef.current = setInterval(async () => {
            const now = new Date();
            const tStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            const algoState = useAlgoStore.getState();
            const tradingState = useTradingStore.getState();

            const activePositions = algoState.activePositions;
            const watchlist = tradingState.watchlist;
            const latestCandles = chartDataRef.current;

            // ── 1. Hard stop: end-time ──────────────────────────────────────
            const hardStop = tStr >= config.endTime;

            if (hardStop) {
                if (activePositions.length > 0) {
                    activePositions.forEach(pos => {
                        algoState.closePosition(pos.symbol, pos.currentPrice);
                        playAlgoSound('EXIT');
                    });
                    console.log(`[AlgoRunner] Hard stop reached at ${tStr}. All positions closed.`);
                }
                return;
            }

            // ── 2. Update active position prices ────────────────────────────
            activePositions.forEach(pos => {
                const match = watchlist.find(w =>
                    String(w.securityId) === String((pos as any).id) ||
                    w.symbol === pos.symbol
                );
                if (match && match.ltp > 0) {
                    algoState.updatePrices(String((pos as any).id) || pos.symbol, match.ltp);
                }
            });

            // ── 3. Indicator & Entry Logic (Placeholder) ────────────────====
            // [INDICATOR_CODE_WILL_GO_HERE]

        }, 3000); // Check every 3 seconds

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };

    }, [isRunning, brokerCredentials, config]);
}
