/**
 * MOTOR · UN COMANDO SOBRE UNA SESION TERMINADA (CTO, 15-oct, respuesta 3 de q.17.4).
 * Escrito ANTES que el codigo.
 *
 * Un solo codigo de rechazo, 'sesion_terminada', con su motivo:
 *   breach | fase_superada | objetivo_alcanzado
 * en el reto (aplicaReto) y en la practica (cartera y motor de un par):
 *   { rechazado: 'sesion_terminada', motivo }
 * Los codigos sueltos de antes desaparecen: ninguno sobrevive en lib/, pages/,
 * components/, sql/ ni en las pruebas (negativo al final).
 *
 * Casos:
 *   - reto: el reset de la hora del comando lo quema (C7-01 de pruebas/motor/reto.mjs):
 *     breach, con los eventos del reset y del cierre; y un comando mas sobre el reto ya
 *     quemado: breach, sin eventos y el reto intacto;
 *   - reto superado (estado 'superada'): fase_superada;
 *   - practica (cartera y un par) en breach: breach; con el objetivo alcanzado: objetivo_alcanzado.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { titulo, oraculo, ver, fin, importa, REPO } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const U = iso => Date.parse(iso) / 1000
const µ = usd => BigInt(Math.round(usd * 100)) * 10_000n
const cero = Object.freeze({ version: 'prueba:EURUSD:0:0', spread_pips: Object.freeze({ EURUSD: 0 }), comision_lote_µ: 0n, swap_µ: 0n })
const vs = filas => M.velas('EURUSD', filas.map(([iso, p]) => ({ time: U(iso), open: p, high: p, low: p, close: p })))
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const TERM = motivo => tx({ rechazado: 'sesion_terminada', motivo })

function corre(velas, inicioIso, guion) {
  let r = RT.creaReto({ motor: M.crea({ par: 'EURUSD', costes: cero, capital: '100000' }), inicio: U(inicioIso) })
  for (const paso of guion) {
    const x = paso[0] === 'avanza' ? RT.avanzaReto(r, U(paso[1]), velas)
      : RT.aplicaReto(r, paso[0] === 'abrir' ? { tipo: 'abrir', lado: paso[1], orden: 'mercado', lotes: paso[2], cotizadoEn: r.motor.reloj.cursor } : { tipo: 'cerrar', id: paso[1] })
    r = x.reto
  }
  return r
}

titulo('1 · reto')
{
  // C7-01 (Astra, cierres-8): el cierre se pide a las 22:00 UTC; el reset sube el suelo a 115.000 con equity 110.000
  const vM = vs([['2026-10-05T08:00:00Z', '1.10000'], ['2026-10-06T08:00:00Z', '1.10000'], ['2026-10-07T08:00:00Z', '1.10000'], ['2026-10-07T09:00:00Z', '1.20000'], ['2026-10-07T21:58:00Z', '1.10000'], ['2026-10-07T21:59:00Z', '1.08000'], ['2026-10-08T08:00:00Z', '1.08000']])
  const gM = [['avanza', '2026-10-05T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p1'], ['avanza', '2026-10-06T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p2'], ['avanza', '2026-10-07T08:00:00Z'], ['abrir', 'BUY', '2'], ['avanza', '2026-10-07T09:00:00Z'], ['cerrar', 'p3'], ['avanza', '2026-10-07T21:58:00Z'], ['abrir', 'BUY', '5'], ['avanza', '2026-10-07T21:59:00Z']]
  const antes = corre(vM, '2026-10-05T07:00:00Z', gM)
  ver('control: el reto sigue en curso antes del comando', antes.estado === 'en_curso', antes.estado)
  const pide = RT.aplicaReto(antes, { tipo: 'cerrar', id: 'p4' })
  oraculo('TERM', 'reto: el reset de la hora del comando lo quema → { rechazado: sesion_terminada, motivo: breach }, con los eventos del reset y del cierre', tx(pide.resultado) === TERM('breach') && pide.reto.estado === 'breach' && pide.eventos.map(x => x.tipo).join(',') === 'reset_diario,breach,cierre', `${tx(pide.resultado)} · ${pide.eventos.map(x => x.tipo).join(',')}`)
  const otra = RT.aplicaReto(pide.reto, { tipo: 'abrir', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: pide.reto.motor.reloj.cursor })
  oraculo('TERM', 'reto ya quemado: { rechazado: sesion_terminada, motivo: breach }, sin eventos y el reto intacto', tx(otra.resultado) === TERM('breach') && otra.eventos.length === 0 && RT.serializaReto(otra.reto) === RT.serializaReto(pide.reto), tx(otra.resultado))
  // superada: el estado terminal del reto, puesto a mano sobre un reto valido (el camino hasta el objetivo ya lo prueba reto.mjs)
  const sup = { ...antes, estado: 'superada' }
  const rs = RT.aplicaReto(sup, { tipo: 'cerrar', id: 'p4' })
  oraculo('TERM', 'reto superado: { rechazado: sesion_terminada, motivo: fase_superada }, sin eventos', tx(rs.resultado) === TERM('fase_superada') && rs.eventos.length === 0 && rs.reto === sup, tx(rs.resultado))
}

titulo('2 · practica (cartera y un par)')
{
  const base = CA.crea({ pares: ['EURUSD'], costes: cero, capital: '100000' })
  for (const [estado, motivo] of [['breach', 'breach'], ['objetivo', 'objetivo_alcanzado']]) {
    const e = { ...base, estado }
    const r = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: 0 }, {})
    oraculo('TERM', `cartera en ${estado}: { rechazado: sesion_terminada, motivo: ${motivo} }, sin eventos`, tx(r.resultado) === TERM(motivo) && r.eventos.length === 0 && r.estado === e, tx(r.resultado))
  }
  const uno = M.crea({ par: 'EURUSD', costes: cero, capital: '100000' })
  for (const [estado, motivo] of [['breach', 'breach'], ['objetivo', 'objetivo_alcanzado']]) {
    const e = { ...uno, estado }
    const r = M.aplica(e, { tipo: 'abrir', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: 0 }, [])
    oraculo('TERM', `un par en ${estado}: { rechazado: sesion_terminada, motivo: ${motivo} }, sin eventos`, tx(r.resultado) === TERM(motivo) && r.eventos.length === 0 && r.estado === e, tx(r.resultado))
  }
}

titulo('3 · ningun codigo viejo sobrevive')
{
  // los nombres, troceados para que este fichero no se encuentre a si mismo
  const viejos = [['reto', 'terminado'], ['sesion', 'en', 'breach'], ['objetivo', 'alcanzado']].map(p => p.join('_'))
  // objetivo_alcanzado es ahora un MOTIVO: vale solo como valor de motivo, nunca como codigo de rechazo
  const todos = viejos.join('|'), sueltos = viejos.slice(0, 2).join('|')
  const formas = [`rechazo\\([^,()]*,\\s*['"](${todos})['"]`, `rechazado\\s*(:|===|==|!==)\\s*['"](${todos})['"]`, `['"](${sueltos})['"]`, `«(${todos})»`]
  const codigoViejo = new RegExp(formas.join('|'))
  const yo = path.resolve(REPO, 'pruebas/motor/sesion-terminada.mjs')
  const hallados = []
  let leidos = 0
  const recorre = dir => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n.startsWith('.')) continue
      const p = path.join(dir, n)
      if (statSync(p).isDirectory()) { recorre(p); continue }
      if (!/\.(mjs|js|jsx|ts|tsx|sql|json|sh)$/.test(n) || p === yo) continue
      leidos++
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (codigoViejo.test(l)) hallados.push(`${path.relative(REPO, p)}:${i + 1}`) })
    }
  }
  for (const d of ['lib', 'pages', 'components', 'sql', 'pruebas']) recorre(path.join(REPO, d))
  // control positivo: el detector caza las tres formas de antes
  const muestras = [`return rechazo(estado, '${viejos[1]}')`, `return rechazo(estado, '${viejos[2]}')`, `resultado: { rechazado: '${viejos[0]}' } }`, `se rechaza («${viejos[1]}»)`, `x.resultado?.rechazado === '${viejos[2]}'`]
  ver('control: el detector caza las formas de antes (5/5)', muestras.every(m => codigoViejo.test(m)), '')
  ver('control: deja pasar el motivo nuevo', !codigoViejo.test(`rechazo(estado, 'sesion_terminada', { motivo: '${viejos[2]}' })`), '')
  ver(`control: ha leido ficheros (${leidos})`, leidos > 100, '')
  oraculo('TERM', 'ningun codigo de rechazo viejo en lib/, pages/, components/, sql/ ni en las pruebas', hallados.length === 0, hallados.slice(0, 8).join(' · '))
}
fin()
