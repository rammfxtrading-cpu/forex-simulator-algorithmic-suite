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
//                       (se devuelve un error de transporte, como supabase-js ante
//                       un fetch roto a la vuelta)
//   db.log            cada operacion: { cliente, tabla, op, payload, filtros }
import { randomUUID, createHash } from 'node:crypto'
const quien = new URL(import.meta.url).search.slice(1) || 'prueba'
export const db = globalThis.__db ??= {}
export function reset() {
  Object.assign(db, { tablas: {}, tokens: {}, sesion: null, storage: {}, maxFilas: null, falla: null, pausa: null, entrega: null, pierde: null, cascadas: null, log: [], auth: [], oyentesAuth: [] })
}
if (!db.tablas) reset()
const tick = () => new Promise(r => setImmediate(r))
const copia = x => x === undefined ? undefined : structuredClone(x)
const proyecta = (f, cols) => {
  if (!cols || cols.trim() === '*') return f
  return Object.fromEntries(cols.split(',').map(c => c.trim()).filter(Boolean).map(c => [c, f[c]]))
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
  eq(c, v) { this.desc.push(`${c}=eq.${v}`); this.filtros.push(f => f[c] === v); return this }
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
      filas.push(...res)
      res = res.map(copia)
    } else {
      let sel = filas.filter(f => this.filtros.every(g => g(f)))
      if (this.op === 'update') for (const f of sel) Object.assign(f, copia(this.payload))
      else if (this.op === 'delete') {
        db.tablas[this.tabla] = filas.filter(f => !sel.includes(f))
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
  const op = async (tipo, payload) => {
    await tick()
    const ctx = { cliente: quien, tabla: 'storage:' + nombre, op: tipo, payload, filtros: [] }
    db.log.push(ctx)
    if (db.pausa) await db.pausa(ctx)
    return (db.falla && await db.falla(ctx)) || null
  }
  const noExiste = { data: null, error: { message: 'Bucket not found', statusCode: '404' } }
  const NO_ENCONTRADO = { name: 'StorageApiError', message: 'Object not found', status: 400, statusCode: '404' }
  return {
    async download(ruta) {
      const err = await op('download', ruta); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      // como storage-js 2.102: la API responde 400 con cuerpo { statusCode: '404',
      // error: 'not_found', message: 'Object not found' } → StorageApiError
      if (!Object.hasOwn(objetos(), ruta)) return { data: null, error: NO_ENCONTRADO }
      const blob = new Blob([objetos()[ruta]], { type: 'application/octet-stream' })
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
      return { data: { name: ruta, etag, version: etag, size: Buffer.byteLength(c), lastModified: null, contentType: null }, error: null }
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
      return { data: { path: ruta }, error: null }
    },
    async list(prefijo = '', o = {}) {
      const err = await op('list', { prefijo, ...o }); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      const lim = o.limit ?? 100, off = o.offset ?? 0
      const nombres = Object.keys(objetos()).filter(n => n.startsWith(prefijo + '/')).map(n => n.slice(prefijo.length + 1)).sort()
      return { data: nombres.slice(off, off + lim).map(name => ({ name })), error: null }
    },
    async remove(rutas) {
      const err = await op('remove', rutas); if (err) return { data: null, error: err }
      if (!objetos()) return noExiste
      const fuera = rutas.filter(r => Object.hasOwn(objetos(), r))
      for (const r of fuera) delete objetos()[r]
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

export function createClient() {
  return { from: t => new Q(t), storage: { from: bucket }, auth, rpc: async n => ({ data: null, error: { code: 'PGRST202', message: 'rpc desconocida ' + n } }) }
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
