
import { useEffect, useRef } from 'react';
import { useAlgoStore } from '../store/algoStore';
import { useTradingStore } from '../store/tradingStore';
import { TradingStrategy } from './strategy';
import {
    buildMorningContext,
    pdlsVixCheckSignal,
    pdlsVixCheckExit,
    buildPDLSZones,
    PDLS_CONFIG,
    shouldStopTrading,
    MorningContext,
    PDLSRiskState
} from './pdlsVixStrategy';
import { playAlgoSound } from '../utils/sound';

export function useAlgoRunner(chartData: any[] = []) {
    const {
        isRunning,
        config,
        addSignal,
        addPosition,
        activePositions,
        closePosition,
        monitoredContracts,
        stats,
        setZones,
        activeStrategy
    } = useAlgoStore();

    const { brokerCredentials } = useTradingStore();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const chartDataRef = useRef(chartData);

    // PDLS session refs
    const morningCtxRef = useRef<MorningContext | null>(null);
    const ctxBuiltRef = useRef(false);
    const first15MinHighRef = useRef(0);
    const first15MinLowRef = useRef(Infinity);
    const first15DoneRef = useRef(false);
    const riskStateRef = useRef<PDLSRiskState>({
        consecutiveLosses: 0,
        dailyLoss: 0,
        tradeCount: 0,
        tradesToday: 0
    });
    const prevTradeCountRef = useRef(0);

    // Keep chart data ref current
    useEffect(() => {
        chartDataRef.current = chartData;
    }, [chartData]);

    useEffect(() => {
        if (!isRunning || !brokerCredentials) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        // Reset session state on algo start
        ctxBuiltRef.current = false;
        first15DoneRef.current = false;
        first15MinHighRef.current = 0;
        first15MinLowRef.current = Infinity;
        riskStateRef.current = { consecutiveLosses: 0, dailyLoss: 0, tradeCount: 0, tradesToday: 0 };
        prevTradeCountRef.current = 0;
        morningCtxRef.current = null;

        console.log(`[AlgoRunner] Started — strategy: ${useAlgoStore.getState().activeStrategy}`);

        intervalRef.current = setInterval(async () => {
            const now = new Date();
            const tStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            const algoState = useAlgoStore.getState();
            const tradingState = useTradingStore.getState();

            const activePositions = algoState.activePositions;
            const watchlist = tradingState.watchlist;
            const monitoredContracts = algoState.monitoredContracts;
            const latestCandles = chartDataRef.current;

            // ── A. Detect newly closed trades → update risk state ──────────
            const currentTradeCount = algoState.tradeHistory.length;
            if (currentTradeCount > prevTradeCountRef.current) {
                const newTrades = algoState.tradeHistory.slice(0, currentTradeCount - prevTradeCountRef.current);
                newTrades.forEach(t => {
                    const pnl = t.pnl || 0;
                    if (pnl < 0) {
                        riskStateRef.current.dailyLoss += Math.abs(pnl);
                        riskStateRef.current.consecutiveLosses++;
                    } else {
                        riskStateRef.current.consecutiveLosses = 0;
                    }
                    riskStateRef.current.tradesToday++;
                });
                prevTradeCountRef.current = currentTradeCount;
            }

            // ── B. Build MorningContext lazily (once per session) ──────────
            // Works off 1-min intraday candles — we synthesise "daily" bars
            // from the candle array so buildMorningContext has something to work with.
            if (!ctxBuiltRef.current && latestCandles.length >= 5) {
                const vix = algoState.liveVix || 14;
                const vix5dAvg = algoState.liveVix5dAvg || vix;

                // Create synthetic daily summaries from intraday 1min candles
                // (group by date, then compute OHLC)
                const dayMap = new Map<string, any[]>();
                latestCandles.forEach((c: any) => {
                    const ts = c.time || 0;
                    const day = new Date(ts * 1000).toISOString().split('T')[0];
                    if (!dayMap.has(day)) dayMap.set(day, []);
                    dayMap.get(day)!.push(c);
                });

                // Build synthetic daily candles for context
                const syntheticDailyCandles: any[] = [];
                dayMap.forEach((candles, date) => {
                    const open = candles[0].open;
                    const close = candles[candles.length - 1].close;
                    const high = Math.max(...candles.map((c: any) => c.high));
                    const low = Math.min(...candles.map((c: any) => c.low));
                    // Use noon timestamp for the day
                    const ts = candles[0].time;
                    syntheticDailyCandles.push({ time: ts, open, high, low, close, volume: 0 });
                });

                const todayOpen = latestCandles[0]?.open ?? 0;
                const ctx = buildMorningContext(syntheticDailyCandles, todayOpen, vix, vix5dAvg);
                morningCtxRef.current = ctx;
                ctxBuiltRef.current = true;

                // Also push zones for the chart
                const zones = buildPDLSZones(ctx);
                algoState.setZones(zones);

                console.log('[AlgoRunner] Context built from intraday data:', {
                    pdh: ctx.pdh.toFixed(0), pdl: ctx.pdl.toFixed(0),
                    adr: ctx.adr.toFixed(0), bias: ctx.bias,
                    vix: ctx.vix, vixCondition: ctx.vixCondition,
                    days: syntheticDailyCandles.length
                });
            }

            // ── C. Opening Range = 9:15 candle only → entry fires at 9:16 ──
            if (tStr === '09:15' && latestCandles.length > 0) {
                const c9_15 = latestCandles[latestCandles.length - 1];
                if (c9_15) {
                    first15MinHighRef.current = c9_15.high;
                    first15MinLowRef.current = c9_15.low;
                }
            }
            if (tStr >= '09:16' && !first15DoneRef.current && first15MinHighRef.current > 0) {
                first15DoneRef.current = true;
                console.log(`[AlgoRunner] 9:15 OR candle set: H=${first15MinHighRef.current} L=${first15MinLowRef.current} | Plan will fire at 9:16+`);
            }

            // ── D. Hard stop: daily loss cap or end-time ───────────────────
            const hardStop = riskStateRef.current.dailyLoss >= PDLS_CONFIG.MAX_DAILY_LOSS_HARD
                || tStr >= config.endTime;

            if (hardStop) {
                if (activePositions.length > 0) {
                    activePositions.forEach(pos => {
                        algoState.closePosition(pos.symbol, pos.currentPrice);
                        playAlgoSound('EXIT');
                    });
                }
                return;
            }

            // ── E. Update active position prices ──────────────────────────
            activePositions.forEach(pos => {
                const match = watchlist.find(w =>
                    String(w.securityId) === String((pos as any).id) ||
                    w.symbol === pos.symbol
                );
                if (match && match.ltp > 0) {
                    algoState.updatePrices(String((pos as any).id) || pos.symbol, match.ltp);
                }
            });

            // ── F. Exit logic ─────────────────────────────────────────────
            // Re-read after price updates
            const freshPositions = useAlgoStore.getState().activePositions;
            freshPositions.forEach(pos => {
                const targetPts = (pos as any).targetPoints ?? PDLS_CONFIG.TARGET_POINTS;
                const slPts = (pos as any).slPoints ?? PDLS_CONFIG.SL_POINTS;
                const decision = pdlsVixCheckExit(pos.entryPrice, pos.currentPrice, targetPts, slPts);

                if (decision.shouldClose) {
                    console.log(`[AlgoRunner] EXIT ${pos.symbol}: ${decision.reason}`);
                    algoState.closePosition(pos.symbol, pos.currentPrice);
                    playAlgoSound('EXIT');
                } else if (decision.trail) {
                    console.log(`[AlgoRunner] Trail SL to cost: ${pos.symbol}`);
                }
            });

            // ── G. Entry logic (only when flat) ──────────────────────────
            const currentPositions = useAlgoStore.getState().activePositions;
            if (currentPositions.length > 0) return; // no pyramiding

            const ctx = morningCtxRef.current;
            if (!ctx) {
                console.log('[AlgoRunner] Context not yet built — skipping entry check');
                return;
            }

            config.symbols.forEach(symbol => {
                // Spot index price
                const indexItem = watchlist.find(w =>
                    w.symbol.includes(symbol) && !w.symbol.includes('CE') && !w.symbol.includes('PE')
                );
                if (!indexItem?.ltp) {
                    console.log(`[AlgoRunner] No spot price for ${symbol}`);
                    return;
                }

                // ATM contracts must be pre-loaded
                const contracts = monitoredContracts[symbol];
                if (!contracts?.ce && !contracts?.pe) {
                    console.warn(`[AlgoRunner] No monitored contracts for ${symbol} — run "Market Architecture" analysis first`);
                    return;
                }

                if (currentPositions.some(p => p.symbol.startsWith(symbol))) return;

                const prevCandles = latestCandles.slice(Math.max(0, latestCandles.length - 30), -1);
                if (prevCandles.length < 5) {
                    console.log(`[AlgoRunner] Not enough candles (${prevCandles.length})`);
                    return;
                }

                // Build current synthetic candle
                const lastRaw = latestCandles[latestCandles.length - 1];
                const currentCandle = {
                    ...lastRaw,
                    close: indexItem.ltp,
                    high: Math.max(indexItem.ltp, lastRaw?.high ?? indexItem.ltp),
                    low: Math.min(indexItem.ltp, lastRaw?.low ?? indexItem.ltp),
                    volume: indexItem.volume || 100000
                };

                // Update ADR used % live
                const todayHigh = Math.max(...latestCandles.slice(-50).map((c: any) => c.high ?? 0));
                const todayLow = Math.min(...latestCandles.slice(-50).map((c: any) => c.low ?? Infinity));
                ctx.adrUsedPercent = ctx.adr > 0 ? (todayHigh - todayLow) / ctx.adr : 0;

                // ── Strategy branch ────────────────────────────────────────
                const currentActiveStrategy = algoState.activeStrategy;
                let signal: any;

                if (currentActiveStrategy === 'PDLS_VIX') {
                    signal = pdlsVixCheckSignal(
                        currentCandle, prevCandles, ctx, riskStateRef.current,
                        first15MinHighRef.current,
                        first15MinLowRef.current === Infinity ? 0 : first15MinLowRef.current
                    );
                } else {
                    signal = TradingStrategy.checkSignal(currentCandle, prevCandles, algoState.zones);
                }

                // Always log what signal engine returned (helpful for debugging)
                if (signal.type === 'NONE') {
                    console.log(`[AlgoRunner] No signal: ${signal.reason}`);
                    return;
                }

                console.log(`[AlgoRunner] SIGNAL ${signal.type}: ${signal.reason}`);

                // Pick CE or PE
                const targetContract = signal.type === 'BUY' ? contracts.ce : contracts.pe;
                if (!targetContract) {
                    console.warn(`[AlgoRunner] No ${signal.type === 'BUY' ? 'CE' : 'PE'} contract available`);
                    return;
                }

                // Get live option price
                const optionWatch = watchlist.find(w =>
                    String(w.securityId) === String(targetContract.securityId ?? targetContract.security_id)
                );
                const entryPrice: number = optionWatch?.ltp || targetContract.last_price || 200;

                // Capital check before entry
                const tradeCapital = entryPrice * (currentActiveStrategy === 'PDLS_VIX' ? PDLS_CONFIG.TOTAL_QTY : 1);
                if (tradeCapital > algoState.availableCapital) {
                    console.warn(`[AlgoRunner] Insufficient capital: need ₹${tradeCapital.toFixed(0)}, have ₹${algoState.availableCapital.toFixed(0)}`);
                    return;
                }

                const qty = currentActiveStrategy === 'PDLS_VIX'
                    ? PDLS_CONFIG.TOTAL_QTY
                    : TradingStrategy.calculateQuantity(config.initialCapital, entryPrice, config.lotSize[symbol] || 1);

                const targetPrice = currentActiveStrategy === 'PDLS_VIX'
                    ? entryPrice + (signal.targetPoints ?? PDLS_CONFIG.TARGET_POINTS)
                    : signal.target ? entryPrice * signal.target : entryPrice * 1.40;

                const slPrice = currentActiveStrategy === 'PDLS_VIX'
                    ? entryPrice - (signal.slPoints ?? PDLS_CONFIG.SL_POINTS)
                    : signal.sl ? entryPrice * signal.sl : entryPrice * 0.80;

                const positionSymbol = `${symbol} ${targetContract.strike_price} ${targetContract.oc_type === 'CALL' ? 'CE' : 'PE'}`;

                algoState.addSignal({ ...signal, symbol: positionSymbol, price: entryPrice });
                playAlgoSound('ENTRY');

                algoState.addPosition({
                    symbol: positionSymbol,
                    id: String(targetContract.securityId ?? targetContract.security_id),
                    type: 'LONG',
                    entryPrice,
                    quantity: qty,
                    currentPrice: entryPrice,
                    pnl: 0,
                    timestamp: Date.now(),
                    target: targetPrice,
                    sl: slPrice,
                    targetPoints: signal.targetPoints,
                    slPoints: signal.slPoints
                } as any);

                console.log(`[AlgoRunner] ENTERED ${positionSymbol} @ ₹${entryPrice} | TP ₹${targetPrice.toFixed(0)} | SL ₹${slPrice.toFixed(0)} | Qty ${qty}`);
            });

        }, 3000); // every 3 seconds

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };

    }, [isRunning, brokerCredentials, config]);
}
