
import { AlgoSignal, TradingZone } from './types';

/**
 * Algo Strategy Helper
 * Focuses on breakout/breakdown detection and fakeout identification.
 */
export class TradingStrategy {
    /**
     * Identifies trading zones and analyzes market sentiment over 10 days.
     * Determines PDH, PDL, PDC and calculates "Retail SL Clusters".
     */
    static identifyZones(candles: any[]): (TradingZone & { metadata?: any })[] {
        if (!candles || candles.length === 0) return [];

        // Group by day for multi-day analysis
        const dayMap = new Map<string, any[]>();
        candles.forEach(c => {
            const date = new Date(c.time ? c.time * 1000 : c.start_Time).toISOString().split('T')[0];
            if (!dayMap.has(date)) dayMap.set(date, []);
            dayMap.get(date)?.push(c);
        });

        const dates = Array.from(dayMap.keys()).sort();
        if (dates.length < 2) return [];

        // 1. Analyze 10-Day Sentiment
        const last10Dates = dates.slice(-11, -1); // Exclude today if it's in the data
        let bullishDays = 0;
        let bearishDays = 0;
        let totalVolatility = 0;

        last10Dates.forEach(date => {
            const dayCandles = dayMap.get(date)!;
            const open = dayCandles[0].open;
            const close = dayCandles[dayCandles.length - 1].close;
            const high = Math.max(...dayCandles.map(c => c.high));
            const low = Math.min(...dayCandles.map(c => c.low));

            if (close > open) bullishDays++;
            else bearishDays++;

            totalVolatility += (high - low);
        });

        const avgDailyRange = totalVolatility / last10Dates.length;
        const sentiment = bullishDays > bearishDays ? 'BULLISH' : 'BEARISH';
        const sentimentStrength = Math.abs(bullishDays - bearishDays) / 10;

        // 2. Previous Day Key Levels
        const prevDate = dates[dates.length - 2];
        const prevDayCandles = dayMap.get(prevDate)!;
        const pdh = Math.max(...prevDayCandles.map(c => c.high));
        const pdl = Math.min(...prevDayCandles.map(c => c.low));
        const pdc = prevDayCandles[prevDayCandles.length - 1].close;
        const pdo = prevDayCandles[0].open;

        // Retail Bias for Today
        // If PDC > PDO and Close was near High, Retail is Bullish (targets for SL hunting)
        const closePosition = (pdc - pdl) / (pdh - pdl);
        const retailBias = closePosition > 0.7 ? 'BULLISH' : (closePosition < 0.3 ? 'BEARISH' : 'NEUTRAL');

        const zones: (TradingZone & { metadata?: any })[] = [
            { price: pdh, type: 'RESISTANCE', strength: 1.0, description: 'PDH', metadata: { retailBias, sentiment } },
            { price: pdl, type: 'SUPPORT', strength: 1.0, description: 'PDL', metadata: { retailBias, sentiment } },
            { price: pdc, type: 'PIVOT', strength: 0.6, description: 'PDC' }
        ];

        // 3. Identify Retail SL Cluster Zones (0.1% beyond extremes)
        const slBuffer = pdh * 0.0005; // ~10 points on Nifty
        zones.push({ price: pdh + slBuffer, type: 'RESISTANCE', strength: 0.5, description: 'Retail SL Hunt (Longs)' });
        zones.push({ price: pdl - slBuffer, type: 'SUPPORT', strength: 0.5, description: 'Retail SL Hunt (Shorts)' });

        return zones;
    }

    /**
     * Intelligent SL Hunting Logic.
     * Analysis focus: 
     * - If Retail is BULLISH (from PDC/Sentiment), Smart Money will HUNT below PDL.
     * - If Retail is BEARISH, Smart Money will HUNT above PDH.
     */
    static checkSignal(
        currentCandle: any,
        prevCandles: any[],
        zones: any[]
    ): AlgoSignal {
        const lastCandle = prevCandles[prevCandles.length - 1];
        if (!lastCandle) return { type: 'NONE', price: 0, symbol: '', reason: 'No history', strength: 0, timestamp: Date.now() };

        const pdhZone = zones.find(z => z.description === 'PDH');
        const pdlZone = zones.find(z => z.description === 'PDL');
        const meta = pdhZone?.metadata || {};

        if (!pdhZone || !pdlZone) return { type: 'NONE', price: 0, symbol: '', reason: 'PDH/PDL missing', strength: 0, timestamp: Date.now() };

        // 1. BEAR TRAP (Hunt Retail Shorts)
        // Retailers sell at PDL breakdown. We wait for breakdown and then quick reversal.
        // Higher probability if Sentiment is Bullish or Retail Bias is Bearish today.
        const recentLow = Math.min(...prevCandles.slice(-8).map(c => c.low));
        if (recentLow < pdlZone.price && currentCandle.close > pdlZone.price && lastCandle.close <= pdlZone.price) {
            const strength = meta.sentiment === 'BULLISH' ? 0.95 : 0.8;
            return {
                type: 'BUY',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Smart Money SL Hunt: Bear Trap @ PDL. Bias ${meta.sentiment}`,
                strength,
                timestamp: Date.now()
            };
        }

        // 2. BULL TRAP (Hunt Retail Longs)
        // Retailers buy at PDH breakout. We wait for breakout and then quick reversal.
        // Higher probability if Sentiment is Bearish or Retail Bias is Bullish today.
        const recentHigh = Math.max(...prevCandles.slice(-8).map(c => c.high));
        if (recentHigh > pdhZone.price && currentCandle.close < pdhZone.price && lastCandle.close >= pdhZone.price) {
            const strength = meta.sentiment === 'BEARISH' ? 0.95 : 0.8;
            return {
                type: 'SELL',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Smart Money SL Hunt: Bull Trap @ PDH. Bias ${meta.sentiment}`,
                strength,
                timestamp: Date.now()
            };
        }

        return { type: 'NONE', price: 0, symbol: '', reason: 'Waiting for Trap', strength: 0, timestamp: Date.now() };
    }

    /**
     * Quantity calculation with smart scaling based on Daily Progress
     */
    static calculateQuantity(capital: number, price: number, lotSize: number = 1): number {
        // Allocation: 60% of capital for SL Hunt trades as they are high probability
        const allocation = capital * 0.6;
        const rawQty = allocation / price;
        const lots = Math.floor(rawQty / lotSize);
        return Math.max(1, lots) * lotSize;
    }

    static getATMStrike(spot: number, symbol: string): number {
        const step = symbol.includes('BANK') ? 100 : 50;
        return Math.round(spot / step) * step;
    }

    static findContract(chain: any[], targetStrike: number, type: 'CALL' | 'PUT') {
        if (!Array.isArray(chain)) return null;
        return chain.find(c =>
            Number(c.strike_price) === targetStrike &&
            c.oc_type === type
        );
    }

    /**
     * Goal Management
     */
    static shouldStopForDay(currentPnl: number, targetPnl: number = 10000): boolean {
        return currentPnl >= targetPnl;
    }
}
