export interface AdrValues {
    adr1h: number;
    adr1l: number;
    adr2h: number;
    adr2l: number;
    adr3h: number;
    adr3l: number;
    open: number;
}

export interface CandleWithAdr extends Record<string, any> {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    adr?: AdrValues; // Will be attached per candle
}

// Convert unix timestamp (seconds) to YYYY-MM-DD in IST
function getIstDateStr(timestampSeconds: number) {
    const d = new Date(timestampSeconds * 1000);
    const totalMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + 330; // +330 = IST
    const h = Math.floor(totalMinutes / 60) % 24;
    const isNextDay = Math.floor(totalMinutes / 60) >= 24;

    // We want the calendar date. Instead of manual math, just use an offset Date:
    const offsetDate = new Date(timestampSeconds * 1000 + (330 * 60 * 1000));
    return offsetDate.toISOString().split('T')[0];
}

export function calculateADRx3(candles: any[], p1 = 14, p2 = 7, p3 = 5): CandleWithAdr[] {
    if (!candles || candles.length === 0) return [];

    // 1. Group by daily date string to compute Daily OHLC
    const dailyMap = new Map<string, { o: number; h: number; l: number; c: number }>();
    const datesOrdered: string[] = [];

    candles.forEach((c) => {
        const dStr = getIstDateStr(c.time);
        if (!dailyMap.has(dStr)) {
            datesOrdered.push(dStr);
            dailyMap.set(dStr, { o: c.open, h: c.high, l: c.low, c: c.close });
        } else {
            const day = dailyMap.get(dStr)!;
            day.h = Math.max(day.h, c.high);
            day.l = Math.min(day.l, c.low);
            day.c = c.close; // continuously updates as day goes
        }
    });

    // 2. Pre-calculate the prior days' ADR for each day, to prevent O(N^2)
    // We need SMA of high and SMA of low for past periods (p1, p2, p3)
    const dayAdrs = new Map<string, AdrValues>();

    for (let i = 0; i < datesOrdered.length; i++) {
        const todayStr = datesOrdered[i];
        const todaySummary = dailyMap.get(todayStr)!;

        // Find previous days available
        const pastDays: Array<{ o: number; h: number; l: number; c: number }> = [];
        // Walk backwards starting from yesterday
        for (let j = i - 1; j >= 0; j--) {
            pastDays.push(dailyMap.get(datesOrdered[j])!);
        }

        const getAdrs = (period: number) => {
            if (pastDays.length === 0) return 0; // Not enough data
            const lookback = pastDays.slice(0, period); // Take most recent `period` days
            const sumH = lookback.reduce((acc, obj) => acc + obj.h, 0);
            const sumL = lookback.reduce((acc, obj) => acc + obj.l, 0);

            const smaH = sumH / lookback.length;
            const smaL = sumL / lookback.length;

            return Math.max(0, smaH - smaL); // ADR is difference of SMA(high) and SMA(low)
        };

        const adr1 = getAdrs(p1);
        const adr2 = getAdrs(p2);
        const adr3 = getAdrs(p3);

        const open = todaySummary.o; // exact today's actual open

        dayAdrs.set(todayStr, {
            open,
            adr1h: adr1 > 0 ? open + (adr1 / 2) : 0,
            adr1l: adr1 > 0 ? open - (adr1 / 2) : 0,
            adr2h: adr2 > 0 ? open + (adr2 / 2) : 0,
            adr2l: adr2 > 0 ? open - (adr2 / 2) : 0,
            adr3h: adr3 > 0 ? open + (adr3 / 2) : 0,
            adr3l: adr3 > 0 ? open - (adr3 / 2) : 0,
        });
    }

    // 3. Map the calculated daily values onto each 1-min candle!
    return candles.map(c => {
        const dStr = getIstDateStr(c.time);
        const adrVals = dayAdrs.get(dStr);
        return {
            ...c,
            adr: adrVals
        };
    });
}
