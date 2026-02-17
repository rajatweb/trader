import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

// Using a global variable for in-memory caching in the server environment (note: this persists only as long as the lambda/process is warm)
let cachedInstruments: any[] = [];
const CSV_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

export interface Instrument {
    exchange: string;
    segment: string;
    securityId: string;
    symbol: string;
    name: string;
    lotSize: number;
    expiry?: string;
    strike?: number;
    optionType?: string;
}

export async function getInstruments() {
    if (cachedInstruments.length > 0) {
        return cachedInstruments;
    }

    try {
        console.log('Fetching Dhan Master Scrip CSV...');
        const response = await fetch(CSV_URL);
        const text = await response.text();

        console.log('Parsing CSV...');
        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
        });

        // Filter and map to a compact format to save memory
        // Dhan CSV Headers typically:
        // SEM_EXM_EXCH_ID, SEM_SEGMENT, SEM_SMST_SECURITY_ID, SEM_INSTRUMENT_NAME, SEM_TRADING_SYMBOL, SEM_LOT_UNITS, SEM_EXPIRY_DATE, SEM_STRIKE_PRICE, SEM_OPTION_TYPE, ...

        cachedInstruments = parsed.data
            .filter((row: any) => {
                const exch = row['SEM_EXM_EXCH_ID'];
                // Filter primarily for NSE/NFO/INDICES/MCX to keep it relevant for typical traders
                return (exch === 'NSE' || exch === 'BSE' || exch === 'MCX');
            })
            .map((row: any) => ({
                exchange: row['SEM_EXM_EXCH_ID'],
                segment: mapSegment(row['SEM_EXM_EXCH_ID'], row['SEM_SEGMENT']), // Helper to map 'E', 'D' to API segments like 'NSE_EQ'
                securityId: row['SEM_SMST_SECURITY_ID'],
                symbol: row['SEM_TRADING_SYMBOL'],
                name: row['SEM_INSTRUMENT_NAME'],
                lotSize: Number(row['SEM_LOT_UNITS']),
                expiry: row['SEM_EXPIRY_DATE'],
                strike: row['SEM_STRIKE_PRICE'],
                optionType: row['SEM_OPTION_TYPE']
            }));

        console.log(`Loaded ${cachedInstruments.length} instruments.`);
        return cachedInstruments;
    } catch (error) {
        console.error('Failed to fetch instruments:', error);
        return [];
    }
}

function mapSegment(exchange: string, segment: string): string {
    // Basic mapping based on Dhan documentation patterns
    if (exchange === 'NSE') {
        if (segment === 'E') return 'NSE_EQ';
        if (segment === 'D') return 'NSE_FNO'; // or 'NFO'
        if (segment === 'C') return 'NSE_CURRENCY';
        if (segment === 'I') return 'IDX_I';
    }
    if (exchange === 'BSE') {
        if (segment === 'E') return 'BSE_EQ';
        if (segment === 'D') return 'BSE_FNO';
        if (segment === 'I') return 'IDX_I'; // BSE Index often maps similarly or has specific handling
    }
    if (exchange === 'MCX') return 'MCX_COMM';
    return `${exchange}_${segment}`;
}

export async function searchInstruments(query: string) {
    const instruments = await getInstruments();
    const q = query.toUpperCase();

    // Simple limiting to 50 results
    return instruments
        .filter(i => i.symbol && i.symbol.includes(q))
        .slice(0, 50);
}
