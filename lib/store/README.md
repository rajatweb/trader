# Trading Store Documentation

## Overview
The trading store is a comprehensive Zustand-based state management solution for paper trading with real-time market data integration.

## Features

### 1. **Watchlist Management**
- Add/remove instruments
- Real-time price updates via WebSocket
- Reorderable list
- Persistent storage

### 2. **Order Management**
- Place orders (MARKET, LIMIT, SL, SL-M)
- Automatic execution for market orders
- Pending order tracking
- Order status updates

### 3. **Position Tracking**
- Real-time P&L calculation
- Average price tracking
- Position closing
- Realized vs Unrealized P&L

### 4. **Margin Calculation**
- Pre-trade margin checks
- Real-time margin utilization
- Product-specific margin requirements

### 5. **Account Summary**
- Total capital tracking
- Available vs Used margin
- Overall P&L

## Usage Examples

### Basic Setup

```tsx
import { useTradingStore, useMarketFeed } from '@/lib/store';

function TradingApp() {
    // Initialize market feed (handles WebSocket connection)
    useMarketFeed();
    
    const { watchlist, orders, positions, account } = useTradingStore();
    
    return (
        <div>
            <h1>Capital: ₹{account.totalCapital}</h1>
            <h2>P&L: ₹{account.totalPnl}</h2>
        </div>
    );
}
```

### Placing an Order

```tsx
import { useTradingStore } from '@/lib/store';

function OrderButton() {
    const { placeOrder, calculateMargin } = useTradingStore();
    
    const handleBuy = () => {
        const order = {
            securityId: '1333',
            symbol: 'RELIANCE',
            exchange: 'NSE',
            segment: 'NSE_EQ',
            side: 'BUY',
            orderType: 'MARKET',
            productType: 'INTRADAY',
            quantity: 10,
            price: 2950.50
        };
        
        // Check margin before placing
        const marginCheck = calculateMargin(order);
        if (!marginCheck.sufficient) {
            alert('Insufficient margin!');
            return;
        }
        
        // Place order
        const orderId = placeOrder(order);
        console.log('Order placed:', orderId);
    };
    
    return <button onClick={handleBuy}>Buy</button>;
}
```

### Viewing Positions

```tsx
import { useTradingStore } from '@/lib/store';

function PositionsTable() {
    const { positions } = useTradingStore();
    
    return (
        <table>
            <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>LTP</th>
                    <th>P&L</th>
                </tr>
            </thead>
            <tbody>
                {positions.map(pos => (
                    <tr key={pos.securityId}>
                        <td>{pos.symbol}</td>
                        <td>{pos.quantity}</td>
                        <td>₹{pos.ltp.toFixed(2)}</td>
                        <td className={pos.totalPnl >= 0 ? 'text-green' : 'text-red'}>
                            ₹{pos.totalPnl.toFixed(2)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
```

### Connecting Broker

```tsx
import { useTradingStore } from '@/lib/store';

function BrokerConnect() {
    const { connectBroker, isConnected } = useTradingStore();
    
    const handleConnect = async () => {
        // After validating credentials via API
        const clientId = '1001234567';
        const accessToken = 'eyJhbGc...';
        
        connectBroker(clientId, accessToken);
    };
    
    return (
        <div>
            {isConnected ? (
                <span>✓ Connected</span>
            ) : (
                <button onClick={handleConnect}>Connect</button>
            )}
        </div>
    );
}
```

## Store Structure

### State
```typescript
{
    watchlist: WatchlistItem[],
    orders: Order[],
    positions: Position[],
    account: AccountSummary,
    isConnected: boolean,
    brokerCredentials: { clientId, accessToken } | null
}
```

### Actions
- **Watchlist**: `addToWatchlist`, `removeFromWatchlist`, `updateWatchlistPrices`, `reorderWatchlist`
- **Orders**: `placeOrder`, `cancelOrder`, `updateOrderStatus`, `getOrdersByStatus`, `getPendingOrders`
- **Positions**: `updatePosition`, `closePosition`, `getPositionBySecurityId`
- **Account**: `calculateMargin`, `updateAccountSummary`
- **Broker**: `connectBroker`, `disconnectBroker`
- **Utilities**: `reset`

## Real-Time Updates

The `useMarketFeed` hook automatically:
1. Connects to Dhan WebSocket when broker is connected
2. Subscribes to all watchlist + position instruments
3. Updates prices in real-time
4. Executes pending limit/SL orders when conditions are met
5. Recalculates P&L automatically

## Persistence

The store automatically persists to `localStorage`:
- Watchlist
- Orders
- Positions
- Account summary
- Broker credentials (encrypted recommended)

## Order Execution Logic

### Market Orders
- Execute immediately at current LTP
- Update position instantly

### Limit Orders
- Remain OPEN until price condition met
- BUY: Execute when LTP <= limit price
- SELL: Execute when LTP >= limit price

### Stop Loss Orders
- Remain OPEN until trigger price hit
- BUY: Execute when LTP >= trigger price
- SELL: Execute when LTP <= trigger price
- SL-M: Execute at market price
- SL: Execute at specified limit price

## Margin Calculation

Simplified margin requirements:
- **Delivery**: 100% of order value
- **Intraday**: 20% of order value (5x leverage)
- **MTF**: 25% of order value (4x leverage)
- **F&O**: 15% of order value

## Best Practices

1. **Always check margin** before placing orders
2. **Use `useMarketFeed`** in your root component
3. **Connect broker** before trading
4. **Monitor `account.marginUtilization`** to avoid over-leverage
5. **Use `closePosition`** for quick exits
6. **Check `getPendingOrders()`** regularly

## Example: Complete Trading Flow

```tsx
import { useTradingStore, useMarketFeed } from '@/lib/store';

function TradingDashboard() {
    useMarketFeed(); // Initialize real-time updates
    
    const { 
        watchlist, 
        positions, 
        account,
        placeOrder,
        closePosition,
        isConnected 
    } = useTradingStore();
    
    const handleQuickBuy = (item) => {
        const order = {
            securityId: item.id,
            symbol: item.symbol,
            exchange: item.exchange,
            segment: item.segment,
            side: 'BUY',
            orderType: 'MARKET',
            productType: 'INTRADAY',
            quantity: 1,
            price: item.ltp
        };
        
        placeOrder(order);
    };
    
    return (
        <div>
            {!isConnected && <div>⚠️ Connect broker for live trading</div>}
            
            <div>
                <h2>Account</h2>
                <p>Capital: ₹{account.totalCapital.toLocaleString()}</p>
                <p>Available: ₹{account.availableMargin.toLocaleString()}</p>
                <p>P&L: ₹{account.totalPnl.toFixed(2)}</p>
            </div>
            
            <div>
                <h2>Watchlist</h2>
                {watchlist.map(item => (
                    <div key={item.id}>
                        {item.symbol} - ₹{item.ltp}
                        <button onClick={() => handleQuickBuy(item)}>Buy</button>
                    </div>
                ))}
            </div>
            
            <div>
                <h2>Positions</h2>
                {positions.map(pos => (
                    <div key={pos.securityId}>
                        {pos.symbol} x {pos.quantity} - P&L: ₹{pos.totalPnl.toFixed(2)}
                        <button onClick={() => closePosition(pos.securityId)}>Close</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
```
