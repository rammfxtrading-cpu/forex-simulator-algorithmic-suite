// Supabase FALSO en memoria para el simulador (sustituye a @supabase/supabase-js
// en lo que importa el repo; ver cargador.mjs). Copiado del arnes del journal.
// ⚠️ LIMITES (H07): ver pruebas/LEEME.md. Ademas de lo de abajo: upsert
//    equivale a insert (clave repetida → 23505) y `order` compara como texto.
// ⛔ Es un MODELO del cliente, no de la base: NO hay RLS, ni grants, ni CHECK,
//    ni triggers, ni cascadas. Lo real de la base se pide con
//    sql/consultas/s04-esquema-simulador.sql.
//    Estado unico en globalThis.__db, lo use el servidor o el navegador.
//
//   db.tablas[t]      filas de cada tabla
//   db.tokens[jwt]    usuario que devuelve auth.getUser(jwt) (servidor)
//   db.sesion         la sesion que ve auth.getSession() (navegador)
//   db.storage[b][r]  contenido (texto) del objeto r del bucket b; un bucket que
//                     no esta, no existe
//   db.maxFilas       tope de filas por respuesta (el max-rows de PostgREST); null = sin tope
//   db.falla(ctx)     → un error {message,code} para esa operacion, o nada
//   db.pausa(ctx)     → una promesa que retiene esa operacion (carreras)
//   db.pierde(ctx)    → true: la operacion SE EJECUTA pero la respuesta no llega
//   db.trasAplicar(ctx) → (storage upload) una promesa que retiene la RESPUESTA
//                     de una subida YA APLICADA (bloque G, punto 9; opcional)
//   db.clientes       → las opciones con que se creo cada cliente (createClient)
//   db.metadatos[b][r] → los metadatos de usuario de la ultima subida de r
//                     (upload con options.metadata; info los devuelve en
//                     `metadata`, como el tipo FileObjectV2 de storage-js 2.102)
//   db.infoSinMetadatos → true: info no devuelve `metadata` (bloque G, punto 11)
//   db.infoSinTamano  → true: info devuelve size null (Astra MD-01)
//   db.infoSinEtag    → true: info no devuelve etag (Astra MDC2-02; la version sigue)
//   db.getSinEtag     → true: la descarga no lleva etag. Si no, una descarga atada
//                       (lib/mercado/limites.mjs, con señal) recibe la etag del
//                       contenido servido, como el GET real (apuntaRespuesta)
//                       (se devuelve un error de transporte, como supabase-js ante
//                       un fetch roto a la vuelta)
//   db.rpcExterno(nombre, args) → { data, error }: quien contesta las RPC (la base real del ensayo); null = las de RPCS
//   db.log            cada operacion: { cliente, tabla, op, payload, filtros }
import { randomUUID, createHash } from 'node:crypto'
const quien = new URL(import.meta.url).search.slice(1) || 'prueba'
export const db = globalThis.__db ??= {}
export function reset() {
  Object.assign(db, { tablas: {}, tokens: {}, sesion: null, storage: {}, maxFilas: null, falla: null, pausa: null, entrega: null, pierde: null, cascadas: null, trasAplicar: null, clientes: [], metadatos: {}, infoSinMetadatos: false, infoSinTamano: false, infoSinEtag: false, getSinEtag: false, cuerpoFalla: null, rpcExterno: null, log: [], auth: [], oyentesAuth: [] })
}
if (!db.tablas) reset()
const tick = () => new Promise(r => setImmediate(r))
const copia = x => x === undefined ? undefined : structuredClone(x)
// eq como en Postgres para un numeric: el texto '10234.50' y el numero 10234.5 son iguales
// (sin pasar por float: se comparan los decimales); lo demas, identico
const decimal = x => { const m = String(x).trim().match(/^([+-]?)(\d+)(?:\.(\d*))?$/); if (!m) return null
  const ent = m[2].replace(/^0+(?=\d)/, ''), dec = (m[3] ?? '').replace(/0+$/, ''); return (m[1] === '-' && (ent !== '0' || dec) ? '-' : '') + ent + (dec ? '.' + dec : '') }
