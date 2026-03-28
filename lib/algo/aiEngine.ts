import * as synaptic from 'synaptic';

export interface MLTrainingFeatures {
    [key: string]: number;
    timeOfDay: number;       // 0 to 1 normalized
    candleSizeToAtr: number; // Candle total range / ATR
    volumeSpike: number;     // Current Volume / Average Volume
    lowerWickRatio: number;  // Lower Wick / Total Range
    upperWickRatio: number;  // Upper Wick / Total Range
    closePosition: number;   // Where the close is inside the range (0 to 1)
    direction: number;       // 1 for Bullish, 0 for Bearish
    sweepLowDist: number;    // Distance to 15-period low (0 if sweeping)
    sweepHighDist: number;   // Distance to 15-period high (0 if sweeping)
    distToPdh: number;       // Distance to Prev Day High
    distToPdl: number;       // Distance to Prev Day Low
    isFakeoutRecent: number; // 1 if candle is a breach-and-reclaim fakeout
    swingReversalCount: number; // How many pivots in current day
    gapSize: number;         // Opening gap %
    swingSize: number;       // Magnitude of recent swing
    pdlRetestSignal: number; // Binary near PDL
    pdhRetestSignal: number; // Binary near PDH
    isClosingFakeout: number; // Explicitly for closing-based fakeouts
    // Semantic Features (from User Notes)
    noteSentiment: number;   // -1 to 1 (Bearish to Bullish)
    noteStrength: number;    // 0 to 1 (Weak to Strong)
    noteVolKeyword: number;  // 1 if "volume" mentioned
    noteLevelKeyword: number; // 1 if "level/pdh/pdl/s/r" mentioned
    noteRejection: number;   // 1 if "reject/bounce" mentioned
    noteBreakout: number;    // 1 if "break/cross" mentioned
    noteLiquidity: number;   // 1 if "sweep/hunt" mentioned
}

export interface MLTrainingData {
    input: MLTrainingFeatures;
    output: {
        success: number; // 1 for profitable, 0 for loss
    };
    meta?: {
        timestamp: number;
        caseId?: number;
        caseName?: string;
        userNote?: string;
    };
}

/**
 * AI Engine powered by Synaptic.js
 * A robust, reliable machine learning library for JS environments.
 */
class AIEngine {
    private net: synaptic.Network;
    private trainer: synaptic.Trainer;
    private isHydrated: boolean;
    private inputSize = 25; // Deep Behavioral Context

    constructor() {
        // Build a Perceptron architecture: 25 inputs, 16 hidden, 1 output layer
        this.net = new synaptic.Architect.Perceptron(this.inputSize, 16, 1);
        this.trainer = new synaptic.Trainer(this.net);
        this.isHydrated = false;
    }

    // Convert object to array for matrix math and normalize features for Neural Net
    private featureToArray(f: MLTrainingFeatures): number[] {
        return [
            f.timeOfDay || 0,                            // Already 0 to 1
            Math.min(f.candleSizeToAtr, 3) / 3 || 0,     // Cap extreme sizes (above 3x ATR) to 1.0
            Math.min(f.volumeSpike, 5) / 5 || 0,         // Cap peak volume to 5x average
            f.lowerWickRatio || 0,                       // 0 to 1
            f.upperWickRatio || 0,                       // 0 to 1
            f.closePosition || 0,                        // 0 to 1
            f.direction || 0,                            // Binary 0 or 1
            Math.min(f.sweepLowDist * 100, 1) || 0,      // Scale fractional % down to 0-1 range. If 0 (Sweeping lows), stays 0.
            Math.min(f.sweepHighDist * 100, 1) || 0,     // Scale fractional % down to 0-1 range.
            Math.min(f.distToPdh * 50, 1) || 0,          // Sensitivity to Daily Levels
            Math.min(f.distToPdl * 50, 1) || 0,
            f.isFakeoutRecent || 0,                      // Binary
            Math.min(f.swingReversalCount / 10, 1) || 0, // Normalized (10 swings = max)
            Math.min(Math.abs(f.gapSize) * 50, 1) || 0,  // Gap intensity
            Math.min(f.swingSize / 5, 1) || 0,           // Pivot magnitude
            f.pdlRetestSignal || 0,                      // Retesting signals
            f.pdhRetestSignal || 0,
            f.isClosingFakeout || 0,                     // Specifically for close-based reversals
            (f.noteSentiment + 1) / 2 || 0.5,            // Map -1/1 to 0..1 range
            f.noteStrength || 0,                         // Intensity of observation
            f.noteVolKeyword || 0,
            f.noteLevelKeyword || 0,
            f.noteRejection || 0,
            f.noteBreakout || 0,
            f.noteLiquidity || 0
        ];
    }

    /**
     * Train the model with a batch of backtested setups
     */
    public trainModel(data: MLTrainingData[]): any {
        if (data.length === 0) return { error: 0, iterations: 0 };

        console.log(`[AIEngine] Starting training on ${data.length} samples with Synaptic.js...`);

        // Map raw data array into format Synaptic expects
        const trainingSet = data.map(d => ({
            input: this.featureToArray(d.input),
            output: [d.output.success]
        }));

        const stats = this.trainer.train(trainingSet, {
            rate: 0.1,
            iterations: 2000,
            error: 0.005,
            shuffle: true,
            log: 100, // Console log progress every 100 iterations
            cost: synaptic.Trainer.cost.CROSS_ENTROPY
        });

        this.isHydrated = true;
        console.log(`[AIEngine] Training complete:`, stats);
        return stats;
    }

    /**
     * Predict the success probability of a new trade setup
     */
    public predict(features: MLTrainingFeatures): number {
        if (!this.isHydrated) return 1.0;

        const input = this.featureToArray(features);
        const result = this.net.activate(input);

        return result[0]; // Output layer is 1 node
    }

    /**
     * Export the trained weights for storage
     */
    public exportWeights(): any {
        if (!this.isHydrated) return null;
        return this.net.toJSON();
    }

    /**
     * Import trained weights from storage
     */
    public importWeights(json: any) {
        if (json && json.neurons && json.connections) {
            this.net = synaptic.Network.fromJSON(json);
            this.trainer = new synaptic.Trainer(this.net);
            this.isHydrated = true;
            console.log(`[AIEngine] Synaptic AI weights successfully imported and hydrated.`);
        }
    }

    public getHydrationStatus(): boolean {
        return this.isHydrated;
    }
}

// Export as Singleton to share brain across the app
export const aiEngine = new AIEngine();
