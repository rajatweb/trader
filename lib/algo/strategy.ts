import { AlgoSignal, TradingPlan } from './types';
import { CandleWithAdr } from './adrIndicator';
import { aiEngine, MLTrainingFeatures } from './aiEngine';
// @ts-ignore
import Sentiment from 'sentiment';

const sentiment = new Sentiment();

export interface MarketSnapshot {
    orbHigh: number;
    orbLow: number;
    vwap: number;
    atr: number;
    timeOfDay: number;
    mlFeatures?: MLTrainingFeatures;
}

export class TradingStrategy {
    static dateStrToNumber(dateObj: Date): number {
        const d = dateObj.toISOString().split('T')[0];
        return parseInt(d.replace(/-/g, ''), 10);
    }

    /**
     * Advanced Behavioral Parser: Uses NLP (Sentiment NPM) to map user words to trading physics.
     */
    static parseNote(note?: string) {
        if (!note) return { sentiment: 0, strength: 0, vol: 0, level: 0, rejection: 0, breakout: 0, liquidity: 0, success: 1, detectedName: 'Manual Label' };
        const n = note.toLowerCase();

        // 1. Emotional Tone Analysis via 'sentiment' NPM
        const result = sentiment.analyze(note);
        const sentimentScore = result.score / 5;

        // 2. Trading Behavioral Mapping
        const behavior = {
            rejection: (n.includes('reject') || n.includes('wick') || n.includes('bounce') || n.includes('tail') || n.includes('hammer')) ? 1 : 0,
            breakout: (n.includes('break') || n.includes('cross') || n.includes('breach') || n.includes('expansion') || n.includes('blast')) ? 1 : 0,
            liquidity: (n.includes('sweep') || n.includes('hunt') || n.includes('stop') || n.includes('grab') || n.includes('trap') || n.includes('fake')) ? 1 : 0,
            vol: (n.includes('vol') || n.includes('supply') || n.includes('demand') || n.includes('climax') || n.includes('spike')) ? 1 : 0,
            level: (n.includes('pdl') || n.includes('pdh') || n.includes('level') || n.includes('s/r') || n.includes('zone') || n.includes('key')) ? 1 : 0
        };

        // 3. Logic Inference (Intent detection)
        let success = 1;
        if (n.includes('noise') || n.includes('avoid') || n.includes('ignore') || n.includes('bad') || n.includes('fail') || n.includes('low probability')) success = 0;

        // Extract a descriptive name
        let detectedName = 'Custom Note';
        if (behavior.breakout) detectedName = 'Breakout Play';
        else if (behavior.rejection) detectedName = 'Rejection Setup';
        else if (behavior.liquidity) detectedName = 'Liquidity Sweep';
        else if (behavior.level) detectedName = 'Level Retest';

        if (n.includes('pdl')) detectedName += ' (PDL)';
        if (n.includes('pdh')) detectedName += ' (PDH)';

        const strength = Math.min(1, (note.length / 100) + (Math.abs(result.score) / 10));

        return { sentiment: sentimentScore, strength, ...behavior, success, detectedName };
    }

