// EquityCurve.js — curva de capital con tooltip al hover + ejes X (fecha) e Y ($).
// Estilo FX Replay. Reutilizable: se usa en /dashboard (vista del alumno) y en
// /admin (vista del detalle de cualquier alumno).
//
// Props:
//   closedTrades:   array de trades cerrados con {pnl, side, pair, rr, session_id, closed_at|created_at}
//   sessions:       array de sesiones (para resolver el nombre por session_id)
//   initialBalance: balance inicial — punto de partida de la curva
//
// El componente calcula sus propios puntos (eqPoints + screenPoints), construye
// el path SVG, y renderiza ejes + interacción.

import { useState, useMemo } from 'react'

// Layout del SVG. viewBox 800x200.
// Reservamos espacio a la izquierda (eje Y) y abajo (eje X).
const VB_W = 800
const VB_H = 200
const PAD_L = 60   // espacio para labels del eje Y
const PAD_R = 12
const PAD_T = 12
const PAD_B = 28   // espacio para labels del eje X
const PLOT_W = VB_W - PAD_L - PAD_R
const PLOT_H = VB_H - PAD_T - PAD_B

// Formateo: $1.2K, $105K, $1.05M, etc.
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n/1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  // dd/mm/yy
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
function fmtDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2,'0')
  const min = String(d.getMinutes()).padStart(2,'0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

// "nice" axis ticks — algoritmo clásico: redondea step a 1·10^n, 2·10^n, 5·10^n.
function niceTicks(min, max, target = 5) {
  if (min === max) { min -= 1; max += 1 }
  const range = max - min
  const rough = range / target
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / pow
  let step
  if (norm < 1.5) step = 1*pow
  else if (norm < 3) step = 2*pow
  else if (norm < 7) step = 5*pow
  else step = 10*pow
  const niceMin = Math.floor(min/step)*step
  const niceMax = Math.ceil(max/step)*step
  const ticks = []
  for (let v = niceMin; v <= niceMax + step*0.001; v += step) ticks.push(Number(v.toFixed(10)))
  return { ticks, niceMin, niceMax }
}

export default function EquityCurve({ closedTrades = [], sessions = [], initialBalance = 0 }) {
  const [hover, setHover] = useState(null) // {idx, mouseX, mouseY}

  // Construimos los puntos: punto 0 = balance inicial, después uno por trade cerrado.
  const { eqPoints, screenPoints, pathD, areaD, niceY, dateRange } = useMemo(() => {
    let run = initialBalance
    const pts = [{ x:0, y:run, trade:null, ts:null }]
    closedTrades.forEach((t,i) => {
      run += (t.pnl || 0)
      const ts = t.closed_at || t.updated_at || t.created_at || null
      pts.push({ x:i+1, y:run, trade:t, ts })
    })
    if (pts.length < 2) {
      return { eqPoints: pts, screenPoints: [], pathD: '', areaD: '', niceY: { ticks:[], niceMin:0, niceMax:0 }, dateRange: { from:null, to:null } }
    }
    const ys = pts.map(p => p.y)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const niceY = niceTicks(minY, maxY, 5)
    const yRange = niceY.niceMax - niceY.niceMin || 1
    const screenPoints = pts.map(p => {
      const x = PAD_L + (p.x/(pts.length-1)) * PLOT_W
      const y = PAD_T + PLOT_H - ((p.y - niceY.niceMin) / yRange) * PLOT_H
      return { x, y, balance: p.y, trade: p.trade, ts: p.ts, idx: p.x }
    })
    const pathD = screenPoints.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
    const areaD = `${pathD} L${screenPoints[screenPoints.length-1].x},${PAD_T+PLOT_H} L${screenPoints[0].x},${PAD_T+PLOT_H} Z`
    // Rango de fechas para los ticks del eje X
    const tsList = pts.map(p => p.ts).filter(Boolean)
    const dateRange = {
      from: tsList.length ? tsList[0] : null,
      to:   tsList.length ? tsList[tsList.length-1] : null,
    }
    return { eqPoints: pts, screenPoints, pathD, areaD, niceY, dateRange }
  }, [closedTrades, initialBalance])

  // Si no hay datos suficientes, no mostramos curva.
  if (eqPoints.length < 2) {
    return (
      <div style={{borderRadius:12,padding:'20px 24px',marginBottom:20,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:1,marginBottom:12,textTransform:'uppercase'}}>Equity Curve</div>
        <div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.4)',fontSize:12}}>
          No hay operaciones suficientes para mostrar la curva.
        </div>
      </div>
    )
  }

  // Ticks del eje X: máximo 6 marcas (incluyendo extremos).
  const xTickCount = Math.min(6, eqPoints.length)
  const xTickIndices = []
  for (let i=0; i<xTickCount; i++) {
    const idx = Math.round(i * (eqPoints.length-1) / (xTickCount-1))
    xTickIndices.push(idx)
  }

  // Render del tooltip
  const renderTooltip = () => {
    if (!hover) return null
    const pt = screenPoints[hover.idx]
    if (!pt) return null
    const tr = pt.trade
    const sess = tr ? sessions.find(s => s.id === tr.session_id) : null
    const initial = initialBalance || pt.balance
    const pct = initial > 0 ? ((pt.balance - initial) / initial * 100) : 0
    const tipW = 240
    const tipH = tr ? 130 : 70
    const cx = hover.mouseX
    const cy = hover.mouseY
    let left = cx + 12
    let top = cy - tipH - 12
    if (top < 4) top = cy + 16
    return (
      <div style={{
        position:'absolute',
        left, top,
        maxWidth: tipW,
        background:'rgba(4,10,24,0.96)',
        border:'1px solid rgba(30,144,255,0.4)',
        borderRadius:8,
        padding:'10px 12px',
        pointerEvents:'none',
        backdropFilter:'blur(20px)',
        WebkitBackdropFilter:'blur(20px)',
        boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
        fontFamily:"'Montserrat',sans-serif",
        fontSize:11,
        color:'#fff',
        zIndex:10,
      }}>
        {tr ? (
          <>
            <div style={{display:'flex',justifyContent:'space-between',gap:10,marginBottom:6}}>
              <span style={{color:'rgba(255,255,255,0.6)',fontSize:9,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase'}}>Trade #{hover.idx}</span>
              <span style={{color:tr.side==='BUY'?'#1E90FF':'#ef4444',fontSize:9,fontWeight:800}}>{tr.side} {tr.pair}</span>
            </div>
            {pt.ts && (
              <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',marginBottom:6}}>
                {fmtDateTime(pt.ts)}
              </div>
            )}
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span style={{color:'rgba(255,255,255,0.6)'}}>Balance</span>
              <span style={{fontWeight:700,color:'#fff',fontFamily:'monospace'}}>${pt.balance.toFixed(2)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span style={{color:'rgba(255,255,255,0.6)'}}>P&L</span>
              <span style={{fontWeight:700,color:tr.pnl>=0?'#22c55e':'#ef4444',fontFamily:'monospace'}}>{tr.pnl>=0?'+':''}{parseFloat(tr.pnl||0).toFixed(2)} ({pct>=0?'+':''}{pct.toFixed(2)}%)</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span style={{color:'rgba(255,255,255,0.6)'}}>R:R</span>
              <span style={{fontWeight:700,color:'#f59e0b'}}>{parseFloat(tr.rr||0).toFixed(2)}R</span>
            </div>
            {sess && (
              <div style={{borderTop:'1px solid rgba(30,144,255,0.2)',marginTop:6,paddingTop:5,fontSize:9,color:'rgba(255,255,255,0.6)'}}>
                {sess.name}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{color:'rgba(255,255,255,0.6)',fontSize:9,fontWeight:700,marginBottom:4,letterSpacing:0.5,textTransform:'uppercase'}}>Punto inicial</div>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'rgba(255,255,255,0.6)'}}>Balance</span>
              <span style={{fontWeight:700,color:'#fff',fontFamily:'monospace'}}>${pt.balance.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{borderRadius:12,padding:'20px 24px',marginBottom:20,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:1,marginBottom:12,textTransform:'uppercase'}}>Equity Curve</div>
      <div
        style={{position:'relative',width:'100%',height:200}}
        onMouseLeave={()=>setHover(null)}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{width:'100%',height:200,display:'block',overflow:'visible'}}
          preserveAspectRatio="none"
          onMouseMove={(e)=>{
            if (!screenPoints.length) return
            const rect = e.currentTarget.getBoundingClientRect()
            const localX = e.clientX - rect.left
            // Convertir a coords del viewBox (0..VB_W). Ajuste: el área de plot
            // empieza en PAD_L y termina en VB_W-PAD_R, pero el SVG completo es 0..VB_W.
            const svgX = (localX/rect.width) * VB_W
            // Solo activamos hover si está dentro del área de plot.
            if (svgX < PAD_L || svgX > VB_W-PAD_R) { setHover(null); return }
            let bestIdx = 0, bestDist = Infinity
            for (let i=0; i<screenPoints.length; i++) {
              const d = Math.abs(screenPoints[i].x - svgX)
              if (d < bestDist) { bestDist = d; bestIdx = i }
            }
            setHover({ idx: bestIdx, mouseX: localX, mouseY: e.clientY - rect.top })
          }}
        >
          <defs>
            <linearGradient id="eqGradGlobal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E90FF" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#1E90FF" stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Grid lines + Y axis labels (a la izquierda) */}
          {niceY.ticks.map((tickVal, i) => {
            const yRange = niceY.niceMax - niceY.niceMin || 1
            const y = PAD_T + PLOT_H - ((tickVal - niceY.niceMin) / yRange) * PLOT_H
            return (
              <g key={`y-${i}`}>
                <line
                  x1={PAD_L} x2={VB_W-PAD_R}
                  y1={y} y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
                <text
                  x={PAD_L-8}
                  y={y+3}
                  fontSize="9"
                  fill="rgba(255,255,255,0.45)"
                  textAnchor="end"
                  fontFamily="Montserrat,sans-serif"
                  fontWeight="600"
                >
                  {fmtMoney(tickVal)}
                </text>
              </g>
            )
          })}

          {/* X axis labels (fechas) */}
          {xTickIndices.map((idx, i) => {
            const sp = screenPoints[idx]
            if (!sp) return null
            const label = sp.ts ? fmtDate(sp.ts) : (idx === 0 ? 'Inicio' : `#${idx}`)
            const anchor = i === 0 ? 'start' : i === xTickIndices.length-1 ? 'end' : 'middle'
            return (
              <g key={`x-${i}`}>
                <line
                  x1={sp.x} x2={sp.x}
                  y1={PAD_T+PLOT_H} y2={PAD_T+PLOT_H+4}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1"
                />
                <text
                  x={sp.x}
                  y={PAD_T+PLOT_H+16}
                  fontSize="9"
                  fill="rgba(255,255,255,0.45)"
                  textAnchor={anchor}
                  fontFamily="Montserrat,sans-serif"
                  fontWeight="600"
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* Eje X y eje Y (líneas base) */}
          <line x1={PAD_L} x2={VB_W-PAD_R} y1={PAD_T+PLOT_H} y2={PAD_T+PLOT_H} stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
          <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T+PLOT_H} stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>

          {/* Curva */}
          <path d={areaD} fill="url(#eqGradGlobal)"/>
          <path d={pathD} fill="none" stroke="#1E90FF" strokeWidth="2.5" filter="drop-shadow(0 0 6px rgba(30,144,255,0.6))"/>

          {/* Hover: línea vertical guía + circulo destacado */}
          {hover && screenPoints[hover.idx] && (
            <>
              <line
                x1={screenPoints[hover.idx].x}
                x2={screenPoints[hover.idx].x}
                y1={PAD_T} y2={PAD_T+PLOT_H}
                stroke="rgba(30,144,255,0.4)"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <circle
                cx={screenPoints[hover.idx].x}
                cy={screenPoints[hover.idx].y}
                r="5"
                fill="#1E90FF"
                stroke="#fff"
                strokeWidth="2"
                filter="drop-shadow(0 0 8px rgba(30,144,255,0.9))"
              />
            </>
          )}
        </svg>
        {renderTooltip()}
      </div>
    </div>
  )
}
