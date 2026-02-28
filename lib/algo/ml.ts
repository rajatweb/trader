/**
 * BrainCore V2: Multi-Output Neural Network for Alpha Discovery
 * This core deciphers market structure to predict Entry, SL, and TP simultaneously.
 */
import * as tf from '@tensorflow/tfjs';

export interface MarketSnapshot {
    // 1. Trend & Sentiment (3)
    marketSentiment: number;
    trendStrength: number;
    volatility: number;

    // 2. Closing Structure & Gap Analysis (V4) (8)
    prevDayCloseRel: number;
    prevDayHighRel: number;  // Current price relative to yesterday's high
    prevDayLowRel: number;   // Current price relative to yesterday's low
    gapType: number;         // -1: Pro-Gap (Continuation), 1: Gap Trap (Reverse), 0: Neutral
    gapSize: number;         // Normalized gap %
    priceRelToClose: number; // Current price vs prev close
    isLiquidityGrab: number; // 1 if wick sweeps prev close then reverses
    closingStructure: number; // Trend of the last 30 mins of yesterday

    // 3. Retailer Traps & Attempts (5)
    rangeBreakout: number;
    tradesTakenToday: number;
    morningSentiment: number;
    isFakeBreakout: number;  // 1 if price breaks range then immediately closes back inside
    stopHuntZone: number;    // 1 if price is in a known liquidity pool (prev day high/low/close)

    // 4. EMA & Price Action (8)
    ema20Spread: number;
    ema50Spread: number;
    ema200Spread: number;
    emaTrend: number;
    bodyPct: number;
    wickRatio: number;
    volumeZ: number;
    timeOfDay: number;

    // 5. Metadata & Momentum (8)
    indexType: number;
    priceRelToOpen: number;
    momentum: number;
    swingLowDef: number;
    rangeStatus: number;
    avgSessionVol: number;   // Volatility of the first 15 mins
    orderFlowBias: number;   // Volume-weighted momentum
    riskRewardRatio: number; // Distance to next major level vs SL
}

export interface AIAction {
    type: 'LONG' | 'SHORT' | 'WAIT';
    confidence: number;
    slPoints: number;
    tpPoints: number;
    reasoning?: string;
}

export class AdvancedBrain {
    public model: tf.LayersModel;

