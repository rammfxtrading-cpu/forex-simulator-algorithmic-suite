export default async function handler(req, res) {
  const { pair, timeframe, year, month } = req.query
  if (!pair || !timeframe || !year || !month) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const symbol = pair.replace('/', '')
  const m = String(month).padStart(2, '0')
  const tfMap = { M1:'M1', M5:'M5', M15:'M15', M30:'M30', H1:'H1', H4:'H4', D1:'D1' }
  const tf = tfMap[timeframe] || 'H1'

  const url = `https://freeserv.dukascopy.com/2.0/?path=chart/json&instrument=${symbol}&offer_side=B&interval=${tf}&splits=false&stocks=false&start=${year}-${m}-01T00:00:00&end=${year}-${m}-28T23:59:59&jsonp=false`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Dukascopy error: ${response.status}`)
    const raw = await response.json()

    const candles = raw
      .map(c => ({
        time: Math.floor(c[0] / 1000),
        open: parseFloat(c[1].toFixed(5)),
        high: parseFloat(c[2].toFixed(5)),
        low:  parseFloat(c[3].toFixed(5)),
        close:parseFloat(c[4].toFixed(5)),
        volume: c[5] || 0,
      }))
      .filter(c => c.open && c.high && c.low && c.close)

    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(candles)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
