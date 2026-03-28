async function test() {
  try {
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate30 = new Date();
    fromDate30.setDate(fromDate30.getDate() - 30);

    const intra = await fetch('http://localhost:9000/api/dhan/intraday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: '1000305250', 
            accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzcyMzM4NzgwLCJpYXQiOjE3NzIyNTIzODAsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMDAwMzA1MjUwIn0.tlydP8gOIao6r7kXg2GfQYdZoI0YSL70JYQ8UbRnli9dUFZJYHZKEPN225tqdgez7FC_ceMGFSvaij3MJdDc8w', 
            securityId: '25', 
            exchangeSegment: 'IDX_I', 
            instrument: 'INDEX',
            interval: '1', 
            fromDate: fromDate30.toISOString().split('T')[0], 
            toDate: toDate
        })
    });
    const intraJson = await intra.json();
    console.log('Intraday 30d 1m Length:', intraJson.data ? (Array.isArray(intraJson.data) ? intraJson.data.length : 'Obj:' + Object.keys(intraJson.data)[0].length) : JSON.stringify(intraJson).substring(0,100));
  } catch(e) { console.error(e); }
}
test();
