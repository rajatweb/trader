import { useEffect, useRef, useCallback } from 'react';
import { useTradingStore } from './tradingStore';
import { DhanFeedClient, MarketDataUpdate } from '@/lib/dhan/websocket-client';

/**
 * Hook to manage WebSocket connection and sync with trading store
 */
export function useMarketFeed() {
    const feedClientRef = useRef<DhanFeedClient | null>(null);
    const {
        watchlist,
        positions,
        isConnected,
        brokerCredentials,
        updateWatchlistPrices,
        getPendingOrders,
        updateOrderStatus,
        checkAutoSquareOff,
        setFeedStatus
    } = useTradingStore();

    // Periodic check for auto square-off (every 30 seconds)
    useEffect(() => {
        // Initial check
        checkAutoSquareOff();

        const interval = setInterval(() => {
            checkAutoSquareOff();
        }, 30000); // 30s

        return () => clearInterval(interval);
    }, [checkAutoSquareOff]);

    const handleError = useCallback((error: string) => {
        console.error('Market Feed Error:', error);
    }, []);

    // Check if any pending limit/SL orders should be executed
    const checkPendingOrders = useCallback((updates: MarketDataUpdate[]) => {
        const pendingOrders = getPendingOrders();

        pendingOrders.forEach(order => {
            const update = updates.find(u => String(u.securityId) === order.securityId);
            if (!update || !update.ltp) return;

            const ltp = update.ltp;
            let shouldExecute = false;
            let executionPrice = ltp;

            const triggerPrice = order.triggerPrice || order.price;

            // Check execution conditions based on order type
            if (order.orderType === 'LIMIT') {
                if (order.side === 'BUY' && ltp <= order.price) {
                    shouldExecute = true;
                    executionPrice = order.price;
                } else if (order.side === 'SELL' && ltp >= order.price) {
                    shouldExecute = true;
                    executionPrice = order.price;
                }
            } else if (order.orderType === 'SL' || order.orderType === 'SL-M') {

                if (order.side === 'BUY' && ltp >= triggerPrice) {
                    shouldExecute = true;
                    executionPrice = order.orderType === 'SL-M' ? ltp : order.price;
                } else if (order.side === 'SELL' && ltp <= triggerPrice) {
                    shouldExecute = true;
                    executionPrice = order.orderType === 'SL-M' ? ltp : order.price;
                }
            }

            if (shouldExecute) {
                updateOrderStatus(order.orderId, 'EXECUTED', order.quantity, executionPrice);
            }
        });
    }, [getPendingOrders, updateOrderStatus]);

    // Handle market data updates
    const handleMarketUpdates = useCallback((updates: MarketDataUpdate[]) => {
        // Convert updates to watchlist format
        const priceUpdates = updates.map(update => ({
            securityId: String(update.securityId),
            ltp: update.ltp,
            prevClose: update.prevClose,
            open: update.open,
            high: update.high,
            low: update.low,
            volume: update.volume
        }));

        // Update watchlist and positions
        updateWatchlistPrices(priceUpdates);

        // Check pending orders for execution
        checkPendingOrders(updates);
    }, [updateWatchlistPrices, checkPendingOrders]);

    // ----------------------------------------------------------------
    // 1. Connection Management Effect
    // Only runs when credentials or explicit connection status changes
    // ----------------------------------------------------------------
    useEffect(() => {
        // Only connect if broker is connected and we have valid credentials
        if (!isConnected || !brokerCredentials) {
            return;
        }

        const { clientId, accessToken } = brokerCredentials;

        // Create WebSocket client
        const client = new DhanFeedClient(
            clientId,
            accessToken,
            handleMarketUpdates,
            handleError,
            (status) => setFeedStatus(status)
        );

        client.connect();
        feedClientRef.current = client;

        // Cleanup: Disconnect when credentials change or component unmounts
        return () => {
            client.disconnect();
            feedClientRef.current = null;
        };
        // Dependencies are minimal to prevent unnecessary reconnects
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, brokerCredentials?.clientId, brokerCredentials?.accessToken, handleMarketUpdates, handleError, setFeedStatus]);


    // ----------------------------------------------------------------
    // 2. Subscription Management Effect
    // Runs when valid instruments list changes (watchlist/positions)
    // ----------------------------------------------------------------
    useEffect(() => {
        const client = feedClientRef.current;

        // If client is not ready or no instruments, skip
        if (!client || !isConnected) return;

        // Subscribe to all instruments (watchlist + positions)
        const allInstruments = new Map<string, { segment: string; securityId: string }>();

        watchlist.forEach(item => {
            allInstruments.set(item.securityId, { segment: item.segment, securityId: item.securityId });
        });

        positions.forEach(pos => {
            allInstruments.set(pos.securityId, { segment: pos.segment, securityId: pos.securityId });
        });

        const instrumentList = Array.from(allInstruments.values());
        if (instrumentList.length > 0) {
            // Subscribe without reconnecting
            client.subscribe(instrumentList, 17); // Quote mode
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchlist.length, positions.length, isConnected]); // Only re-subscribe if list length changes. (Using length as proxy for structure changes is a safe optimization here)

    return {
        isConnected: isConnected, // Return the store's connection state, or feedStatus === 'CONNECTED'
        reconnect: () => {
            if (feedClientRef.current) {
                feedClientRef.current.disconnect();
            }
            // Trigger re-connection by updating a dependency
        }
    };
}
