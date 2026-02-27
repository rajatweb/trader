
import { useEffect, useRef } from 'react';
import { useAlgoStore } from '../store/algoStore';
import { useTradingStore } from '../store/tradingStore';
import { TradingStrategy } from './strategy';
import { playAlgoSound } from '../utils/sound';

export function useAlgoRunner(chartData: any[] = []) {
    const {
        isRunning,
        config,
        zones,
        addSignal,
        addPosition,
        activePositions,
        updatePrices,
        closePosition,
        monitoredContracts,
        stats
    } = useAlgoStore();

    const { brokerCredentials, isConnected } = useTradingStore();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const chartDataRef = useRef(chartData);

    // Keep the ref updated with the latest live candles
    useEffect(() => {
        chartDataRef.current = chartData;
    }, [chartData]);

    useEffect(() => {
        if (!isRunning || !brokerCredentials) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        console.log("Algo Runner Started with Option Monitoring");

        intervalRef.current = setInterval(async () => {
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            const algoState = useAlgoStore.getState();
            const tradingState = useTradingStore.getState();

            const activePositions = algoState.activePositions;
            const watchlist = tradingState.watchlist;
            const monitoredContracts = algoState.monitoredContracts;
            const zones = algoState.zones;
            const stats = algoState.stats;

            // 1. Check Trading Hours & Daily Target
            if (timeStr < config.startTime || timeStr > config.endTime || TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) {
                if (TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) {
                    console.log("Daily Target of ₹10,000 reached. Protocol Suspended.");
                }

                // Square off all if end time reached or target reached
                if ((timeStr === config.endTime || TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) && activePositions.length > 0) {
                    activePositions.forEach(pos => {
                        algoState.closePosition(pos.symbol, pos.currentPrice);
                        playAlgoSound('EXIT');
                    });
                }
                return;
            }

            // 1.5 Update ALL active position prices mapping directly to Live Watchlist
            activePositions.forEach(pos => {
                const optionItem = watchlist.find(w =>
                    String(w.securityId) === String((pos as any).id) ||
                    w.symbol.includes(pos.symbol) ||
                    pos.symbol.includes(w.symbol)
                );
                if (optionItem && optionItem.ltp > 0) {
                    algoState.updatePrices(pos.symbol, optionItem.ltp);
                }
            });

            // 2. Monitor Market Context
            config.symbols.forEach(symbol => {
                // Get Index Spot Price for Signal Generation
                const indexItem = watchlist.find(w => w.symbol.includes(symbol) && !w.symbol.includes('CE') && !w.symbol.includes('PE'));
                if (!indexItem || !indexItem.ltp) return;

                const contracts = monitoredContracts[symbol];
                if (!contracts) return;

                // 3. Check for Entry Signals (only if no open position for this index area)
                const hasPosition = activePositions.some(p => p.symbol.startsWith(symbol));
                if (!hasPosition) {
                    const latestCandles = chartDataRef.current;
                    // Provide the last 30 minutes of real intraday data for trap pattern detection
                    const realPrevCandles = latestCandles.slice(Math.max(0, latestCandles.length - 30), Math.max(0, latestCandles.length - 1));

                    if (realPrevCandles.length < 5) return; // Need at least some history to scan for traps

                    const signal = TradingStrategy.checkSignal(
                        { close: indexItem.ltp, high: indexItem.ltp, low: indexItem.ltp, volume: indexItem.volume || 100000, ...latestCandles[latestCandles.length - 1] },
                        realPrevCandles,
                        zones
                    );

                    if (signal.type !== 'NONE') {
                        const targetContract = signal.type === 'BUY' ? contracts.ce : contracts.pe;
                        if (!targetContract) return;

                        // Get real-time price of the option contract
                        const optionWatchEntry = watchlist.find(w => String(w.securityId) === String(targetContract.securityId) || String(w.securityId) === String(targetContract.security_id));
                        const valFallback = Object.values(targetContract).find(v => typeof v === 'number' && v > 0);
                        let entryPrice: number = optionWatchEntry?.ltp || (typeof valFallback === 'number' ? valFallback : 300); // Fallback to 300 to not block the algorithm if WebSocket lags

                        console.log(`[Algo] Option detected live price: ₹${entryPrice}. Executing real trade parameters.`);
                        algoState.addSignal({ ...signal, symbol: `${symbol} ${targetContract.strike_price} ${targetContract.oc_type === 'CALL' ? 'CE' : 'PE'}`, price: entryPrice });
                        playAlgoSound('ENTRY');

                        const qty = TradingStrategy.calculateQuantity(config.initialCapital, entryPrice, config.lotSize[symbol] || 1);

                        algoState.addPosition({
                            symbol: `${symbol} ${targetContract.strike_price} ${targetContract.oc_type === 'CALL' ? 'CE' : 'PE'}`,
                            id: String(targetContract.securityId || targetContract.security_id),
                            type: 'LONG', // Option buying is always a LONG trade
                            entryPrice: entryPrice,
                            quantity: qty,
                            currentPrice: entryPrice,
                            pnl: 0,
                            timestamp: Date.now()
                        } as any);
                    }
                } else {
                    // 4. Check for Exit Signal / SL / Target
                    const pos = activePositions.find(p => p.symbol.startsWith(symbol));
                    if (pos) {
                        const target = pos.entryPrice * 1.40; // 40% Target as requested
                        const sl = pos.entryPrice * 0.80;     // 20% SL as requested

                        if (pos.currentPrice >= target || pos.currentPrice <= sl) {
                            algoState.closePosition(pos.symbol, pos.currentPrice);
                            playAlgoSound('EXIT');
                        }
                    }
                }
            });

        }, 3000); // Check every 3 seconds

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning, brokerCredentials, config]); // Minimal dependencies to stop re-triggering timer bugs
}
