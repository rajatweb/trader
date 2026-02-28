import { AlgoSignal, TradingPlan } from './types';
import { CandleWithAdr } from './adrIndicator';

/**
 * ADR Sniper Strategy
 * Intelligent Options Buying Strategy based on Average Daily Range bands
 */
export class TradingStrategy {

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
        let maxTradesAllowed = 2; // Choppy days = low trades
        const allowedDirections: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
        let reasoning = '';

        // If yesterday closed above ADR1 High, it's super bullish momentum
        if (yesterdayClose > adr.adr1h) {
            trend = 'SUPER_BULLISH';
            maxTradesAllowed = 5;
            allowedDirections.splice(0, allowedDirections.length, 'BUY'); // Only taking CE trades
            reasoning = `Yesterday closed extremely strong above ADR1 High (${adr.adr1h.toFixed(0)}), indicating huge momentum. Aggressive Long bias.`;
        } else if (yesterdayClose > adr.open) {
            trend = 'BULLISH';
            maxTradesAllowed = 3;
            reasoning = `Yesterday closed positive above open. Moderate Long bias. Reversion trades allowed.`;
        } else if (yesterdayClose < adr.adr1l) {
            trend = 'SUPER_BEARISH';
            maxTradesAllowed = 5;
            allowedDirections.splice(0, allowedDirections.length, 'SELL'); // Only taking PE trades
            reasoning = `Yesterday closed extremely weak below ADR1 Low (${adr.adr1l.toFixed(0)}), indicating huge downside momentum. Aggressive Short bias.`;
        } else if (yesterdayClose < adr.open) {
            trend = 'BEARISH';
            maxTradesAllowed = 3;
            reasoning = `Yesterday closed negative below open. Moderate Short bias. Reversion trades allowed.`;
        } else {
            trend = 'NEUTRAL';
            maxTradesAllowed = 2;
            reasoning = `Yesterday closed around the open. Market is consolidating. Expecting chop, restricted to high-confidence mean reversion trades only.`;
        }

        return {
            trend,
            maxTradesAllowed,
            allowedDirections,
            reasoning,
            generatedAt: Date.now()
        };
    }

    /**
     * Checks the 1-minute candle sequence against ADR lines 
     * and the active trading plan to generate exact signals.
     */
    static checkAdrSignal(
        currentCandle: CandleWithAdr,
        prevCandles: CandleWithAdr[],
        plan: TradingPlan | null
    ): AlgoSignal {
        if (!plan || !currentCandle.adr) {
            return { type: 'NONE', price: 0, symbol: '', reason: 'No plan or ADR data', strength: 0, timestamp: Date.now() };
        }

        const adr = currentCandle.adr;
        const lastCandle = prevCandles[prevCandles.length - 1];
        if (!lastCandle) return { type: 'NONE', price: 0, symbol: '', reason: 'No history', strength: 0, timestamp: Date.now() };

        // Signal A: Trend Following Breakout of Inner Bands
        // MUST align with the TradingPlan's overall trend
        if (plan.allowedDirections.includes('BUY') && currentCandle.close > adr.adr1h && lastCandle.close <= adr.adr1h) {
            if ((currentCandle.volume || 0) > (lastCandle.volume || 0)) { // Volume confirmation
                return {
                    type: 'BUY',
                    price: currentCandle.close,
                    symbol: 'INDEX',
                    reason: `Trend Breakout: Crossed ADR1 High with volume confirmation. Trend is ${plan.trend}`,
                    strength: 0.85,
                    timestamp: Date.now(),
                    targetPoints: Math.abs(adr.adr2h - currentCandle.close), // Target ADR2
                    slPoints: Math.abs(currentCandle.close - currentCandle.low) + 10 // SL below breakout candle
                };
            }
        }

        if (plan.allowedDirections.includes('SELL') && currentCandle.close < adr.adr1l && lastCandle.close >= adr.adr1l) {
            if ((currentCandle.volume || 0) > (lastCandle.volume || 0)) {
                return {
                    type: 'SELL',
                    price: currentCandle.close,
                    symbol: 'INDEX',
                    reason: `Trend Breakdown: Crossed ADR1 Low with volume confirmation. Trend is ${plan.trend}`,
                    strength: 0.85,
                    timestamp: Date.now(),
                    targetPoints: Math.abs(currentCandle.close - adr.adr2l), // Target ADR2
                    slPoints: Math.abs(currentCandle.high - currentCandle.close) + 10
                };
            }
        }

        // Signal B: Extreme Mean Reversion at Outer Bands (Allowed in almost all plans)
        // ADR3 touches are pure elastic rebounds.
        if (currentCandle.high >= adr.adr3h && currentCandle.close < currentCandle.open) { // Touching ADR3 High and reverting red
            return {
                type: 'SELL',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Extreme Mean Reversion: Rejection at ADR3 High. High probability fade.`,
                strength: 0.95,
                timestamp: Date.now(),
                targetPoints: Math.abs(currentCandle.close - adr.adr1h), // Target back inside to ADR1
                slPoints: Math.abs(adr.adr3h - currentCandle.close) + 15  // Tight SL just above ADR3
            };
        }

        if (currentCandle.low <= adr.adr3l && currentCandle.close > currentCandle.open) { // Touching ADR3 Low and reverting green
            return {
                type: 'BUY',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Extreme Mean Reversion: Rejection at ADR3 Low. High probability bounce.`,
                strength: 0.95,
                timestamp: Date.now(),
                targetPoints: Math.abs(adr.adr1l - currentCandle.close),
                slPoints: Math.abs(currentCandle.close - adr.adr3l) + 15
            };
        }

        // ADR2 Mean Reversion (Needs to be cautious if trend is "SUPER")
        if (plan.trend !== 'SUPER_BULLISH' && currentCandle.high >= adr.adr2h && currentCandle.close < currentCandle.open) {
            return {
                type: 'SELL',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Mean Reversion: Rejection at ADR2 High.`,
                strength: 0.8,
                timestamp: Date.now(),
                targetPoints: Math.abs(currentCandle.close - adr.adr1h),
                slPoints: Math.abs(adr.adr2h - currentCandle.close) + 15
            };
        }

        if (plan.trend !== 'SUPER_BEARISH' && currentCandle.low <= adr.adr2l && currentCandle.close > currentCandle.open) {
            return {
                type: 'BUY',
                price: currentCandle.close,
                symbol: 'INDEX',
                reason: `Mean Reversion: Rejection at ADR2 Low.`,
                strength: 0.8,
                timestamp: Date.now(),
                targetPoints: Math.abs(adr.adr1l - currentCandle.close),
                slPoints: Math.abs(currentCandle.close - adr.adr2l) + 15
            };
        }

        return { type: 'NONE', price: 0, symbol: '', reason: 'Waiting for ADR interaction', strength: 0, timestamp: Date.now() };
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
