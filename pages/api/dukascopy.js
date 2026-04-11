// pages/api/dukascopy.js
// Sirve datos OHLCV desde Supabase Storage
// Query params: pair=EURUSD&timeframe=H1&year=2023

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BUCKET = 'dukascopy-data';

// Agrega velas de 1h a timeframes mayores
function aggregateCandles(candles, targetMinutes) {
  if (targetMinutes <= 60) return candles; // H1 ya está listo
  const ratio = targetMinutes / 60;
  const result = [];
  for (let i = 0; i < candles.length; i += ratio) {
    const chunk = candles.slice(i, i + ratio);
    if (chunk.length === 0) continue;
    result.push({
      time:   chunk[0].time,
      open:   chunk[0].open,
      high:   Math.max(...chunk.map(c => c.high)),
      low:    Math.min(...chunk.map(c => c.low)),
      close:  chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return result;
}

const TF_MINUTES = {
  M1:  1, M5: 5, M15: 15, M30: 30,
  H1: 60, H4: 240, D1: 1440,
};

export default async function handler(req, res) {
  const { pair = 'EURUSD', timeframe = 'H1', year = '2023' } = req.query;

  const pairUpper = pair.toUpperCase();
  const tf = timeframe.toUpperCase();
  const minutes = TF_MINUTES[tf] || 60;

  // Fetch JSON desde Supabase Storage (público)
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${pairUpper}/H1/${year}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({ error: `Data not found for ${pairUpper} ${year}` });
    }
    const candles = await response.json();
    const aggregated = aggregateCandles(candles, minutes);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(aggregated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
