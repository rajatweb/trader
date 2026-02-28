import { AlgoSignal, TradingPlan } from './types';
import { CandleWithAdr } from './adrIndicator';
import { MarketSnapshot, AlphaStrategist } from './ml';

/**
 * AI-Driven Alpha Strategist
 */
export class TradingStrategy {
    // ... rest follows

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
            maxTradesAllowed = 2;
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
     * Builds a normalized MarketSnapshot for the AI
     * Now purely based on Sentiment, Trend & EMAs (ADR disabled)
     */
    static buildSnapshot(allCandles: CandleWithAdr[], currentIdx: number, indexType: 'NIFTY' | 'BANKNIFTY', tradesTaken: number = 0): MarketSnapshot | null {
        const currentCandle = allCandles[currentIdx];
        if (!currentCandle) return null;

        // Essential EMA data
        const ema20 = currentCandle.ema20 || currentCandle.close;
        const ema50 = currentCandle.ema50 || currentCandle.close;
        const ema200 = currentCandle.ema200 || currentCandle.close;

        const timeObj = new Date(currentCandle.time * 1000 + 330 * 60000);
        const morning = 9 * 60 + 15;
        const totalMins = timeObj.getUTCHours() * 60 + timeObj.getUTCMinutes();
        const timeProgress = (totalMins - morning) / (6 * 60 + 15);

        const range = currentCandle.high - currentCandle.low || 1;
        const bodySize = Math.abs(currentCandle.close - currentCandle.open);
        const pc = currentCandle.prevClose || currentCandle.open;
        const prevDayCloseRel = (currentCandle.close - pc) / pc;

        // ── 1. Closing Structure & Gap Analysis (V4) ───────────────────────
        const gapSize = (currentCandle.open - pc) / pc;
        let gapType = 0; // 0: Neutral, 1: Trap (Reverse), -1: Pro (Continuation)

        let closingStructure = 0;
        let yHigh = currentCandle.high;
        let yLow = currentCandle.low;
        const currDate = new Date(currentCandle.time * 1000).getUTCDate();
        let yesterdayEndIdx = -1;
        for (let i = currentIdx - 1; i >= 0; i--) {
            if (new Date(allCandles[i].time * 1000).getUTCDate() !== currDate) {
                yesterdayEndIdx = i;
                break;
            }
        }

        if (yesterdayEndIdx !== -1) {
            // Find yesterday's high/low for trap detection
            let searchIdx = yesterdayEndIdx;
            const targetDate = new Date(allCandles[searchIdx].time * 1000).getUTCDate();
            let yMax = -Infinity;
            let yMin = Infinity;
            while (searchIdx >= 0 && new Date(allCandles[searchIdx].time * 1000).getUTCDate() === targetDate) {
                if (allCandles[searchIdx].high > yMax) yMax = allCandles[searchIdx].high;
                if (allCandles[searchIdx].low < yMin) yMin = allCandles[searchIdx].low;
                searchIdx--;
            }
            yHigh = yMax;
            yLow = yMin;

            if (yesterdayEndIdx > 30) {
                const yesterdayFinalRange = allCandles.slice(yesterdayEndIdx - 30, yesterdayEndIdx);
                const yOpen = yesterdayFinalRange[0].open;
                const yClose = yesterdayFinalRange[yesterdayFinalRange.length - 1].close;
                closingStructure = (yClose - yOpen) / yOpen;
            }
        }

        if (gapSize > 0.002 && closingStructure < -0.001) gapType = 1;
        else if (gapSize < -0.002 && closingStructure > 0.001) gapType = 1;
        else if (Math.abs(gapSize) > 0.003) gapType = -1;

        const prevDayHighRel = (currentCandle.close - yHigh) / yHigh;
        const prevDayLowRel = (currentCandle.close - yLow) / yLow;

        // ── 2. Structural Patterns ────────────────────────────────────────
        let isLiquidityGrab = 0;
        if (currentCandle.high >= pc && currentCandle.close < pc && gapSize < 0) isLiquidityGrab = 1;
        if (currentCandle.low <= pc && currentCandle.close > pc && gapSize > 0) isLiquidityGrab = 1;

        let swingLowDef = 0;
        if (currentIdx > 15) {
            const last15 = allCandles.slice(currentIdx - 15, currentIdx);
            const minLowLast15 = Math.min(...last15.map(c => c.low));
            if (currentCandle.low < minLowLast15) swingLowDef = 1;
        }

        let rangeStatus = 0;
        if (currentIdx > 30) {
            const last30 = allCandles.slice(currentIdx - 30, currentIdx);
            const h = Math.max(...last30.map(c => c.high));
            const l = Math.min(...last30.map(c => c.low));
            const spread = (h - l) / currentCandle.close;
            rangeStatus = Math.max(0, 1 - (spread / 0.005));
        }

        let rangeBreakout = 0;
        let isFakeBreakout = 0;
        if (currentIdx > 30) {
            const rangeWindow = allCandles.slice(currentIdx - 30, currentIdx);
            const h30 = Math.max(...rangeWindow.map(c => c.high));
            const l30 = Math.min(...rangeWindow.map(c => c.low));

            if (currentCandle.close > h30) rangeBreakout = 1;
            else if (currentCandle.close < l30) rangeBreakout = -1;

            if (currentIdx > 0) {
                const prev = allCandles[currentIdx - 1];
                if ((prev.close > h30 && currentCandle.close <= h30) || (prev.close < l30 && currentCandle.close >= l30)) {
                    isFakeBreakout = 1;
                }
            }
        }

        // ── 3. Morning Bias & Volatility ─────────────────────────────────
        let morningSentiment = 0;
        let dayOpen = currentCandle.open;
        for (let i = currentIdx; i >= Math.max(0, currentIdx - 400); i--) {
            if (new Date(allCandles[i].time * 1000).getUTCDate() !== currDate) {
                dayOpen = allCandles[i + 1].open;
                break;
            }
            if (i === 0) dayOpen = allCandles[0].open;
        }
        if (dayOpen > 0) morningSentiment = (currentCandle.close - dayOpen) / (dayOpen * 0.003);

        const momentum = (currentCandle.close - currentCandle.open) / (currentCandle.open || 1);
        const sentiment = Math.max(-1, Math.min(1, momentum * 1000));
        const volatility = range / (currentCandle.open * 0.002);

        let avgSessionVol = 0;
        if (totalMins < morning + 15) avgSessionVol = volatility;

        const stopHuntZone = (Math.abs(currentCandle.close - pc) / pc < 0.0005) ? 1 : 0;
        const orderFlowBias = sentiment * ((currentCandle.volume || 0) / (currentCandle.avgVol || 1));

        // Trend Assessment Logic
        let trendStrength = 0.5;
        if (ema20 > ema50 && ema50 > ema200) trendStrength = 1.0;
        else if (ema20 > ema50) trendStrength = 0.75;
        else if (ema20 < ema50 && ema50 < ema200) trendStrength = 0.0;
        else if (ema20 < ema50) trendStrength = 0.25;

        return {
            marketSentiment: sentiment,
            trendStrength,
            volatility: Math.min(1, volatility),
            prevDayCloseRel,
            prevDayHighRel,
            prevDayLowRel,
            gapType,
            gapSize,
            priceRelToClose: (currentCandle.close - pc) / pc,
            isLiquidityGrab,
            closingStructure,
            rangeBreakout,
            tradesTakenToday: tradesTaken === 0 ? 0 : (tradesTaken === 1 ? 0.5 : 1.0),
            morningSentiment: Math.max(-1.5, Math.min(1.5, morningSentiment)),
            isFakeBreakout,
            stopHuntZone,
            ema20Spread: (currentCandle.close - ema20) / currentCandle.close,
            ema50Spread: (currentCandle.close - ema50) / currentCandle.close,
            ema200Spread: (currentCandle.close - ema200) / currentCandle.close,
            emaTrend: ema20 > ema50 ? 1 : 0,
            bodyPct: bodySize / range,
            wickRatio: (range - bodySize) / range,
            volumeZ: (currentCandle.volume || 0) / (currentCandle.avgVol || 1),
            timeOfDay: Math.min(1, Math.max(0, timeProgress)),
            indexType: indexType === 'BANKNIFTY' ? 1 : 0,
            priceRelToOpen: (currentCandle.close - (currentCandle.open || 0)) / 1000 + 0.5,
            momentum,
            swingLowDef,
            rangeStatus: Math.min(1, rangeStatus),
            avgSessionVol,
            orderFlowBias,
            riskRewardRatio: 3.0
        };
    }

