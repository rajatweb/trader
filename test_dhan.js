async function test() {
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  
  const res = await fetch('http://localhost:9000/api/dhan/intraday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        clientId: 'dummy',
        accessToken: 'dummy',
        securityId: '25',
        exchangeSegment: 'IDX_I',
        instrument: 'INDEX',
        interval: '1',
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate
    })
  });
  const json = await res.json();
  if (!json.success) console.log(json);
  else console.log('Intraday lengths:', json.data ? (Array.isArray(json.data) ? json.data.length : Object.keys(json.data).map(k=>json.data[k].length)) : json);
}
test();
