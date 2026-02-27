
/**
 * PDLS-VIX Liquidity Reversal Strategy
 * (Previous Day Liquidity Sweep + VIX Confirmation)
 *
 * Instrument: BankNifty Options
 * Mode:       Intraday Option Buying Only
 * Target:     +50 index points (or 1.5R = ~45 pts based on 30pt SL)
 * SL:         30 index points (hard)
 * Lots:       2 lots fixed
 * Daily Risk: Stop at ₹6,000 loss  |  Stop after 3 consecutive losses  |  Max 4 trades/day
 *
 * Philosophy:
 *  1. Market builds LIQUIDITY at Prior Day High / Low / Swing levels
 *  2. Retail traders chase breakouts → Smart Money hunts their stops
 *  3. After the sweep, a sharp REVERSAL + EXPANSION occurs
 *  4. We enter ATM option after rejection candle + VIX confirmation
 */

import { AlgoSignal, TradingZone } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DayType =
    | 'TREND_UP'
    | 'TREND_DOWN'
    | 'INSIDE_DAY'
    | 'EXPANSION'
    | 'FAKE_BREAKOUT'
    | 'VIX_SPIKE'
    | 'UNKNOWN';

export interface DaySummary {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    range: number;
    dayType: DayType;
}

export interface MorningContext {
    pdh: number;               // Previous Day High
    pdl: number;               // Previous Day Low
    pdc: number;               // Previous Day Close
    adr: number;               // Average Daily Range (10-day)
    swingHigh: number;         // Multi-day swing high
    swingLow: number;          // Multi-day swing low
    equalHighs: number[];      // Clusters of equal HH
    equalLows: number[];       // Clusters of equal LL
    dayHistory: DaySummary[];  // Last 10 days
    bias: 'REVERSAL' | 'CONTINUATION' | 'NEUTRAL';
    vixCondition: 'GOOD' | 'AVOID' | 'NEUTRAL';
    vix: number;               // Last known VIX value
    vix5dAvg: number;          // 5-day average VIX
    adrUsedPercent: number;    // How much of today's ADR is already consumed
    openingGapType: 'GAP_UP' | 'GAP_DOWN' | 'FLAT';
    openingGapPoints: number;
}

