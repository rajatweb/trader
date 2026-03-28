import { NextRequest, NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clientId, accessToken, securityId, exchangeSegment, instrument, expiryFlag, expiryCode, strike, drvOptionType, fromDate, toDate } = body;

        if (!clientId || !accessToken || !securityId || !exchangeSegment || !instrument || !expiryFlag || !fromDate || !toDate) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const client = new DhanClient({ clientId, accessToken });

        const commonParams = {
            securityId: Number(securityId),
            exchangeSegment: exchangeSegment || 'NSE_FNO',
            instrument: instrument || 'OPTIDX',
            expiryFlag: (expiryFlag || 'WEEK').toUpperCase() as 'WEEK' | 'MONTH',
            expiryCode: typeof expiryCode === 'number' ? expiryCode : Number(expiryCode || 0),
            strike: strike || 'ATM',
            requiredData: ['open', 'high', 'low', 'close', 'volume'],
            fromDate: String(fromDate),
            toDate: String(toDate),
            interval: '1'
        };

        console.log('--- DHAN ROLLING PAYLOAD ---', JSON.stringify(commonParams, null, 2));

        const [ceData, peData] = await Promise.all([
            client.getRollingOptionData({
                ...commonParams,
                drvOptionType: 'CALL'
            }),
            client.getRollingOptionData({
                ...commonParams,
                drvOptionType: 'PUT'
            })
        ]);

        // Merge results
        const merged = {
            ce: ceData.data?.ce || ceData.data || null,
            pe: peData.data?.pe || peData.data || null
        };

        return NextResponse.json({ success: true, data: { data: merged } });

    } catch (error: any) {
        console.error('Dhan Rolling Option API Error:', error);
        return NextResponse.json({
            error: error.message || 'Failed to fetch rolling option data',
            success: false
        }, { status: 500 });
    }
}
