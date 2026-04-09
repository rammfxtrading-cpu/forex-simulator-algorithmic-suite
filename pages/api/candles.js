export default async function handler(req, res) {
  const { pair, timeframe, year, month } = req.query
  if (!pair || !timeframe || !year || !month) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const apiKey = process.env.TWELVE_DATA_KEY
  if (!apiKey) return res.status(500).json({ error: 'No API key' })

  const symbol = pair.replace('/', '/') // EUR/USD format
  const tfMap = { M1:'1min', M5:'5min', M15:'15min', M30:'30min', H1:'1h', H4:'4h', D1:'1day' }
  const interval = tfMap[timeframe] || '1h'

  const m = String(month).padStart(2, '0')
  const y = String(year)
  const lastDay = new Date(+y, +month, 0).getDate()
  const start = `${y}-${m}-01 00:00:00`
  const end = `${y}-${m}-${String(lastDay).padStart(2,'0')} 23:59:59`

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&order=ASC&outputsize=5000&apikey=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'error') {
      return res.status(400).json({ error: data.message })
    }

    if (!data.values || !data.values.length) {
      return res.status(404).json({ error: 'No data returned' })
    }

    const candles = data.values.map(c => ({
      time:   Math.floor(new Date(c.datetime).getTime() / 1000),
      open:   parseFloat(parseFloat(c.open).toFixed(5)),
      high:   parseFloat(parseFloat(c.high).toFixed(5)),
      low:    parseFloat(parseFloat(c.low).toFixed(5)),
      close:  parseFloat(parseFloat(c.close).toFixed(5)),
      volume: 0,
    }))

    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(candles)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
