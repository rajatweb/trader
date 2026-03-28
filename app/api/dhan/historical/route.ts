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

        // Dhan Index Historical API often requires 'D' for daily candles rather than '1D'
        const finalParams = { ...params };
        if (finalParams.interval === '1D') finalParams.interval = 'D';

        const dhanResponse = await client.getHistoricalData(finalParams as any);

        // Dhan returns data in columns: { open: [], high: [], ... }
        // We look for 'open' or 'Open' to detect the column-based structure
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

                        // Standardize core price keys
                        if (['open', 'high', 'low', 'close', 'volume'].includes(lowerKey)) {
                            candle[lowerKey] = val;
                        }
                        // Standardize time keys (Strategy expects 'time' or 'start_Time')
                        else if (lowerKey === 'start_time' || lowerKey === 'time' || lowerKey === 'timestamp') {
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

        return NextResponse.json({
            success: true,
            data: [],
            debug: { hasData: !!dhanResponse.data, keys: Object.keys(dataRoot), status: dhanResponse.status }
        });

    } catch (error: any) {
        console.error('Dhan Historical Data API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch historical data',
            success: false
        }, { status: 500 });
    }
}
