import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        let modelStr = body.model;

        // Handle if they passed raw JSON object instead of string
        if (!modelStr && body.weights) {
            modelStr = JSON.stringify(body.weights, null, 2);
        } else if (typeof body.model === 'object') {
            modelStr = JSON.stringify(body.model, null, 2);
        }

        if (!modelStr) {
            return NextResponse.json({ success: false, error: 'No model data provided' }, { status: 400 });
        }

        // Save the model to a public JSON file so the client can fetch it
        const filePath = path.join(process.cwd(), 'public', 'ml_weights.json');

        fs.writeFileSync(filePath, modelStr, 'utf8');

        return NextResponse.json({ success: true, message: 'Model saved successfully' });
    } catch (error: any) {
        console.error("Failed to save model:", error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to save model' }, { status: 500 });
    }
}
