// LA PAGINA REAL DEL SIMULADOR EN CHROME (pesado: SIEMPRE bajo revisiones-suite/con-turno).
// `next dev` del worktree con un entorno INVENTADO (env -i: ni .env*, ni claves; NEXT_PUBLIC_SUPABASE_URL apunta a
// http://supabase.prueba, que no existe) y Chrome por CDP. TODAS las peticiones de la pagina se interceptan (Fetch):
//   · localhost (la app)            → siguen, salvo /api/*
//   · /api/candles                   → la semana real de pruebas/fixtures/velas (EUR/USD 2-6 mar 2026)
//   · supabase.prueba (REST, auth)   → un doble en memoria (sesion de practica inventada, sin trades)
//   · cualquier otra cosa (fuentes…) → bloqueada y anotada en `fuera`
// Nada sale de la maquina y nada toca Supabase. El servidor de Next no recibe ninguna llamada a /api.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { abre, REPO } from './cdp.mjs'

export const USUARIO = 'aaaaaaaa-1111-4111-8111-111111111111'
export const SESION = '5e5e5e5e-0000-4000-8000-000000000001'
const SUPA = 'http://supabase.prueba'
const UNICAS = { session_drawings: [[['session_id', 'pair'], 'session_drawings_session_id_pair_key']] }

export async function arrancaNext() {
  const puerto = 3400 + Math.floor(Math.random() * 400)
  fs.mkdirSync(path.join(REPO, '.pruebas'), { recursive: true })
  const log = fs.openSync(path.join(REPO, '.pruebas', 'next-navegador.log'), 'a')
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Europe/Madrid', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: SUPA, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-inventada' }
  for (const f of fs.readdirSync(REPO)) if (/^\.env/.test(f)) throw new Error(`hay ${f} en el worktree: no se arranca (podria apuntar a la base real)`)
  const p = spawn(path.join(REPO, 'node_modules/.bin/next'), ['dev', '-p', String(puerto), '-H', 'localhost'], { cwd: REPO, env, detached: true, stdio: ['ignore', log, log] })
  const mata = () => { try { process.kill(-p.pid, 'SIGKILL') } catch {} }
  process.on('exit', mata)
  const url = `http://localhost:${puerto}`
  for (let i = 0; i < 600; i++) { try { const r = await fetch(url + '/favicon.ico'); if (r.status) break } catch {} ; await espera(200) }
  return { url, mata }
}

function velasSemana() {
  const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json'), 'utf8'))
  return fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
}