    /**
     * Extracts purely mathematical features for the Algo Engine, plus semantic user input.
     */
    static buildFeatures(allCandles: CandleWithAdr[], currentIdx: number, note?: string): MarketSnapshot | null {
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

        // Find ORB and daily VWAP
        for (let j = currentIdx; j >= 0; j--) {
            const lb = allCandles[j];
            const lbDateObj = new Date(lb.time * 1000 + 330 * 60000);
            const lbDate = this.dateStrToNumber(lbDateObj);
            const lbTimeMins = lbDateObj.getUTCHours() * 60 + lbDateObj.getUTCMinutes();

            if (lbDate !== currDate) break;

            const typicalPrice = (lb.high + lb.low + lb.close) / 3;
            vwapNumerator += typicalPrice * (lb.volume || 1);
            vwapDenominator += (lb.volume || 1);

            if (lbTimeMins <= (9 * 60 + 55)) {
                if (lb.high > orbHigh) orbHigh = lb.high;
                if (lb.low < orbLow) orbLow = lb.low;
            }
        }
        const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : current.close;

        // ATR Calculation
        let trueRangeSum = 0;
        for (let j = 0; j < 14; j++) {
            const c = allCandles[currentIdx - j];
            const p = allCandles[currentIdx - j - 1];
            if (!c || !p) continue;
            trueRangeSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
        }
        const atr = trueRangeSum / 14;

        if (orbHigh === -Infinity) orbHigh = current.high;
        if (orbLow === Infinity) orbLow = current.low;

        // Standard Market Physics
        const totalRange = current.high - current.low || 0.01;
        const candleSizeToAtr = totalRange / (atr || 0.01);
        const volumeSpike = (current.volume || 0) / (current.avgVol || 1);
        const lowerWickRatio = (Math.min(current.open, current.close) - current.low) / totalRange;
        const upperWickRatio = (current.high - Math.max(current.open, current.close)) / totalRange;
        const closePosition = (current.close - current.low) / totalRange;
        const direction = current.close > current.open ? 1 : 0;

        // Liquidity Distances
        let lowest15 = Infinity, highest15 = -Infinity;
        for (let j = 1; j <= 15; j++) {
            const p = allCandles[currentIdx - j];
            if (!p) continue;
            if (p.low < lowest15) lowest15 = p.low;
            if (p.high > highest15) highest15 = p.high;
        }
        const sweepLowDist = lowest15 === Infinity ? 0 : Math.max(0, (current.low - lowest15) / lowest15);
        const sweepHighDist = highest15 === -Infinity ? 0 : Math.max(0, (highest15 - current.high) / highest15);

        // Daily Structural Levels
        let pdh = -Infinity, pdl = Infinity, pdc = 0, dayStartIdx = -1;
        for (let j = currentIdx; j >= 0; j--) {
            const c = allCandles[j];
            const date = this.dateStrToNumber(new Date(c.time * 1000 + 330 * 60000));
            if (date !== currDate) {
                if (pdc === 0) {
                    pdc = allCandles[j].close;
                    for (let k = j; k >= 0; k--) {
                        const ck = allCandles[k];
                        if (this.dateStrToNumber(new Date(ck.time * 1000 + 330 * 60000)) !== date) break;
                        if (ck.high > pdh) pdh = ck.high;
                        if (ck.low < pdl) pdl = ck.low;
                    }
                }
                break;
            }
            dayStartIdx = j;
        }
        const gapSize = pdc > 0 ? (allCandles[dayStartIdx].open - pdc) / pdc : 0;
        const distToPdh = pdh > 0 ? Math.abs(current.close - pdh) / pdh : 0;
        const distToPdl = pdl > 0 ? Math.abs(current.close - pdl) / pdl : 0;

        // Advanced Swing Features
        let swingReversalCount = 0, isFakeoutRecent = 0, isClosingFakeout = 0, swingSize = 0;
        const lookback = 10;
        for (let j = dayStartIdx + lookback; j < currentIdx; j++) {
            const win = allCandles.slice(j - lookback, j + lookback + 1);
            const isH = win.every(c => allCandles[j].high >= c.high), isL = win.every(c => allCandles[j].low <= c.low);
            if (isH || isL) {
                swingReversalCount++;
                const pL = isH ? allCandles[j].high : allCandles[j].low;
                if (j >= currentIdx - 5) {
                    if ((current.high > pL && current.close < pL) || (current.low < pL && current.close > pL)) {
                        isFakeoutRecent = 1;
                        if (Math.abs(pL - current.close) > (atr * 0.5)) isClosingFakeout = 1;
                        swingSize = Math.abs(pL - (isH ? pdl : pdh)) / (atr || 1);
                    }
                }
            }
        }

        // Semantic Translation
        const noteSigs = this.parseNote(note);

        const mlFeatures: MLTrainingFeatures = {
            timeOfDay, candleSizeToAtr, volumeSpike, lowerWickRatio, upperWickRatio, closePosition, direction,
            sweepLowDist, sweepHighDist, distToPdh, distToPdl, isFakeoutRecent, swingReversalCount, gapSize,
            swingSize: swingSize || 0, pdlRetestSignal: distToPdl < 0.0005 ? 1 : 0, pdhRetestSignal: distToPdh < 0.0005 ? 1 : 0, isClosingFakeout,
            noteSentiment: noteSigs.sentiment, noteStrength: noteSigs.strength, noteVolKeyword: noteSigs.vol, noteLevelKeyword: noteSigs.level,
            noteRejection: noteSigs.rejection, noteBreakout: noteSigs.breakout, noteLiquidity: noteSigs.liquidity
        };

        return { orbHigh, orbLow, vwap, atr, timeOfDay, mlFeatures };
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

        // Calculate if we just swept local liquidity
        let lowest15 = Infinity, highest15 = -Infinity;
        for (let j = 1; j <= 15; j++) {
            const lb = allCandles[currentIdx - j];
            if (!lb) continue;
            if (lb.low < lowest15) lowest15 = lb.low;
            if (lb.high > highest15) highest15 = lb.high;
        }

        const totalRange = current.high - current.low + 0.01;
        const volumeClimax = (current.volume || 0) > (current.avgVol * 1.5);

        // 1. SWEEP & RECLAIM (LONG)
        if (current.low < lowest15 && current.close > current.open) {
            const lowerWick = Math.min(current.open, current.close) - current.low;
            if (lowerWick / totalRange > 0.4 && volumeClimax) {
                algoDecision = 'LONG';
                slPoints = Math.max(features.atr * 1.2, current.close - current.low + 5);
                reasoning = 'Sweep & Reclaim (Hunted Local Lows)';
            }
        }

        // 2. SWEEP & RECLAIM (SHORT)
        if (algoDecision === 'NONE' && current.high > highest15 && current.close < current.open) {
            const upperWick = current.high - Math.max(current.open, current.close);
            if (upperWick / totalRange > 0.4 && volumeClimax) {
                algoDecision = 'SHORT';
                slPoints = Math.max(features.atr * 1.2, current.high - current.close + 5);
                reasoning = 'Sweep & Reclaim (Hunted Local Highs)';
            }
        }

        if (algoDecision === 'NONE') return noSignal('No Mathematical Setup');
        const signalType = algoDecision === 'LONG' ? 'BUY' : 'SELL';

        if (plan && !plan.allowedDirections.includes(signalType)) {
            return noSignal(`Bias Filter: ${signalType} restricted`);
        }

        if (indexType === 'BANKNIFTY') slPoints = Math.max(60, Math.min(125, slPoints));
        else slPoints = Math.max(20, Math.min(50, slPoints));

        const tpPoints = slPoints * 2.5;

        // ---- AI INFERENCE PIPELINE ----
        let mlConfidence = 1.0;
        if (features.mlFeatures && aiEngine.getHydrationStatus()) {
            mlConfidence = aiEngine.predict(features.mlFeatures);
            if (mlConfidence < 0.50) return noSignal(`AI Rejected (Confidence: ${(mlConfidence * 100).toFixed(1)}%)`);
        }

        return {
            type: signalType, price: current.close, symbol: indexType, reason: reasoning,
            strength: mlConfidence, timestamp: Date.now(), slPoints, targetPoints: tpPoints, snapshot: features
        };
    }

