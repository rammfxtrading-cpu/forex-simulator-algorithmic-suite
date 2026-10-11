/**
 * estado-s04 · EL MONTAJE DE PRODUCCION FRENTE A LA SALIDA LITERAL DE s04/s05
 *
 * pruebas/estado-s04.mjs (PRODUCCION) es el punto de partida del ensayo de
 * sim-003. Antes valia un resumen; ahora tiene que ser lo que Ramon ejecuto el
 * 10-oct (CTO 11-oct, Astra G): las salidas literales estan en
 * sql/consultas/salidas/ (s04-esquema-simulador-2026-10-10.csv y
 * s05-nombres-libres-2026-10-10.csv, copiadas tal cual de revisiones-suite).
 *
 *   1 se monta PRODUCCION + sql/sim-002 en un PostgreSQL 17 desechable
 *   2 se corren las MISMAS consultas (sql/consultas/s04 y s05), en READ ONLY,
 *     con salida CSV
 *   3 cada fila tiene que ser la del CSV de produccion, y ninguna mas: tablas,
 *     columnas (orden, tipo, NULL, default), restricciones (las FK entrantes de
 *     otros productos incluidas), indices, triggers, politicas, grants,
 *     funciones con su cuerpo y su ACL, bucket y storage; y en s05, nombres,
 *     columnas, el prefijo sim_ y pgcrypto
 * ⚠️ Lo que s04 no lee no lo puede comprobar: ver la cabecera de PRODUCCION
 *    (marcado «NO CONSTA»). No prueba el editor de Supabase.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')

// CSV con comillas y saltos de linea dentro del campo → [[campos]]
function csv(texto) {
  const filas = []
  let fila = [], campo = '', dentro = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentro) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') dentro = false
      else campo += c
    } else if (c === '"') dentro = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}
const claves = filas => filas.map(f => f.join(' ¦ '))
// lo que sobra en a respecto de b (multiconjunto)
const resta = (a, b) => { const q = [...b]; return a.filter(x => { const k = q.indexOf(x); if (k < 0) return true; q.splice(k, 1); return false }) }
const corto = l => l.length > 160 ? l.slice(0, 160) + '…' : l

const pg = cluster()
try {
  pg.arranca()
  titulo('1 · montaje')
  pg.psql('create database p', 'postgres')
  const m = pg.psql(PRODUCCION, 'p')
  ver('PRODUCCION se monta', m.ok, m.err.split('\n')[0])
  const m2 = pg.psql(lee('sql/sim-002-lectura-estable.sql'), 'p')
  ver('y sql/sim-002 tal cual encima', m2.ok, m2.err.split('\n')[0])

  for (const [s, consulta, salida] of [['s04', 'sql/consultas/s04-esquema-simulador.sql', 'sql/consultas/salidas/s04-esquema-simulador-2026-10-10.csv'],
    ['s05', 'sql/consultas/s05-nombres-libres.sql', 'sql/consultas/salidas/s05-nombres-libres-2026-10-10.csv']]) {
    titulo(`2 · ${s}: el montaje frente a la salida de produccion`)
    const q = lee(consulta).replace(/--.*$/mg, '').trim().replace(/;\s*$/, '')
    const r = pg.psql(`begin read only;\ncopy (${q}) to stdout with (format csv, header);\ncommit;`, 'p')
    ver(`${s} corre en READ ONLY sobre el montaje`, r.ok, r.err.split('\n')[0])
    const prod = csv(lee(salida)), ens = csv(r.out + '\n')
    ver(`${s}: la salida de produccion se lee (cabecera seccion,objeto,detalle y FIN)`, prod[0].join(',') === 'seccion,objeto,detalle' && prod.at(-1)[0] === 'FIN' && prod.every(f => f.length === 3), prod.length)
    const P = claves(prod.slice(1)), E = claves(ens.slice(1))
    const faltan = resta(P, E), sobran = resta(E, P)
    for (const l of faltan) console.log('    falta en el montaje: ' + corto(l.replace(/\n/g, '⏎')))
    for (const l of sobran) console.log('    sobra en el montaje: ' + corto(l.replace(/\n/g, '⏎')))
    ver(`${s}: las ${P.length} filas de produccion, identicas, y ninguna mas`, faltan.length === 0 && sobran.length === 0, `faltan ${faltan.length} · sobran ${sobran.length}`)
    if (s === 's04') {
      // control positivo: el comparador ve una sola diferencia plantada (otra base)
      pg.psql('create database q', 'postgres'); pg.psql(PRODUCCION, 'q')
      pg.psql('alter table public.sim_trades alter column session_id drop not null;', 'q')
      const rq = pg.psql(`begin read only;\ncopy (${q}) to stdout with (format csv, header);\ncommit;`, 'q')
      const Q = claves(csv(rq.out + '\n').slice(1))
      ver('control: sim_trades.session_id nulable en otra base → exactamente 1 falta y 1 sobra', resta(P, Q).length === 1 && resta(Q, P).length === 1
        && /sim_trades\.session_id ¦ 02 · uuid · nulable/.test(resta(Q, P)[0] ?? ''), resta(Q, P).join(' / '))
    }
  }
} finally {
  pg.cierra()
}
fin()
