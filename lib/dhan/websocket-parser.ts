/**
 * Parser for Dhan Live Market Feed binary packets.
 * Documentation: https://api.dhan.co/v2-live-feed
 */

export enum FeedResponseCode {
    Ticker = 2,
    Quote = 4,
    OI = 5,
    PrevClose = 6,
    Full = 8,
    Disconnect = 50
}

export enum FeedRequestCode {
    Unsubscribe = 12,
    Ticker = 15,
    Quote = 17,
    Full = 21
}

export interface MarketDataUpdate {
    securityId: number;
    segment: number;
    type: FeedResponseCode;
    ltp?: number;
    ltt?: number;
    volume?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    prevClose?: number;
    oi?: number;
    avgPrice?: number;
}

export function parseDhanBinaryPacket(buffer: ArrayBuffer): MarketDataUpdate[] {
    const updates: MarketDataUpdate[] = [];
    const view = new DataView(buffer);
    let offset = 0;

    while (offset < buffer.byteLength) {
        if (offset + 8 > buffer.byteLength) break;

        const responseCode = view.getUint8(offset);
        const messageLength = view.getInt16(offset + 1, true);
        const segment = view.getUint8(offset + 3);
        const securityId = view.getInt32(offset + 4, true);

        const update: MarketDataUpdate = {
            securityId,
            segment,
            type: responseCode as FeedResponseCode
        };

        try {
            switch (responseCode) {
                case FeedResponseCode.Ticker:
                    if (offset + 16 <= buffer.byteLength) {
                        update.ltp = view.getFloat32(offset + 8, true);
                        update.ltt = view.getInt32(offset + 12, true);
                    }
                    break;

                case FeedResponseCode.Quote:
                    if (offset + 50 <= buffer.byteLength) {
                        update.ltp = view.getFloat32(offset + 8, true);
                        update.ltt = view.getInt32(offset + 14, true);
                        update.avgPrice = view.getFloat32(offset + 18, true);
                        update.volume = view.getInt32(offset + 22, true);
                        update.open = view.getFloat32(offset + 34, true);
                        update.close = view.getFloat32(offset + 38, true);
                        update.high = view.getFloat32(offset + 42, true);
                        update.low = view.getFloat32(offset + 46, true);
                    }
                    break;

                case FeedResponseCode.PrevClose:
                    // console.log(`PrevClose: ${securityId} -> ${view.getFloat32(offset + 8, true)}`);
                    if (offset + 16 <= buffer.byteLength) {
                        update.prevClose = view.getFloat32(offset + 8, true);
                        update.oi = view.getInt32(offset + 12, true);
                    }
                    break;

                case FeedResponseCode.OI:
                    if (offset + 12 <= buffer.byteLength) {
                        update.oi = view.getInt32(offset + 8, true);
                    }
                    break;

                case FeedResponseCode.Full:
                    if (offset + 162 <= buffer.byteLength) {
                        update.ltp = view.getFloat32(offset + 8, true);
                        update.ltt = view.getInt32(offset + 14, true);
                        update.avgPrice = view.getFloat32(offset + 18, true);
                        update.volume = view.getInt32(offset + 22, true);
                        update.oi = view.getInt32(offset + 34, true);
                        update.open = view.getFloat32(offset + 46, true);
                        update.close = view.getFloat32(offset + 50, true);
                        update.high = view.getFloat32(offset + 54, true);
                        update.low = view.getFloat32(offset + 58, true);
                    }
                    break;
            }
        } catch (e) {
            console.error("Error parsing packet payload:", e);
        }

        updates.push(update);

        let jump = 8 + messageLength;
        if (messageLength <= 0) {
            switch (responseCode) {
                case FeedResponseCode.Ticker: jump = 16; break;
                case FeedResponseCode.Quote: jump = 50; break;
                case FeedResponseCode.PrevClose: jump = 16; break;
                case FeedResponseCode.OI: jump = 12; break;
                case FeedResponseCode.Full: jump = 162; break;
                default: jump = 8;
            }
        }
        offset += jump;
    }

    return updates;
}