// el doble de Supabase (lo minimo que pide la pagina de sesion)
export function dobleSupabase({ sesion = {} } = {}) {
  const ahora = '2026-10-01T00:00:00Z'
  const tablas = {
    profiles: [{ id: USUARIO, email: 'a@ejemplo.test', nombre: 'Alumno A', rol_global: 'user', journal_activo: false, simulador_activo: true, plan: 'basic' }],
    sim_sessions: [{ id: SESION, user_id: USUARIO, name: 'Practica', pair: 'EUR/USD', timeframe: 'H1', date_from: '2026-03-02', date_to: '2026-03-06',
      capital: 10000, balance: 10000, status: 'active', created_at: ahora, last_timestamp: 1772625600, challenge_type: null, challenge_phase: null,
      challenge_parent_id: null, motor_version: null, epoca: null, version: null, terminal: null, legado: false, legado_snapshot: null, mercado: null,
      creada_por_rpc: false, rev_saldo: 0, ...sesion }],
    sim_servicio: [{ id: true, mantenimiento: false, version_minima: 1 }],
    sim_trades: [], session_drawings: [], session_chart_config: [], user_chart_config: [], user_tool_config: [], sim_drawing_templates: [],
  }
  const log = []
  const filtra = (filas, q) => filas.filter(f => [...q.entries()].every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) return true
    const m = /^eq\.(.*)$/.exec(v); if (!m) return true
    return String(f[k]) === m[1]
  }))
  const responde = (req) => {
    const u = new URL(req.url), metodo = req.method, cab = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]))
    log.push(`${metodo} ${u.pathname}${u.search}`)
    if (metodo === 'OPTIONS') return { estado: 204, cuerpo: '' }
    if (u.pathname.startsWith('/auth/v1/user')) return { estado: 200, cuerpo: { id: USUARIO, email: 'a@ejemplo.test', aud: 'authenticated', role: 'authenticated' } }
    if (u.pathname.startsWith('/auth/v1/')) return { estado: 200, cuerpo: {} }
    const rpc = /^\/rest\/v1\/rpc\/(\w+)/.exec(u.pathname)
    if (rpc) {
      const a = req.postData ? JSON.parse(req.postData) : {}
      if (rpc[1] === 'sim_cierre_v0') { tablas.sim_trades.push({ ...a.p_trade, session_id: a.p_session_id }); return { estado: 200, cuerpo: a.p_trade?.id ?? null } }
      return { estado: 200, cuerpo: [] }
    }
    const t = /^\/rest\/v1\/(\w+)/.exec(u.pathname)?.[1]
    if (!t) return { estado: 404, cuerpo: { message: 'no' } }
    const filas = (tablas[t] ??= [])
    const objeto = /vnd\.pgrst\.object/.test(cab.accept || '')
    if (metodo === 'GET' || metodo === 'HEAD') {
      // como PostgREST: un filtro uuid con algo que no lo es (p. ej. session_id=eq.dashboard) es 400 (22P02)
      for (const [k, v] of u.searchParams) if (/^(session_id|user_id)$/.test(k) && /^eq\./.test(v) && !/^eq\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) { log.push(`400 ${t} ${k}=${v}`); return { estado: 400, cuerpo: { code: '22P02', message: `invalid input syntax for type uuid: "${v.slice(3)}"` } } }
      const r = filtra(filas, u.searchParams)
      if (objeto) return r.length === 1 ? { estado: 200, cuerpo: r[0] } : { estado: 406, cuerpo: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`, details: `The result contains ${r.length} rows` } }
      return { estado: 200, cuerpo: r }
    }
    const cuerpo = req.postData ? JSON.parse(req.postData) : null
    // como la base: la clave unica (session_id, pair) de session_drawings (session_drawings_session_id_pair_key) da 409
    if (metodo === 'POST') { const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(x => ({ id: crypto.randomUUID(), ...x }))
      for (const [cols, nombre] of UNICAS[t] ?? []) for (const nf of nuevas) if (filas.some(f => cols.every(c => f[c] === nf[c]))) { log.push(`409 ${t}`); return { estado: 409, cuerpo: { code: '23505', message: `duplicate key value violates unique constraint "${nombre}"` } } }
      filas.push(...nuevas); return { estado: 201, cuerpo: objeto ? nuevas[0] : nuevas } }
    // con Prefer: return=representation (el .select() de supabase-js) devuelve las filas, como PostgREST
    if (metodo === 'PATCH') { const r = filtra(filas, u.searchParams); for (const f of r) Object.assign(f, cuerpo); const rep = /return=representation/.test(cab.prefer || '')
      return { estado: objeto || rep ? 200 : 204, cuerpo: objeto ? r[0] : rep ? r : '' } }
    if (metodo === 'DELETE') { const r = new Set(filtra(filas, u.searchParams)); tablas[t] = filas.filter(f => !r.has(f)); return { estado: 204, cuerpo: '' } }
    return { estado: 405, cuerpo: {} }
  }
  return { tablas, log, responde }
}

// abre la pagina de la sesion con todo interceptado; devuelve el navegador (cdp.mjs) y lo de fuera
// latApi: lo que tarda en responder cada /api/* que no es de velas (por defecto, nada; como la red: hd01, el Go to de un reto)
export async function abreSesion(app, { doble = dobleSupabase(), tope = 240000, velas = velasSemana(), latApi = 0 } = {}) {
  const fuera = []
  const sesionAuth = { access_token: 'tok-a', refresh_token: 'ref-a', token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000,
    user: { id: USUARIO, email: 'a@ejemplo.test', aud: 'authenticated', role: 'authenticated' } }
  const b = await abre(`${app.url}/session/${SESION}`, { tope, esperaListo: Number(process.env.ESPERA ?? 180000),
    listo: `!!(window.__chartMap?.current?.['EUR/USD']?.plugin && window.__chartMap.current['EUR/USD'].series)`,
    antes: async (cdp, on) => {
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      await cdp('Network.enable')
      await cdp('Network.setCookie', { name: 'sb-supabase-auth-token', value: encodeURIComponent(JSON.stringify(sesionAuth)), domain: 'localhost', path: '/' })
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
      const cors = [{ name: 'access-control-allow-origin', value: app.url }, { name: 'access-control-allow-credentials', value: 'true' },
        { name: 'access-control-allow-headers', value: '*' }, { name: 'access-control-allow-methods', value: 'GET,POST,PATCH,DELETE,OPTIONS,HEAD' },
        { name: 'access-control-expose-headers', value: 'content-range' }]
      const llena = (id, estado, cuerpo, extra = []) => cdp('Fetch.fulfillRequest', { requestId: id, responseCode: estado,
        responseHeaders: [{ name: 'content-type', value: 'application/json' }, ...cors, ...extra],
        body: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)).toString('base64') })
      on('Fetch.requestPaused', async ({ requestId, request }) => {
        const u = new URL(request.url)
        if (u.origin === app.url && u.pathname.startsWith('/api/')) {
          if (u.pathname === '/api/candles') {
            await espera(Number(process.env.LAT_VELAS ?? 1500))   // como la red: con respuesta instantanea la pagina pinta antes de tener el grafico
            const y = Number(u.searchParams.get('year')), from = Number(u.searchParams.get('from')), to = Number(u.searchParams.get('to'))
            return llena(requestId, 200, { candles: velas.filter(v => v.time >= from && v.time <= to && new Date(v.time * 1000).getUTCFullYear() === y) })
          }
          if (latApi) await espera(latApi)
          return llena(requestId, 200, {})
        }
        if (u.origin === app.url) return cdp('Fetch.continueRequest', { requestId })
        if (u.origin === SUPA) { const r = doble.responde(request); return llena(requestId, r.estado, r.cuerpo, [{ name: 'content-range', value: '0-0/*' }]) }
        fuera.push(request.url); return cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
      })
    } })
  return { b, fuera, doble }
}
