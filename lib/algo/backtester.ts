/**
 * Zenith Algo Backtesting Engine
 *
 * Runs the custom indicator simulation logic on historical candles.
 */

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
}


// ─────────────────────────────────────────────────────────────────────────────
// Main backtester
// ─────────────────────────────────────────────────────────────────────────────

export function runBacktest(allCandles: Candle[]): BacktestResult {
    if (allCandles.length === 0) {
        return emptyResult(allCandles);
    }

    const allTrades: BacktestTrade[] = [];
    const dayResults: DayResult[] = [];
    const monthResults: MonthResult[] = [];
    const signalCandles: { index: number; trade: BacktestTrade }[] = [];

    // ── Indicator & Backtest Logic ───────────────────────────────────────────
    // [INDICATOR_CODE_WILL_GO_HERE]


    // ── Global stats evaluation ──────────────────────────────────────────────
    const wins = allTrades.filter(t => t.netPnl > 0).length;
    const losses_cnt = allTrades.filter(t => t.netPnl <= 0).length;
    const grossPnl = allTrades.reduce((s, t) => s + t.pnl, 0);
    const totalBrok = allTrades.reduce((s, t) => s + t.brokerage, 0);
    const netPnl = allTrades.reduce((s, t) => s + t.netPnl, 0);

    const winPnls = allTrades.filter(t => t.netPnl > 0).map(t => t.netPnl);
    const lossPnls = allTrades.filter(t => t.netPnl <= 0).map(t => t.netPnl);
    const avgWin = winPnls.length ? winPnls.reduce((s, v) => s + v, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length ? lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length : 0;

    // Max drawdown
    let peak = 0, maxDD = 0, running = 0;
    allTrades.forEach(t => {
        running += t.netPnl;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
    });

    const grossProfit = winPnls.reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(lossPnls.reduce((s, v) => s + v, 0));
    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 999;

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
