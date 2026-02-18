import { parseDhanBinaryPacket, MarketDataUpdate } from './websocket-parser';
export type { MarketDataUpdate };

export type OnUpdateCallback = (updates: MarketDataUpdate[]) => void;

export class DhanFeedClient {
    private socket: WebSocket | null = null;
    private clientId: string;
    private accessToken: string;
    private onUpdate: OnUpdateCallback;
    private instruments: Set<string> = new Set(); // format: "segment:securityId"
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isManualDisconnect = false;
    private onError?: (error: string) => void;
    private onStatusChange?: (status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR') => void;

    constructor(
        clientId: string,
        accessToken: string,
        onUpdate: OnUpdateCallback,
        onError?: (error: string) => void,
        onStatusChange?: (status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR') => void
    ) {
        this.clientId = (clientId || '').toString().trim();
        this.accessToken = (accessToken || '').trim();
        this.onUpdate = onUpdate;
        this.onError = onError;
        this.onStatusChange = onStatusChange;
    }

    connect() {
        if (!this.clientId || !this.accessToken) {
            console.warn('Dhan Feed: Missing credentials, skipping connection.');
            return;
        }

        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.isManualDisconnect = false;

        const url = `wss://api-feed.dhan.co?version=2&token=${encodeURIComponent(this.accessToken)}&clientId=${encodeURIComponent(this.clientId)}&authType=2`;

        try {
            if (this.onStatusChange) this.onStatusChange('CONNECTING');
            this.socket = new WebSocket(url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('Dhan Feed WebSocket Connected');
                if (this.onStatusChange) this.onStatusChange('CONNECTED');
                this.reconnectAttempts = 0;
                this.resubscribe();
            };

            this.socket.onmessage = (event) => {
                // Handle text messages (Ping/Pong/Connection status)
                if (typeof event.data === 'string') {
                    // console.log("Text Message:", event.data);
                    // Log text messages for debugging
                    console.log("[Dhan Feed] Text Message:", event.data);
                    // Explicitly handle ping if needed (though unlikely)
                    if (event.data === 'Ping') {
                        // Responding with Pong if server expects text-based ping-pong
                        // this.socket?.send('Pong');
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    const updates = parseDhanBinaryPacket(event.data);
                    if (updates.length > 0) {
                        this.onUpdate(updates);
                    }
                }
            };

            this.socket.onerror = () => {
                // onerror usually doesn't have details, but we log it
                console.error('Dhan Feed WebSocket Error');
                if (this.onStatusChange) this.onStatusChange('ERROR');
            };

            this.socket.onclose = (event) => {
                // Ignore code 1000 (normal closure) if disconnected manually
                if (this.isManualDisconnect) {
                    if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
                    return;
                }

                const reason = event.reason || (event.code === 1006 ? 'Abnormal Closure (Check Token/IP Block)' : 'Unknown');
                console.warn(`Dhan Feed WebSocket Closed (Code: ${event.code}, Reason: ${reason})`);

                if (this.onStatusChange) this.onStatusChange('DISCONNECTED');

                if (event.code === 4001) {
                    const msg = 'Invalid Token (Code 4001). Please re-connect broker.';
                    if (this.onError) this.onError(msg);
                    return; // Don't reconnect on auth failure
                }

                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.attemptReconnect();
                }
            };
        } catch (err) {
            console.error('Failed to create WebSocket instance:', err);
        }
    }

    private attemptReconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
        console.log(`Dhan Feed: Reconnecting in ${delay / 1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        if (this.reconnectAttempts > 3) {
            console.warn("Frequent disconnections detected. Please check your internet connection or if your IP is being rate-limited.");
        }

        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Subscribe to instruments.
     * @param instruments List of instruments
     * @param mode Request Code: 15 (Ticker), 17 (Quote), 21 (Full). Defaults to 17 (Quote) for better data.
     */
    subscribe(instruments: { segment: string; securityId: string }[], mode: number = 17) {
        // Filter out TEST instruments (Dhan doesn't know about them)
        const validInstruments = instruments.filter(i => i.segment !== 'TEST');
        if (validInstruments.length === 0) return;

        // Add to our internal set for resubscription
        validInstruments.forEach(i => this.instruments.add(`${i.segment}:${i.securityId}`));

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        // Dhan limits: 100 instruments per request, max 5000 per connection
        const batchSize = 100;

        for (let i = 0; i < instruments.length; i += batchSize) {
            const batch = instruments.slice(i, i + batchSize);
            const request = {
                RequestCode: mode,
                InstrumentCount: batch.length,
                InstrumentList: batch.map(inst => ({
                    ExchangeSegment: inst.segment,
                    SecurityId: inst.securityId
                }))
            };
            this.socket.send(JSON.stringify(request));
        }
    }

    private resubscribe() {
        if (this.instruments.size === 0) return;
        const list = Array.from(this.instruments).map(key => {
            const [segment, securityId] = key.split(':');
            return { segment, securityId };
        });
        this.subscribe(list);
    }

    disconnect() {
        this.isManualDisconnect = true;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.socket) {
            // Send unsubscribe or disconnect packet if needed, but close() is usually enough
            try {
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({ "RequestCode": 12 }));
                }
            } catch (e) {
                console.warn('Error sending disconnect packet:', e);
            }
            this.socket.close();
            this.socket = null;
            // Actually let's clear instruments if we're purposefully disconnecting to avoid stale subs.
            this.instruments.clear();
        }
    }
}
