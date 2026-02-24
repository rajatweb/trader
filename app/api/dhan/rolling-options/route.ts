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

        // Ensure array is passed if provided as a string or undefined
        const requestedData = params.requiredData || ["open", "high", "low", "close", "volume", "timestamp", "strike", "spot"];

        const response = await client.getRollingOptionData({
            ...params,
            requiredData: requestedData,
            securityId: String(params.securityId), // Ensure string
            expiryCode: Number(params.expiryCode || 1) // Default to 1 (near expiry)
        });

        return NextResponse.json({ success: true, data: response });
    } catch (error: any) {
        console.error('Rolling Options API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch rolling option data',
            success: false
        }, { status: 500 });
    }
}
