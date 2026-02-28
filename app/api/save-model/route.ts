import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
    try {
        const { model } = await req.json();

        if (!model) {
            return NextResponse.json({ success: false, error: 'No model data provided' }, { status: 400 });
        }

        // Save the model to a public JSON file so the client can fetch it
        const filePath = path.join(process.cwd(), 'public', 'ml_weights.json');

        fs.writeFileSync(filePath, model, 'utf8');

        return NextResponse.json({ success: true, message: 'Model saved successfully' });
    } catch (error: any) {
        console.error("Failed to save model:", error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to save model' }, { status: 500 });
    }
}
