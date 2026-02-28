import { AlgoSignal, TradingPlan } from './types';
import { CandleWithAdr } from './adrIndicator';

export interface MarketSnapshot {
    orbHigh: number;
    orbLow: number;
    vwap: number;
    atr: number;
    timeOfDay: number;
}
export class TradingStrategy {
    // ... rest follows

    static dateStrToNumber(dateObj: Date): number {
        const d = dateObj.toISOString().split('T')[0];
        return parseInt(d.replace(/-/g, ''), 10);
    }

    /**
     * Pre-Market Analysis generator.
     * Takes the last 30 days of data and the freshly generated ADR zones for today
     * to formulate a statistical trading plan.
     */
    static runPreMarketAnalysis(candles: CandleWithAdr[]): TradingPlan | null {
        if (!candles || candles.length < 10) return null;

        const latestCandle = candles[candles.length - 1];
        const adr = latestCandle.adr;
        if (!adr) return null;

        // Get yesterday's close
        let yesterdayClose = 0;
        let yesterdayOpen = 0;

        // Find the last candle of the previous day
        const todayDate = new Date(latestCandle.time * 1000).toISOString().split('T')[0];

        for (let i = candles.length - 1; i >= 0; i--) {
            const cDate = new Date(candles[i].time * 1000).toISOString().split('T')[0];
            if (cDate !== todayDate) {
                yesterdayClose = candles[i].close;
                // find yesterday's open
                for (let j = i; j >= 0; j--) {
                    const cDate2 = new Date(candles[j].time * 1000).toISOString().split('T')[0];
                    if (cDate2 !== cDate) {
                        break;
                    }
                    yesterdayOpen = candles[j].open;
                }
                break;
            }
        }

        if (yesterdayClose === 0) return null;

        // Trend Assessment
        let trend: TradingPlan['trend'] = 'NEUTRAL';
        let maxTradesAllowed = 3;
        let maxDailyLossPoints = 120;
        let maxDailyProfitPoints = 220; // 120 + 50 + 50
        const allowedDirections: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
        let reasoning = '';

        // If yesterday closed above ADR1 High, it's super bullish momentum
        if (yesterdayClose > adr.adr1h) {
            trend = 'SUPER_BULLISH';
            maxTradesAllowed = 3;
            allowedDirections.splice(0, allowedDirections.length, 'BUY'); // Only taking CE trades
            reasoning = `Yesterday closed extremely strong above ADR1 High (${adr.adr1h.toFixed(0)}), indicating huge momentum. Aggressive Long bias.`;
        } else if (yesterdayClose > adr.open) {
            trend = 'BULLISH';
            maxTradesAllowed = 3;
            reasoning = `Yesterday closed positive above open. Moderate Long bias.`;
        } else if (yesterdayClose < adr.adr1l) {
            trend = 'SUPER_BEARISH';
            maxTradesAllowed = 3;
            allowedDirections.splice(0, allowedDirections.length, 'SELL'); // Only taking PE trades
            reasoning = `Yesterday closed extremely weak below ADR1 Low (${adr.adr1l.toFixed(0)}), indicating huge downside momentum. Aggressive Short bias.`;
        } else if (yesterdayClose < adr.open) {
            trend = 'BEARISH';
            maxTradesAllowed = 3;
            reasoning = `Yesterday closed negative below open. Moderate Short bias.`;
        } else {
            trend = 'NEUTRAL';
            maxTradesAllowed = 2; // Strict limit to prevent drawdown in sideways markets
            maxDailyLossPoints = 80;
            reasoning = `Yesterday closed around the open. Market is consolidating. Restricted to high-confidence scalps.`;
        }

        return {
            trend,
            maxTradesAllowed,
            maxDailyLossPoints,
            maxDailyProfitPoints,
            allowedDirections,
            reasoning,
            generatedAt: Date.now()
        };
    }