const igual = (a, b) => {
  if (a === b) return true
  if ((typeof a === 'number' && typeof b === 'string') || (typeof a === 'string' && typeof b === 'number')) {
    const x = decimal(a), y = decimal(b); return x != null && x === y
  }
  return false
}
// el disparador sim_sessions_rev_saldo de sql/sim-004a-preparatoria.sql (ronda 3, E1R2-01; el SQL
// lo prueba pruebas/sim-004a.mjs, seccion 11): INSERT → 0; UPDATE → +1 si balance cambia, si no el
// de antes. Lo que mande el cliente en rev_saldo no cuenta. Una fila sin contador vale 0.
function contadorSaldo(fila, antes) {
  if (!antes) { fila.rev_saldo = 0; return }
  const previo = antes.rev_saldo ?? 0
  fila.rev_saldo = igual(antes.balance, fila.balance) ? previo : previo + 1
}
// y el disparador sim_trades_rev_saldo (ronda 3 bis): toda escritura de sim_trades sube 1 el contador de su
// sesion (en un UPDATE que cambia session_id, el de las dos). El SQL: pruebas/sim-004a.mjs, seccion 12
function contadorTrades(...ids) {
  for (const sid of new Set(ids.filter(x => x != null))) {
    const ses = (db.tablas.sim_sessions || []).find(x => x.id === sid)
    if (ses) ses.rev_saldo = (ses.rev_saldo ?? 0) + 1
  }
}
// columnas de select: '*', 'col', y 'alias:col::text' (el cast de PostgREST; un numero sale como su texto)
const proyecta = (f, cols) => {
  if (!cols || cols.trim() === '*') return f
  const out = {}
  for (const c of cols.split(',').map(c => c.trim()).filter(Boolean)) {
    if (c === '*') { Object.assign(out, f); continue }
    const m = c.match(/^(?:(\w+):)?(\w+)(?:::(\w+))?$/)
    if (!m) { out[c] = f[c]; continue }
    const [, alias, col, tipo] = m
    out[alias ?? col] = tipo === 'text' && f[col] != null ? String(f[col]) : f[col]
  }
  return out
}

