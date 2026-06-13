import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/useAuth'
import NoAccess from '../components/NoAccess'
import NetworkBg from '../components/NetworkBg'

// ─────────────────────────────────────────────────────────────────────────────
// /operativas — Operativas R.A.M.M.FX TRADING (página huérfana hasta el switch
// del dashboard). Gate de alumno con useAuth + NoAccess, mismo patrón que
// analytics. Maqueta aprobada s63 portada 1:1: 3 cards (Londres, NY, Swing)
// → modales liquid glass con vídeo (hueco) + trading plan, y hoja de ruta
// interactiva con 11 checks persistidos en localStorage por usuario (v1;
// persistencia en Supabase queda para la fase de blindaje).
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_KEYS = ['r1a','r2a','r2b','r3a','r3b','r4a','r4b','r5a','r5b','r6a','r6b']

const RUTA = [
  { n: 1, t: 'Elige tu sesión operativa', d: 'Londres, Nueva York o Swing. Una ruta cubre un solo modelo — domínalo antes de pasar al siguiente.',
    items: [{ k: 'r1a', t: 'Sesión operativa elegida' }] },
  { n: 2, t: 'Estudia el modelo', d: 'Vídeo y trading plan completos antes del primer trade. Las reglas de invalidación no se negocian.',
    items: [{ k: 'r2a', t: 'Vídeo completo visto' }, { k: 'r2b', t: 'Trading plan leído de principio a fin' }] },
  { n: 3, t: 'Opción 1 · +100 trades', d: 'Crea una sesión en el simulador y nómbrala con modelo y opción, p. ej. «LND · Opción 1». Solo esa opción, nada más: estás midiendo su edge por separado.',
    items: [{ k: 'r3a', t: 'Sesión creada y nombrada' }, { k: 'r3b', t: '+100 trades completados' }] },
  { n: 4, t: 'Opción 2 · +100 trades', d: 'Nueva sesión para la segunda opción, p. ej. «LND · 2A». Mismo rigor, misma muestra.',
    items: [{ k: 'r4a', t: 'Sesión creada y nombrada' }, { k: 'r4b', t: '+100 trades completados' }] },
  { n: 5, t: 'Opción 3 · +100 trades', d: 'Tercera sesión, p. ej. «LND · 2B». Si tu modelo solo tiene dos opciones (swing: caminos A y B), marca esta etapa y sigue.',
    items: [{ k: 'r5a', t: 'Sesión creada y nombrada' }, { k: 'r5b', t: '+100 trades completados' }] },
  { n: 6, t: 'Analiza tus métricas', d: '+300 trades del modelo: compara winrate y RR de cada opción por separado. Tu punto fuerte y tu punto débil quedan al descubierto — y eso es exactamente lo que te llevas a real.',
    items: [{ k: 'r6a', t: 'Métricas comparadas por opción' }, { k: 'r6b', t: 'Punto fuerte y punto débil identificados' }] },
]

