import { useEffect, useRef, useState } from 'react'
import { getSeriesData, getRealLen } from '../lib/sessionData'
import { SESSIONS, TF_LIST, calcSessions } from '../lib/killzonesDomain'
import { KillzonesPrimitive } from './KillzonesPrimitive'

const DEF = {
  visible: true,
  asia: true, london: true, nyam: true, nypm: false,
  showLabel: true,
  history: 5,
  tfs: { M1: true, M3: true, M5: true, M15: true, M30: true, H1: true, H4: true, D1: false },
}

const STORAGE_KEY = 'killzones_cfg_v2'

function loadCfg() {
  if (typeof window === 'undefined') return DEF
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEF
    const parsed = JSON.parse(raw)
    return { ...DEF, ...parsed, tfs: { ...DEF.tfs, ...(parsed.tfs || {}) } }
  } catch {
    return DEF
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KillzonesOverlay v5 — migración Opción C (Fase 5g sesión 38)
// ─────────────────────────────────────────────────────────────────────────────
//
// Migración Opción C: render delegado a KillzonesPrimitive (ISeriesPrimitive
// nativo LWC 5.1.0). Este wrapper React queda como capa de UI + cache de
// sesiones dominio puro + dispatch a primitive vía setSessions().
//
// CAMBIOS RESPECTO A v4:
// - Eliminado canvas externo propio (KillzonesPrimitive vive dentro del
//   canvas LWC interno).
// - Eliminado resizeCanvas + ResizeObserver + subscribeVisibleLogicalRangeChange
//   + subscribeSizeChange + dragLoop rAF + wheel handler. El pipeline LWC
//   invoca updateAllViews del primitive automáticamente en cualquier cambio
//   (resize/pan/zoom/drag horizontal/drag vertical). Estructuralmente
//   imposible que S33.4 reaparezca (race scale X barSpacing stale).
// - Eliminado draw callback (95 líneas) — migrado a KillzonesRenderer.
// - Eliminados 5 refs frescos + drawRef (sin subscribers asíncronos no
//   hacen falta).
// - Helpers dominio (SESSIONS/calcSessions/...) extraídos a
//   lib/killzonesDomain.js.
// ─────────────────────────────────────────────────────────────────────────────

export default function KillzonesOverlay({ chartMap, activePair, dataReady, currentTf, tick, tfKey, currentTime }) {
  const [cfg, setCfg]             = useState(loadCfg)
  const [hovered, setHovered]     = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const panelRef                  = useRef(null)
  const primitiveRef              = useRef(null)
  const cachedSessionsRef         = useRef([])

  const tfAllowed = !currentTf || cfg.tfs[currentTf] !== false

  // Persistir cfg
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
  }, [cfg])

  // Cerrar panel al click fuera
  useEffect(() => {
    if (!showPanel) return
    const fn = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setShowPanel(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPanel])

  // ── Mount/unmount primitive sobre cr.series ─────────────────────────────
  useEffect(() => {
    if (!activePair) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series) return

    const kp = new KillzonesPrimitive()
    try { cr.series.attachPrimitive(kp) } catch {}
    primitiveRef.current = kp

    return () => {
      try { cr.series.detachPrimitive(kp) } catch {}
      primitiveRef.current = null
    }
  }, [activePair, chartMap, dataReady])

  // ── Recalcular sesiones cuando cambien datos/cfg/tick/currentTime ──────
  // currentTime: bucketed a 30 min para no disparar recálculo en cada vela
  // M1 del replay, pero sí cuando entre/salga de un horario de killzone
  // (todas las KZ alineadas a intervalos de 30 min en hora NY).
  const ctBucket = currentTime ? Math.floor(currentTime / 1800) : 0
  useEffect(() => {
    if (!cfg.visible || !tfAllowed || !dataReady || !activePair) {
      cachedSessionsRef.current = []
      primitiveRef.current?.setSessions([], currentTime, cfg.showLabel)
      return
    }
    const allData = getSeriesData()
    const realLen = getRealLen()
    if (!allData || !realLen) {
      cachedSessionsRef.current = []
      primitiveRef.current?.setSessions([], currentTime, cfg.showLabel)
      return
    }
    const candles = allData.slice(0, realLen)
    const sessions = calcSessions(candles, cfg)
    // Limitar a las N más recientes por tipo
    const counts = {}
    cachedSessionsRef.current = sessions.reverse().filter(s => {
      counts[s.key] = (counts[s.key] || 0) + 1
      return counts[s.key] <= cfg.history
    }).reverse()
    primitiveRef.current?.setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)
  }, [cfg, tfAllowed, dataReady, activePair, tick, tfKey, ctBucket, currentTime])

  // ── Dispatch a primitive cuando avanza replay (bucket 60s endpoint vivo) ─
  // La cache de sesiones NO cambia, pero la KZ activa crece vela-a-vela en
  // el primitive (lógica computeActiveSession). Bucket de 60s para no
  // saturar React a velocidades altas de replay.
  const ctRedrawBucket = currentTime ? Math.floor(currentTime / 60) : 0
  useEffect(() => {
    primitiveRef.current?.setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)
  }, [ctRedrawBucket, cfg.showLabel])

  // ── UI ──────────────────────────────────────────────────────────────────
  const Toggle = ({ label, k }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{label}</span>
      <div onClick={() => setCfg(p => ({ ...p, [k]: !p[k] }))}
        style={{ width: 30, height: 17, borderRadius: 9, cursor: 'pointer', position: 'relative',
          background: cfg[k] ? '#2962FF' : 'rgba(255,255,255,0.15)', transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: 2.5, left: cfg[k] ? 14 : 3,
          width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </div>
    </div>
  )

  const TfChip = ({ tf }) => (
    <div onClick={() => setCfg(p => ({ ...p, tfs: { ...p.tfs, [tf]: !p.tfs[tf] } }))}
      style={{
        padding: '3px 7px', fontSize: 10, fontWeight: 600,
        borderRadius: 4, cursor: 'pointer', userSelect: 'none',
        background: cfg.tfs[tf] ? 'rgba(41,98,255,0.85)' : 'rgba(255,255,255,0.06)',
        color: cfg.tfs[tf] ? '#fff' : 'rgba(255,255,255,0.45)',
        border: cfg.tfs[tf] ? '1px solid rgba(41,98,255,0.9)' : '1px solid rgba(255,255,255,0.08)',
        transition: 'background .15s, color .15s',
      }}>
      {tf}
    </div>
  )

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>

      {/* Sin canvas Capa 1 — el primitive vive dentro del canvas LWC */}

      {/* Capa 2: Indicator label */}
      <div
        style={{
          position: 'absolute', top: 20, left: 6, pointerEvents: 'all',
          display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "'Montserrat',sans-serif", fontSize: 11,
          color: cfg.visible && tfAllowed ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)',
          cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { if (!showPanel) setHovered(false) }}
      >
        <span style={{ fontWeight: 500, letterSpacing: 0.1 }}>Killzones</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 1,
          opacity: hovered || showPanel ? 1 : 0, transition: 'opacity .12s', marginLeft: 2 }}>

          <button title={cfg.visible ? 'Ocultar' : 'Mostrar'}
            onClick={() => setCfg(p => ({ ...p, visible: !p.visible }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            {cfg.visible
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>

          <button title="Configuración" onClick={() => setShowPanel(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </span>

        {showPanel && (
          <div ref={panelRef} style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: 'rgba(10,14,26,0.97)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '12px 14px', minWidth: 240,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(20px)', zIndex: 200, pointerEvents: 'all'
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
              letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Killzones SMC</div>
            <Toggle label="Asia KZ  (20:00–00:00 NY)" k="asia" />
            <Toggle label="Londres KZ  (02:00–05:00 NY)" k="london" />
            <Toggle label="NY AM KZ  (07:00–10:00 NY)" k="nyam" />
            <Toggle label="NY PM KZ  (13:30–16:00 NY)" k="nypm" />
            <Toggle label="Etiquetas" k="showLabel" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Sesiones a mostrar</span>
              <input type="number" min={1} max={20} value={cfg.history}
                style={{ width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, color: '#fff', fontSize: 11, padding: '3px 6px',
                  fontFamily: "'Montserrat',sans-serif", outline: 'none', textAlign: 'right' }}
                onChange={e => setCfg(p => ({ ...p, history: Math.max(1, Math.min(20, +e.target.value || 1)) }))} />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
                letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Visible en</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TF_LIST.map(tf => <TfChip key={tf} tf={tf} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
