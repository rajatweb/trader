/**
 * MORNING MOMENTUM STRATEGY  (Hunting Trader 2.0)
 * ─────────────────────────────────────────────────
 *
 * PHILOSOPHY:
 *   Market sentiment is CONTRARIAN to the previous day.
 *
 *   Prev day BEARISH (close < open)  → Today plan BUY CE (bullish)
 *   Prev day BULLISH (close > open)  → Today plan BUY PE (bearish)
 *
 * OPENING SCENARIOS:
 *   Case A — Opens BELOW prev close (gap down / weak open):
 *     → Confirms negative sentiment
 *     → Plan BUY CE (counter to the open weakness)
 *     → Wait for Opening Range High (ORH) to BREAK → Enter CE → 50 pts
 *     → After exit, wait for next mini-range to form → same trigger
 *     → Multiple trades possible
 *
 *   Case B — Opens ABOVE prev close (gap up / strong open):
 *     → Confirms positive sentiment
 *     → Plan BUY PE (counter to the open strength)
 *     → Wait for Opening Range Low (ORL) or first candle LOW to BREAK → Enter PE → 50 pts
 *     → After exit, wait for next mini-range → same setup again
 *
 * RANGE FORMATION:
 *   Opening Range  = 9:15–9:30 candles (first 15 mins)
 *   Mini-Range     = last 5–10 candles after any exit (re-entry opportunity)
 *
 * TRADE RULES:
 *   Entry  : Range Break in planned direction (CE = break above range high, PE = break below range low)
 *   Target : 50 index points
 *   SL     : Opposite side of the range (structure SL), hard cap 30 pts
 *   Lots   : 2 lots × 15 qty = 30 qty
 *   Daily  : Max 4 trades, stop after ₹6000 loss or 2 consecutive losses
 *   Time   : 9:30 AM – 2:30 PM (multiple setups through the day)
 */

import { AlgoSignal, TradingZone } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DayType =
    | 'TREND_UP'        // Close > Open + significant range
    | 'TREND_DOWN'      // Close < Open + significant range
    | 'INSIDE_DAY'      // Small body, indecision
    | 'EXPANSION'       // Very large range
    | 'FAKE_BREAKOUT'   // Poked high/low but reversed
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
    // Previous day key levels
    pdh: number;      // Previous Day High
    pdl: number;      // Previous Day Low
    pdc: number;      // Previous Day Close
    pdo: number;      // Previous Day Open

    // ADR (Average Daily Range last 10 days)
    adr: number;

    // Swing structure
    swingHigh: number;
    swingLow: number;
    equalHighs: number[];
    equalLows: number[];

    dayHistory: DaySummary[];

    // ── MORNING MOMENTUM CORE ─────────────────────────────────────────────
    // What was previous day's behavior?
    prevDayBullish: boolean;   // prev day close > prev day open

    // Today's opening gap
    openingGapType: 'GAP_UP' | 'GAP_DOWN' | 'FLAT';
    openingGapPoints: number;

    // THE PLAN (set at 9:15, never changes during the day)
    daySentiment: 'BULLISH' | 'BEARISH';  // Our contrarian plan for the day
    plannedTrade: 'BUY_CE' | 'BUY_PE';   // What option we buy on range break
    plan: string;                  // Human-readable plan description

    // Opening Range (9:15–9:30) — set once, used for first entry
    orHigh: number;  // Opening Range High
    orLow: number;  // Opening Range Low

    // Meta
    bias: 'REVERSAL' | 'CONTINUATION' | 'NEUTRAL';
    vixCondition: 'GOOD' | 'AVOID' | 'NEUTRAL';
    vix: number;
    vix5dAvg: number;
    adrUsedPercent: number;
}

export interface PDLSRiskState {
    consecutiveLosses: number;
    dailyLoss: number;
    tradeCount: number;
    tradesToday: number;
}