const CSS = `
  .opv-stars{position:fixed;inset:0;z-index:0;pointer-events:none}
  .opv-glow{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(1000px 640px at 80% -10%,rgba(30,144,255,.15),transparent 60%),radial-gradient(820px 720px at 6% 112%,rgba(38,166,154,.07),transparent 55%)}
  .opv-scroll{position:relative;z-index:1;height:100vh;overflow-y:auto}
  .opv-wrap{max-width:1080px;margin:0 auto;padding:28px 24px 60px}
  .opv-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:42px}
  .opv-brand{display:flex;align-items:center;gap:12px}
  .opv-mark{width:34px;height:34px;border-radius:8px;object-fit:contain;display:block}
  .opv-brand b{display:block;font-size:12px;letter-spacing:2.5px;color:#fff}
  .opv-brand span{display:block;font-size:10px;letter-spacing:1.5px;color:rgba(255,255,255,.82);margin-top:2px}
  .opv-back{color:rgba(255,255,255,.55);font-size:12px;text-decoration:none;border:1px solid rgba(255,255,255,.1);padding:8px 14px;border-radius:8px;transition:.15s;cursor:pointer;background:none;font-family:inherit}
  .opv-back:hover{color:#fff;border-color:rgba(255,255,255,.16)}
  .opv-pillhead{border:1px solid rgba(30,144,255,.7);color:#A7CDF5;font-size:11px;font-weight:700;letter-spacing:2.5px;padding:6px 16px;border-radius:999px;box-shadow:0 0 16px rgba(30,144,255,.15)}
  .opv-h1{font-size:clamp(34px,4.6vw,46px);font-weight:800;letter-spacing:-.5px;line-height:1.05;margin:0;max-width:15ch}
  .opv-h1 em{font-style:normal;color:#4a8ae0}
  .opv-eyebrow{font-size:11px;font-weight:700;letter-spacing:3.5px;color:#A7CDF5;display:inline-flex;align-items:center;gap:11px;margin:0 0 16px}
  .opv-eyebrow::before{content:"";width:30px;height:1px;background:linear-gradient(90deg,rgba(30,144,255,.9),transparent)}
  .opv-sub{color:rgba(255,255,255,.55);font-size:13.5px;line-height:1.7;margin:12px 0 6px;max-width:640px}
  .opv-lock{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.4);font-size:11.5px;margin:6px 0 34px}
  .opv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
  .opv-card{background:linear-gradient(165deg,rgba(30,144,255,.10),rgba(255,255,255,.03) 55%),rgba(13,18,28,.55);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:22px 22px 20px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;animation:opvRise .5s ease backwards;box-shadow:0 4px 22px rgba(0,0,0,.35);position:relative;overflow:hidden}
  .opv-card:nth-child(2){animation-delay:.08s}.opv-card:nth-child(3){animation-delay:.16s}
  @keyframes opvRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .opv-card:hover{transform:translateY(-6px);border-color:rgba(30,144,255,.8);box-shadow:0 18px 48px rgba(30,144,255,.26)}
  .opv-card::before{content:"";position:absolute;inset:0;z-index:0;opacity:0;transition:opacity .25s;background:radial-gradient(420px 220px at 50% -10%,rgba(30,144,255,.20),transparent 70%);pointer-events:none}
  .opv-card:hover::before{opacity:1}
  .opv-card>*{position:relative;z-index:1}
  .opv-card::after{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,rgba(30,144,255,.95),transparent 82%);z-index:2}
  .opv-sess{display:inline-block;background:rgba(30,144,255,.2);border:1px solid rgba(30,144,255,.65);color:#A7CDF5;font-size:10.5px;font-weight:700;letter-spacing:1.5px;padding:5px 12px;border-radius:999px}
  .opv-card h2{font-size:18px;font-weight:700;margin:16px 0 0}
  .opv-card p{color:rgba(255,255,255,.55);font-size:12.5px;line-height:1.65;margin:9px 0 0}
  .opv-meta{display:flex;align-items:center;gap:14px;margin-top:18px;color:rgba(255,255,255,.4);font-size:11.5px}
  .opv-meta .opv-go{margin-left:auto;color:#4a8ae0;font-size:16px;transition:transform .18s}
  .opv-card:hover .opv-go{transform:translateX(4px)}
  .opv-overlay{position:fixed;inset:0;background:rgba(2,4,9,.32);-webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 16px;z-index:50;animation:opvFade .2s ease}
  @keyframes opvFade{from{opacity:0}to{opacity:1}}
  .opv-modal{background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.03) 26%),rgba(13,18,28,.36);-webkit-backdrop-filter:blur(44px) saturate(185%);backdrop-filter:blur(44px) saturate(185%);border:1px solid rgba(255,255,255,.3);border-radius:20px;max-width:680px;width:100%;padding:26px 26px 30px;animation:opvPop .22s ease;box-shadow:0 28px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.25),inset 0 0 30px rgba(255,255,255,.035)}
  @keyframes opvPop{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
  .opv-mhead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
  .opv-mtitle{font-size:21px;font-weight:800;margin-top:12px}
  .opv-mtime{color:rgba(255,255,255,.55);font-size:12px;margin-top:5px}
  .opv-x{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:9px;color:rgba(255,255,255,.7);font-size:15px;width:34px;height:34px;cursor:pointer;transition:.15s;font-family:inherit}
  .opv-x:hover{color:#fff;border-color:rgba(255,255,255,.3)}
  .opv-video{aspect-ratio:16/9;background:#000;border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;margin:20px 0 26px}
  .opv-play{width:62px;height:62px;border:2px solid rgba(30,144,255,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#6FAFF0;font-size:20px;transition:.15s;cursor:pointer;box-shadow:0 0 22px rgba(30,144,255,.28)}
  .opv-play:hover{background:rgba(30,144,255,.12)}
  .opv-vtag{position:absolute;left:14px;bottom:12px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);font-size:11px;padding:5px 11px;border-radius:7px}
  .opv-label{color:#85B7EB;font-size:11px;font-weight:700;letter-spacing:2.5px;margin:26px 0 12px}
  .opv-step{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:14px 16px}
  .opv-step+.opv-step{margin-top:9px}
  .opv-n{min-width:24px;width:24px;height:24px;flex:none;background:rgba(30,144,255,.18);color:#A7CDF5;font-size:12px;font-weight:700;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;line-height:1;text-align:center}
  .opv-step b{font-size:13.5px}
  .opv-step div span{display:block;color:rgba(255,255,255,.55);font-size:11.5px;margin-top:3px;line-height:1.55}
  .opv-pills{display:flex;flex-direction:column;gap:9px;margin-top:4px}
  .opv-pillrow{display:flex;align-items:center;gap:12px;font-size:12px;color:rgba(255,255,255,.75)}
  .opv-pill{min-width:84px;text-align:center;font-size:10.5px;font-weight:800;letter-spacing:1.5px;padding:5px 0;border-radius:999px;border:1px solid}
  .opv-pg{color:#26a69a;border-color:rgba(38,166,154,.55);background:rgba(38,166,154,.1)}
  .opv-pr{color:#ef5350;border-color:rgba(239,83,80,.55);background:rgba(239,83,80,.1)}
  .opv-pa{color:#EF9F27;border-color:rgba(239,159,39,.55);background:rgba(239,159,39,.1)}
  .opv-zona{display:grid;grid-template-columns:130px 1fr;gap:14px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:13px 16px;font-size:12px}
  .opv-zona+.opv-zona{margin-top:8px}
  .opv-zona b{color:#4a8ae0;font-size:12px}
  .opv-zona span{color:rgba(255,255,255,.55);line-height:1.6}
  .opv-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:11px;margin-top:4px}
  .opv-opt{border:1px solid rgba(255,255,255,.1);border-radius:11px;overflow:hidden;display:flex;flex-direction:column}
  .opv-oh{background:linear-gradient(135deg,#4a8ae0,#2d5fb0);color:#F0F6FD;font-size:11px;font-weight:800;letter-spacing:2px;text-align:center;padding:7px}
  .opv-ob{background:rgba(255,255,255,.04);padding:13px 14px;flex:1}
  .opv-ob b{font-size:12.5px;display:block}
  .opv-ob p{color:rgba(255,255,255,.55);font-size:11.5px;line-height:1.6;margin:6px 0 0}
  .opv-ob ul{margin:8px 0 0;padding-left:16px;color:rgba(255,255,255,.7);font-size:11.5px;line-height:1.7}
  .opv-rr{display:inline-block;background:rgba(38,166,154,.16);border:1px solid rgba(38,166,154,.65);color:#6FE0BA;font-size:11px;font-weight:800;letter-spacing:1px;padding:6px 14px;border-radius:999px;margin-top:14px;box-shadow:0 0 14px rgba(38,166,154,.18)}
  .opv-warn{background:rgba(239,83,80,.07);border:1px solid rgba(239,83,80,.4);border-radius:12px;padding:16px 18px;margin-top:24px}
  .opv-warn b{color:#F09595;font-size:12.5px;letter-spacing:1px}
  .opv-warn ul{margin:10px 0 0;padding-left:16px;color:rgba(255,255,255,.72);font-size:12px;line-height:1.9}
  .opv-ex{border:1.5px dashed rgba(255,255,255,.25);border-radius:12px;padding:26px;text-align:center;color:rgba(255,255,255,.4);font-size:12px;margin-top:18px}
  .opv-modal details{border-top:1px solid rgba(255,255,255,.1);margin-top:24px;padding-top:6px}
  .opv-modal summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;color:rgba(255,255,255,.75);font-size:13px;font-weight:700;padding:10px 0}
  .opv-modal summary::after{content:"▾";color:rgba(255,255,255,.4);transition:.2s}
  .opv-modal details[open] summary::after{transform:rotate(180deg)}
  .opv-quote{font-style:italic;color:rgba(255,255,255,.8);font-size:12.5px;line-height:1.7;border-left:2px solid #1e90ff;padding:2px 0 2px 14px;margin:6px 0 10px}
  .opv-fine{color:rgba(255,255,255,.4);font-size:11.5px;line-height:1.7}
  .opv-eco{margin-top:26px;border-top:1px solid rgba(255,255,255,.1);padding-top:16px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;letter-spacing:1.5px}
  .opv-banner{background:rgba(30,144,255,.08);border:1px solid rgba(30,144,255,.35);border-radius:11px;padding:13px 16px;font-size:12px;color:rgba(255,255,255,.85);line-height:1.6;margin-top:18px}
  .opv-banner b{color:#85B7EB;letter-spacing:1px;font-size:11px;display:block;margin-bottom:5px}
  .opv-rhead{display:flex;align-items:center;gap:14px;margin:8px 0 20px}
  .opv-rhead b{font-size:12px;letter-spacing:1px;color:rgba(255,255,255,.75);white-space:nowrap}
  .opv-rbar{flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}
  .opv-rfill{display:block;height:100%;background:linear-gradient(90deg,#1e90ff,#26a69a);border-radius:999px;transition:width .25s;box-shadow:0 0 12px rgba(30,144,255,.6)}
  .opv-rnode{display:flex;gap:16px}
  .opv-rmark{display:flex;flex-direction:column;align-items:center}
  .opv-rdot{width:32px;height:32px;min-height:32px;flex:none;border-radius:50%;border:2px solid rgba(30,144,255,.85);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;line-height:1;text-align:center;color:#A7CDF5;background:#0B0F18;transition:.2s;box-shadow:0 0 14px rgba(30,144,255,.35)}
  .opv-rseg{width:2px;flex:1;min-height:16px;background:linear-gradient(180deg,rgba(30,144,255,.6),rgba(30,144,255,.15));margin:6px 0}
  .opv-rcard{flex:1;background:linear-gradient(165deg,rgba(30,144,255,.06),rgba(255,255,255,.03) 55%),rgba(13,18,28,.55);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:14px 16px;margin-bottom:14px;transition:border-color .2s,box-shadow .2s}
  .opv-rcard h3{font-size:13.5px;font-weight:700;margin:0}
  .opv-rdesc{color:rgba(255,255,255,.55);font-size:11.5px;line-height:1.6;margin:4px 0 0}
  .opv-chklist{margin-top:11px;border-top:1px solid rgba(255,255,255,.1)}
  .opv-chk{display:flex;align-items:center;gap:10px;font-size:12px;color:rgba(255,255,255,.72);padding:8px 0;cursor:pointer}
  .opv-chk+.opv-chk{border-top:1px dashed rgba(255,255,255,.08)}
  .opv-chk input{display:none}
  .opv-cbox{width:16px;height:16px;min-width:16px;flex:none;border:1.5px solid rgba(255,255,255,.35);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;color:transparent;transition:.15s}
  .opv-chk input:checked ~ .opv-cbox{background:#26a69a;border-color:#26a69a;color:#04110e}
  .opv-chk input:checked ~ .opv-t{color:rgba(255,255,255,.4);text-decoration:line-through}
  .opv-rnode.opv-done .opv-rdot{background:#26a69a;border-color:#26a69a;color:#04110e}
  .opv-rnode.opv-done .opv-rcard{border-color:rgba(38,166,154,.5)}
  .opv-rbtn{display:block;width:100%;margin-top:4px;background:rgba(30,144,255,.1);border:1px solid rgba(30,144,255,.55);color:#A7CDF5;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:1.5px;padding:14px;border-radius:11px;cursor:pointer;transition:.2s}
  .opv-rbtn:hover{background:rgba(30,144,255,.2);border-color:rgba(30,144,255,.85);color:#fff;box-shadow:0 0 26px rgba(30,144,255,.3)}
  .opv-rbtn.opv-ready{background:linear-gradient(135deg,#26a69a,#1a7a72);border-color:transparent;color:#fff;box-shadow:0 4px 22px rgba(38,166,154,.45)}
  .opv-rmap{margin-top:56px;background:rgba(16,23,38,.55);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:26px 26px 28px;-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);box-shadow:0 18px 48px rgba(0,0,0,.36)}
  .opv-loading{height:100vh;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.5);font-size:13px;letter-spacing:2px}
`