    static runPreMarketAnalysis(candles: CandleWithAdr[]): TradingPlan | null {
        if (!candles || candles.length < 10) return null;
        const latestCandle = candles[candles.length - 1];
        const adr = latestCandle.adr;
        if (!adr) return null;

        let yesterdayClose = 0, yesterdayOpen = 0;
        const todayDate = new Date(latestCandle.time * 1000).toISOString().split('T')[0];

        for (let i = candles.length - 1; i >= 0; i--) {
            const cDate = new Date(candles[i].time * 1000).toISOString().split('T')[0];
            if (cDate !== todayDate) {
                yesterdayClose = candles[i].close;
                for (let j = i; j >= 0; j--) {
                    if (new Date(candles[j].time * 1000).toISOString().split('T')[0] !== cDate) break;
                    yesterdayOpen = candles[j].open;
                }
                break;
            }
        }
        if (yesterdayClose === 0) return null;

        let trend: TradingPlan['trend'] = 'NEUTRAL', maxTrades = 3, maxLoss = 120, maxProfit = 220, directions: ('BUY' | 'SELL')[] = ['BUY', 'SELL'], reason = '';

        if (yesterdayClose > adr.adr1h) {
            trend = 'SUPER_BULLISH'; directions = ['BUY']; reason = `Close above ADR1 High (${adr.adr1h.toFixed(0)}). Pure Momentum.`;
        } else if (yesterdayClose > adr.open) {
            trend = 'BULLISH'; reason = `Yesterday close > open. Long bias.`;
        } else if (yesterdayClose < adr.adr1l) {
            trend = 'SUPER_BEARISH'; directions = ['SELL']; reason = `Close below ADR1 Low (${adr.adr1l.toFixed(0)}). Pure Momentum.`;
        } else if (yesterdayClose < adr.open) {
            trend = 'BEARISH'; reason = `Yesterday close < open. Short bias.`;
        } else {
            trend = 'NEUTRAL'; maxTrades = 2; maxLoss = 80; reason = `Consolidation detected. High-confidence only.`;
        }

        return { trend, maxTradesAllowed: maxTrades, maxDailyLossPoints: maxLoss, maxDailyProfitPoints: maxProfit, allowedDirections: directions, reasoning: reason, generatedAt: Date.now() };
    }

    static calculateQuantity(capital: number, price: number, lotSize: number = 1): number {
        const allocation = capital * 0.5;
        return Math.max(1, Math.floor((allocation / price) / lotSize)) * lotSize;
    }

    static getUntradedITMStrike(spot: number, index: string, isCall: boolean, hist: any[], active: any[], depth: number = 1): number | null {
        const step = index.includes('BANK') ? 100 : 50, atm = Math.round(spot / step) * step, used = [...hist.map(t => t.symbol), ...active.map(p => p.symbol)];
        let d = depth;
        for (let i = 0; i < 5; i++) {
            const strike = isCall ? (atm - d * step) : (atm + d * step), sym = `${index} ${strike} ${isCall ? 'CE' : 'PE'}`;
            if (!used.includes(sym)) return strike;
            d++;
        }
        return null;
    }
}
