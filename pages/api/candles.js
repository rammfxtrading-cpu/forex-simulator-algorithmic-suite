export default async function handler(req, res) {
  const { pair, timeframe, year, month } = req.query
  if (!pair || !timeframe || !year || !month) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'No API key' })

  const symbol = `C:${pair.replace('/', '')}`

  const tfMap = {
    M1:  { multiplier: 1,  timespan: 'minute' },
    M5:  { multiplier: 5,  timespan: 'minute' },
    M15: { multiplier: 15, timespan: 'minute' },
    M30: { multiplier: 30, timespan: 'minute' },
    H1:  { multiplier: 1,  timespan: 'hour'   },
    H4:  { multiplier: 4,  timespan: 'hour'   },
    D1:  { multiplier: 1,  timespan: 'day'    },
  }
  const tf = tfMap[timeframe] || tfMap['H1']

  const m = String(month).padStart(2, '0')
  const y = String(year)
  const lastDay = new Date(+y, +month, 0).getDate()
  const from = `${y}-${m}-01`
  const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${tf.multiplier}/${tf.timespan}/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'ERROR' || !data.results?.length) {
      return res.status(404).json({ error: data.error || 'No data', status: data.status })
    }

    const candles = data.results.map(c => ({
      time:   Math.floor(c.t / 1000),
      open:   parseFloat(c.o.toFixed(5)),
      high:   parseFloat(c.h.toFixed(5)),
      low:    parseFloat(c.l.toFixed(5)),
      close:  parseFloat(c.c.toFixed(5)),
      volume: c.v || 0,
    }))

    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(candles)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
