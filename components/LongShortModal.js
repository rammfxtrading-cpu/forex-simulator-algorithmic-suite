/**
 * LongShortModal.js
 * Modal de configuración para Long/Short Position
 * Estilo TradingView — liquid glass — Algorithmic Suite
 */
import { useState, useEffect } from 'react'

const PILL = {
  fontFamily: "'Montserrat',sans-serif",
  background: 'rgba(4,10,24,0.97)',
  border: '1px solid rgba(30,144,255,0.3)',
  borderRadius: 16,
  boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  color: '#fff',
  width: 420,
  overflow: 'hidden',
}

const input = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '6px 10px',
  color: '#fff',
  fontSize: 12,
  fontFamily: "'Montserrat',sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const label = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.6)',
  marginBottom: 4,
  display: 'block',
}

const section = {
  fontSize: 9,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  margin: '16px 0 8px',
}

const isJpy = (pair) => pair?.includes('JPY')
const pipMult = (pair) => isJpy(pair) ? 100 : 10000
const pipSize = (pair) => isJpy(pair) ? 0.01 : 0.0001

export default function LongShortModal({ tool, toolId, activePair, balance, initialBalance, isChallenge, onConfirm, onClose, onStyleUpdate }) {
  const [tab, setTab] = useState('data')

  // Position data from tool points.
  // - Los precios *visibles* (state) los redondeamos para no marear al usuario.
  // - Los precios *crudos* (rawXxx) los guardamos sin tocar para que la limit
  //   se ejecute exactamente en el mismo nivel donde está el dibujo. Sin esto,
  //   .toFixed(5) trunca 1.162074998 → 1.16207 y la línea queda desfasada.
  const [entryPrice, setEntryPrice]   = useState('')
  const [stopPrice,  setStopPrice]    = useState('')
  const [targetPrice,setTargetPrice]  = useState('')
  const [rawEntry, setRawEntry] = useState(null)
  const [rawStop,  setRawStop]  = useState(null)
  const [rawTarget,setRawTarget]= useState(null)
  // Risk base mode (FTMO-style):
  // - 'initial' (DEFAULT, siempre activo en challenges): riesgo se calcula sobre el
  //   capital inicial fijo. 1% siempre = misma cantidad USD, sin importar el balance.
  //   Esto se alinea con cómo FTMO calcula los caps de DD diario y total.
  // - 'live' (solo disponible en sesiones libres): riesgo sobre balance vivo.
  //   Comportamiento clásico MT4: si has ganado, 1% representa más USD.
  // En challenge el toggle queda OCULTO y se fuerza 'initial'.
  const [riskBaseMode, setRiskBaseMode] = useState('initial')
  // El accountSize se deriva del modo. En sesiones libres con modo 'live'
  // permitimos también edición manual (override) — el usuario puede simular
  // una cuenta hipotética distinta a su balance real.
  const accountSize = riskBaseMode === 'initial'
    ? (initialBalance || balance || 10000)
    : (balance || initialBalance || 10000)
  const [riskPct,    setRiskPct]      = useState(1)
  const [leverage,   setLeverage]     = useState(100)

  // Style
  const [profitColor, setProfitColor] = useState('rgba(38,166,154,0.25)')
  const [stopColor,   setStopColor]   = useState('rgba(239,83,80,0.25)')
  const [textColor,   setTextColor]   = useState('#ffffff')
  const [borderWidth, setBorderWidth] = useState(1)

  useEffect(() => {
    if (!tool) return
    try {
      const points = tool.points || []
      const decimals = isJpy(activePair) ? 3 : 5
      if (points[0]?.price != null) {
        setEntryPrice(points[0].price.toFixed(decimals))
        setRawEntry(points[0].price)
      }
      if (points[1]?.price != null) {
        setStopPrice(points[1].price.toFixed(decimals))
        setRawStop(points[1].price)
      }
      if (points[2]?.price != null) {
        setTargetPrice(points[2].price.toFixed(decimals))
        setRawTarget(points[2].price)
      }
    } catch {}
  }, [tool])

  // Calculated values
  const entry  = parseFloat(entryPrice)  || 0
  const stop   = parseFloat(stopPrice)   || 0
  const target = parseFloat(targetPrice) || 0
  const pm     = pipMult(activePair)
  const ps     = pipSize(activePair)

  const stopTicks    = Math.abs((entry - stop)   / ps).toFixed(0)
  const targetTicks  = Math.abs((target - entry) / ps).toFixed(0)
  const rr           = stopTicks > 0 ? (targetTicks / stopTicks).toFixed(2) : '—'
  const riskAmount   = (accountSize * riskPct / 100).toFixed(2)
  const lotSize      = stopTicks > 0 ? (parseFloat(riskAmount) / (parseFloat(stopTicks) * 10)).toFixed(2) : '—'
  const profitAmount = lotSize !== '—' ? (parseFloat(lotSize) * parseFloat(targetTicks) * 10).toFixed(2) : '—'

  const isLong = entry < target

  const TABS = [
    { id: 'data',  label: 'Entradas de datos' },
    { id: 'style', label: 'Estilo' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,5,20,0.7)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)', fontFamily:"'Montserrat',sans-serif" }}
      onClick={onClose}>
      <div style={PILL} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'18px 22px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: isLong ? '#26a69a' : '#ef5350', boxShadow: `0 0 10px ${isLong ? '#26a69a' : '#ef5350'}` }}/>
            <span style={{ fontSize:15, fontWeight:800, color:'#fff' }}>
              {isLong ? 'Posición Larga' : 'Posición Corta'}
            </span>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'#fff', cursor:'pointer', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontFamily:"'Montserrat',sans-serif" }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', padding:'12px 22px 0', borderBottom:'1px solid rgba(255,255,255,0.06)', gap:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background:'none', border:'none', cursor:'pointer',
              padding:'8px 16px', fontSize:12, fontWeight:600,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t.id ? '2px solid #1E90FF' : '2px solid transparent',
              fontFamily:"'Montserrat',sans-serif",
              marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding:'16px 22px 20px', maxHeight:460, overflowY:'auto' }}>

          {tab === 'data' && (
            <>
              {/* Account */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{...label, marginBottom:0}}>Tamaño de cuenta</span>
                    {/* Toggle solo visible fuera de challenges. En challenges
                        el riesgo siempre se calcula sobre capital inicial (FTMO). */}
                    {!isChallenge && (
                      <button
                        type="button"
                        onClick={() => setRiskBaseMode(m => m === 'initial' ? 'live' : 'initial')}
                        title={riskBaseMode === 'initial'
                          ? 'Riesgo sobre capital inicial (estilo FTMO). Click para cambiar a balance vivo.'
                          : 'Riesgo sobre balance vivo (estilo MT4). Click para cambiar a capital inicial.'}
                        style={{
                          background:'rgba(30,144,255,0.1)',
                          border:'1px solid rgba(30,144,255,0.3)',
                          borderRadius:6,
                          padding:'2px 8px',
                          fontSize:9,
                          fontWeight:700,
                          color:'#1E90FF',
                          cursor:'pointer',
                          fontFamily:"'Montserrat',sans-serif",
                          letterSpacing:0.3,
                          textTransform:'uppercase',
                        }}>
                        {riskBaseMode === 'initial' ? 'Inicial' : 'Vivo'}
                      </button>
                    )}
                  </div>
                  {/* Campo readonly. El valor se deriva del modo (inicial/vivo).
                      En challenge: siempre initial, sin opción a cambiar. */}
                  <input
                    style={{...input, opacity:0.7, cursor:'not-allowed'}}
                    type="number"
                    value={accountSize}
                    readOnly
                    title={isChallenge
                      ? 'En challenge el riesgo se calcula sobre el capital inicial (estilo FTMO)'
                      : (riskBaseMode === 'initial'
                          ? 'Capital inicial — usa el toggle para cambiar a balance vivo'
                          : 'Balance vivo — usa el toggle para cambiar a capital inicial')}
                  />
                </div>
                <div>
                  <span style={label}>Riesgo %</span>
                  <input style={input} type="number" value={riskPct} step="0.1" onChange={e => setRiskPct(parseFloat(e.target.value))} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
                <div>
                  <span style={label}>Lotes calculados</span>
                  <div style={{ ...input, color:'#1E90FF', fontWeight:700, display:'flex', alignItems:'center' }}>{lotSize}</div>
                </div>
                <div>
                  <span style={label}>Apalancamiento</span>
                  <input style={input} type="number" value={leverage} onChange={e => setLeverage(parseFloat(e.target.value))} />
                </div>
              </div>

              {/* Entry */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
                <div>
                  <span style={label}>Precio entrada</span>
                  <input style={input} type="number" step="0.00001" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Riesgo en $</span>
                  <div style={{ ...input, color:'#ef5350', fontWeight:700, display:'flex', alignItems:'center' }}>-{riskAmount}</div>
                </div>
              </div>

              {/* Stop */}
              <div style={section}>Nivel de Stop</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <span style={label}>Precio</span>
                  <input style={input} type="number" step="0.00001" value={stopPrice} onChange={e => setStopPrice(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Pips</span>
                  <div style={{ ...input, display:'flex', alignItems:'center', color:'rgba(255,255,255,0.7)' }}>{stopTicks}</div>
                </div>
              </div>

              {/* Target */}
              <div style={section}>Nivel de Beneficio</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <span style={label}>Precio</span>
                  <input style={input} type="number" step="0.00001" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Pips</span>
                  <div style={{ ...input, display:'flex', alignItems:'center', color:'rgba(255,255,255,0.7)' }}>{targetTicks}</div>
                </div>
              </div>

              {/* RR Summary */}
              <div style={{ marginTop:16, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, textAlign:'center' }}>
                <div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:1, marginBottom:4 }}>RATIO R:R</div>
                  <div style={{ fontSize:16, fontWeight:800, color: isLong ? '#26a69a' : '#ef5350' }}>{rr}</div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:1, marginBottom:4 }}>BENEFICIO $</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#26a69a' }}>+{profitAmount}</div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:1, marginBottom:4 }}>RIESGO $</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#ef5350' }}>-{riskAmount}</div>
                </div>
              </div>
            </>
          )}

          {tab === 'style' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:8 }}>
                <div>
                  <span style={label}>Color zona beneficio</span>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                    <span style={{ width:32, height:32, borderRadius:8, background: profitColor, border:'1px solid rgba(255,255,255,0.15)', display:'block', overflow:'hidden' }}>
                      <input type="color" value='#26a69a' onChange={e => { setProfitColor(e.target.value+'40'); onStyleUpdate({ profitColor: e.target.value+'40' }) }} style={{ opacity:0, width:'100%', height:'100%' }}/>
                    </span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{profitColor}</span>
                  </label>
                </div>
                <div>
                  <span style={label}>Color zona stop</span>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                    <span style={{ width:32, height:32, borderRadius:8, background: stopColor, border:'1px solid rgba(255,255,255,0.15)', display:'block', overflow:'hidden' }}>
                      <input type="color" value='#ef5350' onChange={e => { setStopColor(e.target.value+'40'); onStyleUpdate({ stopColor: e.target.value+'40' }) }} style={{ opacity:0, width:'100%', height:'100%' }}/>
                    </span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{stopColor}</span>
                  </label>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 }}>
                <div>
                  <span style={label}>Color texto</span>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                    <span style={{ width:32, height:32, borderRadius:8, background: textColor, border:'1px solid rgba(255,255,255,0.15)', display:'block', overflow:'hidden' }}>
                      <input type="color" value={textColor} onChange={e => { setTextColor(e.target.value); onStyleUpdate({ textColor: e.target.value }) }} style={{ opacity:0, width:'100%', height:'100%' }}/>
                    </span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{textColor}</span>
                  </label>
                </div>
                <div>
                  <span style={label}>Grosor borde</span>
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    {[1,2,3].map(w => (
                      <button key={w} onClick={() => { setBorderWidth(w); onStyleUpdate({ borderWidth: w }) }}
                        style={{ flex:1, padding:'6px 0', borderRadius:8, border: borderWidth===w ? '1px solid rgba(41,98,255,0.7)' : '1px solid rgba(255,255,255,0.1)', background: borderWidth===w ? 'rgba(41,98,255,0.3)' : 'rgba(255,255,255,0.05)', color:'#fff', cursor:'pointer', fontSize:12, fontFamily:"'Montserrat',sans-serif" }}>{w}</button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 22px 18px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', gap:10 }}>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, color:'rgba(255,255,255,0.7)', cursor:'pointer', padding:'9px 20px', fontSize:12, fontWeight:600, fontFamily:"'Montserrat',sans-serif" }}>Cancelar</button>
          <div style={{display:'flex',gap:10}}>
            <button onClick={onClose} style={{ background:'rgba(30,144,255,0.15)', border:'1px solid rgba(30,144,255,0.4)', borderRadius:10, color:'#fff', cursor:'pointer', padding:'9px 20px', fontSize:12, fontWeight:700, fontFamily:"'Montserrat',sans-serif" }}>Aceptar</button>
            <button onClick={() => {
              // Si el valor del input coincide con el raw redondeado, usamos
              // el raw (sin pérdida). Si el usuario lo editó manualmente,
              // usamos lo que escribió. Esto evita el desfase de las líneas
              // SL/TP/entry vs el dibujo.
              const decimals = isJpy(activePair) ? 3 : 5
              const useRaw = (raw, str) => (raw != null && raw.toFixed(decimals) === str) ? raw : parseFloat(str)
              onConfirm({
                side: isLong ? 'BUY' : 'SELL',
                entry: useRaw(rawEntry,  entryPrice),
                sl:    useRaw(rawStop,   stopPrice),
                tp:    useRaw(rawTarget, targetPrice),
                lots: parseFloat(lotSize) || 0.01,
                slPips: parseFloat(stopTicks),
                tpPips: parseFloat(targetTicks),
                rr: parseFloat(rr),
              })
            }} style={{ background: isLong ? 'linear-gradient(135deg,#26a69a,#1a7a72)' : 'linear-gradient(135deg,#ef5350,#b71c1c)', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', padding:'9px 24px', fontSize:12, fontWeight:800, fontFamily:"'Montserrat',sans-serif", boxShadow: isLong ? '0 4px 20px rgba(38,166,154,0.4)' : '0 4px 20px rgba(239,83,80,0.4)' }}>
              Ejecutar
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
