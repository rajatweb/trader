const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzcxOTgyOTg0LCJpYXQiOjE3NzE4OTY1ODQsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMDAwMzA1MjUwIn0.e7aqgW609PxGMWsJf4Rbc_ylzrTmP8mPUusDEM9dc7MvF8B5GKR9p-tJVwKRRQfVGrKVZS2WVc7a9CAySpKM7A';
const clientId = '1000305250';

async function test() {
    const date = '2025-01-01';
    
    // Fetch Spot
    const resSpot = await fetch('https://api.dhan.co/v2/charts/intraday', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'access-token': token, 'client-id': clientId },
        body: JSON.stringify({
            securityId: "25",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "1",
            fromDate: `${date} 09:15:00`,
            toDate: `${date} 15:30:00`
        })
    });
    const spotRaw = await resSpot.json();
    const spot = spotRaw.data || spotRaw;

    // Fetch ATM Put (50900)
    // We'll also try a deep ITM/OTM Put to see if availability is the issue
    async function getOpt(strike) {
        const res = await fetch('https://api.dhan.co/v2/charts/rollingoption', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'access-token': token, 'client-id': clientId },
            body: JSON.stringify({
                exchangeSegment: 'NSE_FNO',
                interval: '1',
                securityId: '25', 
                instrument: 'OPTIDX',
                expiryFlag: 'WEEK',
                expiryCode: 1, // Jan 8
                strike: strike, 
                drvOptionType: 'PUT',
                requiredData: ['open', 'high', 'low', 'close', 'volume', 'timestamp', 'strike', 'spot'],
                fromDate: date,
                toDate: date
            })
        });
        const d = await res.json();
        return d.data?.pe;
    }

    const put50900 = await getOpt('50900');

    if (!spot || !put50900) {
        console.log("Failed to fetch. Spot:", !!spot, "Put:", !!put50900);
        return;
    }

    console.log("Time | Spot Close | Put Close | Vol | Strike");
    console.log("-----------------------------------------------");
    
    for (let i = 0; i < 30; i++) {
        const time = new Date(put50900.timestamp[i] * 1000).toLocaleTimeString();
        const sc = spot.close[i] || 'N/A';
        const pc = put50900.close[i] || 'N/A';
        const v = put50900.volume[i] || 0;
        const stk = put50900.strike[i] || 'N/A';
        console.log(`${time} | ${sc} | ${pc} | ${v} | ${stk}`);
    }
}

test();
