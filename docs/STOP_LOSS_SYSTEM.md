# Stop Loss (SL) Order System - NSE Compliant

## Overview
The Stop Loss order system is designed to match NSE's SL order mechanism, allowing traders to protect their positions from excessive losses.

## How NSE Stop Loss Works

### 1. **SL (Stop Loss Limit)**
- **Trigger**: When the market price reaches the trigger price
- **Execution**: A **limit order** is placed at the specified limit price
- **Use Case**: When you want control over the exit price
- **Risk**: Order may not execute if price moves too fast past limit price

**Example (Long Position):**
- Current Price: ₹100
- Trigger Price: ₹95 (5% below)
- Limit Price: ₹94.50
- **What happens**: When price falls to ₹95, a limit sell order is placed at ₹94.50

### 2. **SL-M (Stop Loss Market)**
- **Trigger**: When the market price reaches the trigger price
- **Execution**: A **market order** is placed immediately
- **Use Case**: When guaranteed exit is more important than price
- **Risk**: May execute at a worse price in fast-moving markets

**Example (Long Position):**
- Current Price: ₹100
- Trigger Price: ₹95 (5% below)
- **What happens**: When price falls to ₹95, a market sell order is placed immediately

## Implementation Details

### Position-Based Logic

#### **Long Positions (Quantity > 0)**
- **SL Direction**: SELL order (to exit long)
- **Trigger Price**: Must be **below** current price
- **Limit Price**: Should be **at or below** trigger price
- **Purpose**: Protect against downside losses

#### **Short Positions (Quantity < 0)**
- **SL Direction**: BUY order (to exit short)
- **Trigger Price**: Must be **above** current price
- **Limit Price**: Should be **at or above** trigger price
- **Purpose**: Protect against upside losses

### Validation Rules

1. **Trigger Price Validation**
   - Must be > 0
   - For longs: Must be < current LTP
   - For shorts: Must be > current LTP

2. **Limit Price Validation** (SL orders only)
   - Must be > 0
   - For longs: Should be ≤ trigger price
   - For shorts: Should be ≥ trigger price

3. **Price Relationship**
   ```
   Long Position:  Current Price > Trigger Price ≥ Limit Price
   Short Position: Current Price < Trigger Price ≤ Limit Price
   ```

## User Interface

### SL Order Modal Features

1. **Position Summary**
   - Direction (LONG/SHORT)
   - Quantity
   - Average Price
   - Current LTP

2. **SL Type Selection**
   - Radio buttons for SL vs SL-M
   - Clear descriptions of each type

3. **Price Inputs**
   - Trigger Price (required for both)
   - Limit Price (required for SL only)
   - Smart defaults (2% from current price)

4. **Potential Loss Calculator**
   - Real-time calculation based on trigger price
   - Formula: `|avgPrice - triggerPrice| × quantity`
   - Displayed prominently in red

5. **Validation Feedback**
   - Real-time error messages
   - Contextual help text
   - Clear guidance on price relationships

## Usage Flow

### From Positions Page

1. **Open Position Menu**
   - Click the three-dot menu (⋮) on any position row

2. **Click "SL" Button**
   - Shield icon button in the action menu
   - Opens SL Order Modal

3. **Configure SL Order**
   - Choose SL type (SL or SL-M)
   - Set trigger price
   - Set limit price (if SL)
   - Review potential loss

4. **Place Order**
   - Click "Place SL Order" button
   - Order appears in Orders page with status "OPEN"
   - Order will execute when trigger price is hit

## Code Structure

### Components

**`SLOrderModal.tsx`**
- Main modal component
- Handles SL order configuration
- Validates prices
- Places SL orders

**`PositionsPage.tsx`**
- Integrates SL modal
- Provides "SL" button in action menu
- Manages modal state

### Store Integration

```typescript
// Place SL order
placeOrder({
  securityId: position.securityId,
  symbol: position.symbol,
  exchange: position.exchange,
  segment: position.segment,
  side: isLong ? 'SELL' : 'BUY',
  orderType: 'SL' | 'SL-M',
  productType: position.productType,
  quantity: Math.abs(position.quantity),
  price: limitPrice, // For SL
  triggerPrice: triggerPrice
});
```

## Examples

### Example 1: Long Position with SL

**Position:**
- Symbol: RELIANCE
- Quantity: +50 (LONG)
- Avg Price: ₹2,950
- Current LTP: ₹2,980

**SL Order:**
- Type: SL (Limit)
- Trigger: ₹2,920 (1% below current)
- Limit: ₹2,915
- Potential Loss: ₹1,750 (₹35 × 50)

**Execution:**
- When price falls to ₹2,920 → Limit sell order placed at ₹2,915
- If filled at ₹2,915 → Actual loss: ₹1,750

### Example 2: Short Position with SL-M

**Position:**
- Symbol: BANKNIFTY FEB 61000 PE
- Quantity: -100 (SHORT)
- Avg Price: ₹150
- Current LTP: ₹145

**SL Order:**
- Type: SL-M (Market)
- Trigger: ₹155 (3.4% above current)
- Potential Loss: ₹500 (₹5 × 100)

**Execution:**
- When price rises to ₹155 → Market buy order placed immediately
- Fills at best available price (could be ₹155.50)
- Actual loss: ~₹550

## Best Practices

1. **Set SL Immediately**
   - Place SL orders right after entering a position
   - Don't wait for losses to accumulate

2. **Use Appropriate Type**
   - **SL**: For normal market conditions, better price control
   - **SL-M**: For volatile markets, guaranteed exit

3. **Reasonable Trigger Distance**
   - Too tight: May trigger on normal volatility
   - Too loose: Defeats purpose of protection
   - Recommended: 2-5% from entry price

4. **Monitor Open SL Orders**
   - Check Orders page for SL status
   - Adjust if market conditions change
   - Cancel if position is manually closed

5. **Consider Slippage**
   - SL orders may execute at worse prices
   - Factor in bid-ask spread
   - Use limit price buffer for SL orders

## Technical Notes

### Order Lifecycle

1. **Placement**: SL order created with status "OPEN"
2. **Monitoring**: System watches for trigger price hit
3. **Trigger**: When LTP reaches trigger price
4. **Execution**: 
   - SL: Limit order placed
   - SL-M: Market order placed
5. **Fill**: Order status changes to "EXECUTED"

### Price Monitoring

Currently implemented as paper trading simulation. In production:
- Real-time price feeds monitor trigger prices
- Broker API handles actual order placement
- Exchange confirms execution

## Future Enhancements

1. **Trailing Stop Loss**
   - Automatically adjust trigger as price moves favorably
   - Lock in profits while protecting downside

2. **Bracket Orders**
   - Combine entry, target, and SL in single order
   - Automatic position management

3. **OCO Orders** (One-Cancels-Other)
   - Place both target and SL
   - When one executes, other cancels

4. **Advanced SL Types**
   - Time-based SL
   - Percentage-based trailing
   - ATR-based dynamic SL
