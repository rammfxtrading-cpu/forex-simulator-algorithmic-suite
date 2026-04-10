import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

export default function SessionPage() {
  const router = useRouter()
  const { id } = router.query
  const tvRef = useRef(null)
  const widgetRef = useRef(null)

  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(10000)
  const [lots, setLots] = useState(0.01)
  const [positions, setPositions] = useState([])
  const [realizedPnl, setRealizedPnl] = useState(0)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [showPositions, setShowPositions] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { router.replace('/'); return }
      setUser(s.user)
    })
  }, [])

  useEffect(() => {
    if (!id) return
    supabase.from('sim_sessions').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          setSession(data)
          setBalance(parseFloat(data.balance))
        }
        setLoading(false)
      })
  }, [id])

  // Load TradingView widget
  useEffect(() => {
    if (!session || !tvRef.current) return

    // Convert pair format EUR/USD -> EURUSD
    const symbol = session.pair.replace('/', '')
    const tfMap = { M1:'1', M5:'5', M15:'15', M30:'30', H1:'60', H4:'240', D1:'D' }
    const interval = tfMap[session.timeframe] || '60'

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      if (widgetRef.current) return
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: `FX:${symbol}`,
        interval: interval,
        timezone: 'Europe/Madrid',
        theme: 'dark',
        style: '1',
        locale: 'es',
        toolbar_bg: '#1e222d',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: 'tv_chart_container',
        studies: [],
        show_popup_button: false,
        popup_width: '1000',
        popup_height: '650',
        no_referral_id: true,
        withdateranges: true,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        details: false,
        hotlist: false,
        calendar: false,
      })
    }
    document.head.appendChild(script)

    return () => {
      widgetRef.current = null
      const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')
      if (existing) existing.remove()
    }
  }, [session])

  const openPosition = (side) => {
    if (!currentPrice) return
    setPositions(prev => [...prev, {
      id: Date.now(), side, price: currentPrice, lots, openTime: new Date().toISOString()
    }])
  }

  const closePosition = (posId) => {
    const pos = positions.find(p => p.id === posId)
    if (!pos) return
    const isJpy = session?.pair?.includes('JPY')
    const mult = isJpy ? 100 : 10000
    const pips = pos.side === 'BUY' ? (currentPrice - pos.price) * mult : (pos.price - currentPrice) * mult
    const pnl = pips * pos.lots * 10
    setRealizedPnl(prev => prev + pnl)
    setBalance(prev => prev + pnl)
    setPositions(prev => prev.filter(p => p.id !== posId))
  }

  const unrealizedPnl = positions.reduce((sum, pos) => {
    const isJpy = session?.pair?.includes('JPY')
    const mult = isJpy ? 100 : 10000
    const pips = pos.side === 'BUY' ? (currentPrice - pos.price) * mult : (pos.price - currentPrice) * mult
    return sum + pips * pos.lots * 10
  }, 0)

  const pnlColor = (v) => v > 0 ? '#26a69a' : v < 0 ? '#ef5350' : '#B2B5BE'

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#131722'}}>
      <div className="spinner"/>
      <style>{`.spinner{width:28px;height:28px;border:2px solid #1e222d;border-top-color:#26a69a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={s.root}>
      {/* TOP BAR */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <button style={s.backBtn} onClick={()=>router.push('/dashboard')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div style={s.sessionInfo}>
            <span style={s.sessionName}>{session?.name}</span>
            <span style={s.sessionMeta}>{session?.pair} · {session?.date_from} → {session?.date_to}</span>
          </div>
        </div>
        <div style={s.topRight}>
          <div style={s.statPill}>
            <span style={s.statLabel}>BALANCE</span>
            <span style={s.statVal}>${balance.toFixed(2)}</span>
          </div>
          <div style={s.statPill}>
            <span style={s.statLabel}>REALIZED P&L</span>
            <span style={{...s.statVal, color:pnlColor(realizedPnl)}}>{realizedPnl>=0?'+':''}{realizedPnl.toFixed(2)}</span>
          </div>
          <div style={s.statPill}>
            <span style={s.statLabel}>UNREALIZED P&L</span>
            <span style={{...s.statVal, color:pnlColor(unrealizedPnl)}}>{unrealizedPnl>=0?'+':''}{unrealizedPnl.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* TRADINGVIEW CHART — fullscreen */}
      <div style={s.chartWrap}>
        <div id="tv_chart_container" ref={tvRef} style={s.chart}/>
      </div>

      {/* BOTTOM BAR */}
      <div style={s.bottomBar}>
        <div style={s.bottomLeft}>
          <div style={s.lotWrap}>
            <span style={s.bottomLabel}>LOTS</span>
            <div style={s.lotControls}>
              <button style={s.lotBtn} onClick={()=>setLots(l=>Math.max(0.01,parseFloat((l-0.01).toFixed(2))))}>−</button>
              <input style={s.lotInput} type="number" step="0.01" min="0.01" value={lots}
                onChange={e=>setLots(Math.max(0.01,parseFloat(e.target.value)||0.01))}/>
              <button style={s.lotBtn} onClick={()=>setLots(l=>parseFloat((l+0.01).toFixed(2)))}>+</button>
            </div>
          </div>
          <div style={s.lotWrap}>
            <span style={s.bottomLabel}>PRICE</span>
            <input style={{...s.lotInput,width:80,borderBottom:'1px solid #2a2e39'}} type="number" step="0.00001"
              value={currentPrice} onChange={e=>setCurrentPrice(parseFloat(e.target.value)||0)}
              placeholder="0.00000"/>
          </div>
          <button style={s.buyBtn} onClick={()=>openPosition('BUY')}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="12,3 22,21 2,21"/></svg>
            BUY
          </button>
          <button style={s.sellBtn} onClick={()=>openPosition('SELL')}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="12,21 22,3 2,3"/></svg>
            SELL
          </button>
          {positions.length > 0 && (
            <button style={s.posBtn} onClick={()=>setShowPositions(!showPositions)}>
              {positions.length} posición{positions.length>1?'es':''} {showPositions?'▲':'▼'}
            </button>
          )}
        </div>
        <div style={s.bottomRight}>
          <span style={{fontSize:10,color:'#5d6673'}}>Forex Simulator · Algorithmic Suite</span>
        </div>
      </div>

      {/* POSITIONS PANEL */}
      {showPositions && positions.length > 0 && (
        <div style={s.posPanel}>
          <div style={s.posPanelHeader}>
            <span style={{fontSize:11,fontWeight:700,color:'#B2B5BE',letterSpacing:1}}>POSICIONES ABIERTAS</span>
            <button style={{background:'none',border:'none',color:'#B2B5BE',cursor:'pointer'}} onClick={()=>setShowPositions(false)}>✕</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid #2a2e39'}}>
                {['Dirección','Entrada','Actual','Lots','P&L',''].map(h=>(
                  <th key={h} style={{padding:'6px 12px',textAlign:'left',color:'#5d6673',fontWeight:600,fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => {
                const isJpy = session?.pair?.includes('JPY')
                const mult = isJpy ? 100 : 10000
                const pips = pos.side==='BUY' ? (currentPrice-pos.price)*mult : (pos.price-currentPrice)*mult
                const pnl = pips * pos.lots * 10
                return (
                  <tr key={pos.id} style={{borderBottom:'1px solid #1e222d'}}>
                    <td style={{padding:'8px 12px',color:pos.side==='BUY'?'#26a69a':'#ef5350',fontWeight:700}}>{pos.side}</td>
                    <td style={{padding:'8px 12px',color:'#B2B5BE'}}>{pos.price.toFixed(5)}</td>
                    <td style={{padding:'8px 12px',color:'#B2B5BE'}}>{currentPrice?.toFixed(5)}</td>
                    <td style={{padding:'8px 12px',color:'#B2B5BE'}}>{pos.lots}</td>
                    <td style={{padding:'8px 12px',color:pnlColor(pnl),fontWeight:600}}>{pnl>=0?'+':''}{pnl.toFixed(2)}</td>
                    <td style={{padding:'8px 12px'}}>
                      <button onClick={()=>closePosition(pos.id)} style={{background:'#ef535015',border:'1px solid #ef535040',color:'#ef5350',borderRadius:4,padding:'3px 10px',fontSize:10,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                        Cerrar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{overflow:hidden;background:#131722}
        .spinner{width:28px;height:28px;border:2px solid #1e222d;border-top-color:#26a69a;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type=number]::-webkit-inner-spin-button{opacity:0}
        #tv_chart_container iframe{border:none!important}
      `}</style>
    </div>
  )
}

