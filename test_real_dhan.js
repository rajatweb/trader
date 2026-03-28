async function test() {
  const cid = '1000305250';
  const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzcyMzM4NzgwLCJpYXQiOjE3NzIyNTIzODAsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMDAwMzA1MjUwIn0.tlydP8gOIao6r7kXg2GfQYdZoI0YSL70JYQ8UbRnli9dUFZJYHZKEPN225tqdgez7FC_ceMGFSvaij3MJdDc8w';
  
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate30 = new Date();
  fromDate30.setDate(fromDate30.getDate() - 30);
  const fromDate5Str = '2026-02-23'; // example 5 day

  console.log("Testing Historical (Daily) API...");
  const hist = await fetch('http://localhost:9000/api/dhan/historical', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        clientId: cid, accessToken: token, securityId: '25', exchangeSegment: 'IDX_I', instrument: 'INDEX',
        expiryCode: 0, interval: 'D', fromDate: fromDate30.toISOString().split('T')[0], toDate: toDate
    })
  });
  const histJson = await hist.json();
  console.log('Historical 30 days D Length:', histJson.data ? (Array.isArray(histJson.data) ? histJson.data.length : 'Obj') : histJson);

  console.log("Testing Intraday API...");
  const intra = await fetch('http://localhost:9000/api/dhan/intraday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        clientId: cid, accessToken: token, securityId: '25', exchangeSegment: 'IDX_I', instrument: 'INDEX',
        interval: '1', fromDate: fromDate5Str, toDate: toDate
    })
  });
  const intraJson = await intra.json();
  console.log('Intraday 5 days 1m Length:', intraJson.data ? (Array.isArray(intraJson.data) ? intraJson.data.length : 'Obj') : intraJson);
}
test();
