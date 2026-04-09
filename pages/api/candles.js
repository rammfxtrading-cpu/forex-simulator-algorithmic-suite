export default async function handler(req, res) {
  const { pair, timeframe, year, month } = req.query
  if (!pair || !timeframe || !year || !month) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const apiKey = process.env.ALPHA_VANTAGE_KEY
  if (!apiKey) return res.status(500).json({ error: 'No API key' })

  // Alpha Vantage forex symbol format: EURUSD -> from=EUR, to=USD
  const symbol = pair.replace('/', '')
  const from_symbol = symbol.slice(0, 3)
  const to_symbol = symbol.slice(3, 6)

  // Map timeframe to Alpha Vantage interval
  const tfMap = {
    M1: '1min', M5: '5min', M15: '15min', M30: '30min',
    H1: '60min', H4: '60min', D1: 'daily'
  }
  const interval = tfMap[timeframe] || '60min'
  const isIntraday = timeframe !== 'D1'

  const url = isIntraday
    ? `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${from_symbol}&to_symbol=${to_symbol}&interval=${interval}&outputsize=full&apikey=${apiKey}`
    : `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${from_symbol}&to_symbol=${to_symbol}&outputsize=full&apikey=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    // Check for rate limit
    if (data.Note || data.Information) {
      return res.status(429).json({ error: 'Rate limit reached', note: data.Note || data.Information })
    }

    const seriesKey = isIntraday
      ? `Time Series FX (${interval})`
      : 'Time Series FX (Daily)'

    const series = data[seriesKey]
    if (!series) {
      return res.status(404).json({ error: 'No data', keys: Object.keys(data) })
    }

    // Filter by year/month
    const y = String(year)
    const m = String(month).padStart(2, '0')
    const prefix = `${y}-${m}`

    const candles = Object.entries(series)
      .filter(([date]) => date.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        time: Math.floor(new Date(date).getTime() / 1000),
        open:  parseFloat(parseFloat(v['1. open']).toFixed(5)),
        high:  parseFloat(parseFloat(v['2. high']).toFixed(5)),
        low:   parseFloat(parseFloat(v['3. low']).toFixed(5)),
        close: parseFloat(parseFloat(v['4. close']).toFixed(5)),
        volume: 0,
      }))

    if (!candles.length) {
      return res.status(404).json({ error: 'No candles for this period' })
    }

    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(candles)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