    constructor() {
        const input = tf.input({ shape: [96] }); // 32 features * 3 candles

        // Feature extractor
        const dense1 = tf.layers.dense({ units: 128, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
        const drop1 = tf.layers.dropout({ rate: 0.15 }).apply(dense1) as tf.SymbolicTensor;
        const dense2 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(drop1) as tf.SymbolicTensor;
        const dense3 = tf.layers.dense({ units: 32, activation: 'relu' }).apply(dense2) as tf.SymbolicTensor;

        // Action head (Classification: 0=SHORT, 0.5=WAIT/NEUTRAL, 1=LONG)
        // Using sigmoid for a probability-like output (0 to 1)
        const actionOutput = tf.layers.dense({
            units: 1,
            activation: 'sigmoid',
            name: 'actionHead'
        }).apply(dense3) as tf.SymbolicTensor;

        // SL head (Regression)
        const slOutput = tf.layers.dense({
            units: 1,
            activation: 'relu',
            name: 'slHead'
        }).apply(dense3) as tf.SymbolicTensor;

        // TP head (Regression)
        const tpOutput = tf.layers.dense({
            units: 1,
            activation: 'relu',
            name: 'tpHead'
        }).apply(dense3) as tf.SymbolicTensor;

        this.model = tf.model({
            inputs: input,
            outputs: [actionOutput, slOutput, tpOutput]
        });

        this.model.compile({
            optimizer: tf.train.adam(0.0015),
            loss: {
                actionHead: 'meanSquaredError',
                slHead: 'meanSquaredError',
                tpHead: 'meanSquaredError'
            },
            metrics: ['mse']
        });
    }

    forward(input: number[]): number[] {
        return tf.tidy(() => {
            const inputTensor = tf.tensor2d([input]);
            const preds = this.model.predict(inputTensor) as tf.Tensor[];

            const action = preds[0].dataSync()[0];
            const sl = preds[1].dataSync()[0];
            const tp = preds[2].dataSync()[0];

            return [action, sl, tp];
        });
    }

    toJSON() {
        const weights = this.model.getWeights().map(w => ({
            shape: w.shape,
            data: Array.from(w.dataSync())
        }));
        return { type: 'tfjs-model-v5', weights };
    }

    fromJSON(json: any) {
        if (json && json.weights) {
            try {
                const tensors = json.weights.map((w: any, i: number) => tf.tensor(w.data, w.shape));
                this.model.setWeights(tensors);
                tensors.forEach((t: any) => t.dispose());
            } catch (e) {
                console.warn("Retaining fresh brain due to weight mismatch.");
            }
        }
    }
}

export class AlphaStrategist {
    private brain: AdvancedBrain;
    private trainingLogs: string[] = [];
    private dataset: any[] = [];

    constructor() {
        this.brain = new AdvancedBrain();
    }

    private vectorize(s: MarketSnapshot): number[] {
        return [
            s.marketSentiment, s.trendStrength, s.volatility,
            s.prevDayCloseRel, s.prevDayHighRel, s.prevDayLowRel, s.gapType, s.gapSize, s.priceRelToClose, s.isLiquidityGrab, s.closingStructure,
            s.rangeBreakout, s.tradesTakenToday, s.morningSentiment, s.isFakeBreakout, s.stopHuntZone,
            s.ema20Spread, s.ema50Spread, s.ema200Spread, s.emaTrend, s.bodyPct, s.wickRatio, s.volumeZ, s.timeOfDay,
            s.indexType, s.priceRelToOpen, s.momentum, s.swingLowDef, s.rangeStatus, s.avgSessionVol, s.orderFlowBias, s.riskRewardRatio
        ];
    }

    private flattenSequence(snaps: MarketSnapshot[]): number[] {
        // Ensure we always have 3 candles by padding if necessary
        const windowSize = 3;
        const lastThree = snaps.slice(-windowSize);
        while (lastThree.length < windowSize) {
            lastThree.unshift(lastThree[0] || {} as any);
        }
        return lastThree.flatMap(s => this.vectorize(s));
    }

    decide(snaps: MarketSnapshot[]): AIAction {
        const vec = this.flattenSequence(snaps);
        const result = this.brain.forward(vec);
        const rawAction = result[0];
        const rawSL = result[1];
        const rawTP = result[2];

        const current = snaps[snaps.length - 1];

        let type: AIAction['type'] = 'WAIT';
        let confidence = 0.5;

        // ── Institutional Trap Lockdown (Anti-Trap Logic) ──
        let trapLockdown = false;
        let forceWait = false;

        if (current.isFakeBreakout > 0.5) trapLockdown = true;
        if (Math.abs(current.momentum) > 0.001 && current.volumeZ < 0.6) trapLockdown = true;
        if (current.isLiquidityGrab > 0.5 && current.volumeZ < 0.8) forceWait = true;

        // ── Trend Alignment & Dynamic Thresholding ──
        // Center is 0.5. >0.5 is LONG, <0.5 is SHORT.
        let baseMargin = current.tradesTakenToday === 0 ? 0.08 : 0.18; // Morning needs less margin

        // Trap Lockdown makes trades requires much higher conviction
        if (trapLockdown) baseMargin += 0.15;

        let longMargin = baseMargin;
        let shortMargin = baseMargin;

        // Trend Filtering: Penalize counter-trend trades heavily
        // trendStrength: 1.0 (Super Bullish), 0.75 (Bullish), 0.25 (Bearish), 0.0 (Super Bearish)
        const isCounterTrendLong = current.trendStrength <= 0.25;
        const isCounterTrendShort = current.trendStrength >= 0.75;

        if (isCounterTrendLong) {
            longMargin += 0.20; // Needs >= 0.70+ to 0.90+ for a counter-trend LONG
            shortMargin -= 0.05; // Easier to take pro-trend SHORT
        }
        if (isCounterTrendShort) {
            shortMargin += 0.20; // Needs <= 0.30 to 0.10 for a counter-trend SHORT
            longMargin -= 0.05;  // Easier to take pro-trend LONG
        }

        const longThreshold = 0.5 + longMargin;
        const shortThreshold = 0.5 - shortMargin;

        // ── Volatility Adjustment ──
        // Only adjust the *remaining* distance to 1 or 0, do not shift the 0.5 center.
        const volAdjustment = current.volatility > 0.4 ? 0 : 0.05; // Reduce required margin slightly if volatile

        const finalLongReq = longThreshold - volAdjustment;
        const finalShortReq = shortThreshold + volAdjustment;

        if (!forceWait && rawAction >= finalLongReq) {
            type = 'LONG'; confidence = rawAction;
        } else if (!forceWait && rawAction <= finalShortReq) {
            type = 'SHORT'; confidence = 1 - rawAction;
        }

        // ── Volatility-Aware Target Scaling ──
        const volMultiplier = 1 + (current.volatility * 1.8); // Higher weight for profit expansion
        let tpPoints = 55;
        let slPoints = 25;

        // 1st Trade: Goliath Logic (Capture the morning spike)
        if (current.tradesTakenToday === 0) {
            tpPoints = 145; // Boosted for option spike capture
            slPoints = 45 * volMultiplier;
        } else {
            // Regressed TP/SL outputs scaled to market volatility
            tpPoints = Math.max(55, rawTP * 180 * volMultiplier);
            slPoints = Math.max(20, rawSL * 85 * volMultiplier);
        }

        let reasoning = '';
        if (trapLockdown && type === 'WAIT') reasoning = 'Retailer Trap Suspected (Volume/Fakeout Divergence)';
        else if (forceWait) reasoning = 'Waiting for Institutional Confirmation (Low Vol Sweep)';
        else if (type === 'LONG') {
            if (current.gapType === 1) reasoning = 'Gap Trap Reversal (Fill Move)';
            else if (current.isLiquidityGrab > 0.5) reasoning = 'Liquidity Sweep (Trap Rejected)';
            else if (current.tradesTakenToday === 0) reasoning = 'Morning Goliath (Structural Shift)';
            else if (current.rangeBreakout > 0.5) reasoning = 'Confirmed Structure Break';
            else reasoning = 'Bullish Institutional Flow';
        } else if (type === 'SHORT') {
            if (current.gapType === -1) reasoning = 'Gap Trap Reversal (Fill Move)';
            else if (current.isLiquidityGrab > 0.5) reasoning = 'Liquidity Sweep (Trap Rejected)';
            else if (current.tradesTakenToday === 0) reasoning = 'Morning Goliath (Structural Shift)';
            else if (current.rangeBreakout < -0.5) reasoning = 'Confirmed Structure Breakdown';
            else reasoning = 'Bearish Institutional Flow';
        }

        return { type, confidence, slPoints, tpPoints, reasoning };
    }

    learn(snaps: MarketSnapshot[], outcome: { type: 'LONG' | 'SHORT', pnl: number, maxFavorable: number, maxAdverse: number }) {
        const input = this.flattenSequence(snaps);
        const targetDirection = outcome.type === 'LONG' ? 1 : 0;

        // Reward asymmetry: If it was a clean win, strongly reinforce. If messy, reinforce lightly.
        const isCleanWin = outcome.pnl > 0 && (outcome.maxAdverse < outcome.maxFavorable * 0.35);

        // Multi-head targets (Expanded for higher-profit learning)
        const normalizedSL = Math.min(1, outcome.maxAdverse / 100);
        const normalizedTP = Math.min(1, outcome.maxFavorable / 250); // Learn to hold for 250pt moves

        if (isCleanWin) {
            this.dataset.push({
                input,
                output: { actionHead: targetDirection, slHead: normalizedSL, tpHead: normalizedTP }
            });
            this.trainingLogs.push(`💎 GOLDEN SETUP: ${outcome.type} (+${outcome.pnl.toFixed(0)}pts) - Clean.`);
        } else if (outcome.pnl > 0) {
            this.dataset.push({
                input,
                output: { actionHead: targetDirection === 1 ? 0.75 : 0.25, slHead: 0.5, tpHead: 0.4 }
            });
            this.trainingLogs.push(`⚠️ MESSY WIN: ${outcome.type} - High drawdown.`);
        } else {
            // Failure: reverse the directional target
            this.dataset.push({
                input,
                output: { actionHead: targetDirection === 1 ? 0.2 : 0.8, slHead: 0.8, tpHead: 0.1 }
            });
            this.trainingLogs.push(`⛔ REJECTED: ${outcome.type} failed. Increasing defensive bias.`);
        }
    }

    async train(onProgress?: (p: number) => void) {
        if (this.dataset.length > 0) {
            const inputs = tf.tensor2d(this.dataset.map(d => d.input));
            const targetAction = tf.tensor2d(this.dataset.map(d => [d.output.actionHead]));
            const targetSL = tf.tensor2d(this.dataset.map(d => [d.output.slHead]));
            const targetTP = tf.tensor2d(this.dataset.map(d => [d.output.tpHead]));

            await this.brain.model.fit(inputs, {
                actionHead: targetAction,
                slHead: targetSL,
                tpHead: targetTP
            }, {
                epochs: 150,
                batchSize: 32,
                shuffle: true,
                verbose: 0,
                callbacks: {
                    onEpochEnd: (epoch) => {
                        if (onProgress) onProgress(Math.round(((epoch + 1) / 150) * 100));
                    }
                }
            });

            inputs.dispose();
            targetAction.dispose();
            targetSL.dispose();
            targetTP.dispose();
            this.trainingLogs.push(`🧠 V5 BRAIN FINALIZED: Trained on ${this.dataset.length} alpha patterns.`);
            this.dataset = [];
        }
    }

    getLogs() { return this.trainingLogs.slice(-500); }
    reset() { this.brain = new AdvancedBrain(); this.trainingLogs = []; this.dataset = []; }
    exportJSON() { return JSON.stringify(this.brain.toJSON()); }
    importJSON(str: string) { try { this.brain.fromJSON(JSON.parse(str)); } catch (e) { } }
}
