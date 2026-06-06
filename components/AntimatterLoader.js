import { useEffect, useRef } from 'react'

/**
 * components/AntimatterLoader.js — pantalla de carga de la sesion (mini-corte H, s60).
 * Orbe "antimateria" en canvas puro: nucleo blanco-azul que respira, 3 anillos
 * orbitales finos en 3D con cometas-electron, polvo orbital, campo de 340
 * particulas con densidad decreciente desde el nucleo, pulso sonar y estrellas
 * fugaces serenas cada 8-12s. Debajo, rotacion de consejos R.A.M.M.FX:
 * "Vamos pa´encima!" abre siempre, el resto barajado, la sabatina solo si es
 * sabado, tiempo en pantalla proporcional a la longitud (5.2s a 9s).
 * ~30fps con pausa en pestana oculta y cleanup completo (raf + resize + timers).
 * Transcrito 1:1 de la demo v6 aprobada por Ramon en s60.
 */

const FIRST_TIP = 'Vamos pa´encima!'
const TIPS = [
  'El día que aceptes perder pequeño, dejarás de perder grande.',
  'El mercado no te debe nada. Ni siquiera hoy, que lo necesitas.',
  'Operar cansado, dolido o con prisa son tres formas de regalar tu dinero.',
  'El journal duele porque no miente. Por eso es lo que más enseña.',
  'El mercado abre mañana otra vez. Tu cuenta, solo si la proteges hoy.',
  'Sabes exactamente qué hiciste mal. Lo supiste mientras lo hacías.',
  'El precio te llevó al stop. Quedarte a discutir con él fue decisión tuya.',
  'Romper tu regla y ganar es la peor victoria: ahora la romperás siempre.',
  'No es que el setup fallara. Es que no era tu setup y entraste igual.',
  'Esa vela no te quitó el dinero. Te lo quitó la prisa por estar dentro.',
  'Si el lunes ya quieres recuperar el viernes, el problema no es el mercado.',
  'Cada sesión de backtesting que terminas es una que tu yo del futuro no improvisa.',
  'Hoy no tienes que ganarle al mercado. Solo a tu versión de ayer.',
  { saturday: true, text: 'Estar aquí entrenando un sábado ya te separa de la mayoría que solo sueña.' },
  'La disciplina que estás construyendo trade a trade nadie te la podrá quitar.',
  'Las rachas malas terminan. Los traders que se forman durante ellas, no.',
  'No estás lejos. Estás en la parte del camino donde casi todos se rinden. Tú sigue.',
  'Tu proceso ya está dando frutos: hoy ves gráficos que hace meses ni entendías.',
  'Equivocarse aquí, en replay, es exactamente para lo que existe este simulador. Falla sin miedo, aprende sin factura.',
  'Un trader rentable no nació sabiendo. Se crea con determinación y constancia.',
  'R.A.M.M.FX TRADING no te promete pasar el challenge. Te entrena para merecerlo.',
]

function buildTipList() {
  const isSaturday = new Date().getDay() === 6
  const pool = TIPS
    .filter(t => typeof t === 'string' || (t.saturday && isSaturday))
    .map(t => typeof t === 'string' ? t : t.text)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return [FIRST_TIP, ...pool]
}

