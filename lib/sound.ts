export type SoundType = 'success' | 'error' | 'notification' | 'sl_hit' | 'placed';

class SoundManager {
    private audioContext: AudioContext | null = null;

    private getContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return this.audioContext;
    }

    play(type: SoundType) {
        try {
            const ctx = this.getContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            switch (type) {
                case 'placed':
                    // Short high ping
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;

                case 'success': // Executed
                    // "Ka-ching" inspired two-tone
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.setValueAtTime(1200, now + 0.1);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;

                case 'error': // Rejected
                    // Low buzz
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;

                case 'sl_hit': // Warning / SL Triggered
                    // Descending alert
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.linearRampToValueAtTime(300, now + 0.4);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                    break;

                case 'notification':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(500, now);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
            }
        } catch (e) {
            console.error('Audio playback failed', e);
        }
    }
}

export const soundManager = new SoundManager();
