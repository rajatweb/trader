/**
 * SuperTrend Indicator
 *  Period: 7 (default)
 *  Multiplier: 3 (default)
 *
 * Returns per-candle:
 *   value:     the SuperTrend line price (support below or resistance above)
 *   direction: 'UP' (bullish, line is green below price) | 'DOWN' (bearish, red above price)
 *   flip:      true on the candle where direction changed (= entry signal)
 */

export interface SuperTrendPoint {
    time: number;
    value: number;
    direction: 'UP' | 'DOWN';
    flip: boolean;   // true = this candle triggered a direction change
}

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATR (Wilder's smoothing)
// ─────────────────────────────────────────────────────────────────────────────

function calcATR(candles: Candle[], period: number): number[] {
    const n = candles.length;
    const tr = new Array<number>(n).fill(0);
    const atr = new Array<number>(n).fill(0);

    // True Range
    for (let i = 0; i < n; i++) {
        const hl = candles[i].high - candles[i].low;
        const hpc = i > 0 ? Math.abs(candles[i].high - candles[i - 1].close) : 0;
        const lpc = i > 0 ? Math.abs(candles[i].low - candles[i - 1].close) : 0;
        tr[i] = Math.max(hl, hpc, lpc);
    }

    // Wilder's smoothing (same as Pine Script default)
    // First ATR = simple average of first `period` TRs
    let sum = 0;
    for (let i = 0; i < period && i < n; i++) sum += tr[i];
    if (n >= period) {
        atr[period - 1] = sum / period;
        for (let i = period; i < n; i++) {
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
        }
    }

    return atr;
}

// ─────────────────────────────────────────────────────────────────────────────
// SuperTrend
// ─────────────────────────────────────────────────────────────────────────────

export function calcSuperTrend(
    candles: Candle[],
    period = 7,
    multiplier = 3
): SuperTrendPoint[] {
    const n = candles.length;
    const atr = calcATR(candles, period);

    const upperBand = new Array<number>(n).fill(0);
    const lowerBand = new Array<number>(n).fill(0);
    const st = new Array<number>(n).fill(0);
    const dir = new Array<'UP' | 'DOWN'>(n).fill('UP');

    for (let i = 0; i < n; i++) {
        const hl2 = (candles[i].high + candles[i].low) / 2;
        const bu = hl2 + multiplier * atr[i];   // Basic Upper
        const bl = hl2 - multiplier * atr[i];   // Basic Lower

        if (i === 0) {
            upperBand[i] = bu;
            lowerBand[i] = bl;
            // Default: start bearish (price will determine)
            st[i] = bu;
            dir[i] = 'DOWN';
            continue;
        }

        // Final Upper Band
        // Tighten only when possible (price must not have closed above prev upper)
        upperBand[i] = (bu < upperBand[i - 1] || candles[i - 1].close > upperBand[i - 1])
            ? bu
            : upperBand[i - 1];

        // Final Lower Band
        // Loosen only when possible (price must not have closed below prev lower)
        lowerBand[i] = (bl > lowerBand[i - 1] || candles[i - 1].close < lowerBand[i - 1])
            ? bl
            : lowerBand[i - 1];

        // Determine SuperTrend value & direction
        const prevST = st[i - 1];

        if (prevST === upperBand[i - 1]) {
            // Was bearish
            if (candles[i].close > upperBand[i]) {
                st[i] = lowerBand[i];   // Flipped to bullish
                dir[i] = 'UP';
            } else {
                st[i] = upperBand[i];   // Still bearish
                dir[i] = 'DOWN';
            }
        } else {
            // Was bullish
            if (candles[i].close < lowerBand[i]) {
                st[i] = upperBand[i];   // Flipped to bearish
                dir[i] = 'DOWN';
            } else {
                st[i] = lowerBand[i];   // Still bullish
                dir[i] = 'UP';
            }
        }
    }

    return candles.map((c, i) => ({
        time: c.time,
        value: st[i],
        direction: dir[i],
        flip: i > 0 && dir[i] !== dir[i - 1],
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-minute candle aggregation (for use with 1-min input data)
// ─────────────────────────────────────────────────────────────────────────────

export function aggregateTo5Min(candles: Candle[]): Candle[] {
    const groups = new Map<number, Candle[]>();

    candles.forEach(c => {
        // Round down to nearest 5-min bucket (unix seconds)
        const bucket = Math.floor(c.time / 300) * 300;
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket)!.push(c);
    });

    const result: Candle[] = [];
    groups.forEach((cs, time) => {
        result.push({
            time,
            open: cs[0].open,
            high: Math.max(...cs.map(c => c.high)),
            low: Math.min(...cs.map(c => c.low)),
            close: cs[cs.length - 1].close,
            volume: cs.reduce((s, c) => s + c.volume, 0),
        });
    });

    return result.sort((a, b) => a.time - b.time);
}

// ─────────────────────────────────────────────────────────────────────────────
// Map 5-min SuperTrend back to 1-min candle timestamps
// Returns a SuperTrendPoint for every 1-min candle
// ─────────────────────────────────────────────────────────────────────────────

export function mapSTto1Min(
    candles1m: Candle[],
    st5m: SuperTrendPoint[]
): SuperTrendPoint[] {
    // Build lookup: 5m bucket → ST point
    const lookup = new Map<number, SuperTrendPoint>();
    st5m.forEach(p => lookup.set(p.time, p));

    let lastST: SuperTrendPoint = {
        time: 0, value: 0, direction: 'DOWN', flip: false
    };

    return candles1m.map(c => {
        const bucket = Math.floor(c.time / 300) * 300;
        const stPt = lookup.get(bucket);
        if (stPt) {
            const isFlip = stPt.flip && stPt.time === bucket;  // only at bucket start
            lastST = { ...stPt, time: c.time, flip: isFlip && c.time === bucket };
        } else {
            lastST = { ...lastST, time: c.time, flip: false };
        }
        return lastST;
    });
}
