const { getHistoricalRates } = require('dukascopy-node')

async function test() {
  console.log('Downloading EURUSD M1 for 2026-02-12...')
  const data = await getHistoricalRates({
    instrument: 'eurusd',
    dates: {
      from: new Date('2026-02-12T00:00:00Z'),
      to:   new Date('2026-02-13T00:00:00Z'),
    },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  console.log('Total candles:', data.length)
  console.log('\nFirst 5 candles:')
  data.slice(0, 5).forEach((c, i) => {
    const t = new Date(c.timestamp).toISOString().slice(11, 16)
    const range = ((c.high - c.low) * 10000).toFixed(1)
    console.log(`  ${i} ${t} O:${c.open.toFixed(5)} H:${c.high.toFixed(5)} L:${c.low.toFixed(5)} C:${c.close.toFixed(5)} range:${range}p vol:${c.volume}`)
  })

  console.log('\nQuality check:')
  let sameHigh=0, sameLow=0, sameHL=0
  for(let i=1; i<data.length; i++) {
    const p=data[i-1], c=data[i]
    if(c.high===p.high) sameHigh++
    if(c.low===p.low) sameLow++
    if(c.high===p.high && c.low===p.low) sameHL++
  }
  console.log(`  Same high consecutive: ${sameHigh}/${data.length} (${(sameHigh/data.length*100).toFixed(1)}%)`)
  console.log(`  Same low consecutive:  ${sameLow}/${data.length} (${(sameLow/data.length*100).toFixed(1)}%)`)
  console.log(`  Same H AND L:          ${sameHL}/${data.length}`)
}

test().catch(e => { console.error('Error:', e.message); process.exit(1) })
