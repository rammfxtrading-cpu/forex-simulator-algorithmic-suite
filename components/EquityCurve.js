// EquityCurve.js — curva de capital con Chart.js, replicando exactamente el
// estilo del Journal de Algorithmic Suite. Reutilizable en /dashboard y /admin.
//
// Props:
//   closedTrades:   trades cerrados [{pnl, side, pair, rr, result, session_id, closed_at}]
//   sessions:       sesiones para el tooltip (resolver nombre por session_id)
//   initialBalance: balance inicial — punto de partida de la curva

import { useEffect, useRef, useMemo } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// Format: YYYY-MM-DD para los labels del eje X (estilo journal)
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0,10)
}

export default function EquityCurve({ closedTrades = [], sessions = [], initialBalance = 0 }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  // Dataset memoizado — equity acumulado + colores por trade.
  const { equity, labels, pointColors, tradesData } = useMemo(() => {
    // Punto inicial + uno por trade. equity[i] = balance tras el trade i-ésimo.
    const eq = [initialBalance]
    const lbls = ['Inicio']
    closedTrades.forEach(t => {
      eq.push(eq[eq.length-1] + (t.pnl || 0))
      lbls.push(fmtDate(t.closed_at || t.created_at) || '—')
    })
    // Colores: el primer punto es azul (inicio). Para los demás:
    //   - azul si balance subió (positivo)
    //   - rojo si bajó (negativo)
    //   - amarillo si igual (breakeven)
    const colors = eq.map((v, i) => {
      if (i === 0) return '#2d7ef7'
      if (eq[i] < eq[i-1]) return '#f03e3e'
      if (eq[i] === eq[i-1]) return '#f59e0b'
      return '#2d7ef7'
    })
    return { equity: eq, labels: lbls, pointColors: colors, tradesData: closedTrades }
  }, [closedTrades, initialBalance])

  useEffect(() => {
    if (!canvasRef.current) return
    if (!equity || equity.length < 2) {
      // Si no hay datos suficientes destruimos cualquier chart previo
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      return
    }

    // Destruir chart anterior antes de crear uno nuevo (cambios de filtro)
    if (chartRef.current) chartRef.current.destroy()

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: equity,
          borderColor: '#2d7ef7',
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            // Gradient azul vertical idéntico al journal
            const canvas = ctx.chart.ctx
            const gradient = canvas.createLinearGradient(0, 0, 0, 300)
            gradient.addColorStop(0, 'rgba(45,126,247,0.35)')
            gradient.addColorStop(1, 'rgba(45,126,247,0.01)')
            return gradient
          },
          pointRadius: 3,
          pointBackgroundColor: pointColors,
          pointBorderColor: 'transparent',
          pointBorderWidth: 0,
          tension: 0.35, // bezier suavizado
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(4,10,24,0.96)',
            borderColor: 'rgba(30,144,255,0.4)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleColor: '#fff',
            titleFont: { size: 11, weight: 'bold' },
            bodyColor: 'rgba(255,255,255,0.85)',
            bodyFont: { size: 11 },
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex
                if (i === 0) return 'Punto inicial'
                const t = tradesData[i-1]
                return `Trade #${i} · ${t?.side || ''} ${t?.pair || ''}`.trim()
              },
              label: (ctx) => {
                const i = ctx.dataIndex
                const balance = equity[i]
                const lines = [`Balance: $${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
                if (i > 0) {
                  const t = tradesData[i-1]
                  if (t) {
                    const initial = initialBalance || balance
                    const pct = initial > 0 ? ((balance - initial) / initial * 100) : 0
                    const pnl = t.pnl || 0
                    const sign = pnl >= 0 ? '+' : ''
                    lines.push(`P&L: ${sign}$${pnl.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`)
                    if (t.rr != null) lines.push(`R:R: ${parseFloat(t.rr || 0).toFixed(2)}R`)
                    const sess = sessions.find(s => s.id === t.session_id)
                    if (sess) lines.push(sess.name)
                  }
                }
                return lines
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 45, minRotation: 45 },
            grid: { display: false },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#64748b',
              font: { size: 9 },
              callback: v => '$' + v.toLocaleString()
            },
          }
        }
      }
    })

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [equity, labels, pointColors, tradesData, sessions, initialBalance])

  // Caso vacío
  if (!equity || equity.length < 2) {
    return (
      <div style={{borderRadius:12,padding:'20px 24px',marginBottom:20,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:1,textTransform:'uppercase'}}>Equity Curve</div>
          <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1}}>USD</div>
        </div>
        <div style={{height:240,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.4)',fontSize:12}}>
          No hay operaciones suficientes para mostrar la curva.
        </div>
      </div>
    )
  }

  return (
    <div style={{borderRadius:12,padding:'20px 24px',marginBottom:20,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:1,textTransform:'uppercase'}}>Equity Curve</div>
        <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1}}>USD</div>
      </div>
      <div style={{position:'relative',height:240}}>
        <canvas ref={canvasRef}/>
      </div>
    </div>
  )
}