    /**
     * Builds a sequence of snapshots for the AI context
     */
    static buildSnapshotWindow(allCandles: CandleWithAdr[], currentIdx: number, windowSize: number, indexType: 'NIFTY' | 'BANKNIFTY', tradesTaken: number = 0): MarketSnapshot[] {
        const window: MarketSnapshot[] = [];
        for (let i = Math.max(0, currentIdx - windowSize + 1); i <= currentIdx; i++) {
            const snap = this.buildSnapshot(allCandles, i, indexType, tradesTaken);
            if (snap) window.push(snap);
        }
        return window;
    }

    /**
     * Checks the 1-minute candle sequence against ADR lines 
     * and the active trading plan to generate exact signals.
     */
    static checkAiSignal(
        allCandles: CandleWithAdr[],
        currentIdx: number,
        indexType: 'NIFTY' | 'BANKNIFTY',
        strategist: AlphaStrategist,
        tradesTaken: number = 0,
        plan?: TradingPlan
    ): AlgoSignal {
        const currentCandle = allCandles[currentIdx];
        const snaps = this.buildSnapshotWindow(allCandles, currentIdx, 3, indexType, tradesTaken);
        if (snaps.length === 0) return { type: 'NONE', price: 0, symbol: '', reason: 'No data', strength: 0, timestamp: Date.now() };

        const decision = strategist.decide(snaps);

        if (decision.type === 'WAIT') {
            return { type: 'NONE', price: 0, symbol: '', reason: 'AI Neutral', strength: 0, timestamp: Date.now() };
        }

        const signalType = decision.type === 'LONG' ? 'BUY' : 'SELL';

        // Filter by Trading Plan Bias if provided
        if (plan && !plan.allowedDirections.includes(signalType)) {
            return { type: 'NONE', price: 0, symbol: '', reason: `Bias Filter: ${signalType} restricted`, strength: 0, timestamp: Date.now() };
        }

        return {
            type: decision.type === 'LONG' ? 'BUY' : 'SELL',
            price: currentCandle.close,
            symbol: indexType,
            reason: decision.reasoning || `AI Alpha Pattern (confidence ${(decision.confidence * 100).toFixed(1)}%)`,
            strength: decision.confidence,
            timestamp: Date.now(),
            slPoints: decision.slPoints,
            targetPoints: decision.tpPoints,
            snapshot: snaps[snaps.length - 1] // Pass latest snapshot for training feedback
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