export default function AntimatterLoader() {
  const canvasRef = useRef(null)
  const tipRef = useRef(null)

  /* rotacion de consejos */
  useEffect(() => {
    const tipEl = tipRef.current
    if (!tipEl) return
    const tipList = buildTipList()
    let tipIdx = 0
    let tShow, tNext
    function cycleTip() {
      const text = tipList[tipIdx % tipList.length]
      tipIdx++
      tipEl.textContent = text
      tipEl.style.opacity = '1'
      tipEl.style.transform = 'translateY(0)'
      const dur = Math.min(9000, Math.max(5200, 2800 + text.length * 65))
      tShow = setTimeout(() => {
        tipEl.style.opacity = '0'
        tipEl.style.transform = 'translateY(5px)'
        tNext = setTimeout(cycleTip, 600)
      }, dur)
    }
    cycleTip()
    return () => { clearTimeout(tShow); clearTimeout(tNext) }
  }, [])

  /* orbe antimateria */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, R = 120, MAXD = 800

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * DPR; canvas.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      CX = W / 2; CY = H * 0.41
      R = Math.max(90, Math.min(150, Math.min(W, H) * 0.17))
      MAXD = Math.hypot(Math.max(CX, W - CX), Math.max(CY, H - CY)) * 1.04
    }
    resize()
    window.addEventListener('resize', resize)

    /* campo de particulas: densidad decreciente desde el nucleo (pow 1.8) */
    const field = []
    for (let i = 0; i < 340; i++) {
      const dist = Math.pow(Math.random(), 1.8)
      field.push({
        ang: Math.random() * Math.PI * 2,
        dist,
        w: (Math.random() * .000022 + .000006) * (Math.random() < .5 ? -1 : 1),
        r: Math.random() * .9 + .35,
        a: (Math.random() * .3 + .1) * (1 - dist * .55),
        tw: Math.random() * Math.PI * 2,
        sp: Math.random() * .7 + .25,
      })
    }

    const RINGS = [
      { r: .58, ax: 1.15, az: 0.30, w: .00035, col: [140, 195, 255], cph: 0, cw: .0019 },
      { r: .80, ax: 0.55, az: -0.85, w: -.00026, col: [30, 144, 255], cph: 2.1, cw: -.0014 },
      { r: 1.02, ax: 1.85, az: 0.95, w: .00017, col: [150, 120, 255], cph: 4.2, cw: .0011 }, /* detalle violeta */
    ]
    const SEGS = 120
    const TAIL = 16

    const dust = []
    for (let i = 0; i < 55; i++) {
      const lat = Math.asin(Math.random() * 2 - 1)
      dust.push({
        lat,
        lon: Math.random() * Math.PI * 2,
        rad: .5 + Math.random() * .58,
        w: (Math.random() * .00016 + .00008) * (Math.random() < .5 ? -1 : 1),
        a: Math.random() * .34 + .14,
      })
    }

    const pulses = []
    let nextPulse = 1200

    /* fugaces: velocidad variable — las lentas viven mas y cruzan serenas */
    const meteors = []
    let nextMeteor = 5000
    function spawnMeteor() {
      for (let tries = 0; tries < 8; tries++) {
        const x0 = W * (Math.random() * .8 + .1)
        const y0 = H * (Math.random() * .45 + .05)
        const dir = Math.random() < .5 ? 1 : -1
        const ang = (Math.random() * 15 + 22) * Math.PI / 180 /* 22-37 grados */
        const sp = Math.random() * .36 + .22 /* 0.22-0.58 px/ms */
        const vx = Math.cos(ang) * sp * dir
        const vy = Math.sin(ang) * sp
        const life = 700 + (0.6 - sp) * 1900 + Math.random() * 250 /* lentas ~1.4s */
        const mx = x0 + vx * life * .5, my = y0 + vy * life * .5
        if (Math.hypot(mx - CX, my - CY) < R * 1.7) continue
        meteors.push({ x0, y0, vx, vy, born: 0, life, len: Math.random() * 55 + 85 })
        return
      }
    }

    function rotXZ(p, ax, az) {
      const y1 = p.y * Math.cos(ax) - p.z * Math.sin(ax)
      const z1 = p.y * Math.sin(ax) + p.z * Math.cos(ax)
      const x2 = p.x * Math.cos(az) - y1 * Math.sin(az)
      const y2 = p.x * Math.sin(az) + y1 * Math.cos(az)
      return { x: x2, y: y2, z: z1 }
    }

    function ringPoint(ring, th, prec, Rr) {
      let p = { x: Math.cos(th), y: Math.sin(th), z: 0 }
      p = rotXZ(p, ring.ax, ring.az)
      const cosP = Math.cos(prec), sinP = Math.sin(prec)
      const xr = p.x * cosP + p.z * sinP
      const zr = -p.x * sinP + p.z * cosP
      return [CX + xr * Rr, CY + p.y * Rr, (zr + 1) / 2]
    }

    let last = 0
    let rafId
    function frame(ts) {
      rafId = requestAnimationFrame(frame)
      if (document.hidden) return
      if (ts - last < 33) return /* ~30fps, es decorativo */
      last = ts
      const t = ts

      ctx.clearRect(0, 0, W, H)

      const vg = ctx.createRadialGradient(CX, CY, 0, CX, CY, R * 2.4)
      vg.addColorStop(0, 'rgba(30,144,255,0.05)')
      vg.addColorStop(.55, 'rgba(30,144,255,0.018)')
      vg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = vg
      ctx.fillRect(CX - R * 2.5, CY - R * 2.5, R * 5, R * 5)

      for (const p of field) {
        p.ang += p.w * 33
        const a = p.a * (0.6 + 0.4 * Math.sin(t * .0008 * p.sp + p.tw))
        const x = CX + Math.cos(p.ang) * p.dist * MAXD
        const y = CY + Math.sin(p.ang) * p.dist * MAXD
        ctx.fillStyle = `rgba(190,215,255,${a})`
        ctx.beginPath()
        ctx.arc(x, y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (t > nextMeteor) { spawnMeteor(); nextMeteor = t + 8000 + Math.random() * 4000 }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        if (!m.born) m.born = t
        const age = t - m.born
        if (age > m.life) { meteors.splice(i, 1); continue }
        const f = age / m.life
        const fade = f < .15 ? f / .15 : (f > .6 ? (1 - f) / .4 : 1)
        const hx = m.x0 + m.vx * age
        const hy = m.y0 + m.vy * age
        const nv = Math.hypot(m.vx, m.vy)
        const tx = hx - (m.vx / nv) * m.len
        const ty = hy - (m.vy / nv) * m.len
        const g = ctx.createLinearGradient(hx, hy, tx, ty)
        g.addColorStop(0, `rgba(235,245,255,${.75 * fade})`)
        g.addColorStop(.3, `rgba(150,200,255,${.35 * fade})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.fillStyle = `rgba(255,255,255,${.85 * fade})`
        ctx.beginPath()
        ctx.arc(hx, hy, 1.3, 0, Math.PI * 2)
        ctx.fill()
      }

      const breath = 1 + 0.07 * Math.sin(t * .0018)

      if (t > nextPulse) { pulses.push({ born: t }); nextPulse = t + 3400 }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const age = t - pulses[i].born
        const LIFE = 2200
        if (age > LIFE) { pulses.splice(i, 1); continue }
        const f = age / LIFE
        const e = 1 - Math.pow(1 - f, 3)
        const pr = R * (.2 + 1.15 * e)
        ctx.strokeStyle = `rgba(120,180,255,${(1 - f) * .26})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(CX, CY, pr, 0, Math.PI * 2)
        ctx.stroke()
      }

      for (const d of dust) {
        d.lon += d.w * 33
        const cl = Math.cos(d.lat)
        const p = { x: cl * Math.cos(d.lon), y: Math.sin(d.lat) * .92, z: cl * Math.sin(d.lon) }
        const depth = (p.z + 1) / 2
        const x = CX + p.x * R * d.rad * breath
        const y = CY + p.y * R * d.rad * breath
        ctx.fillStyle = `rgba(170,210,255,${d.a * (.3 + .7 * depth)})`
        ctx.beginPath()
        ctx.arc(x, y, .5 + .8 * depth, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const ring of RINGS) {
        const prec = t * ring.w
        const Rr = R * ring.r * breath

        let prev = null
        for (let k = 0; k <= SEGS; k += 2) {
          const th = (k / SEGS) * Math.PI * 2
          const pt = ringPoint(ring, th, prec, Rr)
          if (prev) {
            const d = (prev[2] + pt[2]) / 2
            ctx.strokeStyle = `rgba(${ring.col[0]},${ring.col[1]},${ring.col[2]},${.06 + .42 * d})`
            ctx.lineWidth = .6 + .7 * d
            ctx.beginPath()
            ctx.moveTo(prev[0], prev[1])
            ctx.lineTo(pt[0], pt[1])
            ctx.stroke()
          }
          prev = pt
        }

        const head = ring.cph + t * ring.cw
        for (let k = TAIL; k >= 0; k--) {
          const th = head - k * .075 * Math.sign(ring.cw)
          const pt = ringPoint(ring, th, prec, Rr)
          const f = 1 - k / (TAIL + 1)
          const d = pt[2]
          if (k === 0) {
            const g = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 7)
            g.addColorStop(0, `rgba(255,255,255,${.55 + .4 * d})`)
            g.addColorStop(.4, `rgba(${ring.col[0]},${ring.col[1]},${ring.col[2]},${.4 * d + .2})`)
            g.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(pt[0], pt[1], 7, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillStyle = `rgba(${ring.col[0]},${ring.col[1]},${ring.col[2]},${f * f * (.15 + .5 * d)})`
            ctx.beginPath()
            ctx.arc(pt[0], pt[1], .6 + 1.5 * f * (.4 + .6 * d), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      const flick = 1 + 0.06 * Math.sin(t * .0047) * Math.sin(t * .0011 + 1.3)
      const coreR = R * .15 * breath * flick
      const bloom = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 3.4)
      bloom.addColorStop(0, `rgba(30,144,255,${0.13 * flick})`)
      bloom.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bloom
      ctx.fillRect(CX - coreR * 3.5, CY - coreR * 3.5, coreR * 7, coreR * 7)

      const core = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR)
      core.addColorStop(0, 'rgba(255,255,255,0.96)')
      core.addColorStop(.45, 'rgba(207,232,255,0.58)')
      core.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(CX, CY, coreR, 0, Math.PI * 2)
      ctx.fill()
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div style={st.wrap}>
      <canvas ref={canvasRef} style={st.canvas}/>
      <div style={st.tipWrap}>
        <div style={st.tipLabel}>R.A.M.M.FX TRADING</div>
        <div ref={tipRef} style={st.tipText}></div>
        <div style={st.barTrack}><div style={st.barSweep}/></div>
        <div style={st.loadingTag}>CARGANDO SESIÓN</div>
      </div>
      <style>{`@keyframes almSweep{to{left:100%}}`}</style>
    </div>
  )
}

const st = {
  wrap: { position: 'fixed', inset: 0, background: '#000', zIndex: 1000, overflow: 'hidden', fontFamily: 'Montserrat,sans-serif' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  tipWrap: {
    position: 'absolute', left: '50%', top: '67%', transform: 'translateX(-50%)',
    width: 'min(640px, 86vw)', textAlign: 'center', pointerEvents: 'none',
  },
  tipLabel: {
    fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(30,144,255,.75)',
    marginBottom: 16,
  },
  tipText: {
    minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 'clamp(15px, 2vw, 19px)', fontWeight: 500, lineHeight: 1.7,
    letterSpacing: .2, color: 'rgba(235,243,255,.88)',
    opacity: 0, transform: 'translateY(5px)',
    transition: 'opacity .6s ease, transform .6s ease',
  },
  barTrack: {
    width: 180, height: 1.5, margin: '24px auto 0', borderRadius: 2,
    background: 'rgba(30,144,255,.12)', overflow: 'hidden', position: 'relative',
  },
  barSweep: {
    position: 'absolute', top: 0, left: '-40%', width: '40%', height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(30,144,255,.9), transparent)',
    animation: 'almSweep 1.8s ease-in-out infinite',
  },
  loadingTag: {
    marginTop: 16, fontSize: 8, fontWeight: 600, letterSpacing: 3.5,
    color: 'rgba(160,184,208,.35)',
  },
}