export interface PDLSRiskState {
    consecutiveLosses: number;
    dailyLoss: number;
    tradeCount: number;
    tradesToday: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_POINTS = 50;         // Fixed option-points target
const SL_POINTS = 30;             // Fixed option-points SL
const R_BASED_TARGET = SL_POINTS * 1.5; // 1.5R = 45 pts  → use whichever is higher or lower dynamically
const TRAIL_TO_COST_AT = 25;      // Trail SL to breakeven when +25 pts profit
const MAX_DAILY_LOSS_HARD = 10000; // Hard daily stop in ₹
const MAX_DAILY_LOSS_SOFT = 6000;  // Soft daily stop in ₹ (warn + stop)
const MAX_CONSECUTIVE_LOSSES = 3;
const MAX_TRADES_PER_DAY = 4;
const LOTS = 2;
const LOT_SIZE = 15;              // BankNifty lot size
const TOTAL_QTY = LOTS * LOT_SIZE; // 30

// Time filters: Only trade in these windows
const SESSION_1_START = '09:30';
const SESSION_1_END = '11:30';
const SESSION_2_START = '13:30';
const SESSION_2_END = '14:45';
const NO_TRADE_BEFORE = '09:15';  // Warmup only

// ADR % usage filter – if market has moved more than this, skip
const ADR_MAX_USED_PCT = 0.80;

// ─────────────────────────────────────────────────────────────────────────────
// VIX Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify India VIX for option buying suitability.
 * We expose a simple interface: caller provides current VIX and 5d average.
 */
export function classifyVIX(vix: number, vix5dAvg: number): 'GOOD' | 'AVOID' | 'NEUTRAL' {
    if (vix > 25) return 'AVOID';  // Extreme VIX → premium decay risk
    if (vix < 10) return 'AVOID';  // Too flat → no premium movement
    if (vix >= vix5dAvg * 1.03) return 'GOOD';   // VIX rising → expansion
    if (vix <= vix5dAvg * 0.97) return 'AVOID';  // VIX falling sharply
    return 'NEUTRAL';
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyDay(
    open: number,
    high: number,
    low: number,
    close: number,
    prevHigh: number,
    prevLow: number,
    adr: number,
    vix: number
): DayType {
    const range = high - low;
    const isInsideDay = high <= prevHigh && low >= prevLow;
    const isExpansion = range > adr * 1.3;
    const brokeHigh = high > prevHigh;
    const brokeLow = low < prevLow;
    const closedBackInside = brokeHigh && close < prevHigh || brokeLow && close > prevLow;

    if (vix > 20) return 'VIX_SPIKE';
    if (isInsideDay) return 'INSIDE_DAY';
    if (isExpansion) return 'EXPANSION';
    if (closedBackInside) return 'FAKE_BREAKOUT';
    if (close > open + adr * 0.5) return 'TREND_UP';
    if (close < open - adr * 0.5) return 'TREND_DOWN';
    return 'UNKNOWN';
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning Warmup Engine: Build MorningContext from 10 days of OHLC candles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call once before market opens (or at 9:15 on first tick).
 * @param candles  Full daily candles array (15m candles or 1D candles both work)
 * @param todayOpen  Today's opening price (from first 1m candle)
 * @param vix        Current India VIX value
 * @param vix5dAvg   5-day average of India VIX
 */
export function buildMorningContext(
    candles: any[],
    todayOpen: number,
    vix: number,
    vix5dAvg: number
): MorningContext {
    // Group by day
    const dayMap = new Map<string, any[]>();
    candles.forEach(c => {
        let ts = c.time || c.start_Time || c.start_time || c.timestamp;
        if (!ts) return;
        if (ts > 20000000000) ts = ts / 1000;
        try {
            const date = new Date(ts * 1000).toISOString().split('T')[0];
            if (!dayMap.has(date)) dayMap.set(date, []);
            dayMap.get(date)!.push(c);
        } catch { /* ignore */ }
    });

    const dates = Array.from(dayMap.keys()).sort();
    const today = new Date().toISOString().split('T')[0];
    // Strip today from history so we only look at completed days
    const histDates = dates.filter(d => d < today).slice(-10);

    if (histDates.length < 2) {
        // Not enough data – return minimal context
        return {
            pdh: 0, pdl: 0, pdc: 0, adr: 0,
            swingHigh: 0, swingLow: 0, equalHighs: [], equalLows: [],
            dayHistory: [], bias: 'NEUTRAL', vixCondition: 'NEUTRAL',
            vix, vix5dAvg,
            adrUsedPercent: 0,
            openingGapType: 'FLAT', openingGapPoints: 0
        };
    }

    // Build daily summaries
    let totalRange = 0;
    const daySummaries: DaySummary[] = [];
    let prevHigh = 0, prevLow = Infinity;

    histDates.forEach((date, i) => {
        const dc = dayMap.get(date)!;
        const open = dc[0].open;
        const close = dc[dc.length - 1].close;
        const high = Math.max(...dc.map((c: any) => c.high));
        const low = Math.min(...dc.map((c: any) => c.low));
        const range = high - low;
        totalRange += range;

        const adrSoFar = i > 0 ? totalRange / i : range;
        const dt = classifyDay(open, high, low, close, prevHigh, prevLow > 1e10 ? high : prevLow, adrSoFar, vix);

        daySummaries.push({ date, open, high, low, close, range, dayType: dt });
        prevHigh = high;
        prevLow = low;
    });

    const adr = totalRange / histDates.length;

    // Previous Day (last in history)
    const pd = daySummaries[daySummaries.length - 1];

    // Swing High/Low over last 5 days
    const last5 = daySummaries.slice(-5);
    const swingHigh = Math.max(...last5.map(d => d.high));
    const swingLow = Math.min(...last5.map(d => d.low));

    // Equal Highs/Lows: cluster levels where price touched within 0.1%
    const tolerance = pd.high * 0.001;
    const equalHighs = last5
        .map(d => d.high)
        .filter((h, _, arr) => arr.filter(x => Math.abs(x - h) < tolerance).length >= 2);
    const equalLows = last5
        .map(d => d.low)
        .filter((h, _, arr) => arr.filter(x => Math.abs(x - h) < tolerance).length >= 2);

    // Bias: How many fake breakout / reversal days in history?
    const fakeBreakouts = daySummaries.filter(d => d.dayType === 'FAKE_BREAKOUT').length;
    const trends = daySummaries.filter(d => d.dayType === 'TREND_UP' || d.dayType === 'TREND_DOWN').length;
    const bias = fakeBreakouts >= 3 ? 'REVERSAL' : trends >= 5 ? 'CONTINUATION' : 'NEUTRAL';

    // VIX condition
    const vixCondition = classifyVIX(vix, vix5dAvg);

    // ADR consumed today (if we have today's candles)
    const todayCandles = dayMap.get(today) ?? [];
    let adrUsedPercent = 0;
    if (todayCandles.length > 0 && adr > 0) {
        const todayHigh = Math.max(...todayCandles.map((c: any) => c.high));
        const todayLow = Math.min(...todayCandles.map((c: any) => c.low));
        adrUsedPercent = (todayHigh - todayLow) / adr;
    }

    // Opening gap
    const gapPoints = todayOpen - pd.close;
    const openingGapType: 'GAP_UP' | 'GAP_DOWN' | 'FLAT' =
        gapPoints > 50 ? 'GAP_UP' : gapPoints < -50 ? 'GAP_DOWN' : 'FLAT';

    return {
        pdh: pd.high, pdl: pd.low, pdc: pd.close, adr,
        swingHigh, swingLow, equalHighs, equalLows,
        dayHistory: daySummaries, bias, vixCondition,
        vix, vix5dAvg, adrUsedPercent,
        openingGapType, openingGapPoints: Math.abs(gapPoints)
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if candle is a strong rejection (long wick, small body).
 * barsToCheck = look back N candles for the sweep.
 */
function isRejectionCandle(candle: any): boolean {
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;
    if (totalRange === 0) return false;

    // Rejection if wick is at least 2x the body and > 30% of range
    const dominantWick = Math.max(upperWick, lowerWick);
    return dominantWick > body * 2 && dominantWick / totalRange > 0.3;
}

/**
 * Average volume of last N candles.
 */
function avgVolume(candles: any[], n = 20): number {
    const slice = candles.slice(-n);
    if (!slice.length) return 0;
    return slice.reduce((s, c) => s + (c.volume || 0), 0) / slice.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeStr(date: Date): string {
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

function inSession(now: string): boolean {
    return (now >= SESSION_1_START && now <= SESSION_1_END) ||
        (now >= SESSION_2_START && now <= SESSION_2_END);
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Guards
// ─────────────────────────────────────────────────────────────────────────────

export function shouldStopTrading(risk: PDLSRiskState): { stop: boolean; reason: string } {
    if (risk.dailyLoss >= MAX_DAILY_LOSS_HARD)
        return { stop: true, reason: `Daily hard loss cap ₹${MAX_DAILY_LOSS_HARD} hit` };
    if (risk.dailyLoss >= MAX_DAILY_LOSS_SOFT)
        return { stop: true, reason: `Daily soft loss cap ₹${MAX_DAILY_LOSS_SOFT} hit` };
    if (risk.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES)
        return { stop: true, reason: `${MAX_CONSECUTIVE_LOSSES} consecutive losses – system paused` };
    if (risk.tradesToday >= MAX_TRADES_PER_DAY)
        return { stop: true, reason: `Max ${MAX_TRADES_PER_DAY} trades/day reached` };
    return { stop: false, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SIGNAL ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main signal checker for PDLS-VIX strategy.
 * Called every 3s by the runner.
 * Returns an AlgoSignal with targetPoints/slPoints set in index-point terms.
 */
export function pdlsVixCheckSignal(
    currentCandle: any,
    prevCandles: any[],
    ctx: MorningContext,
    risk: PDLSRiskState,
    first15MinHigh: number,
    first15MinLow: number
): AlgoSignal {
    const NONE: AlgoSignal = { type: 'NONE', price: 0, symbol: '', reason: 'Waiting', strength: 0, timestamp: Date.now() };

    if (!currentCandle || prevCandles.length < 5) return NONE;

    const now = timeStr(new Date());

    // ── Guard: too early
    if (now < NO_TRADE_BEFORE) return { ...NONE, reason: `Warmup period – no trade before ${NO_TRADE_BEFORE}` };

    // ── Guard: not in allowed session windows
    if (!inSession(now)) return { ...NONE, reason: 'Outside trading window (9:30–11:30 or 13:30–14:45)' };

    // ── Guard: risk limits
    const { stop, reason: stopReason } = shouldStopTrading(risk);
    if (stop) return { ...NONE, reason: stopReason };

    // ── Guard: VIX must be GOOD or NEUTRAL (not AVOID)
    const vixOk = (ctx.vixCondition as string) !== 'AVOID';
    if (!vixOk) return { ...NONE, reason: `VIX condition AVOID (VIX: ${ctx.vix.toFixed(1)})` };

    // ── Guard: if >80% of ADR already consumed, skip
    if (ctx.adrUsedPercent >= ADR_MAX_USED_PCT)
        return { ...NONE, reason: `ADR ${(ctx.adrUsedPercent * 100).toFixed(0)}% consumed – no new entries` };

    const ltp = currentCandle.close;
    const vol = currentCandle.volume || 0;
    const avgVol = avgVolume(prevCandles);
    const volumeExpanded = avgVol > 0 && vol > avgVol * 1.3;
    const rejection = isRejectionCandle(currentCandle);

    // ── SETUP 1: PDH Liquidity Sweep → Short (buy PE)
    // Price broke PDH high, then rejected back below it
    const recentHigh = Math.max(...prevCandles.slice(-5).map(c => c.high));
    if (
        recentHigh > ctx.pdh &&         // Price poked above PDH (sweep)
        ltp < ctx.pdh &&                // Close is back below PDH (rejection)
        rejection &&                    // Rejection candle confirmed
        volumeExpanded                  // Volume spike
    ) {
        const tp = ltp + TARGET_POINTS; // Buy PE → target = ATM PE + 50pts
        const sl = ltp - SL_POINTS;
        return {
            type: 'SELL',
            price: ltp,
            symbol: 'INDEX',
            reason: `PDH Liquidity Sweep Reversal – selling at ${ctx.pdh} rejection. ${ctx.vixCondition === 'GOOD' ? '⚡VIX rising' : ''}`,
            strength: ctx.vixCondition === 'GOOD' ? 0.95 : 0.82,
            timestamp: Date.now(),
            targetPoints: TARGET_POINTS,
            slPoints: SL_POINTS
        };
    }

    // ── SETUP 1B: PDL Liquidity Sweep → Long (buy CE)
    const recentLow = Math.min(...prevCandles.slice(-5).map(c => c.low));
    if (
        recentLow < ctx.pdl &&          // Price swept below PDL
        ltp > ctx.pdl &&                // Closed back above PDL
        rejection &&
        volumeExpanded
    ) {
        return {
            type: 'BUY',
            price: ltp,
            symbol: 'INDEX',
            reason: `PDL Liquidity Sweep Reversal – buying at ${ctx.pdl} rejection. ${ctx.vixCondition === 'GOOD' ? '⚡VIX rising' : ''}`,
            strength: ctx.vixCondition === 'GOOD' ? 0.95 : 0.82,
            timestamp: Date.now(),
            targetPoints: TARGET_POINTS,
            slPoints: SL_POINTS
        };
    }

    // ── SETUP 2: Opening Trap (Gap Up Fails → PE)
    if (ctx.openingGapType === 'GAP_UP' && first15MinHigh > 0) {
        if (ltp < first15MinLow) {
            return {
                type: 'SELL',
                price: ltp,
                symbol: 'INDEX',
                reason: `Opening Trap: Gap-Up failed. 15m low broken at ${first15MinLow.toFixed(0)}`,
                strength: 0.88,
                timestamp: Date.now(),
                targetPoints: TARGET_POINTS,
                slPoints: SL_POINTS
            };
        }
    }

    // ── SETUP 2B: Gap Down Fails → CE
    if (ctx.openingGapType === 'GAP_DOWN' && first15MinLow > 0) {
        if (ltp > first15MinHigh) {
            return {
                type: 'BUY',
                price: ltp,
                symbol: 'INDEX',
                reason: `Opening Trap: Gap-Down failed. 15m high reclaimed at ${first15MinHigh.toFixed(0)}`,
                strength: 0.88,
                timestamp: Date.now(),
                targetPoints: TARGET_POINTS,
                slPoints: SL_POINTS
            };
        }
    }

    // ── SETUP 3: Swing Level Reversal (Beyond PDL/PDH, at multi-day Swing)
    if (
        recentLow < ctx.swingLow &&
        ltp > ctx.swingLow &&
        rejection
    ) {
        return {
            type: 'BUY',
            price: ltp,
            symbol: 'INDEX',
            reason: `Swing Low Reversal at ${ctx.swingLow.toFixed(0)} – strong rejection`,
            strength: 0.90,
            timestamp: Date.now(),
            targetPoints: Math.max(TARGET_POINTS, Math.round(R_BASED_TARGET)),
            slPoints: SL_POINTS
        };
    }

    if (
        recentHigh > ctx.swingHigh &&
        ltp < ctx.swingHigh &&
        rejection
    ) {
        return {
            type: 'SELL',
            price: ltp,
            symbol: 'INDEX',
            reason: `Swing High Reversal at ${ctx.swingHigh.toFixed(0)} – strong rejection`,
            strength: 0.90,
            timestamp: Date.now(),
            targetPoints: Math.max(TARGET_POINTS, Math.round(R_BASED_TARGET)),
            slPoints: SL_POINTS
        };
    }

    return NONE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exit Logic: Called every tick for open positions  
// Returns whether we should close, and why
// ─────────────────────────────────────────────────────────────────────────────

export interface ExitDecision {
    shouldClose: boolean;
    reason: string;
    trail?: boolean;   // Trail SL to cost
}

/**
 * Checks if an open position should be closed based on fixed-point rules.
 * 
 * @param optionEntryPrice  Price AT WHICH the option was bought
 * @param optionCurrentPrice Current option LTP
 * @param targetPoints      Points to add over entry price for target
 * @param slPoints          Points to deduct from entry for SL
 */
export function pdlsVixCheckExit(
    optionEntryPrice: number,
    optionCurrentPrice: number,
    targetPoints: number = TARGET_POINTS,
    slPoints: number = SL_POINTS
): ExitDecision {
    const profit = optionCurrentPrice - optionEntryPrice;
    const target = optionEntryPrice + targetPoints;
    const sl = optionEntryPrice - slPoints;

    if (optionCurrentPrice >= target) {
        return { shouldClose: true, reason: `Target +${targetPoints}pts hit (₹${optionCurrentPrice.toFixed(1)})` };
    }
    if (optionCurrentPrice <= sl) {
        return { shouldClose: true, reason: `SL -${slPoints}pts triggered (₹${optionCurrentPrice.toFixed(1)})` };
    }
    if (profit >= TRAIL_TO_COST_AT) {
        // Positive – trail SL to entry price (breakeven protection)
        return { shouldClose: false, reason: `${TRAIL_TO_COST_AT}pt profit – trailing SL to cost`, trail: true };
    }

    return { shouldClose: false, reason: 'Holding' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone Builder for PDLS (used by identifyZones in UI)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPDLSZones(ctx: MorningContext): (TradingZone & { metadata?: any })[] {
    const meta = { pdh: ctx.pdh, pdl: ctx.pdl, adr: ctx.adr, bias: ctx.bias, vixCondition: ctx.vixCondition };

    const zones: (TradingZone & { metadata?: any })[] = [
        { price: ctx.pdh, type: 'RESISTANCE', strength: 1.0, description: 'PDH', metadata: meta },
        { price: ctx.pdl, type: 'SUPPORT', strength: 1.0, description: 'PDL', metadata: meta },
        { price: ctx.pdc, type: 'PIVOT', strength: 0.6, description: 'PDC' },
        { price: ctx.swingHigh, type: 'RESISTANCE', strength: 1.2, description: 'Swing High' },
        { price: ctx.swingLow, type: 'SUPPORT', strength: 1.2, description: 'Swing Low' },
    ];

    // Liquidity clusters (retail SL zones)
    const buf = ctx.pdh * 0.0005;
    zones.push({ price: ctx.pdh + buf, type: 'RESISTANCE', strength: 0.5, description: 'Retail SL Above PDH' });
    zones.push({ price: ctx.pdl - buf, type: 'SUPPORT', strength: 0.5, description: 'Retail SL Below PDL' });

    // Equal Highs / Lows levels
    ctx.equalHighs.forEach(h => zones.push({ price: h, type: 'RESISTANCE', strength: 0.7, description: 'Equal Highs' }));
    ctx.equalLows.forEach(l => zones.push({ price: l, type: 'SUPPORT', strength: 0.7, description: 'Equal Lows' }));

    return zones;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants export (for UI display)
// ─────────────────────────────────────────────────────────────────────────────

export const PDLS_CONFIG = {
    TARGET_POINTS,
    SL_POINTS,
    R_BASED_TARGET,
    TRAIL_TO_COST_AT,
    TOTAL_QTY,
    LOTS,
    LOT_SIZE,
    MAX_DAILY_LOSS_HARD,
    MAX_DAILY_LOSS_SOFT,
    MAX_CONSECUTIVE_LOSSES,
    MAX_TRADES_PER_DAY,
    SESSION_1_START,
    SESSION_1_END,
    SESSION_2_START,
    SESSION_2_END,
};
