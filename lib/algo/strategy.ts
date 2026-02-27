
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
            let ts = c.time || c.start_Time || c.start_time || c.timestamp;
            if (!ts) return;

            // Normalize: If TS is in ms (usually > 20,000,000,000)
            if (ts > 20000000000) ts = ts / 1000;

            try {
                const date = new Date(ts * 1000).toISOString().split('T')[0];
                if (!dayMap.has(date)) dayMap.set(date, []);
                dayMap.get(date)?.push({ ...c, time: ts, start_Time: ts });
            } catch (e) {
                console.warn("Invalid timestamp encountered:", ts);
            }
        });

        const dates = Array.from(dayMap.keys()).sort();
        if (dates.length < 1) return [];

        const today = new Date().toISOString().split('T')[0];
        const isTodayStarted = dates[dates.length - 1] === today;

        // 1. Identify Reference Periods
        // If today is in data, history is everything before today.
        // If today is NOT in data yet (pre-market), history is everything including the last available day.
        const activeSessionDate = isTodayStarted ? dates[dates.length - 1] : null;
        const prevDate = isTodayStarted ?
            (dates.length > 1 ? dates[dates.length - 2] : null) :
            dates[dates.length - 1];

        // Sentiment analysis should use all available history (up to last 10 days)
        const historyDates = isTodayStarted ? dates.slice(0, -1) : dates;
        const lastNDates = historyDates.slice(-10);
        let bullishDays = 0;
        let bearishDays = 0;
        let totalVolatility = 0;

        let weeklyHigh = 0;
        let weeklyLow = Infinity;

        lastNDates.forEach((date: string) => {
            const dayCandles = dayMap.get(date)!;
            const open = dayCandles[0].open;
            const close = dayCandles[dayCandles.length - 1].close;
            const high = Math.max(...dayCandles.map(c => c.high));
            const low = Math.min(...dayCandles.map(c => c.low));

            if (high > weeklyHigh) weeklyHigh = high;
            if (low < weeklyLow) weeklyLow = low;

            if (close > open) bullishDays++;
            else bearishDays++;
            totalVolatility += (high - low);
        });

        const avgDailyRange = totalVolatility / Math.max(1, lastNDates.length);
        const sentiment = bullishDays > bearishDays ? 'BULLISH' : 'BEARISH';
        const sentimentStrength = Math.abs(bullishDays - bearishDays) / Math.max(1, lastNDates.length);

        if (!prevDate) return [];
        const prevDayCandles = dayMap.get(prevDate)!;
        const pdh = Math.max(...prevDayCandles.map(c => c.high));
        const pdl = Math.min(...prevDayCandles.map(c => c.low));
        const pdc = prevDayCandles[prevDayCandles.length - 1].close;
        const pdo = prevDayCandles[0].open;

        // Retail Bias for Today
        const closePosition = (pdc - pdl) / (pdh - pdl);
        const retailBias = closePosition > 0.7 ? 'BULLISH' : (closePosition < 0.3 ? 'BEARISH' : 'NEUTRAL');

        const zones: (TradingZone & { metadata?: any })[] = [
            { price: pdh, type: 'RESISTANCE', strength: 1.0, description: 'PDH', metadata: { retailBias, sentiment, weeklyHigh, weeklyLow } },
            { price: pdl, type: 'SUPPORT', strength: 1.0, description: 'PDL', metadata: { retailBias, sentiment, weeklyHigh, weeklyLow } },
            { price: pdc, type: 'PIVOT', strength: 0.6, description: 'PDC' },
            { price: weeklyHigh, type: 'RESISTANCE', strength: 1.2, description: 'Weekly High' },
            { price: weeklyLow, type: 'SUPPORT', strength: 1.2, description: 'Weekly Low' }
        ];

        // 3. Identify Retail SL Cluster Zones (0.1% beyond extremes)
        const slBuffer = pdh * 0.0005;
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

        const pdhZone = zones.find(z => z.description.includes('PDH'));
        const pdlZone = zones.find(z => z.description.includes('PDL'));
        const whZone = zones.find(z => z.description.includes('Weekly High'));
        const wlZone = zones.find(z => z.description.includes('Weekly Low'));
        const meta = pdhZone?.metadata || {};

        if (!pdhZone || !pdlZone) return { type: 'NONE', price: 0, symbol: '', reason: 'Anchors missing', strength: 0, timestamp: Date.now() };

        // 1. MEGA REVERSAL (Weekly Low Sweep)
        if (wlZone && currentCandle.low <= wlZone.price && currentCandle.close > wlZone.price) {
            return {
                type: 'BUY',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `MEGA REVERSAL: Weekly Low Liquidity Sweep. High Strength.`,
                strength: 0.98,
                timestamp: Date.now()
            };
        }

        // 2. BEAR TRAP (PDL Scan)
        const recentLow = Math.min(...prevCandles.slice(-10).map(c => c.low));
        if (recentLow < pdlZone.price && currentCandle.close > pdlZone.price && lastCandle.close <= pdlZone.price) {
            const strength = meta.sentiment === 'BULLISH' ? 0.95 : 0.8;
            return {
                type: 'BUY',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Trap @ PDL. Trend: ${meta.sentiment}`,
                strength,
                timestamp: Date.now()
            };
        }

        // 3. BULL TRAP (PDH Scan)
        const recentHigh = Math.max(...prevCandles.slice(-10).map(c => c.high));
        if (recentHigh > pdhZone.price && currentCandle.close < pdhZone.price && lastCandle.close >= pdhZone.price) {
            const strength = meta.sentiment === 'BEARISH' ? 0.95 : 0.8;
            return {
                type: 'SELL',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Trap @ PDH. Trend: ${meta.sentiment}`,
                strength,
                timestamp: Date.now()
            };
        }

        // 4. MEGA SHORT (Weekly High Sweep)
        if (whZone && currentCandle.high >= whZone.price && currentCandle.close < whZone.price) {
            return {
                type: 'SELL',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `MEGA SHORT: Weekly High Liquidity Sweep.`,
                strength: 0.98,
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

    /**
     * Finds the contract from Dhan's Option Chain response (Strike-indexed object)
     */
    static findContract(chainData: any, targetStrike: number, type: 'CALL' | 'PUT') {
        if (!chainData || !chainData.oc) return null;

        const strikes = Object.keys(chainData.oc);
        // Match strike with tolerance for float rounding (e.g., "22500.000000" matches 22500)
        const matchKey = strikes.find(s => Math.round(parseFloat(s)) === targetStrike);

        if (!matchKey) return null;

        const strikeInfo = chainData.oc[matchKey];
        const contract = type === 'CALL' ? strikeInfo.ce : strikeInfo.pe;

        if (!contract) return null;

        return {
            ...contract,
            strike_price: targetStrike,
            oc_type: type
        };
    }

    /**
     * Goal Management
     */
    static shouldStopForDay(currentPnl: number, targetPnl: number = 10000): boolean {
        return currentPnl >= targetPnl;
    }
}
