/**
 * Zenith Algo Backtesting Engine
 *
 * Runs the custom ADR Sniper Strategy simulation logic on historical candles.
 */

import { calculateADRx2, CandleWithAdr } from './adrIndicator';
import { TradingStrategy, MarketSnapshot } from './strategy';
import { TradingPlan } from './types';
import { aiEngine, MLTrainingData } from './aiEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
    time: number; // unix seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface BacktestTrade {
    id: number;
    date: string;           // YYYY-MM-DD
    entryTime: string;      // HH:MM
    exitTime: string;       // HH:MM
    entryTimestamp: number; // For plotting
    exitTimestamp: number;  // For plotting
    type: 'LONG' | 'SHORT';
    signal: string;         // reason
    entrySpot: number;
    exitSpot: number;
    entryIdx: number;       // candle index in full array
    exitIdx: number;
    points: number;         // index points gained/lost
    qty: number;
    pnl: number;            // gross PnL
    brokerage: number;
    netPnl: number;
    exitReason: 'TARGET' | 'SL' | 'EODCLOSE' | 'TIME';
    snapshot?: MarketSnapshot; // AI Vector snapshot
    mlConfidence?: number; // 0 to 1 score generated before trade
    slPoints?: number;
    tpPoints?: number;
}

export interface DayResult {
    date: string;
    trades: BacktestTrade[];
    dayPnl: number;
    dayBrokerage: number;
    dayNetPnl: number;
    tradesTaken: number;
    stopped: boolean;
}

export interface MonthResult {
    month: string;        // YYYY-MM
    label: string;        // "Jan 2025"
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    grossPnl: number;
    brokerage: number;
    netPnl: number;
    maxDayLoss: number;
    maxDayGain: number;
    profitableDays: number;
    totalDays: number;
}

