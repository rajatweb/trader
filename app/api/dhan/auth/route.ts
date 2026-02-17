import { NextResponse } from 'next/server';
import { DhanClient } from '@/lib/dhan/client';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, accessToken } = body;

        console.log("Checking Dhan Auth V2 for Client ID:", clientId);

        if (!clientId || !accessToken) {
            return NextResponse.json(
                { success: false, error: 'Missing Client ID or Access Token' },
                { status: 400 }
            );
        }

        const client = new DhanClient({ clientId, accessToken });
        const isValid = await client.validateSession();

        if (isValid) {
            const profile = await client.getProfile();
            console.log("Dhan session valid for:", profile.dhanClientId);
            return NextResponse.json({ success: true, data: profile });
        } else {
            console.warn("Dhan session invalid for:", clientId);
            return NextResponse.json(
                { success: false, error: 'Invalid credentials or API error from Dhan' },
                { status: 401 }
            );
        }
    } catch (error: any) {
        console.error("Dhan Auth Route Error:", error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
