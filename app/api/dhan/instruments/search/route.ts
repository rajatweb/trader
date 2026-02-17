import { NextResponse } from 'next/server';
import Papa from 'papaparse';

// In-memory cache for the server instance (Next.js serverless functions might lose this, but it works on standard Vercel cold starts/warm starts)
let cachedInstruments: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const CSV_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

// Interface for parsed instrument
interface Instrument {
    exchange: string;
    segment: string;
    securityId: string;
    symbol: string;
    name: string;
    lotSize: number;
    expiry?: string; // Original string expiry from CSV
    expiryDate?: number; // Timestamp for sorting
    strike?: number;
    optionType?: string;
    tradingSymbol: string;
    expiryFlag?: string;
}

async function fetchInstruments(): Promise<void> {

    // If cache is valid, skip
    if (cachedInstruments.length > 0 && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        return;
    }

    try {
        console.log('Fetching Dhan Master Scrip CSV...');
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Failed to fetch CSV');

        const text = await response.text();
        console.log('Parsing CSV...');

        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
        });

        // Filter valid entries to save memory
        // Dhan CSV Headers:
        // SEM_EXM_EXCH_ID, SEM_SEGMENT, SEM_SMST_SECURITY_ID, SEM_INSTRUMENT_NAME, SEM_TRADING_SYMBOL, SEM_LOT_UNITS, SEM_expiry_code, ...
        // We only care about active exchanges for typical retail trading

        cachedInstruments = parsed.data
            .filter((row: any) => {
                const exch = row['SEM_EXM_EXCH_ID'];
                // Keep NSE, BSE, MCX
                return (exch === 'NSE' || exch === 'BSE' || exch === 'MCX');
            })
            .map((row: any) => {
                const exch = row['SEM_EXM_EXCH_ID'];
                const seg = row['SEM_SEGMENT']; // E, D, C, I, M

                // Construct API-compatible segment string
                let apiSegment = '';
                if (exch === 'NSE') {
                    if (seg === 'E') apiSegment = 'NSE_EQ';
                    else if (seg === 'D') apiSegment = 'NSE_FNO';
                    else if (seg === 'C') apiSegment = 'NSE_CURRENCY';
                    else if (seg === 'I') apiSegment = 'IDX_I';
                } else if (exch === 'BSE') {
                    if (seg === 'E') apiSegment = 'BSE_EQ';
                    else if (seg === 'D') apiSegment = 'BSE_FNO';
                    else if (seg === 'I') apiSegment = 'IDX_I';
                } else if (exch === 'MCX') {
                    apiSegment = 'MCX_COMM';
                }

                // Use SEM_CUSTOM_SYMBOL for cleaner display name if available, else SEM_TRADING_SYMBOL
                const displayName = row['SEM_CUSTOM_SYMBOL'] || row['SEM_TRADING_SYMBOL'];
                // Parse Expiry: usually "2024-02-29 14:30:00" or simple date
                const expiryDate = row['SEM_EXPIRY_DATE'] ? new Date(row['SEM_EXPIRY_DATE']).getTime() : undefined;

                return {
                    exchange: exch,
                    segment: apiSegment,
                    securityId: row['SEM_SMST_SECURITY_ID'],
                    symbol: displayName, // Use custom symbol for cleaner display
                    name: row['SEM_INSTRUMENT_NAME'],
                    lotSize: Number(row['SEM_LOT_UNITS'] || 1),
                    expiry: row['SEM_EXPIRY_DATE'],
                    expiryDate: expiryDate, // For sorting
                    strike: Number(row['SEM_STRIKE_PRICE'] || 0),
                    optionType: row['SEM_OPTION_TYPE'], // CE, PE
                    tradingSymbol: row['SEM_TRADING_SYMBOL'], // The actual trading symbol required for APIs
                    expiryFlag: row['SEM_EXPIRY_FLAG'] // W - Weekly, M - Monthly
                };
            });

        lastFetchTime = Date.now();
        console.log(`Loaded ${cachedInstruments.length} instruments.`);

    } catch (error) {
        console.error('Error fetching instruments:', error);
        cachedInstruments = []; // Reset on error
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ results: [] });
    }

    await fetchInstruments();

    const q = query.toUpperCase().trim();

    // 1. Parse Query
    // tokens: text parts (e.g., "BANK", "NIFTY")
    // numbers: potential strikes (e.g., 61000)
    // types: CE or PE
    const parts = q.split(/\s+/);
    const numbers = parts.filter(p => /^\d+(\.\d+)?$/.test(p)).map(Number);
    const types = parts.filter(p => ['CE', 'PE', 'CALL', 'PUT'].includes(p)).map(p => p[0] === 'C' ? 'CALL' : 'PUT');
    const textTokens = parts.filter(p => !/^\d+(\.\d+)?$/.test(p) && !['CE', 'PE', 'CALL', 'PUT'].includes(p));

    // 2. Filter Instruments
    // We want to be efficient. 

    const results = cachedInstruments.filter((inst: Instrument) => {
        // A. Filter by Option Type (if specified)
        if (types.length > 0) {
            // User specified CE/PE, so this MUST be an option and MUST match type
            if (!inst.optionType) return false; // Not an option
            // Map simple 'CE'/'PE' from CSV to standard user query check
            const instType = inst.optionType === 'CE' ? 'CALL' : (inst.optionType === 'PE' ? 'PUT' : '');
            if (instType === '' || !types.includes(instType as "CALL" | "PUT")) return false;
        }

        // B. Filter by Strike (if numbers specified)
        let matchesStrike = true;
        if (numbers.length > 0) {
            // If it's an option (has strike > 0), it MUST match one of the numbers
            if (inst.strike && inst.strike > 0) {
                matchesStrike = numbers.includes(inst.strike);
            } else {
                // It's an Equity/Index (strike 0).
                // Only keep it if the number is part of the name (e.g. "NIFTY 50")
                // Otherwise, "RELIANCE 2500" should NOT show RELIANCE Equity
                const nameHasNumber = numbers.some(num => inst.symbol.includes(num.toString()) || inst.name.includes(num.toString()));
                matchesStrike = nameHasNumber;
            }
        }
        if (!matchesStrike) return false;

        // C. Filter by Text Tokens (Name must contain all text parts)
        const fullName = `${inst.symbol} ${inst.name} ${inst.tradingSymbol}`.toUpperCase();
        const matchesText = textTokens.every(token => fullName.includes(token));

        return matchesText;
    });

    // 3. Sort Results
    // Priority:
    // 1. Exact Name Match (Indices/Stocks)
    // 2. Options with Nearest Expiry (if searching options)
    // 3. Alphabetical

    const now = Date.now();
    const isOptionSearch = numbers.length > 0 || types.length > 0;

    results.sort((a, b) => {
        // Prefer exact symbol matches for clean queries
        if (a.symbol === q) return -1;
        if (b.symbol === q) return 1;

        // If searching for options, prioritize Nearest Expiry
        if (isOptionSearch) {
            // If both are options with expiry
            if (a.expiryDate && b.expiryDate) {
                // Ignore expired? (Though cache might have old data, but usually master is for active)
                // Sort ascending (nearest future date first)
                if (a.expiryDate !== b.expiryDate) {
                    return a.expiryDate - b.expiryDate;
                }
            }
            // Apply expiry flag priority (W > M for traders generally? Or just date is enough)
            // Usually date is enough. 
        } else {
            // If Text Search (e.g. "INFY"), prioritize NSE_EQ over Options
            const aIsEq = a.segment.includes('EQ') || a.segment.includes('IDX');
            const bIsEq = b.segment.includes('EQ') || b.segment.includes('IDX');
            if (aIsEq && !bIsEq) return -1;
            if (!aIsEq && bIsEq) return 1;
        }

        // Fallback to alphabetical if other criteria are equal
        if (a.symbol < b.symbol) return -1;
        if (a.symbol > b.symbol) return 1;
        return 0;
    });

    return NextResponse.json({ results: results.slice(0, 50) });
}

