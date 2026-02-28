/**
 * SuperTrend Option Buying Strategy
 * ────────────────────────────────────
 * Runs on 5-minute BankNifty candles.
 *
 * SIGNAL:
 *   SuperTrend flips DOWN → UP  (red → green):  BUY CE
 *   SuperTrend flips UP   → DOWN (green → red): BUY PE
 *
 * FILTERS:
 *   1. Time window: 9:20 – 14:00  (avoid last 30min theta crush)
 *   2. VIX < 20  (don't buy costly options when IV is extreme)
 *   3. Flip must happen AFTER 9:20 (ignore the first noisy candle)
 *   4. Max 3 trades per day
 *   5. Stop after 2 consecutive losses or ₹6000 daily loss
 *
 * EXIT:
 *   Target:  +50 index points
 *   SL:      -25 index points  (2:1 R:R)
 *   Time SL: Exit by 14:30 regardless
 */

import { AlgoSignal } from './types';
import { calcSuperTrend, aggregateTo5Min, SuperTrendPoint } from './supertrend';

export interface STRiskState {
    consecutiveLosses: number;
    dailyLoss: number;
    tradesToday: number;
}

export interface STExitDecision {
    shouldClose: boolean;
    reason: string;
    trail?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export const ST_CONFIG = {
    // SuperTrend parameters (Pine defaults)
    ST_PERIOD: 7,
    ST_MULTIPLIER: 3,

    // Trade sizing
    LOTS: 2,
    LOT_SIZE: 15,    // BankNifty lot size
    TOTAL_QTY: 30,    // 2 × 15

    // Targets and SL (index points on BankNifty spot)
    TARGET_POINTS: 50,
    SL_POINTS: 25,
    TRAIL_AT: 20,    // Move SL to cost at +20pts

    // Risk limits
    MAX_DAILY_LOSS: 6000,
    MAX_CONSEC_LOSS: 2,
    MAX_TRADES_PER_DAY: 3,

    // Time
    TRADE_START: '09:20',
    TRADE_END: '14:00',
    FORCE_CLOSE: '14:30',

    // VIX
    MAX_VIX: 20,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: time string in IST from unix seconds
// ─────────────────────────────────────────────────────────────────────────────

export function stTimeStr(ts: number): string {
    const d = new Date(ts * 1000);
    const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes() + 330; // IST
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute SuperTrend over 1-min candle array
// Returns 5-minute ST points mapped back to each 1-min candle
// ─────────────────────────────────────────────────────────────────────────────

export function computeSuperTrend(candles1m: any[]): SuperTrendPoint[] {
    if (candles1m.length < 10) return [];

    const c5m = aggregateTo5Min(candles1m);
    if (c5m.length < ST_CONFIG.ST_PERIOD + 2) return [];

    const st5m = calcSuperTrend(c5m, ST_CONFIG.ST_PERIOD, ST_CONFIG.ST_MULTIPLIER);

    // Map back to 1-min resolution
    const lookup = new Map<number, SuperTrendPoint>();
    st5m.forEach(p => {
        // A 5m bucket covers bucketTime, bucketTime+60, +120, +180, +240
        for (let offset = 0; offset < 300; offset += 60) {
            lookup.set(p.time + offset, { ...p, time: p.time + offset, flip: offset === 0 && p.flip });
        }
    });

    return candles1m.map((c: any) => {
        return lookup.get(c.time) ?? { time: c.time, value: 0, direction: 'DOWN' as const, flip: false };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal check — called per candle
// ─────────────────────────────────────────────────────────────────────────────

export function stCheckSignal(
    currentCandle: any,
    stPoints: SuperTrendPoint[],  // all ST points up to and including current candle
    risk: STRiskState,
    vix: number,
    overrideTime?: string              // for backtesting: IST HH:MM of the candle
): AlgoSignal {
    const NONE: AlgoSignal = {
        type: 'NONE', price: 0, symbol: '', reason: 'Watching SuperTrend…', strength: 0, timestamp: Date.now()
    };

    if (!currentCandle || stPoints.length < 2) return NONE;

    const now = overrideTime ?? stTimeStr(currentCandle.time);
    const current = stPoints[stPoints.length - 1];
    const prev = stPoints[stPoints.length - 2];

    // ── Risk guards ──────────────────────────────────────────────────────
    if (now < ST_CONFIG.TRADE_START)
        return { ...NONE, reason: `Waiting until ${ST_CONFIG.TRADE_START}` };
    if (now > ST_CONFIG.TRADE_END)
        return { ...NONE, reason: `No new entries after ${ST_CONFIG.TRADE_END}` };
    if (risk.tradesToday >= ST_CONFIG.MAX_TRADES_PER_DAY)
        return { ...NONE, reason: `Max ${ST_CONFIG.MAX_TRADES_PER_DAY} trades reached today` };
    if (risk.consecutiveLosses >= ST_CONFIG.MAX_CONSEC_LOSS)
        return { ...NONE, reason: `${ST_CONFIG.MAX_CONSEC_LOSS} consecutive losses — stopped` };
    if (risk.dailyLoss >= ST_CONFIG.MAX_DAILY_LOSS)
        return { ...NONE, reason: `Daily loss ₹${ST_CONFIG.MAX_DAILY_LOSS} hit` };
    if (vix > ST_CONFIG.MAX_VIX)
        return { ...NONE, reason: `VIX ${vix.toFixed(1)} too high (>${ST_CONFIG.MAX_VIX}) — options expensive` };

    // ── SuperTrend flip detection ────────────────────────────────────────
    const flippedUp = prev.direction === 'DOWN' && current.direction === 'UP';
    const flippedDown = prev.direction === 'UP' && current.direction === 'DOWN';

    if (flippedUp) {
        return {
            type: 'BUY',
            price: currentCandle.close,
            symbol: 'INDEX',
            reason: `🟢 SuperTrend FLIP → UP at ${currentCandle.close.toFixed(0)}. BUY CE. (ST line: ${current.value.toFixed(0)})`,
            strength: 0.88,
            timestamp: currentCandle.time * 1000,
            targetPoints: ST_CONFIG.TARGET_POINTS,
            slPoints: ST_CONFIG.SL_POINTS,
        };
    }

    if (flippedDown) {
        return {
            type: 'SELL',
            price: currentCandle.close,
            symbol: 'INDEX',
            reason: `🔴 SuperTrend FLIP → DOWN at ${currentCandle.close.toFixed(0)}. BUY PE. (ST line: ${current.value.toFixed(0)})`,
            strength: 0.88,
            timestamp: currentCandle.time * 1000,
            targetPoints: ST_CONFIG.TARGET_POINTS,
            slPoints: ST_CONFIG.SL_POINTS,
        };
    }

    return {
        ...NONE,
        reason: `ST ${current.direction} @ ${current.value.toFixed(0)} — no flip yet`
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exit check
// ─────────────────────────────────────────────────────────────────────────────

export function stCheckExit(
    entrySpot: number,
    currentSpot: number,
    tradeType: 'LONG' | 'SHORT',
    overrideTime?: string,
    candleTime?: number
): STExitDecision {
    const now = overrideTime ?? (candleTime ? stTimeStr(candleTime) : '00:00');

    // Force close at end of day
    if (now >= ST_CONFIG.FORCE_CLOSE) {
        return { shouldClose: true, reason: `Time stop at ${ST_CONFIG.FORCE_CLOSE}` };
    }

    const pts = tradeType === 'LONG'
        ? currentSpot - entrySpot
        : entrySpot - currentSpot;

    if (pts >= ST_CONFIG.TARGET_POINTS)
        return { shouldClose: true, reason: `✅ Target +${ST_CONFIG.TARGET_POINTS}pts hit` };
    if (pts <= -ST_CONFIG.SL_POINTS)
        return { shouldClose: true, reason: `❌ SL -${ST_CONFIG.SL_POINTS}pts hit` };
    if (pts >= ST_CONFIG.TRAIL_AT)
        return { shouldClose: false, reason: `Trail to breakeven (+${pts.toFixed(0)}pts)`, trail: true };

    return { shouldClose: false, reason: `Holding (+${pts.toFixed(0)}pts)` };
}
