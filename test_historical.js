async function test() {
  try {
    const res = await fetch('http://localhost:9000/api/dhan/historical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          clientId: 'dummy',
          accessToken: 'dummy',
          securityId: '25',
          exchangeSegment: 'IDX_I',
          instrument: 'INDEX',
          expiryCode: 0,
          interval: '1',
          fromDate: '2026-01-29',
          toDate: '2026-02-28'
      })
    });
    const json = await res.json();
    console.log('Success:', json.success, 'Data length:', json.data?.length);
    if (!json.success) console.log(json.error || json.debug);
  } catch (e) {
    console.error(e);
  }
}
test();