export interface ExitDecision {
    shouldClose: boolean;
    reason: string;
    trail?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_POINTS = 50;
const SL_POINTS = 30;       // Hard cap
const TRAIL_TO_COST_AT = 25;       // Move SL to breakeven at +25 pts
const MAX_DAILY_LOSS_HARD = 10000;
const MAX_DAILY_LOSS_SOFT = 6000;
const MAX_CONSECUTIVE_LOSSES = 2;
const MAX_TRADES_PER_DAY = 4;        // Multiple setups through the day
const LOTS = 2;
const LOT_SIZE = 15;
const TOTAL_QTY = LOTS * LOT_SIZE; // 30

// Time windows
const OR_START = '09:15';   // Opening Range = just the FIRST candle (9:15)
const OR_END = '09:16';   // 1-minute candle is the range — done at 9:16
const TRADE_START = '09:16';   // Entry fires at 9:16 the instant 9:15 candle breaks
const TRADE_END = '14:30';   // Last entry
const FORCE_CLOSE = '14:45';   // Force close all

// Range Break settings
const BREAKOUT_BUFFER = 3;   // Price must close N pts BEYOND range to confirm break
const MINI_RANGE_CANDLES = 7;   // After a trade exits, how many candles to use as new range
const MIN_RANGE_SIZE = 20;  // Ignore tiny ranges (< 20 pts) – not meaningful

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function timeStr(d: Date): string {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function inTradingHours(t: string): boolean {
    return t >= TRADE_START && t <= TRADE_END;
}

function avgVol(candles: any[], n = 10): number {
    const s = candles.slice(-n);
    if (s.length === 0) return 0;
    return s.reduce((acc: number, c: any) => acc + (c.volume || 0), 0) / s.length;
}

function classifyDay(open: number, high: number, low: number, close: number): DayType {
    const range = high - low;
    const body = Math.abs(close - open);
    const bodyPct = range > 0 ? body / range : 0;
    if (bodyPct < 0.25) return 'INSIDE_DAY';
    if (close > open && bodyPct > 0.5) return 'TREND_UP';
    if (close < open && bodyPct > 0.5) return 'TREND_DOWN';
    if (range > open * 0.013) return 'EXPANSION';
    return 'UNKNOWN';
}

export function classifyVIX(vix: number, vix5dAvg: number): 'GOOD' | 'AVOID' | 'NEUTRAL' {
    if (vix > 25) return 'AVOID';
    if (vix < 10) return 'AVOID';
    if (vix >= vix5dAvg * 1.02) return 'GOOD';
    if (vix <= vix5dAvg * 0.97) return 'NEUTRAL';
    return 'NEUTRAL';
}

export function shouldStopTrading(risk: PDLSRiskState): { stop: boolean; reason: string } {
    if (risk.dailyLoss >= MAX_DAILY_LOSS_HARD)
        return { stop: true, reason: `Hard daily loss ₹${MAX_DAILY_LOSS_HARD} hit` };
    if (risk.dailyLoss >= MAX_DAILY_LOSS_SOFT)
        return { stop: true, reason: `Daily loss ₹${MAX_DAILY_LOSS_SOFT} reached – soft stop` };
    if (risk.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES)
        return { stop: true, reason: `${MAX_CONSECUTIVE_LOSSES} consecutive losses – stopped for today` };
    if (risk.tradesToday >= MAX_TRADES_PER_DAY)
        return { stop: true, reason: `Max ${MAX_TRADES_PER_DAY} trades/day taken` };
    return { stop: false, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Morning Context  (called ONCE at or before 9:15)
// ─────────────────────────────────────────────────────────────────────────────

export function buildMorningContext(
    dailyCandles: any[],
    todayOpen: number,
    vix: number,
    vix5dAvg: number
): MorningContext {
    const fallback: MorningContext = {
        pdh: todayOpen + 200, pdl: todayOpen - 200, pdc: todayOpen, pdo: todayOpen,
        adr: 400, swingHigh: todayOpen + 400, swingLow: todayOpen - 400,
        equalHighs: [], equalLows: [], dayHistory: [],
        prevDayBullish: false,
        openingGapType: 'FLAT', openingGapPoints: 0,
        daySentiment: 'BULLISH', plannedTrade: 'BUY_CE',
        plan: 'No prior data – defaulting to BUY CE on range break',
        orHigh: 0, orLow: 0,
        bias: 'NEUTRAL', vixCondition: classifyVIX(vix, vix5dAvg),
        vix, vix5dAvg, adrUsedPercent: 0,
    };

    if (dailyCandles.length === 0) return fallback;

    const prev = dailyCandles[dailyCandles.length - 1];
    const pdh = prev.high;
    const pdl = prev.low;
    const pdc = prev.close;
    const pdo = prev.open;

    // ADR from last 10 days
    const lookback = dailyCandles.slice(-10);
    const adr = lookback.reduce((s: number, d: any) => s + (d.high - d.low), 0) / lookback.length;

    // Swing levels (last 5 days)
    const last5 = dailyCandles.slice(-5);
    const swingHigh = Math.max(...last5.map((d: any) => d.high));
    const swingLow = Math.min(...last5.map((d: any) => d.low));

    // Day history
    const dayHistory: DaySummary[] = dailyCandles.slice(-10).map((d: any) => ({
        date: new Date(d.time * 1000).toISOString().split('T')[0],
        open: d.open, high: d.high, low: d.low, close: d.close,
        range: d.high - d.low,
        dayType: classifyDay(d.open, d.high, d.low, d.close),
    }));

    // ── STEP 1: Was previous day bullish or bearish? ───────────────────────
    const prevDayBullish = pdc > pdo;

    // ── STEP 2: Opening gap ───────────────────────────────────────────────
    const gapPts = todayOpen - pdc;
    const openingGapType: MorningContext['openingGapType'] =
        gapPts > adr * 0.04 ? 'GAP_UP' :
            gapPts < -adr * 0.04 ? 'GAP_DOWN' : 'FLAT';

    // ── STEP 3: Determine today's sentiment (CONTRARIAN to prev day) ───────
    //
    //  Prev day BULLISH → Today we look for BEARISH opportunities → BUY PE
    //  Prev day BEARISH → Today we look for BULLISH opportunities → BUY CE
    //
    //  Opening gap REINFORCES the plan:
    //    Opens below prev close (gap down) + prev day bullish → 
    //      Weakness in morning → strong bounce likely → BUY CE
    //    Opens above prev close (gap up) + prev day bearish → 
    //      Strength in morning → smart money distributes → BUY PE
    //
    let daySentiment: MorningContext['daySentiment'];
    let plannedTrade: MorningContext['plannedTrade'];
    let planDesc: string;

    if (prevDayBullish) {
        // Yesterday was GREEN → Today plan is SHORT (PE)
        daySentiment = 'BEARISH';
        plannedTrade = 'BUY_PE';
        if (openingGapType === 'GAP_UP') {
            planDesc = `⚡ Prev day BULLISH + Gap Up → Retail excited, smart money distributing. Wait for first candle LOW or range LOW break → BUY PE (50pt target)`;
        } else if (openingGapType === 'GAP_DOWN') {
            planDesc = `⚡ Prev day BULLISH + Gap Down → Selling continues. Wait for any bounce and range HIGH FAILURE (first candle high break + rejection) → BUY PE`;
        } else {
            planDesc = `⚡ Prev day BULLISH + Flat open → Wait for range to form (9:15–9:30), then range LOW break → BUY PE`;
        }
    } else {
        // Yesterday was RED → Today plan is LONG (CE)
        daySentiment = 'BULLISH';
        plannedTrade = 'BUY_CE';
        if (openingGapType === 'GAP_DOWN') {
            planDesc = `⚡ Prev day BEARISH + Gap Down → Pessimism at peak, smart money accumulating. Wait for range HIGH break → BUY CE (50pt target)`;
        } else if (openingGapType === 'GAP_UP') {
            planDesc = `⚡ Prev day BEARISH + Gap Up → Strong reversal possibility. Wait for range HIGH break confirmation → BUY CE`;
        } else {
            planDesc = `⚡ Prev day BEARISH + Flat open → Wait for range (9:15–9:30), then range HIGH break → BUY CE`;
        }
    }

    // VIX override
    const vixCondition = classifyVIX(vix, vix5dAvg);

    // Equal levels
    const tol = pdh * 0.001;
    const allHighs = last5.map((d: any) => d.high);
    const allLows = last5.map((d: any) => d.low);
    const equalHighs = allHighs.filter((h: number) => Math.abs(h - pdh) < tol && h !== pdh);
    const equalLows = allLows.filter((l: number) => Math.abs(l - pdl) < tol && l !== pdl);

    const bias: MorningContext['bias'] = openingGapType !== 'FLAT' ? 'REVERSAL' : 'NEUTRAL';

    return {
        pdh, pdl, pdc, pdo, adr, swingHigh, swingLow,
        equalHighs, equalLows, dayHistory,
        prevDayBullish, openingGapType, openingGapPoints: Math.abs(gapPts),
        daySentiment, plannedTrade, plan: planDesc,
        orHigh: 0, orLow: 0,  // Set later as first 15-min candles complete
        bias, vixCondition, vix, vix5dAvg, adrUsedPercent: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL ENGINE — Morning Momentum Range Break
// ─────────────────────────────────────────────────────────────────────────────
//
// Called every minute after 9:30.
// The caller (runner / backtester) passes:
//   - currentCandle: latest completed 1-min bar
//   - prevCandles:   all candles from today so far (excluding current)
//   - ctx:           morning context (includes orHigh/orLow once set)
//   - risk:          daily risk state
//   - first15High:   9:15–9:30 range high (the Opening Range High)
//   - first15Low:    9:15–9:30 range low  (the Opening Range Low)
//   - overrideTime:  for backtesting, pass the candle's IST time as HH:MM

export function pdlsVixCheckSignal(
    currentCandle: any,
    prevCandles: any[],
    ctx: MorningContext,
    risk: PDLSRiskState,
    first15High: number,
    first15Low: number,
    overrideTime?: string
): AlgoSignal {
    const NONE: AlgoSignal = {
        type: 'NONE', price: 0, symbol: '', reason: 'Waiting', strength: 0, timestamp: Date.now()
    };

    if (!currentCandle || prevCandles.length < 3) return NONE;

    const now = overrideTime ?? timeStr(new Date());

    // Guard: not in trading hours
    if (now < TRADE_START) return { ...NONE, reason: `Waiting for ${TRADE_START}` };
    if (now > TRADE_END) return { ...NONE, reason: `Session closed at ${TRADE_END}` };

    // Guard: daily risk limits
    const { stop, reason: stopReason } = shouldStopTrading(risk);
    if (stop) return { ...NONE, reason: stopReason };

    // Guard: VIX extremely hostile
    if (ctx.vixCondition === 'AVOID' && ctx.vix > 25)
        return { ...NONE, reason: `VIX ${ctx.vix.toFixed(1)} too high – option premium risk` };

    const ltp = currentCandle.close;
    const candleHigh = currentCandle.high;
    const candleLow = currentCandle.low;
    const vol = currentCandle.volume || 0;
    const avgVolume = avgVol(prevCandles, 10);
    const volExpanded = avgVolume === 0 || vol >= avgVolume * 1.2;

    // ── Determine the active range to watch ───────────────────────────────
    // Opening Range = the 9:15 first candle only (1 minute)
    // At 9:16, we check if price breaks above/below that candle
    // After each trade, mini-range takes over for re-entries
    const useOrH = first15High > 0 ? first15High : 0;
    const useOrL = first15Low > 0 ? first15Low : 0;

    // Mini-range from last N candles (for re-entries after first trade)
    const miniCandles = prevCandles.slice(-MINI_RANGE_CANDLES);
    const miniHigh = miniCandles.length > 0 ? Math.max(...miniCandles.map((c: any) => c.high)) : 0;
    const miniLow = miniCandles.length > 0 ? Math.min(...miniCandles.map((c: any) => c.low)) : 0;
    const miniRange = miniHigh - miniLow;

    // Choose which range to use:
    // – If opening range is set and we're early → use OR
    // – If OR was already triggered or it's later → use mini-range
    const activeHigh = useOrH > 0 ? useOrH : miniHigh;
    const activeLow = useOrL > 0 ? useOrL : miniLow;
    const activeRange = activeHigh - activeLow;

    if (activeRange < MIN_RANGE_SIZE) {
        return { ...NONE, reason: `Range too small (${activeRange.toFixed(0)} pts) – waiting for larger range` };
    }

    // ── BUY CE: Watch for range HIGH break ────────────────────────────────
    // When prev day was bearish → today plan is BUY CE
    // Entry: close breaks ABOVE activeHigh + buffer
    if (ctx.plannedTrade === 'BUY_CE') {
        const breakoutLevel = activeHigh + BREAKOUT_BUFFER;
        if (ltp > breakoutLevel && volExpanded) {
            const rangeDesc = useOrH > 0 && ltp > useOrH
                ? `Opening Range High ${useOrH.toFixed(0)}`
                : `Mini-Range High ${miniHigh.toFixed(0)}`;
            return {
                type: 'BUY',
                price: ltp,
                symbol: 'INDEX',
                reason: `🟢 Range HIGH Break: ${rangeDesc} + ${BREAKOUT_BUFFER}pts broken. Prev day BEARISH → Morning reversal. BUY CE. Target: +${TARGET_POINTS}pts`,
                strength: ctx.vixCondition === 'GOOD' ? 0.92 : 0.80,
                timestamp: Date.now(),
                targetPoints: TARGET_POINTS,
                slPoints: Math.min(SL_POINTS, Math.round(activeRange) + 5),
            };
        }
        return { ...NONE, reason: `Waiting for break above ${breakoutLevel.toFixed(0)} (plan: ${ctx.plan.slice(0, 60)})` };
    }

    // ── BUY PE: Watch for range LOW break ─────────────────────────────────
    // When prev day was bullish → today plan is BUY PE
    // Entry: close breaks BELOW activeLow - buffer
    if (ctx.plannedTrade === 'BUY_PE') {
        const breakdownLevel = activeLow - BREAKOUT_BUFFER;
        if (ltp < breakdownLevel && volExpanded) {
            const rangeDesc = useOrL > 0 && ltp < useOrL
                ? `Opening Range Low ${useOrL.toFixed(0)}`
                : `Mini-Range Low ${miniLow.toFixed(0)}`;
            return {
                type: 'SELL',
                price: ltp,
                symbol: 'INDEX',
                reason: `� Range LOW Break: ${rangeDesc} - ${BREAKOUT_BUFFER}pts broken. Prev day BULLISH → Morning reversal. BUY PE. Target: +${TARGET_POINTS}pts`,
                strength: ctx.vixCondition === 'GOOD' ? 0.92 : 0.80,
                timestamp: Date.now(),
                targetPoints: TARGET_POINTS,
                slPoints: Math.min(SL_POINTS, Math.round(activeRange) + 5),
            };
        }
        return { ...NONE, reason: `Waiting for break below ${breakdownLevel.toFixed(0)} (plan: ${ctx.plan.slice(0, 60)})` };
    }

    return NONE;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXIT LOGIC
// ─────────────────────────────────────────────────────────────────────────────

export function pdlsVixCheckExit(
    entrySpot: number,
    currentSpot: number,
    targetPoints: number = TARGET_POINTS,
    slPoints: number = SL_POINTS
): ExitDecision {
    // Points gained: positive = in our favour (caller adjusts sign for SHORT trades)
    const profit = currentSpot - entrySpot;

    if (profit >= targetPoints)
        return { shouldClose: true, reason: `TARGET +${targetPoints}pts hit ✅` };
    if (profit <= -slPoints)
        return { shouldClose: true, reason: `SL -${slPoints}pts triggered ❌` };
    if (profit >= TRAIL_TO_COST_AT)
        return { shouldClose: false, reason: `Trailing SL to cost at +${TRAIL_TO_COST_AT}pts`, trail: true };

    return { shouldClose: false, reason: 'Holding position' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone Builder (for chart overlays)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPDLSZones(ctx: MorningContext): (TradingZone & { metadata?: any })[] {
    const meta = {
        pdh: ctx.pdh, pdl: ctx.pdl, adr: ctx.adr,
        bias: ctx.bias, vixCondition: ctx.vixCondition,
        sentiment: ctx.daySentiment,
        plannedTrade: ctx.plannedTrade,
        plan: ctx.plan,
        retailBias: ctx.daySentiment,
    };

    const zones: (TradingZone & { metadata?: any })[] = [
        { price: ctx.pdh, type: 'RESISTANCE', strength: 1.0, description: `PDH – ${ctx.plannedTrade === 'BUY_PE' ? '🔴 Watch for break' : 'Reference'}`, metadata: meta },
        { price: ctx.pdl, type: 'SUPPORT', strength: 1.0, description: `PDL – ${ctx.plannedTrade === 'BUY_CE' ? '🟢 Watch for break' : 'Reference'}`, metadata: meta },
        { price: ctx.pdc, type: 'PIVOT', strength: 0.6, description: 'PDC (Prev Close)' },
        { price: ctx.swingHigh, type: 'RESISTANCE', strength: 1.2, description: 'Swing High' },
        { price: ctx.swingLow, type: 'SUPPORT', strength: 1.2, description: 'Swing Low' },
    ];

    // Opening Range zones (added dynamically when orHigh/orLow are known)
    if (ctx.orHigh > 0) {
        zones.push({ price: ctx.orHigh, type: 'RESISTANCE', strength: 0.9, description: '📊 OR High – BUY CE trigger' });
    }
    if (ctx.orLow > 0) {
        zones.push({ price: ctx.orLow, type: 'SUPPORT', strength: 0.9, description: '📊 OR Low – BUY PE trigger' });
    }

    // Retail SL clusters
    const buf = ctx.pdh * 0.0005;
    zones.push({ price: ctx.pdh + buf, type: 'RESISTANCE', strength: 0.4, description: 'Retail SL Above PDH' });
    zones.push({ price: ctx.pdl - buf, type: 'SUPPORT', strength: 0.4, description: 'Retail SL Below PDL' });

    return zones;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config export
// ─────────────────────────────────────────────────────────────────────────────

export const PDLS_CONFIG = {
    TARGET_POINTS,
    SL_POINTS,
    R_BASED_TARGET: SL_POINTS * 1.67,
    TRAIL_TO_COST_AT,
    TOTAL_QTY,
    LOTS,
    LOT_SIZE,
    MAX_DAILY_LOSS_HARD,
    MAX_DAILY_LOSS_SOFT,
    MAX_CONSECUTIVE_LOSSES,
    MAX_TRADES_PER_DAY,
    SESSION_1_START: TRADE_START,
    SESSION_1_END: TRADE_END,
    SESSION_2_START: '13:30',
    SESSION_2_END: TRADE_END,
    OR_START,
    OR_END,
    BREAKOUT_BUFFER,
    MINI_RANGE_CANDLES,
};