    /**
     * Extracts purely mathematical features for the Algo Engine.
     */
    static buildFeatures(allCandles: CandleWithAdr[], currentIdx: number): MarketSnapshot | null {
        if (currentIdx < 20) return null;
        const current = allCandles[currentIdx];

        const timeObj = new Date(current.time * 1000 + 330 * 60000);
        const morningMinutes = 9 * 60 + 15;
        const totalMins = timeObj.getUTCHours() * 60 + timeObj.getUTCMinutes();
        const timeOfDay = Math.max(0, Math.min(1, (totalMins - morningMinutes) / (6 * 60 + 15)));

        const currDate = this.dateStrToNumber(new Date(current.time * 1000 + 330 * 60000));

        let orbHigh = -Infinity;
        let orbLow = Infinity;
        let vwapNumerator = 0;
        let vwapDenominator = 0;

        // Find ORB (first 30-45 mins of the day) and daily VWAP
        for (let j = currentIdx; j >= 0; j--) {
            const lookbackCandle = allCandles[j];
            const lbDateObj = new Date(lookbackCandle.time * 1000 + 330 * 60000);
            const lbDate = this.dateStrToNumber(lbDateObj);
            const lbTimeMins = lbDateObj.getUTCHours() * 60 + lbDateObj.getUTCMinutes();

            if (lbDate !== currDate) break; // Reached yesterday

            // VWAP Calc
            const typicalPrice = (lookbackCandle.high + lookbackCandle.low + lookbackCandle.close) / 3;
            vwapNumerator += typicalPrice * (lookbackCandle.volume || 1);
            vwapDenominator += (lookbackCandle.volume || 1);

            // True ORB is 9:15 to 10:00 (first 45 mins)
            if (lbTimeMins <= (9 * 60 + 55)) {
                if (lookbackCandle.high > orbHigh) orbHigh = lookbackCandle.high;
                if (lookbackCandle.low < orbLow) orbLow = lookbackCandle.low;
            }
        }

        const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : current.close;

        // Calculate Average True Range (ATR) over 14 periods for dynamic SL/TP
        let trueRangeSum = 0;
        for (let j = 0; j < 14; j++) {
            const c = allCandles[currentIdx - j];
            const p = allCandles[currentIdx - j - 1];
            if (!c || !p) continue;
            const tr1 = c.high - c.low;
            const tr2 = Math.abs(c.high - p.close);
            const tr3 = Math.abs(c.low - p.close);
            trueRangeSum += Math.max(tr1, tr2, tr3);
        }
        const atr = trueRangeSum / 14;

        if (orbHigh === -Infinity) orbHigh = current.high;
        if (orbLow === Infinity) orbLow = current.low;

        return {
            orbHigh,
            orbLow,
            vwap,
            atr,
            timeOfDay
        };
    }

    /**
     * Executes the Core Algorithmic Quantitative Strategy.
     */
    static checkAiSignal(
        allCandles: CandleWithAdr[],
        currentIdx: number,
        indexType: 'NIFTY' | 'BANKNIFTY',
        tradesTaken: number = 0,
        plan?: TradingPlan
    ): AlgoSignal {
        const noSignal = (reason: string): AlgoSignal => ({
            type: 'NONE', price: 0, symbol: '', reason, strength: 0, timestamp: Date.now()
        });

        const current = allCandles[currentIdx];
        const prev = allCandles[currentIdx - 1];
        if (!prev) return noSignal('Warming Up');

        const features = this.buildFeatures(allCandles, currentIdx);
        if (!features) return noSignal('Warming Up');

        const timeObj = new Date(current.time * 1000 + 330 * 60000);
        const currentMins = timeObj.getUTCHours() * 60 + timeObj.getUTCMinutes();

        // Wait till 10:00 AM so Opening Range properly forms
        if (currentMins < 10 * 60) return noSignal('Building Opening Range Base');

        let algoDecision: 'NONE' | 'LONG' | 'SHORT' = 'NONE';
        let slPoints = 0;
        let reasoning = '';

        const orbBreakoutMargin = indexType === 'BANKNIFTY' ? 10 : 5;

        // SETUPS

        // 1. Opening Range Breakout (ORB) LONG
        if (current.close > (features.orbHigh + orbBreakoutMargin) && prev.close <= features.orbHigh) {
            // Must have broken out on decent volume confirming momentum
            if ((current.volume || 1) > (current.avgVol || 1)) {
                // Strong bullish confirmation candle closing near high
                if (current.close > current.open && ((current.high - current.close) / (current.high - current.low + 0.001) < 0.3)) {
                    algoDecision = 'LONG';
                    // SL safely tucked back inside the ORB or a tight technical low constraint
                    slPoints = Math.max(features.atr * 1.2, current.close - current.low + 10);
                    reasoning = 'Bullish ORB Breakout (High Vol)';
                }
            }
        }

        // 2. Opening Range Breakdown (ORB) SHORT
        if (current.close < (features.orbLow - orbBreakoutMargin) && prev.close >= features.orbLow) {
            if ((current.volume || 1) > (current.avgVol || 1)) {
                if (current.close < current.open && ((current.close - current.low) / (current.high - current.low + 0.001) < 0.3)) {
                    algoDecision = 'SHORT';
                    slPoints = Math.max(features.atr * 1.2, current.high - current.close + 10);
                    reasoning = 'Bearish ORB Breakout (High Vol)';
                }
            }
        }

        // 3. VWAP Bounce LONG (If we are trending above ORB, and we dip back down to VWAP)
        if (algoDecision === 'NONE' && current.close > features.orbHigh) {
            if (current.low <= features.vwap && current.close > features.vwap) {
                // Green rejection candle off VWAP
                if (current.close > current.open) {
                    algoDecision = 'LONG';
                    slPoints = features.atr * 1.2;
                    reasoning = 'Bullish VWAP Trailing Rejection';
                }
            }
        }

        // 4. VWAP Rejection SHORT (If we are trending below ORB, and we pop up to VWAP)
        if (algoDecision === 'NONE' && current.close < features.orbLow) {
            if (current.high >= features.vwap && current.close < features.vwap) {
                if (current.close < current.open) {
                    algoDecision = 'SHORT';
                    slPoints = features.atr * 1.2;
                    reasoning = 'Bearish VWAP Trailing Rejection';
                }
            }
        }

        if (algoDecision === 'NONE') return noSignal('No Mathematical Setup');

        const signalType = algoDecision === 'LONG' ? 'BUY' : 'SELL';

        if (plan && !plan.allowedDirections.includes(signalType)) {
            return noSignal(`Bias Filter: ${signalType} restricted`);
        }

        // Cap Risk Limits Mathematically (5M candle ATR ensures we're scaled correctly to market flow)
        if (indexType === 'BANKNIFTY') {
            slPoints = Math.max(60, Math.min(125, slPoints));
        } else {
            slPoints = Math.max(20, Math.min(50, slPoints));
        }

        // We ride the trend on 5M, aiming for a 1:2.5 risk to reward
        const tpPoints = slPoints * 2.5;

        return {
            type: signalType,
            price: current.close,
            symbol: indexType,
            reason: reasoning,
            strength: 0.9, // Hard math setup
            timestamp: Date.now(),
            slPoints,
            targetPoints: tpPoints
        };
    }

