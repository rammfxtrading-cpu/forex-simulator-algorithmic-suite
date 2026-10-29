/**
 * LO DE PRODUCCIÓN en los usos del contexto completo (CTO 1-072/1-074/1-077): la salida literal de s-contexto y cómo
 * se usa. Desde la v3 (CANON1-05) las fichas son JSON: el destino se deriva CLAVE A CLAVE.
 *   · SALIDA                       → la salida de la s-contexto de la versión en curso (v4)
 *   · leeSalida(ruta)              → { grafo, funcion: {firma: ficha}, tabla: {nombre: ficha}, huerfanos: {fk: n} },
 *                                    o null si todavía no hay salida (los usos llevan entonces el HUECO)
 *   · destino(prod, mPart, mDest)  → la ficha de DESTINO en producción: la de producción con SOLO lo que la migración
 *                                    cambia (lo que difiere entre la partida y el destino del montaje), clave a clave
 *   · cambia(a, b)                 → las rutas de claves que difieren entre dos fichas
 *   · constantes(texto, nombre)    → { clave: valor } de un ARRAY[['clave', 'valor'], …] del DECLARE
 *   · grafoDe(texto)               → el valor de CC_GRAFO
 *   · aMontaje(texto, cambios)     → el texto con CC_GRAFO y las constantes que se digan cambiadas por lo del montaje:
 *                                    para EJECUTAR la migración en un PostgreSQL de prueba
 *   · HUECO                        → el valor de una constante que espera a la s-contexto: con él, la migración PARA
 */
import { readFileSync, existsSync } from 'node:fs'

export const HUECO = '⟦HUECO s-contexto v4⟧'
export const SALIDA = new URL('./salidas/s-contexto-v4.csv', import.meta.url)

// CSV del editor de Supabase: comas, comillas dobles y "" dentro
function csv(texto) {
  const filas = []; let f = [], c = '', q = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (q) { if (ch === '"' && texto[i + 1] === '"') { c += '"'; i++ } else if (ch === '"') q = false; else c += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { f.push(c); c = '' }
    else if (ch === '\n') { f.push(c); filas.push(f); f = []; c = '' }
    else if (ch !== '\r') c += ch
  }
  if (c || f.length) { f.push(c); filas.push(f) }
  return filas
}

export function leeSalida(ruta = SALIDA) {
  if (!existsSync(ruta)) return null
  const filas = csv(readFileSync(ruta, 'utf8'))
  const s = { grafo: null, funcion: {}, tabla: {}, huerfanos: {}, envoltura: null, fin: false }
  for (const [sec, obj, val] of filas.slice(1)) {
    if (sec === 'envoltura') s.envoltura = obj
    else if (sec === 'grafo') s.grafo = val
    else if (sec === 'funcion') s.funcion[obj] = val
    else if (sec === 'tabla') s.tabla[obj] = val
    else if (sec === 'huerfanos') s.huerfanos[obj] = val
    else if (sec === 'FIN') s.fin = true
  }
  return s
}

// CC3-09: los números se leen con su TEXTO de PostgreSQL (0.0000001, 1000000000000000000000) y se vuelven a escribir
// igual: una clase propia, y lee() con el texto original de cada número
class Num { constructor(t) { this.t = t } toJSON() { return this.t } }
export const lee = t => JSON.parse(t, (k, v, c) => (typeof v === 'number' ? new Num(c.source) : v))

// jsonb::text de PostgreSQL, el mismo texto que da la base: claves por longitud y después por bytes; «, » y «: »
export function comoJsonb(v) {
  if (v === null) return 'null'
  if (v instanceof Num) return v.t
  if (Array.isArray(v)) return '[' + v.map(comoJsonb).join(', ') + ']'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    const ks = Object.keys(v).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)))
    return '{' + ks.map(k => JSON.stringify(k) + ': ' + comoJsonb(v[k])).join(', ') + '}'
  }
  return JSON.stringify(v)
}

const igual = (a, b) => comoJsonb(a) === comoJsonb(b)
// el destino clave a clave: lo que no cambia en el montaje, el de producción; lo que cambia, el del montaje (si los
// dos son objetos, se baja un nivel más)
function mezcla(prod, mP, mD) {
  if (igual(mP, mD)) return prod
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Num)
  if (obj(prod) && obj(mP) && obj(mD)) {
    const out = { ...prod }
    for (const k of new Set([...Object.keys(mP), ...Object.keys(mD)])) {
      if (!(k in mD)) delete out[k]
      else if (!(k in mP)) out[k] = mD[k]
      else out[k] = mezcla(prod[k], mP[k], mD[k])
    }
    return out
  }
  return mD
}
export function destino(prod, mPart, mDest) {
  return comoJsonb(mezcla(lee(prod), lee(mPart), lee(mDest)))
}

function rutas(x, y, base) {
  if (igual(x, y)) return []
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Num)
  if (obj(x) && obj(y)) return [...new Set([...Object.keys(x), ...Object.keys(y)])].sort().flatMap(k => rutas(x[k] ?? null, y[k] ?? null, base ? `${base}.${k}` : k))
  return [base || '.']
}
export const cambia = (a, b) => rutas(lee(a), lee(b), '')

const literal = v => v.replace(/'/g, "''")
const desliteral = v => v.replace(/''/g, "'")
const ARRAY_RE = /ARRAY\['((?:[^']|'')+)', '((?:[^']|'')*)'\]/g

export function constantes(texto, nombre) {
  const i = texto.indexOf(`  ${nombre} constant`); if (i < 0) return null
  const j = texto.indexOf('  ];\n', i)
  return Object.fromEntries([...texto.slice(i, j).matchAll(ARRAY_RE)].map(m => [desliteral(m[1]), desliteral(m[2])]))
}

export const grafoDe = texto => { const m = /  CC_GRAFO constant pg_catalog\.text := '((?:[^']|'')*)';/.exec(texto); return m ? desliteral(m[1]) : null }

export function aMontaje(texto, { grafo, ...cambios }) {
  let t = texto
  if (grafo !== undefined) t = t.replace(/(  CC_GRAFO constant pg_catalog\.text := )'(?:[^']|'')*';/, (m, cab) => `${cab}'${literal(grafo)}';`)
  for (const [nombre, vals] of Object.entries(cambios)) {
    const i = t.indexOf(`  ${nombre} constant`); if (i < 0) throw new Error(`no hay ${nombre}`)
    const j = t.indexOf('  ];\n', i)
    let blk = t.slice(i, j)
    for (const [k, v] of Object.entries(vals)) {
      let hecho = false
      blk = blk.replace(ARRAY_RE, (m, a, b) => { if (desliteral(a) !== k) return m; hecho = true; return `ARRAY['${literal(k)}', '${literal(v)}']` })
      if (!hecho) throw new Error(`${nombre}: no está ${k}`)
    }
    t = t.slice(0, i) + blk + t.slice(j)
  }
  return t
}
