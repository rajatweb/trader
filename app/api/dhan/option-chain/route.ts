import { NextRequest, NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, accessToken, underlyingScrip, underlyingSeg, expiry } = body;

        if (!clientId || !accessToken || !underlyingScrip || !underlyingSeg) {
            return NextResponse.json({ error: 'Missing required credentials or scrip details' }, { status: 400 });
        }

        const client = new DhanClient({ clientId, accessToken });

        if (!expiry) {
            // If expiry is missing, fetch the expiry list first
            const expiries = await client.getOptionChainExpiry(underlyingScrip, underlyingSeg);
            return NextResponse.json({ success: true, type: 'expiry_list', data: expiries });
        }

        // Fetch actual option chain data
        const optionChain = await client.getOptionChain({
            underlyingScrip,
            underlyingSeg,
            expiry
        });

        return NextResponse.json({ success: true, type: 'chain_data', data: optionChain });

    } catch (error: any) {
        console.error('Dhan Option Chain API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch option chain data',
            success: false
        }, { status: 500 });
    }
}