    /**
     * Quantity calculation
     */
    static calculateQuantity(capital: number, price: number, lotSize: number = 1): number {
        // Assume maximum risk is hitting a stop loss of approx 30 points (value depends on option delta, but assume roughly 30 * qty)
        // Conservative allocation of capital
        const allocation = capital * 0.5;
        const rawQty = allocation / price;
        const lots = Math.floor(rawQty / lotSize);
        return Math.max(1, lots) * lotSize;
    }

    /**
     * Get In-The-Money (ITM) Strike that hasn't been traded yet today.
     * @param spotPrice The current index price
     * @param indexName ex: 'NIFTY', 'BANKNIFTY'
     * @param isCall True for CE, false for PE
     * @param tradeHistory List of previous trades to avoid repeating strikes
     * @param activePositions List of currently open positions
     * @param depth How many strikes ITM (1 = first ITM)
     */
    static getUntradedITMStrike(
        spotPrice: number,
        indexName: string,
        isCall: boolean,
        tradeHistory: any[],
        activePositions: any[],
        depth: number = 1
    ): number | null {
        const step = indexName.includes('BANK') ? 100 : (indexName.includes('FIN') ? 50 : 50);

        // Base ATM strike
        const atm = Math.round(spotPrice / step) * step;

        // Gather all currently traded/active symbols to prevent reuse
        const usedSymbols = [
            ...tradeHistory.map(t => t.symbol),
            ...activePositions.map(p => p.symbol) // Don't buy the same strike if we are already holding it
        ];

        // Max attempts to find an untraded strike (prevent infinite loops)
        const maxAttempts = 5;

        // For CE, ITM means strike is LOWER than spot. 
        // For PE, ITM means strike is HIGHER than spot.
        let currentDepth = depth;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const strikeOffset = currentDepth * step;
            const targetStrike = isCall ? (atm - strikeOffset) : (atm + strikeOffset);

            const optSymbol = `${indexName} ${targetStrike} ${isCall ? 'CE' : 'PE'}`;

            if (!usedSymbols.includes(optSymbol)) {
                return targetStrike;
            }

            // If used, go one step deeper ITM
            currentDepth++;
        }

        return null; // All reasonable strikes used or depth too extreme
    }
}
