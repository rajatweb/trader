/**
 * PDLS-VIX Backtesting Engine
 *
 * Runs the full strategy logic on historical 1-minute candles.
 * Groups by trading day, builds morning context from prior days,
 * then simulates tick-by-tick entry/exit using index-point P&L.
 *
 * P&L = index_points_gained × qty (2 lots × 15 = 30)
 */

import {
    buildMorningContext,
    pdlsVixCheckSignal,
    pdlsVixCheckExit,
    PDLS_CONFIG,
    MorningContext,
    PDLSRiskState,
} from './pdlsVixStrategy';

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
    type: 'LONG' | 'SHORT'; // CE buy or PE buy
    signal: string;         // reason
    entrySpot: number;
    exitSpot: number;
    entryIdx: number;       // candle index in full array
    exitIdx: number;
    points: number;         // index points gained/lost
    qty: number;
    pnl: number;            // points × qty − brokerage
    brokerage: number;
    netPnl: number;
    exitReason: 'TARGET' | 'SL' | 'EODCLOSE' | 'TIME';
    vix: number;
    vixCondition: string;
}

export interface DayResult {
    date: string;
    trades: BacktestTrade[];
    dayPnl: number;
    dayBrokerage: number;
    dayNetPnl: number;
    tradesTaken: number;
    stopped: boolean; // daily loss cap hit
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toDateStr(ts: number): string {
    return new Date(ts * 1000).toISOString().split('T')[0];
}

function toTimeStr(ts: number): string {
    const d = new Date(ts * 1000);
    // IST = UTC+5:30
    const h = String(d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)).padStart(2, '0');
    const m = String((d.getUTCMinutes() + 30) % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function tHHMM(ts: number): string {
    // Returns HH:MM in IST from unix seconds
    const d = new Date(ts * 1000);
    const totalMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + 330; // +330 = IST
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal open-trade tracker type
// ─────────────────────────────────────────────────────────────────────────────

interface OpenTrade {
    entryTime: string;
    entryIdx: number;
    type: 'LONG' | 'SHORT';
    entrySpot: number;
    signal: string;
    targetPoints: number;
    slPoints: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main backtester
// ─────────────────────────────────────────────────────────────────────────────

export function runBacktest(allCandles: Candle[]): BacktestResult {
    if (allCandles.length === 0) {
        return emptyResult(allCandles);
    }

    // Group candles by date
    const dayGroups = new Map<string, { candles: Candle[]; startIdx: number }>();
    allCandles.forEach((c, idx) => {
        const d = toDateStr(c.time);
        if (!dayGroups.has(d)) dayGroups.set(d, { candles: [], startIdx: idx });
        dayGroups.get(d)!.candles.push(c);
    });

    const dates = Array.from(dayGroups.keys()).sort();

    const allTrades: BacktestTrade[] = [];
    const dayResults: DayResult[] = [];
    const signalCandles: { index: number; trade: BacktestTrade }[] = [];
    let tradeId = 1;

    // Build running daily OHLC for context
    const dailyOHLC: Candle[] = [];

    dates.forEach((date, dayIdx) => {
        const { candles } = dayGroups.get(date)!;
        if (candles.length < 10) return; // skip partial days

        // Build synthetic daily bar for this day
        const dayOpen = candles[0].open;
        const dayHigh = Math.max(...candles.map(c => c.high));
        const dayLow = Math.min(...candles.map(c => c.low));
        const dayClose = candles[candles.length - 1].close;

        const thisDayBar: Candle = { time: candles[0].time, open: dayOpen, high: dayHigh, low: dayLow, close: dayClose, volume: 0 };

        // Morning context needs at least 1 previous day
        if (dailyOHLC.length < 1) {
            dailyOHLC.push(thisDayBar);
            return;
        }

        // Use VIX = 14 as historical default (neutral); could be enhanced with actual VIX data
        const vix = 14;
        const vix5dAvg = 14;

        const ctx: MorningContext = buildMorningContext(dailyOHLC, dayOpen, vix, vix5dAvg);
        ctx.adrUsedPercent = 0; // reset at day start

        // Risk state for this day
        const riskState: PDLSRiskState = {
            consecutiveLosses: 0,
            dailyLoss: 0,
            tradeCount: 0,
            tradesToday: 0
        };

        // 15-min range tracking (Opening Range 9:15–9:30)
        let f15High = 0;
        let f15Low = Infinity;
        let f15Done = false;
        // After first trade, OR is cleared so mini-range takes over
        let useOrForEntry = true;

        const dayTrades: BacktestTrade[] = [];
        // eslint-disable-next-line prefer-const
        let openTrade: OpenTrade | null = null;

        let daylyStopped = false;

        candles.forEach((candle, localIdx) => {
            const absIdx = allCandles.indexOf(candle);
            const timeStr = tHHMM(candle.time);

            // Opening Range = the 9:15 FIRST CANDLE only
            // Record it when we see the 9:15 candle, mark done at 9:16
            if (timeStr === '09:15') {
                f15High = candle.high;
                f15Low = candle.low;
            }
            if (timeStr >= '09:16' && !f15Done && f15High > 0) {
                f15Done = true;
                ctx.orHigh = f15High;
                ctx.orLow = f15Low === Infinity ? 0 : f15Low;
            }

            // Update ADR used
            const todayHigh = Math.max(...candles.slice(0, localIdx + 1).map(c => c.high));
            const todayLow = Math.min(...candles.slice(0, localIdx + 1).map(c => c.low));
            ctx.adrUsedPercent = ctx.adr > 0 ? (todayHigh - todayLow) / ctx.adr : 0;

            // ── Exit open trade ─────────────────────────────────────────────
            if (openTrade) {
                const currentSpot = candle.close;
                const decision = pdlsVixCheckExit(
                    openTrade.entrySpot, currentSpot,
                    openTrade.targetPoints, openTrade.slPoints
                );

                // Force close at end of session
                const forceClose = timeStr >= '14:45';
                const shouldClose = decision.shouldClose || forceClose;

                if (shouldClose) {
                    const exitReason: BacktestTrade['exitReason'] = forceClose && !decision.shouldClose
                        ? 'EODCLOSE'
                        : decision.reason.includes('TARGET') ? 'TARGET' : 'SL';

                    const pts = openTrade.type === 'LONG'
                        ? currentSpot - openTrade.entrySpot
                        : openTrade.entrySpot - currentSpot;

                    const qty = PDLS_CONFIG.TOTAL_QTY;
                    const grossPnl = pts * qty;
                    const brokerage = 100; // flat ₹100 per round trip (Dhan zerobrokerage + SEBI charges)
                    const netPnl = grossPnl - brokerage;

                    const trade: BacktestTrade = {
                        id: tradeId++,
                        date,
                        entryTime: openTrade.entryTime,
                        exitTime: timeStr,
                        type: openTrade.type,
                        signal: openTrade.signal,
                        entrySpot: openTrade.entrySpot,
                        exitSpot: currentSpot,
                        entryIdx: openTrade.entryIdx,
                        exitIdx: absIdx,
                        points: parseFloat(pts.toFixed(2)),
                        qty,
                        pnl: parseFloat(grossPnl.toFixed(2)),
                        brokerage,
                        netPnl: parseFloat(netPnl.toFixed(2)),
                        exitReason,
                        vix,
                        vixCondition: ctx.vixCondition
                    };

                    dayTrades.push(trade);
                    allTrades.push(trade);
                    signalCandles.push({ index: openTrade.entryIdx, trade });

                    // After a trade exits, clear the Opening Range so next entry uses
                    // a mini-range (last MINI_RANGE_CANDLES candles) — enables re-entries
                    f15High = 0;
                    f15Low = 0;
                    ctx.orHigh = 0;
                    ctx.orLow = 0;

                    // Update risk state
                    if (netPnl < 0) {
                        riskState.dailyLoss += Math.abs(netPnl);
                        riskState.consecutiveLosses++;
                    } else {
                        riskState.consecutiveLosses = 0;
                    }
                    riskState.tradesToday++;

                    openTrade = null;

                    // Check daily hard stop
                    if (riskState.dailyLoss >= PDLS_CONFIG.MAX_DAILY_LOSS_HARD) {
                        daylyStopped = true;
                    }
                }
                return; // don't check entry while in trade
            }

            if (daylyStopped) return;
            if (timeStr > '14:30') return;
            if (!f15Done) return; // wait for 9:15 candle to complete (9:16+)

            // ── Check for entry signal ──────────────────────────────────────
            const prevCandles = candles.slice(Math.max(0, localIdx - 30), localIdx);
            if (prevCandles.length < 5) return;

            const signal = pdlsVixCheckSignal(
                candle, prevCandles, ctx, riskState,
                f15High, f15Low === Infinity ? 0 : f15Low,
                timeStr  // pass candle's historical IST time
            );

            if (signal.type !== 'NONE') {
                openTrade = {
                    entryTime: timeStr,
                    entryIdx: absIdx,
                    type: signal.type === 'BUY' ? 'LONG' : 'SHORT',
                    entrySpot: candle.close,
                    signal: signal.reason,
                    targetPoints: signal.targetPoints ?? PDLS_CONFIG.TARGET_POINTS,
                    slPoints: signal.slPoints ?? PDLS_CONFIG.SL_POINTS,
                };
            }
        });

        // If trade still open at day end, force close at last candle
        const finalTrade = openTrade as OpenTrade | null;
        if (finalTrade && candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            const absIdx = allCandles.indexOf(lastCandle);
            const pts = finalTrade.type === 'LONG'
                ? lastCandle.close - finalTrade.entrySpot
                : finalTrade.entrySpot - lastCandle.close;
            const qty = PDLS_CONFIG.TOTAL_QTY;
            const grossPnl = pts * qty;
            const brokerage = 100;
            const netPnl = grossPnl - brokerage;

            const trade: BacktestTrade = {
                id: tradeId++, date,
                entryTime: finalTrade.entryTime, exitTime: '14:45',
                type: finalTrade.type, signal: finalTrade.signal,
                entrySpot: finalTrade.entrySpot, exitSpot: lastCandle.close,
                entryIdx: finalTrade.entryIdx, exitIdx: absIdx,
                points: parseFloat(pts.toFixed(2)), qty,
                pnl: parseFloat(grossPnl.toFixed(2)), brokerage,
                netPnl: parseFloat(netPnl.toFixed(2)),
                exitReason: 'EODCLOSE',
                vix, vixCondition: ctx.vixCondition
            };
            dayTrades.push(trade);
            allTrades.push(trade);
            signalCandles.push({ index: finalTrade.entryIdx, trade });
        }

        const dayPnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
        const dayBrok = dayTrades.reduce((s, t) => s + t.brokerage, 0);
        const dayNetPnl = dayTrades.reduce((s, t) => s + t.netPnl, 0);

        dayResults.push({ date, trades: dayTrades, dayPnl, dayBrokerage: dayBrok, dayNetPnl, tradesTaken: dayTrades.length, stopped: daylyStopped });

        // Add this day's OHLC to running list for next day's context
        dailyOHLC.push(thisDayBar);
    });

    // ── Aggregate monthly stats ─────────────────────────────────────────────
    const monthMap = new Map<string, BacktestTrade[]>();
    allTrades.forEach(t => {
        const ym = t.date.slice(0, 7);
        if (!monthMap.has(ym)) monthMap.set(ym, []);
        monthMap.get(ym)!.push(t);
    });

    const monthResults: MonthResult[] = [];
    monthMap.forEach((trades, ym) => {
        const wins = trades.filter(t => t.netPnl > 0).length;
        const losses = trades.filter(t => t.netPnl <= 0).length;
        const grossPnl = trades.reduce((s, t) => s + t.pnl, 0);
        const brokerage = trades.reduce((s, t) => s + t.brokerage, 0);
        const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

        // Get day results for this month
        const monthDays = dayResults.filter(d => d.date.startsWith(ym));
        const profitableDays = monthDays.filter(d => d.dayNetPnl > 0).length;
        const dayPnls = monthDays.map(d => d.dayNetPnl);

        monthResults.push({
            month: ym,
            label: monthLabel(ym),
            trades: trades.length,
            wins, losses,
            winRate: trades.length > 0 ? parseFloat(((wins / trades.length) * 100).toFixed(1)) : 0,
            grossPnl: parseFloat(grossPnl.toFixed(2)),
            brokerage: parseFloat(brokerage.toFixed(2)),
            netPnl: parseFloat(netPnl.toFixed(2)),
            maxDayLoss: dayPnls.length ? Math.min(...dayPnls) : 0,
            maxDayGain: dayPnls.length ? Math.max(...dayPnls) : 0,
            profitableDays,
            totalDays: monthDays.length
        });
    });
    monthResults.sort((a, b) => a.month.localeCompare(b.month));

    // ── Global stats ───────────────────────────────────────────────────────
    const wins = allTrades.filter(t => t.netPnl > 0).length;
    const losses_cnt = allTrades.filter(t => t.netPnl <= 0).length;
    const grossPnl = allTrades.reduce((s, t) => s + t.pnl, 0);
    const totalBrok = allTrades.reduce((s, t) => s + t.brokerage, 0);
    const netPnl = allTrades.reduce((s, t) => s + t.netPnl, 0);

    const winPnls = allTrades.filter(t => t.netPnl > 0).map(t => t.netPnl);
    const lossPnls = allTrades.filter(t => t.netPnl <= 0).map(t => t.netPnl);
    const avgWin = winPnls.length ? winPnls.reduce((s, v) => s + v, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length ? lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length : 0;

    // Max drawdown (peak-to-trough on cumulative netPnl)
    let peak = 0, maxDD = 0, running = 0;
    allTrades.forEach(t => {
        running += t.netPnl;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
    });

    // Profit Factor
    const grossProfit = winPnls.reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(lossPnls.reduce((s, v) => s + v, 0));
    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 999;

    // Max consecutive losses
    let maxConsec = 0, curConsec = 0;
    allTrades.forEach(t => {
        if (t.netPnl <= 0) { curConsec++; if (curConsec > maxConsec) maxConsec = curConsec; }
        else curConsec = 0;
    });

    return {
        trades: allTrades,
        dayResults,
        monthResults,
        totalTrades: allTrades.length,
        wins,
        losses: losses_cnt,
        winRate: allTrades.length > 0 ? parseFloat(((wins / allTrades.length) * 100).toFixed(1)) : 0,
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
        allCandles,
        signalCandles,
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
