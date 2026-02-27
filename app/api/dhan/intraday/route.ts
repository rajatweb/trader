import { NextRequest, NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, accessToken, ...params } = body;

        if (!clientId || !accessToken) {
            return NextResponse.json({ error: 'Client ID and Access Token are required' }, { status: 400 });
        }

        const client = new DhanClient({ clientId, accessToken });
        const dhanResponse = await client.getIntradayData(params as any);

        // Dhan returns data in columns: { open: [], high: [], ... }
        const dataRoot = dhanResponse.data || dhanResponse;

        // Case 1: Already an array
        if (Array.isArray(dataRoot)) {
            return NextResponse.json({ success: true, data: dataRoot });
        }

        // Case 2: Column-based (Object of arrays)
        const openKey = dataRoot.open ? 'open' : (dataRoot.Open ? 'Open' : null);

        if (openKey && Array.isArray(dataRoot[openKey])) {
            const keys = Object.keys(dataRoot);
            const length = dataRoot[openKey].length;
            const formatted = [];

            for (let i = 0; i < length; i++) {
                const candle: any = {};
                keys.forEach(key => {
                    if (Array.isArray(dataRoot[key])) {
                        const val = dataRoot[key][i];
                        const lowerKey = key.toLowerCase();

                        if (['open', 'high', 'low', 'close', 'volume'].includes(lowerKey)) {
                            candle[lowerKey] = val;
                        } else if (lowerKey === 'start_time' || lowerKey === 'time' || lowerKey === 'timestamp') {
                            candle.time = val;
                            candle.start_Time = val;
                            candle.start_time = val;
                            candle.timestamp = val;
                        } else {
                            candle[key] = val;
                        }
                    }
                });
                formatted.push(candle);
            }
            return NextResponse.json({ success: true, data: formatted });
        }

        return NextResponse.json({ success: true, data: [], raw: dhanResponse });
    } catch (error: any) {
        console.error("Dhan Intraday API Error:", error.message);
        return NextResponse.json({ error: error.message || 'Internal Server Error', success: false }, { status: 500 });
    }
}