const s = {
  root:{display:'flex',flexDirection:'column',height:'100vh',background:'#131722',fontFamily:"'Montserrat',sans-serif",overflow:'hidden'},
  topBar:{height:40,background:'#1e222d',borderBottom:'1px solid #2a2e39',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',flexShrink:0},
  topLeft:{display:'flex',alignItems:'center',gap:10},
  topRight:{display:'flex',alignItems:'center',gap:8},
  backBtn:{background:'none',border:'none',color:'#787b86',cursor:'pointer',display:'flex',alignItems:'center',padding:4,borderRadius:4},
  sessionInfo:{display:'flex',flexDirection:'column',gap:1},
  sessionName:{fontSize:12,fontWeight:700,color:'#ffffff'},
  sessionMeta:{fontSize:10,color:'#5d6673'},
  statPill:{display:'flex',flexDirection:'column',gap:1,padding:'0 10px',borderLeft:'1px solid #2a2e39'},
  statLabel:{fontSize:9,fontWeight:700,color:'#5d6673',letterSpacing:1},
  statVal:{fontSize:12,fontWeight:700,color:'#ffffff'},
  chartWrap:{flex:1,overflow:'hidden'},
  chart:{width:'100%',height:'100%'},
  bottomBar:{height:48,background:'#1e222d',borderTop:'1px solid #2a2e39',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',flexShrink:0},
  bottomLeft:{display:'flex',alignItems:'center',gap:12},
  bottomRight:{display:'flex',alignItems:'center'},
  bottomLabel:{fontSize:9,fontWeight:700,color:'#5d6673',letterSpacing:1},
  lotWrap:{display:'flex',flexDirection:'column',gap:2},
  lotControls:{display:'flex',alignItems:'center'},
  lotBtn:{background:'#2a2e39',border:'none',color:'#B2B5BE',width:20,height:22,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'},
  lotInput:{background:'transparent',border:'none',color:'#ffffff',width:56,height:22,textAlign:'center',fontSize:12,fontWeight:700,outline:'none',fontFamily:'Montserrat,sans-serif'},
  buyBtn:{background:'#26a69a',border:'none',color:'#fff',borderRadius:4,padding:'7px 20px',fontSize:12,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:'Montserrat,sans-serif'},
  sellBtn:{background:'#ef5350',border:'none',color:'#fff',borderRadius:4,padding:'7px 20px',fontSize:12,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:'Montserrat,sans-serif'},
  posBtn:{background:'#2a2e39',border:'none',color:'#B2B5BE',borderRadius:4,padding:'6px 12px',fontSize:11,cursor:'pointer',fontFamily:'Montserrat,sans-serif'},
  posPanel:{position:'fixed',bottom:48,left:0,right:0,background:'#1e222d',borderTop:'1px solid #2a2e39',zIndex:50,maxHeight:220,overflowY:'auto'},
  posPanelHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',borderBottom:'1px solid #2a2e39'},
}