const cmpTexto = (a, b) => String(a).localeCompare(String(b))
// trozos separados por comas al primer nivel (respeta parentesis y comillas)
function trozos(s) {
  const out = []; let nivel = 0, comillas = false, cur = ''
  for (const ch of s) {
    if (ch === '"') comillas = !comillas
    if (!comillas && ch === '(') nivel++
    if (!comillas && ch === ')') nivel--
    if (!comillas && nivel === 0 && ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}
const OPS = { eq: x => x === 0, gt: x => x > 0, gte: x => x >= 0, lt: x => x < 0, lte: x => x <= 0 }
function arbolLogico(tipo, expr) {
  const hijos = trozos(expr).map(t => {
    const m = /^(and|or)\((.*)\)$/s.exec(t)
    if (m) return arbolLogico(m[1], m[2])
    const i = t.indexOf('.'), j = t.indexOf('.', i + 1)
    const col = t.slice(0, i), op = t.slice(i + 1, j)
    let val = t.slice(j + 1)
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    // col.is.null (PostgREST): NULL casa; cualquier otro valor de is, no soportado
    if (op === 'is') { if (val !== 'null') throw new Error(`supabase-falso: is.${val} no soportado en or()`); return f => f[col] == null }
    if (op === 'eq') return f => f[col] != null && igual(f[col], val)
    if (!OPS[op]) throw new Error(`supabase-falso: operador no soportado en or(): ${op}`)
    return f => f[col] != null && OPS[op](cmpTexto(f[col], val))
  })
  return tipo === 'and' ? f => hijos.every(h => h(f)) : f => hijos.some(h => h(f))
}

class Q {
  constructor(t) { Object.assign(this, { tabla: t, op: 'select', filtros: [], desc: [], devolver: false, modo: null, orden: [], lim: null, cols: '*', contar: false, cabeza: false }) }
  select(cols = '*', o = {}) { if (this.op !== 'select') this.devolver = true; else this.cols = cols; if (o.count) this.contar = true; if (o.head) this.cabeza = true; return this }
  insert(p) { this.op = 'insert'; this.payload = p; return this }
  update(p) { this.op = 'update'; this.payload = p; return this }
  upsert(p) { this.op = 'upsert'; this.payload = p; return this }
  delete(o = {}) { this.op = 'delete'; if (o.count) this.contar = true; return this }
  eq(c, v) { this.desc.push(`${c}=eq.${v}`); this.filtros.push(f => igual(f[c], v)); return this }
  neq(c, v) { this.desc.push(`${c}=neq.${v}`); this.filtros.push(f => f[c] !== v); return this }
  in(c, a) { this.desc.push(`${c}=in.(${a})`); this.filtros.push(f => a.includes(f[c])); return this }
  // comparaciones como el orden de este doble (texto): ISO-8601 y uuid ordenan igual
  // que en Postgres si todos tienen el mismo formato. NULL no casa con nada.
  gt(c, v) { this.desc.push(`${c}=gt.${v}`); this.filtros.push(f => f[c] != null && cmpTexto(f[c], v) > 0); return this }
  gte(c, v) { this.desc.push(`${c}=gte.${v}`); this.filtros.push(f => f[c] != null && cmpTexto(f[c], v) >= 0); return this }
  lt(c, v) { this.desc.push(`${c}=lt.${v}`); this.filtros.push(f => f[c] != null && cmpTexto(f[c], v) < 0); return this }
  lte(c, v) { this.desc.push(`${c}=lte.${v}`); this.filtros.push(f => f[c] != null && cmpTexto(f[c], v) <= 0); return this }
  // or('col.op.valor,and(col.op.valor,...)') con la sintaxis de PostgREST: valores
  // entre comillas dobles si llevan , . : ( ); ops eq gt gte lt lte; and()/or() anidados
  or(expr) { this.desc.push(`or=(${expr})`); const g = arbolLogico('or', expr); this.filtros.push(f => g(f)); return this }
  // como PostgREST/Postgres: ASC deja los NULL al final y DESC al principio,
  // salvo nullsFirst explicito
  order(c, o = {}) { const asc = o.ascending !== false; this.orden.push([c, asc, o.nullsFirst ?? !asc]); return this }
  limit(n) { this.lim = n; return this }
  range(desde, hasta) { this.rango = [desde, hasta]; return this }
  single() { this.modo = 'single'; return this }
  maybeSingle() { this.modo = 'maybe'; return this }
  then(ok, ko) { return this.ejecuta().then(async r => {
    if (db.pierde && await db.pierde(this.ctx)) return { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: null, hint: null }, count: null }
    return r
  }).then(ok, ko) }
  async ejecuta() {
    await tick()
    const ctx = { cliente: quien, tabla: this.tabla, op: this.op, payload: copia(this.payload ?? null), filtros: [...this.desc],
      orden: this.orden.map(([c, asc, nf]) => `${c}.${asc ? 'asc' : 'desc'}.${nf ? 'nullsfirst' : 'nullslast'}`) }
    db.log.push(ctx)
    this.ctx = ctx
    if (db.pausa) await db.pausa(ctx)
    const err = db.falla && await db.falla(ctx)
    if (err) return { data: null, error: err, count: null }
    const filas = (db.tablas[this.tabla] ??= [])
    let res
    if (this.op === 'insert' || this.op === 'upsert') {
      res = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(p => ({ id: randomUUID(), created_at: new Date().toISOString(), ...copia(p) }))
      // la clave primaria, como en Postgres: un id que ya esta no entra
      if (res.some(n => filas.some(f => f.id === n.id))) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${this.tabla}_pkey"` }, count: null }
      if (this.tabla === 'sim_sessions') for (const n of res) contadorSaldo(n, null)
      filas.push(...res)
      if (this.tabla === 'sim_trades') for (const n of res) contadorTrades(n.session_id)
      res = res.map(copia)
    } else {
      let sel = filas.filter(f => this.filtros.every(g => g(f)))
      if (this.op === 'update') for (const f of sel) {
        const antes = this.tabla === 'sim_sessions' ? { balance: f.balance, rev_saldo: f.rev_saldo } : null
        const sesionAntes = f.session_id
        Object.assign(f, copia(this.payload))
        if (antes) contadorSaldo(f, antes)
        if (this.tabla === 'sim_trades') contadorTrades(sesionAntes, f.session_id)
      }
      else if (this.op === 'delete') {
        db.tablas[this.tabla] = filas.filter(f => !sel.includes(f))
        if (this.tabla === 'sim_trades') for (const f of sel) contadorTrades(f.session_id)
        // db.cascadas (OPCIONAL, lo declara la prueba): { padre: [[hija, columna], ...] }
        // emula ON DELETE CASCADE de FKs que constan en produccion. Sin declararlas,
        // el doble NO tiene cascadas (pruebas/LEEME.md, H07).
        for (const [hija, col] of db.cascadas?.[this.tabla] ?? []) {
          const ids = new Set(sel.map(f => f.id))
          db.tablas[hija] = (db.tablas[hija] || []).filter(h => !ids.has(h[col]))
        }
      }
      // orden estable por las columnas pedidas y nada mas: los empates quedan en
      // el orden de insercion (Postgres no promete ni eso).
      for (const [c, asc, nf] of [...this.orden].reverse()) sel = [...sel].sort((a, b) => {
        const na = a[c] == null, nb = b[c] == null
        if (na || nb) return na === nb ? 0 : (na ? (nf ? -1 : 1) : (nf ? 1 : -1))
        return (asc ? 1 : -1) * String(a[c]).localeCompare(String(b[c]))
      })
      // count=exact de PostgREST: el total que casa con los filtros, no lo devuelto
      this.total = sel.length
      if (this.rango) sel = sel.slice(this.rango[0], this.rango[1] + 1)
      if (this.lim != null) sel = sel.slice(0, this.lim)
      if (this.op === 'select' && db.maxFilas != null) sel = sel.slice(0, db.maxFilas)
      res = sel.map(f => copia(this.op === 'select' ? proyecta(f, this.cols) : f))
    }
    const count = this.contar ? (this.total ?? res.length) : null
    if (this.cabeza) return { data: null, error: null, count }
    if (this.op !== 'select' && !this.devolver && !this.modo) return { data: null, error: null, count }
    if (this.modo === 'single') return res.length === 1 ? { data: res[0], error: null } : { data: null, error: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned (${res.length})` } }
    if (this.modo === 'maybe') return res.length <= 1 ? { data: res[0] ?? null, error: null } : { data: null, error: { code: 'PGRST116', message: 'varias' } }
    return { data: res, error: null, count }
  }
}

// Storage, con el contrato del SDK instalado (storage-js): download devuelve un
// Blob; upload acepta Blob o texto y, sin upsert, no pisa; un objeto o bucket
// que no esta da error. Los errores se DEVUELVEN ({ data, error }), no se lanzan.
function bucket(nombre) {
  const objetos = () => db.storage[nombre]
  const op = async (tipo, payload, marca = null) => {
    await tick()
    const ctx = { cliente: quien, tabla: 'storage:' + nombre, op: tipo, payload, filtros: [] }
    if (marca) marca.ctx = ctx
    db.log.push(ctx)
    if (db.pausa) await db.pausa(ctx)
    return (db.falla && await db.falla(ctx)) || null
  }
  const noExiste = { data: null, error: { message: 'Bucket not found', statusCode: '404' } }
  const NO_ENCONTRADO = { name: 'StorageApiError', message: 'Object not found', status: 400, statusCode: '404' }
  return {
    // en el log, encontrado: false si la descarga dio 404 (lo que no existe no
    // se descarga: las pruebas de transferencia cuentan solo las reales)
    async download(ruta, opciones, parametros) {
      const m = {}
      const err = await op('download', ruta, m); if (err) return { data: null, error: err }
      if (!objetos()) { m.ctx.encontrado = false; return noExiste }
      // como storage-js 2.102: la API responde 400 con cuerpo { statusCode: '404',
      // error: 'not_found', message: 'Object not found' } → StorageApiError
      if (!Object.hasOwn(objetos(), ruta)) { m.ctx.encontrado = false; return { data: null, error: NO_ENCONTRADO } }
      // db.cuerpoFalla: la respuesta llega pero materializar el cuerpo lanza ese error (E2-04)
      if (db.cuerpoFalla) { const e = db.cuerpoFalla; return { data: { arrayBuffer: async () => { throw e } }, error: null } }
      const blob = new Blob([objetos()[ruta]], { type: 'application/octet-stream' })
      // la descarga atada ve el estado, la etag y los bytes como el envoltorio real (MDC2-02)
      if (parametros?.signal) {
        const L = await import('../lib/mercado/limites.mjs').catch(() => null)
        const c = objetos()[ruta]
        L?.apuntaRespuesta?.(parametros.signal, { status: 200, etag: db.getSinEtag ? null : `"${createHash('sha256').update(c).digest('hex').slice(0, 32)}"`, bytes: Buffer.byteLength(c) })
      }
      // db.entrega(ctx): retiene la ENTREGA de un contenido ya leido (la lectura
      // vio la version de ese instante; la respuesta llega despues)
      if (db.entrega) await db.entrega({ cliente: quien, tabla: 'storage:' + nombre, op: 'download', payload: ruta })
      return { data: blob, error: null }
    },
    // como storage-js 2.102 info(): metadatos SIN descargar el contenido. El etag
    // sale del contenido (cambia si el fichero cambia, como el real).
    async info(ruta) {
      const err = await op('info', ruta); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      if (!Object.hasOwn(objetos(), ruta)) return { data: null, error: NO_ENCONTRADO }
      const c = objetos()[ruta]
      const etag = createHash('sha256').update(c).digest('hex').slice(0, 32)
      const metadata = db.infoSinMetadatos ? undefined : (db.metadatos[nombre]?.[ruta] ?? null)
      return { data: { name: ruta, ...(db.infoSinEtag ? {} : { etag }), version: etag, size: db.infoSinTamano ? null : Buffer.byteLength(c), lastModified: null, contentType: null, ...(metadata === undefined ? {} : { metadata }) }, error: null }
    },
    // texto o binario (Blob, Buffer, Uint8Array), como el real
    async upload(ruta, cuerpo, o = {}) {
      const contenido = typeof cuerpo === 'string' ? cuerpo
        : (cuerpo instanceof Uint8Array) ? Buffer.from(cuerpo)
        : Buffer.from(await cuerpo.arrayBuffer())
      const err = await op('upload', { ruta, bytes: Buffer.byteLength(contenido), upsert: !!o.upsert, contentType: o.contentType ?? null }); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      if (Object.hasOwn(objetos(), ruta) && !o.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } }
      objetos()[ruta] = contenido
      ;(db.metadatos[nombre] ??= {})[ruta] = o.metadata ?? null
      if (db.trasAplicar) await db.trasAplicar({ cliente: quien, tabla: 'storage:' + nombre, op: 'upload', payload: ruta })
      return { data: { path: ruta }, error: null }
    },
    // como POST /object/list de Storage (storage-js 2.102 devuelve el JSON tal cual):
    // UN nivel bajo el prefijo ('' = la raiz), por nombre; una carpeta es
    // { name, id: null, metadata: null } y un objeto { name, id, metadata: { size, eTag } }.
    // (Antes devolvia rutas enteras sin carpetas ni tamaños: una suma de bytes aprobaba en vacio.)
    async list(prefijo = '', o = {}) {
      const err = await op('list', { prefijo, ...o }); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      const lim = o.limit ?? 100, off = o.offset ?? 0
      const base = prefijo ? prefijo.replace(/\/$/, '') + '/' : ''
      const nivel = new Map()
      for (const ruta of Object.keys(objetos()).filter(n => n.startsWith(base))) {
        const resto = ruta.slice(base.length), i = resto.indexOf('/')
        if (i >= 0) { nivel.set(resto.slice(0, i), { name: resto.slice(0, i), id: null, metadata: null }); continue }
        const c = objetos()[ruta]
        nivel.set(resto, { name: resto, id: createHash('sha256').update(ruta).digest('hex').slice(0, 36), metadata: { size: Buffer.byteLength(c), eTag: `"${createHash('sha256').update(c).digest('hex').slice(0, 32)}"` } })
      }
      const filas = [...nivel.values()].sort((a, b) => a.name.localeCompare(b.name))
      return { data: filas.slice(off, off + lim), error: null }
    },
    async remove(rutas) {
      const err = await op('remove', rutas); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      const fuera = rutas.filter(r => Object.hasOwn(objetos(), r))
      for (const r of fuera) { delete objetos()[r]; if (db.metadatos[nombre]) delete db.metadatos[nombre][r] }
      return { data: fuera.map(name => ({ name })), error: null }
    },
  }
}

const auth = {
  async getUser(token) {
    await tick(); db.auth.push({ cliente: quien, op: 'getUser' })
    const u = db.tokens[token]
    return u ? { data: { user: copia(u) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
  },
  async getSession() {
    await tick(); db.auth.push({ cliente: quien, op: 'getSession' })
    const err = db.falla && await db.falla({ cliente: quien, tabla: 'auth', op: 'getSession', filtros: [] })
    if (err) return { data: { session: null }, error: err }
    return { data: { session: copia(db.sesion) }, error: null }
  },
  // Como auth-js 2.43 (_signOut): si el servidor falla (no 401/403/404), devuelve
  // el error y la sesion SE QUEDA; si va bien, la borra y avisa SIGNED_OUT.
  async signOut() {
    await tick(); db.auth.push({ cliente: quien, op: 'signOut' })
    const err = db.falla && await db.falla({ cliente: quien, tabla: 'auth', op: 'signOut', filtros: [] })
    if (err) return { error: err }
    db.sesion = null
    for (const cb of [...db.oyentesAuth]) cb('SIGNED_OUT', null)
    return { error: null }
  },
  async updateUser(p) { await tick(); db.auth.push({ cliente: quien, op: 'updateUser', campos: Object.keys(p) }); return db.sesion ? { data: { user: db.sesion.user }, error: null } : { data: { user: null }, error: { message: 'Auth session missing!' } } },
  // Como supabase-js: al suscribirse llega INITIAL_SESSION; despues, cada cambio.
  onAuthStateChange(cb) {
    db.auth.push({ cliente: quien, op: 'onAuthStateChange' })
    db.oyentesAuth.push(cb)
    const sesion = copia(db.sesion)
    queueMicrotask(() => { if (db.oyentesAuth.includes(cb)) cb('INITIAL_SESSION', sesion) })
    return { data: { subscription: { unsubscribe() { db.oyentesAuth = db.oyentesAuth.filter(f => f !== cb) } } } }
  },
}

// Cambia la sesion y avisa a quien escuche, como hace supabase-js en ESTA
// pestaña. (Un cambio hecho en otra pestaña o en el hub NO avisa: solo cambia
// la cookie; para eso, cambiar db.sesion a mano.)
export function emiteAuth(evento, sesion) {
  db.sesion = sesion
  for (const cb of [...db.oyentesAuth]) cb(evento, copia(sesion))
}

// RPC de sql/sim-002 (bloque E, punto 3): UNA sentencia → una copia de la
// tabla en ESE instante, como la instantanea de PostgreSQL. ⚠️ Sin RLS (H07):
// SECURITY INVOKER y la RLS se prueban en PostgreSQL (pruebas/sim-002.mjs).
// sim_cierre_v0 (sql/sim-004a-preparatoria.sql, etapa 1): el trade y el saldo
// JUNTOS (atomico: si la sesion no esta, no queda nada) y devuelve el id del
// trade. ⚠️ Sin RLS, sin la lista cerrada de claves ni la puerta: eso se prueba
// en PostgreSQL (pruebas/sim-004a.mjs). Lo que modela es el contrato del cliente.
const RPCS = {
  sim_trades_de_sesion: a => (db.tablas.sim_trades || []).filter(t => t.session_id === a?.p_session_id),
  sim_trades_de_usuario: a => (db.tablas.sim_trades || []).filter(t => t.user_id === a?.p_user_id),
  sim_cierre_v0: a => {
    const ses = (db.tablas.sim_sessions || []).find(x => x.id === a?.p_session_id)
    if (!ses) return { error: { code: 'P0001', message: `sim_cierre_v0: la sesion ${a?.p_session_id} no existe o no es tuya` } }
    if (!a?.p_trade?.id) return { error: { code: 'P0001', message: 'sim_cierre_v0: el trade necesita su id (lo genera el cliente)' } }
    if ((db.tablas.sim_trades || []).some(t => t.id === a.p_trade.id)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "sim_trades_pkey"' } }
    // ronda 2 (E1-04): solo sobre una sesion activa (status NULL = activa); el SQL lo prueba pruebas/sim-004a.mjs (E7-sesion-cerrada, E7-carrera-fase)
    if ((ses.status ?? 'active') !== 'active') return { error: { code: 'P0001', message: `sim_cierre_v0: sesion cerrada: la sesion ${a.p_session_id} ya no esta activa (${ses.status})` } }
    ;(db.tablas.sim_trades ??= []).push({ created_at: new Date().toISOString(), ...copia(a.p_trade), session_id: a.p_session_id })
    contadorTrades(a.p_session_id)   // el trade (+1); el saldo, abajo (+1 si cambia)
    const antes = { balance: ses.balance, rev_saldo: ses.rev_saldo }
    ses.balance = a.p_balance
    contadorSaldo(ses, antes)
    if (a.p_last_timestamp != null) ses.last_timestamp = a.p_last_timestamp
    return { valor: a.p_trade.id }
  },
}
async function rpc(nombre, args = {}) {
  await tick()
  const ctx = { cliente: quien, tabla: 'rpc:' + nombre, op: 'rpc', payload: args, filtros: [] }
  db.log.push(ctx)
  if (db.pausa) await db.pausa(ctx)
  const err = db.falla && await db.falla(ctx)
  if (err) return { data: null, error: err }
  // db.rpcExterno(nombre, args): la RPC la contesta otra cosa (etapa 3: la base REAL del ensayo, pruebas/montaje-v1.mjs)
  if (db.rpcExterno) { const r = await db.rpcExterno(nombre, args); if (db.pierde && await db.pierde(ctx)) return { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: null, hint: null }, status: 0 }; return r }
  if (!Object.hasOwn(RPCS, nombre)) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + nombre } }
  const crudo = RPCS[nombre](args)
  if (crudo && !Array.isArray(crudo)) {
    // una RPC que devuelve un valor (no filas); {error} si la funcion lanza
    if (crudo.error) return { data: null, error: crudo.error, status: 400 }
    if (db.pierde && await db.pierde(ctx)) return { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: null, hint: null }, status: 0 }
    return { data: copia(crudo.valor), error: null, status: 200 }
  }
  const res = copia(crudo.slice().sort((x, y) => String(x.id).localeCompare(String(y.id))))
  if (db.pierde && await db.pierde(ctx)) return { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: null, hint: null } }
  return { data: res, error: null }
}
export function createClient(url, key, opciones) {
  db.clientes.push(opciones ?? null)
  return { from: t => new Q(t), storage: { from: bucket }, auth, rpc }
}

// Llama a un handler de pages/api como lo haria Next (pages router).
export async function llama(handler, { token = null, cookie = null, body, method = 'POST', query = {}, headers = {} } = {}) {
  const h = { ...headers }
  if (token) h.authorization = `Bearer ${token}`
  if (cookie) h.cookie = cookie
  const req = { method, headers: h, body, query }
  let estado = 200, cuerpo, terminado = false
  const cabeceras = {}
  const res = { status(s) { estado = s; return this }, json(j) { cuerpo = j; terminado = true; return this }, setHeader(k, v) { cabeceras[k.toLowerCase()] = v; return this }, end() { terminado = true; return this } }
  let excepcion = null
  try { await handler(req, res) } catch (e) { excepcion = e }
  return { estado: excepcion ? 500 : estado, cuerpo, terminado, excepcion, cabeceras }
}
