
import { useEffect, useRef } from 'react';
import { useAlgoStore } from '../store/algoStore';
import { useTradingStore } from '../store/tradingStore';
import { TradingStrategy } from './strategy';

export function useAlgoRunner() {
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

    const { brokerCredentials, watchlist } = useTradingStore();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isRunning || !brokerCredentials) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        console.log("Algo Runner Started with Option Monitoring");

        intervalRef.current = setInterval(async () => {
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            // 1. Check Trading Hours & Daily Target
            if (timeStr < config.startTime || timeStr > config.endTime || TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) {
                if (TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) {
                    console.log("Daily Target of ₹10,000 reached. Protocol Suspended.");
                }

                // Square off all if end time reached or target reached
                if ((timeStr === config.endTime || TradingStrategy.shouldStopForDay(stats.totalPnl, 10000)) && activePositions.length > 0) {
                    activePositions.forEach(pos => {
                        closePosition(pos.symbol, pos.currentPrice);
                    });
                }
                return;
            }

            // 2. Monitor Market Context
            config.symbols.forEach(symbol => {
                // Get Index Spot Price for Signal Generation
                const indexItem = watchlist.find(w => w.symbol.includes(symbol) && !w.symbol.includes('CE') && !w.symbol.includes('PE'));
                if (!indexItem || !indexItem.ltp) return;

                const contracts = monitoredContracts[symbol];
                if (!contracts) return;

                // Update prices for active positions using real-time feedstock
                activePositions.filter(p => (p as any).id).forEach(pos => {
                    const optionItem = watchlist.find(w => String(w.securityId) === (pos as any).id);
                    if (optionItem && optionItem.ltp) {
                        updatePrices(pos.symbol, optionItem.ltp);
                    }
                });

                // 3. Check for Entry Signals (only if no open position for this index area)
                const hasPosition = activePositions.some(p => p.symbol.startsWith(symbol));
                if (!hasPosition) {
                    const mockPrevCandles = zones.filter(z => z.description.includes(symbol)).map(z => ({ close: z.price, volume: 1000000 }));

                    const signal = TradingStrategy.checkSignal(
                        { close: indexItem.ltp, volume: indexItem.volume || 100000 },
                        mockPrevCandles,
                        zones
                    );

                    if (signal.type !== 'NONE') {
                        const targetContract = signal.type === 'BUY' ? contracts.ce : contracts.pe;
                        if (!targetContract) return;

                        // Get real-time price of the option contract
                        const optionWatchEntry = watchlist.find(w => String(w.securityId) === String(targetContract.securityId));
                        const entryPrice = optionWatchEntry?.ltp || 0;

                        if (entryPrice > 0) {
                            addSignal({ ...signal, symbol: `${symbol} OPT` });

                            const qty = TradingStrategy.calculateQuantity(config.initialCapital, entryPrice, config.lotSize[symbol] || 1);

                            addPosition({
                                symbol: `${symbol} ${targetContract.strike_price} ${targetContract.oc_type === 'CALL' ? 'CE' : 'PE'}`,
                                id: String(targetContract.securityId),
                                type: signal.type === 'BUY' ? 'LONG' : 'SHORT',
                                entryPrice: entryPrice,
                                quantity: qty,
                                currentPrice: entryPrice,
                                pnl: 0,
                                timestamp: Date.now()
                            } as any);
                        }
                    }
                } else {
                    // 4. Check for Exit Signal / SL / Target
                    const pos = activePositions.find(p => p.symbol.startsWith(symbol));
                    if (pos) {
                        const target = pos.entryPrice * 1.10; // 10% Target
                        const sl = pos.entryPrice * 0.90;      // 10% SL

                        if (pos.currentPrice >= target || pos.currentPrice <= sl) {
                            closePosition(pos.symbol, pos.currentPrice);
                        }
                    }
                }
            });

        }, 3000); // Check every 3 seconds

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning, brokerCredentials, zones, watchlist, activePositions, monitoredContracts]);
}
