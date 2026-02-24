import { NextRequest, NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, accessToken, params } = body;

        if (!clientId || !accessToken || !params) {
            return NextResponse.json({ error: 'Missing credentials or parameters' }, { status: 400 });
        }

        const client = new DhanClient({ clientId, accessToken });

        const response = await client.getIntradayData({
            ...params,
            securityId: String(params.securityId),
        });

        // The response format for intraday is slightly different than rolling-options
        // It returns { open: [], high: [], low: [], close: [], volume: [], timestamp: [] } directly or wrapped
        return NextResponse.json({ success: true, data: response });
    } catch (error: any) {
        console.error('Intraday API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch intraday data',
            success: false
        }, { status: 500 });
    }
}