export interface BacktestResult {
    trades: BacktestTrade[];
    dayResults: DayResult[];
    monthResults: MonthResult[];
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    grossPnl: number;
    totalBrokerage: number;
    netPnl: number;
    maxDrawdown: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    consecutiveLosses: number;
    allCandles: Candle[];
    signalCandles: { index: number; trade: BacktestTrade }[];
    trainingLogs?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main backtester
// ─────────────────────────────────────────────────────────────────────────────

export async function runBacktest(
    allBaseCandles: Candle[],
    opts: {
        qty: number,
        trainDays?: number,
        preTrainedModel?: string,
        indexType?: 'NIFTY' | 'BANKNIFTY',
        isTraining?: boolean,
        onProgress?: (stage: 'RUNNING' | 'TRAINING', p: number) => void,
        onTrainingDataExtracted?: (trainingData: MLTrainingData[]) => void
    }
): Promise<BacktestResult> {
    if (allBaseCandles.length === 0) {
        return emptyResult(allBaseCandles);
    }

    // 1. Calculate ADR bands & EMAs for the entire dataset upfront
    const allCandles = calculateADRx2(allBaseCandles);

    const allTrades: BacktestTrade[] = [];
    const dayResults: DayResult[] = [];
    const monthResults: MonthResult[] = [];
    const signalCandles: { index: number; trade: BacktestTrade }[] = [];

    // ── Indicator & Backtest Logic ───────────────────────────────────────────
    let activePos: {
        type: 'LONG' | 'SHORT', entryPrice: number, entryIdx: number,
        entryTimeStr: string, signal: string, slPoints: number, targetPoints: number,
        snapshot?: MarketSnapshot, mlConfidence?: number
    } | null = null;
    let currentPlan: TradingPlan | null = null;
    let currentDayStr = '';
    let tradesToday = 0;
    let lastExitIdx = -99;
    // Warmup Day Tracking
    let uniqueDaysPassed = 0;

    // Day tracking
    let dayPnl = 0;
    let dayBrokerage = 0;
    let dayTrades: BacktestTrade[] = [];

    const endOfDay = (dateStr: string) => {
        if (dayTrades.length > 0) {
            dayResults.push({
                date: dateStr,
                trades: [...dayTrades],
                dayPnl,
                dayBrokerage,
                dayNetPnl: dayPnl - dayBrokerage,
                tradesTaken: dayTrades.length,
                stopped: false
            });
        }

        dayTrades = [];
        dayPnl = 0;
        dayBrokerage = 0;
    };

    for (let i = 1; i < allCandles.length; i++) {
        const currentCandle = allCandles[i];
        const dateObj = new Date(currentCandle.time * 1000 + 330 * 60000); // IST Approximation
        const dateStr = dateObj.toISOString().split('T')[0];
        const timeStr = dateObj.toISOString().split('T')[1].slice(0, 5); // HH:MM

        // ── Day Transition ───────────────────────────────────────────
        if (dateStr !== currentDayStr) {
            // Force close any open position at EOD exactly at 15:29 / end of array
            if (activePos) {
                const exitPrice = allCandles[i - 1].close;
                const pnlPts = activePos.type === 'LONG' ? exitPrice - activePos.entryPrice : activePos.entryPrice - exitPrice;
                const pnl = pnlPts * opts.qty;
                const brok = 60 + Math.abs(pnl) * 0.001;

                const tr: BacktestTrade = {
                    id: allTrades.length + 1, date: currentDayStr, entryTime: activePos.entryTimeStr, exitTime: '15:29',
                    entryTimestamp: allCandles[activePos.entryIdx].time, exitTimestamp: allCandles[i - 1].time,
                    type: activePos.type, signal: activePos.signal, entrySpot: activePos.entryPrice, exitSpot: exitPrice,
                    entryIdx: activePos.entryIdx, exitIdx: i - 1, points: pnlPts, qty: opts.qty, pnl, brokerage: brok, netPnl: pnl - brok,
                    exitReason: 'EODCLOSE',
                    snapshot: activePos.snapshot,
                    mlConfidence: activePos.mlConfidence,
                    slPoints: activePos.slPoints,
                    tpPoints: activePos.targetPoints
                };
                allTrades.push(tr);
                dayTrades.push(tr);
                signalCandles.push({ index: activePos.entryIdx, trade: tr });
                dayPnl += pnl;
                dayBrokerage += brok;



                activePos = null;
            }

            if (currentDayStr !== '') {
                endOfDay(currentDayStr);
            }

            currentDayStr = dateStr;
            tradesToday = 0;
            uniqueDaysPassed++;

            uniqueDaysPassed++;

            // Run pre-market analysis
            currentPlan = TradingStrategy.runPreMarketAnalysis(allCandles.slice(0, i));
        }

        // ── Active Position Management ───────────────────────────────
        if (activePos) {
            const isLong = activePos.type === 'LONG';

            // Dynamic Trailing Stop Loss logic for 5-minute trends
            if (isLong) {
                const favorableMove = currentCandle.close - activePos.entryPrice;
                if (favorableMove > activePos.slPoints * 0.75) {
                    // Lock in break-even plus a bit, or trail aggressively
                    const newSlPoints = -favorableMove + (activePos.slPoints * 0.5); // Tighten SL as it moves
                    if (newSlPoints < activePos.slPoints) {
                        activePos.slPoints = newSlPoints;
                    }
                }
            } else {
                const favorableMove = activePos.entryPrice - currentCandle.close;
                if (favorableMove > activePos.slPoints * 0.75) {
                    const newSlPoints = -favorableMove + (activePos.slPoints * 0.5);
                    if (newSlPoints < activePos.slPoints) {
                        activePos.slPoints = newSlPoints;
                    }
                }
            }

            const targetPrice = isLong ? activePos.entryPrice + activePos.targetPoints : activePos.entryPrice - activePos.targetPoints;
            const slPrice = isLong ? activePos.entryPrice - activePos.slPoints : activePos.entryPrice + activePos.slPoints;

            let exitReason: BacktestTrade['exitReason'] | null = null;
            let exitPrice = 0;

            if (isLong) {
                if (currentCandle.high >= targetPrice) { exitReason = 'TARGET'; exitPrice = targetPrice; }
                else if (currentCandle.low <= slPrice) { exitReason = 'SL'; exitPrice = slPrice; }
            } else {
                if (currentCandle.low <= targetPrice) { exitReason = 'TARGET'; exitPrice = targetPrice; }
                else if (currentCandle.high >= slPrice) { exitReason = 'SL'; exitPrice = slPrice; }
            }

            // EOD hard stop
            if (!exitReason && timeStr >= '15:15') { exitReason = 'EODCLOSE'; exitPrice = currentCandle.close; }

            if (exitReason) {
                const pnlPts = isLong ? exitPrice - activePos.entryPrice : activePos.entryPrice - exitPrice;
                const pnl = pnlPts * opts.qty;
                const brok = 60 + Math.abs(pnl) * 0.001;

                const tr: BacktestTrade = {
                    id: allTrades.length + 1, date: currentDayStr, entryTime: activePos.entryTimeStr, exitTime: timeStr,
                    entryTimestamp: allCandles[activePos.entryIdx].time, exitTimestamp: currentCandle.time,
                    type: activePos.type, signal: activePos.signal, entrySpot: activePos.entryPrice, exitSpot: exitPrice,
                    entryIdx: activePos.entryIdx, exitIdx: i, points: pnlPts, qty: opts.qty, pnl, brokerage: brok, netPnl: pnl - brok,
                    exitReason,
                    snapshot: activePos.snapshot,
                    mlConfidence: activePos.mlConfidence,
                    slPoints: activePos.slPoints,
                    tpPoints: activePos.targetPoints
                };
                allTrades.push(tr);
                dayTrades.push(tr);
                signalCandles.push({ index: activePos.entryIdx, trade: tr });
                dayPnl += pnl;
                dayBrokerage += brok;



                activePos = null;
                lastExitIdx = i;
            }
        }

        // ── Signal Generation ─────────────────────────────────────────
        if (!activePos && currentPlan && tradesToday < currentPlan.maxTradesAllowed) {
            // Check max daily loss / profit locks
            const dayNetPnlPts = (dayPnl - dayBrokerage) / opts.qty;
            const hitMaxLoss = dayNetPnlPts <= -currentPlan.maxDailyLossPoints;
            const hitMaxProfit = dayNetPnlPts >= currentPlan.maxDailyProfitPoints;

            // Strategy only considers trades after 9:15 and if daily limits are not hit
            const coolDownOk = (i - lastExitIdx) >= 1; // 1 candle gap (5 minutes) between trades

            if (timeStr >= '09:16' && timeStr <= '15:00' && !hitMaxLoss && !hitMaxProfit && coolDownOk) {
                // LIVE BACKTEST MODE: Let the AI decide and set its own SL/Target
                const signal = TradingStrategy.checkAiSignal(allCandles, i, opts.indexType || 'NIFTY', tradesToday, currentPlan || undefined);

                if (signal.type !== 'NONE') {
                    activePos = {
                        type: signal.type === 'BUY' ? 'LONG' : 'SHORT',
                        entryPrice: currentCandle.close,
                        entryIdx: i,
                        entryTimeStr: timeStr,
                        signal: signal.reason,
                        slPoints: signal.slPoints || 30,
                        targetPoints: signal.targetPoints || 50,
                        snapshot: signal.snapshot as any, // Cast legacy type if needed
                        mlConfidence: signal.strength
                    };
                    tradesToday++;
                }
            }
        }
    }

    if (currentDayStr !== '') {
        endOfDay(currentDayStr);
    }

    // ── Metrics & Reporting ───────────────────────────────────────────────
    const realTrades = allTrades.filter(t => t.qty > 0);
    const wins = realTrades.filter(t => t.netPnl > 0).length;
    const losses_cnt = realTrades.filter(t => t.netPnl <= 0).length;
    const grossPnl = realTrades.reduce((s, t) => s + t.pnl, 0);
    const totalBrok = realTrades.reduce((s, t) => s + t.brokerage, 0);
    const netPnl = realTrades.reduce((s, t) => s + t.netPnl, 0);

    const winPnls = realTrades.filter(t => t.netPnl > 0).map(t => t.netPnl);
    const lossPnls = realTrades.filter(t => t.netPnl <= 0).map(t => t.netPnl);
    const avgWin = winPnls.length ? winPnls.reduce((s, v) => s + v, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length ? lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length : 0;

    // Max drawdown
    let peak = 0, maxDD = 0, running = 0;
    realTrades.forEach(t => {
        running += t.netPnl;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
    });

    const months = [...new Set(dayResults.map(d => d.date.slice(0, 7)))].sort();
    months.forEach(m => {
        const daysInMonth = dayResults.filter(d => d.date.startsWith(m));
        const monthTrades = daysInMonth.flatMap(d => d.trades);
        const mWinds = monthTrades.filter(t => t.netPnl > 0).length;
        const mLosses = monthTrades.filter(t => t.netPnl <= 0).length;
        const mGross = monthTrades.reduce((s, t) => s + t.pnl, 0);
        const mBrok = monthTrades.reduce((s, t) => s + t.brokerage, 0);
        const mNet = monthTrades.reduce((s, t) => s + t.netPnl, 0);

        const date = new Date(m + '-01');
        const label = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        monthResults.push({
            month: m,
            label,
            trades: monthTrades.length,
            wins: mWinds,
            losses: mLosses,
            winRate: monthTrades.length > 0 ? parseFloat(((mWinds / monthTrades.length) * 100).toFixed(1)) : 0,
            grossPnl: mGross,
            brokerage: mBrok,
            netPnl: mNet,
            maxDayLoss: Math.min(0, ...daysInMonth.map(d => d.dayNetPnl)),
            maxDayGain: Math.max(0, ...daysInMonth.map(d => d.dayNetPnl)),
            profitableDays: daysInMonth.filter(d => d.dayNetPnl > 0).length,
            totalDays: daysInMonth.length
        });
    });

    const grossProfit = winPnls.reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(lossPnls.reduce((s, v) => s + v, 0));
    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 999;

    let maxConsec = 0, curConsec = 0;
    realTrades.forEach(t => {
        if (t.netPnl <= 0) { curConsec++; if (curConsec > maxConsec) maxConsec = curConsec; }
        else curConsec = 0;
    });

    let trainingLogs: string[] = [];
    if (opts.isTraining) {
        if (opts.onProgress) opts.onProgress('TRAINING', 0);
        const trainingData: MLTrainingData[] = realTrades
            .filter(t => t.snapshot?.mlFeatures)
            .map(t => ({
                input: t.snapshot!.mlFeatures!,
                output: { success: t.netPnl > 0 ? 1 : 0 },
                meta: { timestamp: t.entryTimestamp }
            }));

        if (trainingData.length > 0) {
            if (opts.onTrainingDataExtracted) {
                // Return data to UI for Human-In-The-Loop review queue
                opts.onTrainingDataExtracted(trainingData);
                trainingLogs.push(`Extracted ${trainingData.length} potential setups for Interactive Review Queue.`);
            } else {
                // Original automatic immediate training
                const stats = aiEngine.trainModel(trainingData);
                trainingLogs.push(`Trained AI Engine on ${trainingData.length} trade samples.`);
                if (stats && stats.error !== undefined) {
                    trainingLogs.push(`Final Neural Net Error: ${stats.error}`);
                    trainingLogs.push(`Epochs (Iterations): ${stats.iterations}`);
                }
            }
        }
        if (opts.onProgress) opts.onProgress('TRAINING', 100);
    }

    return {
        trades: realTrades,
        dayResults,
        monthResults,
        totalTrades: realTrades.length,
        wins,
        losses: losses_cnt,
        winRate: realTrades.length > 0 ? parseFloat(((wins / realTrades.length) * 100).toFixed(1)) : 0,
        grossPnl: parseFloat(grossPnl.toFixed(2)),
        totalBrokerage: parseFloat(totalBrok.toFixed(2)),
        netPnl: parseFloat(netPnl.toFixed(2)),
        maxDrawdown: parseFloat(maxDD.toFixed(2)),
        profitFactor,
        avgWin: parseFloat(avgWin.toFixed(2)),
        avgLoss: parseFloat(avgLoss.toFixed(2)),
        largestWin: winPnls.length ? Math.max(...winPnls) : 0,
        largestLoss: lossPnls.length ? Math.min(...lossPnls) : 0,
        consecutiveLosses: maxConsec,
        allCandles: allCandles as Candle[],
        signalCandles,
        trainingLogs,
    };
}

function emptyResult(candles: Candle[]): BacktestResult {
    return {
        trades: [], dayResults: [], monthResults: [],
        totalTrades: 0, wins: 0, losses: 0, winRate: 0,
        grossPnl: 0, totalBrokerage: 0, netPnl: 0,
        maxDrawdown: 0, profitFactor: 0, avgWin: 0, avgLoss: 0,
        largestWin: 0, largestLoss: 0, consecutiveLosses: 0,
        allCandles: candles, signalCandles: []
    };
}