function Chk({ k, label, checks, onToggle }) {
  return (
    <label className="opv-chk">
      <input type="checkbox" checked={!!checks[k]} onChange={() => onToggle(k)} />
      <span className="opv-cbox">✓</span>
      <span className="opv-t">{label}</span>
    </label>
  )
}

function Zona({ b, children }) {
  return <div className="opv-zona"><b>{b}</b><span>{children}</span></div>
}

function Overlay({ onClose, children }) {
  return (
    <div className="opv-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="opv-modal">{children}</div>
    </div>
  )
}

function MHead({ title, time, onClose }) {
  return (
    <div className="opv-mhead">
      <div>
        <span className="opv-pillhead">TRADING PLAN</span>
        <div className="opv-mtitle">{title}</div>
        <div className="opv-mtime">⏱ {time}</div>
      </div>
      <button className="opv-x" onClick={onClose}>✕</button>
    </div>
  )
}

function VideoPh({ tag, videoId }) {
  if (videoId) {
    return (
      <div className="opv-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
          title={`Vídeo · ${tag}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 'inherit' }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }
  return (
    <div className="opv-video">
      <div className="opv-play">▶</div>
      <span className="opv-vtag">Vídeo · {tag} (hueco reservado)</span>
    </div>
  )
}

function Direccion({ neutro = true, largo, corto, neutroTxt }) {
  return (
    <div className="opv-pills">
      <div className="opv-pillrow"><span className="opv-pill opv-pg">ALCISTA</span> {largo}</div>
      <div className="opv-pillrow"><span className="opv-pill opv-pr">BAJISTA</span> {corto}</div>
      {neutro && <div className="opv-pillrow"><span className="opv-pill opv-pa">NEUTRO</span> {neutroTxt}</div>}
    </div>
  )
}

function Footer() {
  return <div className="opv-eco">ECOSISTEMA R.A.M.M.FX TRADING™ · Mentorías 1a1 · Algorithmic Suite · Libros · Finance</div>
}

function Mentalidad({ quote, fine }) {
  return (
    <details>
      <summary>Mentalidad operativa</summary>
      <p className="opv-quote">{quote}</p>
      <p className="opv-fine">{fine}</p>
    </details>
  )
}

const FINE_COMUN = 'Este modelo es un marco de referencia operativo. Cada trader ajusta dentro de su contexto de cuenta, gestión de riesgo y tolerancia personal. La repetición del proceso es lo que construye la estadística — no la improvisación.'

export default function Operativas() {
  const router = useRouter()
  const { user, profile, loading: authLoading, hasAccess } = useAuth('simulador_activo')
  const rutaRef = useRef(null)
  const [open, setOpen] = useState(null) // 'ldn' | 'ny' | 'sw' | null
  const [checks, setChecks] = useState({})

  const storageKey = user ? 'rammfx_ruta_' + user.id : null

  // Cargar progreso de la ruta del navegador (v1; Supabase en fase blindaje)
  useEffect(() => {
    if (!storageKey) return
    try { setChecks(JSON.parse(localStorage.getItem(storageKey) || '{}')) } catch {}
  }, [storageKey])

  function toggleCheck(k) {
    setChecks(prev => {
      const next = { ...prev, [k]: !prev[k] }
      if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {} }
      return next
    })
  }

  function resetRuta() {
    setChecks({})
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch {} }
    rutaRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Cerrar modal con Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])


  if (!authLoading && !hasAccess) {
    return <NoAccess profile={profile} producto="Simulador" />
  }

  const done = CHECK_KEYS.filter(k => checks[k]).length
  const pct = Math.round(done / CHECK_KEYS.length * 100)

  return (
    <>
      <Head><title>Operativas R.A.M.M.FX — Forex Simulator</title></Head>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {authLoading ? (
        <div className="opv-loading">CARGANDO…</div>
      ) : (
        <>
          <NetworkBg />
          <div className="opv-glow" />
          <div className="opv-scroll" style={open ? { overflow: 'hidden' } : undefined}>
            <div className="opv-wrap">
              <div className="opv-top">
                <div className="opv-brand">
                  <img src="/logo-rammfx.png" alt="R.A.M.M.FX TRADING" className="opv-mark" />
                  <div><b>R.A.M.M.FX TRADING™</b><span>ALGORITHMIC SUITE</span></div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span className="opv-pillhead">OPERATIVAS</span>
                  <button className="opv-back" onClick={() => router.push('/dashboard')}>← Dashboard</button>
                </div>
              </div>

              <div className="opv-eyebrow">OPERATIVAS · MÉTODO R.A.M.M.FX TRADING</div>
              <h1 className="opv-h1">Tres sesiones. Un proceso. Tu <em>edge</em>.</h1>
              <p className="opv-sub">Cada modelo se domina por separado: estudia el vídeo y el plan completo, valida más de 300 trades en el simulador y deja tu punto fuerte y tu punto débil al descubierto — antes de arriesgar un euro en real.</p>
              <p className="opv-lock">🔒 Contenido protegido · solo visible para alumnos con acceso</p>

              <div className="opv-grid">
                <div className="opv-card" onClick={() => setOpen('ldn')}>
                  <span className="opv-sess">LONDON KILLZONE</span>
                  <h2>Sesión Londres</h2>
                  <p>Manipulación del rango asiático y continuación: opciones 1, 2A y 2B con confirmación en 5 minutos.</p>
                  <div className="opv-meta"><span>▶ Vídeo</span><span>▤ Plan operativo</span><span className="opv-go">→</span></div>
                </div>
                <div className="opv-card" onClick={() => setOpen('ny')}>
                  <span className="opv-sess">NEW YORK KILLZONE</span>
                  <h2>Sesión Nueva York</h2>
                  <p>Lectura HTF, zonas de reacción y tres modelos de entrada: setup favorito, continuación y reversal.</p>
                  <div className="opv-meta"><span>▶ Vídeo</span><span>▤ Plan operativo</span><span className="opv-go">→</span></div>
                </div>
                <div className="opv-card" onClick={() => setOpen('sw')}>
                  <span className="opv-sess">SWING TRADING</span>
                  <h2>Swing</h2>
                  <p>Dirección macro con confluencia fundamental, setup favorito y confirmación en 15–30 minutos.</p>
                  <div className="opv-meta"><span>▶ Vídeo</span><span>▤ Plan operativo</span><span className="opv-go">→</span></div>
                </div>
              </div>

              <div className="opv-rmap">
              <div className="opv-label" ref={rutaRef} style={{ marginTop: 0 }}>HOJA DE RUTA · USO ÓPTIMO DEL SIMULADOR</div>
              <p className="opv-sub" style={{ margin: '0 0 14px' }}>Una ruta = un modelo a fondo: una sesión del simulador por cada opción, +100 trades por sesión. Al terminar, reinicia la ruta y repítela con el siguiente modelo.</p>
              <div className="opv-rhead"><b>TU RUTA · {pct}%</b><span className="opv-rbar"><i className="opv-rfill" style={{ width: pct + '%' }} /></span></div>

              {RUTA.map((node, idx) => {
                const nodeDone = node.items.every(i => checks[i.k])
                return (
                  <div key={node.n} className={'opv-rnode' + (nodeDone ? ' opv-done' : '')}>
                    <div className="opv-rmark">
                      <div className="opv-rdot">{node.n}</div>
                      {idx < RUTA.length - 1 && <div className="opv-rseg" />}
                    </div>
                    <div className="opv-rcard">
                      <h3>{node.t}</h3>
                      <p className="opv-rdesc">{node.d}</p>
                      <div className="opv-chklist">
                        {node.items.map(it => <Chk key={it.k} k={it.k} label={it.t} checks={checks} onToggle={toggleCheck} />)}
                      </div>
                    </div>
                  </div>
                )
              })}

              <button className={'opv-rbtn' + (pct === 100 ? ' opv-ready' : '')} onClick={resetRuta}>
                {pct === 100 ? '✓ Ruta completada — empezar con el siguiente modelo' : 'Empezar de nuevo · reinicia los checks'}
              </button>
              </div>
            </div>
          </div>

          {open === 'ldn' && (
            <Overlay onClose={() => setOpen(null)}>
              <MHead title="Sesión Londres" time="08:30 – 11:30 · hora de Londres" onClose={() => setOpen(null)} />
              <VideoPh tag="Modelo Londres" videoId="TdOKEcqvsuc" />
              <div className="opv-label">ORDEN DE EJECUCIÓN</div>
              <div className="opv-step"><span className="opv-n">1</span><div><b>Determinar dirección</b><span>Sesgo alcista o bajista · timeframe 1H – 4H (HTF). Único sentido válido de entrada en toda la sesión.</span></div></div>
              <div className="opv-step"><span className="opv-n">2</span><div><b>Zonas objetivo</b><span>Liquidez · vacíos / FVG · setup favorito. Solo zonas alineadas con el sesgo HTF.</span></div></div>
              <div className="opv-step"><span className="opv-n">3</span><div><b>Modelos de entrada · 08:30 – 11:30</b><span>Setup favorito · manipulación · continuación.</span></div></div>
              <div className="opv-label">① DIRECCIÓN</div>
              <Direccion largo="Solo se buscan entradas en largo." corto="Solo se buscan entradas en corto." neutroTxt="Sin dirección clara en HTF: no hay entrada válida ese día." />
              <div className="opv-label">② ZONAS OBJETIVO</div>
              <Zona b="Liquidez">Highs y lows previos, equal highs / equal lows. Zonas donde hay LQ acumulada.</Zona>
              <Zona b="Vacío / FVG">Fair Value Gap sin mitigar, alineado con la dirección HTF. El precio tiende a volver a cubrirlo.</Zona>
              <Zona b="Setup favorito">Confluencia máxima: SWEEP + CHoCH + LQ previa + POI. Prioridad absoluta de entrada.</Zona>
              <div className="opv-label">③ MODELOS DE ENTRADA</div>
              <div className="opv-opts">
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 1</div><div className="opv-ob"><b>Setup favorito — limit</b>
                  <ul><li>Identificado sobre o bajo el rango asiático, a favor de la dirección HTF.</li><li>Limit clavada en la zona — sin confirmación adicional (también válida confirmada).</li><li>La entrada de mayor calidad y menor tiempo en mercado.</li></ul></div></div>
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 2A</div><div className="opv-ob"><b>Manipulación confirmada</b>
                  <ul><li>El precio barre un high o low previo (stop hunt) y entra en zona de reacción.</li><li>Tras la barrida: cambio de estructura (CHoCH) en 5 minutos.</li><li>Entrada solo con CHoCH confirmado · únicamente dentro del horario.</li></ul></div></div>
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 2B</div><div className="opv-ob"><b>Continuación confirmada</b>
                  <p>Order flow en curso claro, sin manipulación previa en la sesión.</p>
                  <ul><li>FVG aproximadamente al 0.5 del impulso previo.</li><li>Largo: bajo un low relevante · corto: sobre un high relevante.</li><li>Reacción + CHoCH 5m — o entrada con limit directa.</li></ul></div></div>
              </div>
              <span className="opv-rr">RR OBJETIVO · 2:1</span>
              <div className="opv-warn"><b>⚠ REGLAS DE INVALIDACIÓN</b>
                <ul>
                  <li>Fuera del horario 08:30 – 11:30 (hora de Londres) no hay entrada válida.</li>
                  <li>Sin dirección HTF clara → sesión nula.</li>
                  <li>Evitar operar contra el sesgo HTF bajo cualquier circunstancia.</li>
                  <li>Si el setup favorito está disponible → prioridad absoluta sobre las opciones 2A y 2B.</li>
                </ul>
              </div>
              <Mentalidad quote="«Londres manipula. Tu trabajo es leer la trampa, no caer en ella.»" fine={FINE_COMUN} />
              <Footer />
            </Overlay>
          )}

          {open === 'ny' && (
            <Overlay onClose={() => setOpen(null)}>
              <MHead title="Sesión Nueva York" time="14:30 – 17:30 · hora de Londres" onClose={() => setOpen(null)} />
              <VideoPh tag="Modelo Nueva York" videoId="KP8ctANHHC8" />
              <div className="opv-label">ORDEN DE EJECUCIÓN</div>
              <div className="opv-step"><span className="opv-n">1</span><div><b>Determinar dirección</b><span>Sesgo alcista o bajista · timeframe 1H – 4H. Define el único sentido válido de entrada durante toda la sesión.</span></div></div>
              <div className="opv-step"><span className="opv-n">2</span><div><b>Zonas de reacción</b><span>Liquidez · vacíos / FVG · setup favorito. Solo se opera en zonas alineadas con el sesgo.</span></div></div>
              <div className="opv-step"><span className="opv-n">3</span><div><b>Modelos de entrada · 14:30 – 17:30</b><span>Setup favorito · continuación · reversal.</span></div></div>
              <div className="opv-label">① DIRECCIÓN</div>
              <Direccion largo="Solo se buscan entradas largas." corto="Solo se buscan entradas cortas." neutroTxt="Sin dirección clara en 1H – 4H: no hay entrada válida ese día." />
              <div className="opv-label">② ZONAS DE REACCIÓN</div>
              <Zona b="Liquidez">Highs y lows previos, equal highs / equal lows. Zonas donde hay LQ acumulada.</Zona>
              <Zona b="Vacío / FVG">Fair Value Gap sin mitigar, alineado con la dirección HTF. El precio tiende a volver a cubrirlo.</Zona>
              <Zona b="Setup favorito">Confluencia máxima: SWEEP + CHoCH + LQ previa + POI. Prioridad absoluta de entrada.</Zona>
              <div className="opv-label">③ MODELOS DE ENTRADA</div>
              <div className="opv-opts">
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 1</div><div className="opv-ob"><b>Setup favorito — limit</b>
                  <ul><li>Identificado sobre o bajo el rango asiático, a favor de la dirección HTF.</li><li>Orden limit clavada en la zona — sin esperar confirmación (también válida entrada confirmada).</li><li>Objetivo: high / low HTF de la dirección.</li></ul></div></div>
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 2</div><div className="opv-ob"><b>Continuación</b>
                  <p>Asia acumula · Londres manipula y distribuye. NY se suma desde un descuento.</p>
                  <ul><li>Buscar el extremo o descuento del movimiento de Londres.</li><li>CHoCH en 5 minutos confirmado en la zona.</li><li>Objetivo: high / low HTF.</li></ul></div></div>
                <div className="opv-opt"><div className="opv-oh">OPCIÓN 3</div><div className="opv-ob"><b>Reversal</b>
                  <p>Londres distribuye dejando el lado contrario de Asia intacto: esa liquidez es el objetivo.</p>
                  <ul><li>Precio llega a zona de reacción (FVG, POI o manipulación).</li><li>El lado opuesto de Asia permanece sin manipular.</li><li>CHoCH 5m · objetivo: low de Asia en ventas / high en compras.</li></ul></div></div>
              </div>
              <span className="opv-rr">RR OBJETIVO · 2:1</span>
              <div className="opv-warn"><b>⚠ REGLAS DE INVALIDACIÓN</b>
                <ul>
                  <li>Fuera del horario 14:30 – 17:30 (hora de Londres) no hay entrada válida.</li>
                  <li>Sin dirección clara en 1H – 4H → sesión nula.</li>
                  <li>Si el setup favorito está disponible → prioridad absoluta sobre el resto.</li>
                  <li>En el reversal, si el lado contrario de Asia ya fue manipulado, el setup queda invalidado.</li>
                </ul>
              </div>
              <Mentalidad quote="«El fundamental decide el rumbo. El técnico decide la entrada. La disciplina decide si llegas al destino.»" fine={FINE_COMUN} />
              <Footer />
            </Overlay>
          )}

          {open === 'sw' && (
            <Overlay onClose={() => setOpen(null)}>
              <MHead title="Swing" time="Análisis 4H y 30min · confirmación 15min o 30min" onClose={() => setOpen(null)} />
              <VideoPh tag="Modelo Swing" />
              <div className="opv-banner"><b>⚡ PRINCIPIO FUNDAMENTAL</b>Operar SIEMPRE a favor del order flow macro. Ninguna entrada es válida contra el sesgo. Sin excepción.</div>
              <div className="opv-label">ORDEN DE EJECUCIÓN</div>
              <div className="opv-step"><span className="opv-n">1</span><div><b>Dirección macro · TF 4H y 30min</b><span>Sesgo del par + diferencial de datos como confluencia.</span></div></div>
              <div className="opv-step"><span className="opv-n">2</span><div><b>Setup favorito · TF 4H y 30min</b><span>Sweep + CHoCH + LQ previa + POI alineado con la dirección.</span></div></div>
              <div className="opv-step"><span className="opv-n">3</span><div><b>Confirmación · TF 15min o 30min</b><span>Camino A: orden limit directo · Camino B: CHoCH confirmado.</span></div></div>
              <div className="opv-label">① DIRECCIÓN MACRO</div>
              <Direccion neutro={false} largo="Únicamente entradas largas durante toda la operación." corto="Únicamente entradas cortas durante toda la operación." />
              <div className="opv-label">DIFERENCIAL DE DATOS · CONFLUENCIA FUNDAMENTAL</div>
              <Zona b="Inicio de semana">Calendario económico: qué divisas tienen datos relevantes y hacia dónde apuntan las previsiones. Define el sesgo semanal.</Zona>
              <Zona b="Tras el dato">Mejor de lo previsto = impulso positivo · peor = impulso negativo. El diferencial entre las dos divisas del par refuerza o debilita la dirección.</Zona>
              <Zona b="Diferencial claro">A favor de la dirección = setup de mayor calidad y probabilidad.</Zona>
              <div className="opv-label">② SETUP FAVORITO · 4 ELEMENTOS</div>
              <Zona b="Toma de liquidez">Barrida de highs / lows previos en 4H o 30min. El precio recoge liquidez antes de moverse.</Zona>
              <Zona b="Cambio de estructura">CHoCH visible en 4H o 30min que confirma el giro a favor de la dirección.</Zona>
              <Zona b="LQ previa">Liquidez pendiente de manipular antes del POI.</Zona>
              <Zona b="POI">Zona clara de OB + FVG.</Zona>
              <div className="opv-label">③ CONFIRMACIÓN · DOS CAMINOS</div>
              <div className="opv-opts">
                <div className="opv-opt"><div className="opv-oh">CAMINO A</div><div className="opv-ob"><b>Orden limit directo</b>
                  <ul><li>Setup favorito claramente identificado en 4H o 30min.</li><li>Limit clavada en la zona de reacción.</li><li>Sin confirmación adicional en timeframes menores.</li></ul>
                  <span className="opv-rr">RR OBJETIVO · 2:1</span></div></div>
                <div className="opv-opt"><div className="opv-oh">CAMINO B</div><div className="opv-ob"><b>Confirmación CHoCH</b>
                  <ul><li>Precio llega a la zona del setup favorito.</li><li>Barrida de high / low en la zona.</li><li>CHoCH confirmado en 15 o 30 minutos — entrada tras el CHoCH, no antes.</li></ul>
                  <span className="opv-rr">RR OBJETIVO · 2:1</span></div></div>
              </div>
              <div className="opv-warn"><b>⚠ REGLAS DE INVALIDACIÓN</b>
                <ul>
                  <li>Sin dirección clara en 4H y 30min → no hay entrada válida.</li>
                  <li>Setup sin confluencia de los 4 elementos (Sweep + CHoCH + LQ + POI) no es setup favorito.</li>
                  <li>Nunca operar contra el sesgo macro. Sin excepción.</li>
                </ul>
              </div>
              <Mentalidad quote="«En swing la paciencia paga más que la rapidez. Esperar el setup correcto vale más que cien entradas mediocres.»" fine="Este modelo es un marco de referencia operativo. Cada trader ajusta dentro de su contexto de cuenta, gestión de riesgo y tolerancia personal." />
              <Footer />
            </Overlay>
          )}
        </>
      )}
    </>
  )
}
