import { NextRequest, NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, accessToken, securityId, exchangeSegment, instrument, fromDate, toDate } = body;

        if (!clientId || !accessToken || !securityId || !exchangeSegment || !instrument || !fromDate || !toDate) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const client = new DhanClient({ clientId, accessToken });

        const data = await client.getIntradayData({
            securityId,
            exchangeSegment,
            instrument,
            interval: '1',
            fromDate,
            toDate
        });

        return NextResponse.json({ success: true, data });

    } catch (error: any) {
        console.error('Dhan Historical Data API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch historical data',
            success: false
        }, { status: 500 });
    }
}
