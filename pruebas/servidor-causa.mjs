/**
 * ETAPA 3 · LA CAUSA EN EL RECIBO DE UN COMANDO RECHAZADO (CTO, 16-oct; cierra la pregunta de q.17.6).
 * Escrita ANTES que el codigo (contra 256bb89: en rojo).
 *
 * El recibo de un comando sobre una sesion terminada es { rechazado: 'sesion_terminada', motivo, causa }:
 *   · resultado 'rechazado' y motivo 'sesion_terminada' (la columna motivo de sim_recibos, como todo
 *     rechazo);
 *   · causa: el motivo original del final ('breach', 'fase_superada' u 'objetivo_alcanzado'), en
 *     resumen.causa (sim_recibos guarda resultado, motivo y resumen; lo demas no llega al recibo).
 * La causa se COPIA del estado terminal guardado, nunca se recalcula. Por eso los casos son estados
 * guardados en los que copiar y recalcular dan respuestas distintas:
 *   · un reto 'superada' cuyo motor esta en breach → fase_superada (no breach);
 *   · un reto 'breach' con la cuenta sana, sin breach en el motor → breach (recalculando, nada);
 *   · un reto 'breach' cuyo motor alcanzo el objetivo → breach;
 *   · una practica 'breach' con la cuenta sana → breach; una practica 'objetivo' sin posiciones ni
 *     saldo de mas → objetivo_alcanzado.
 * Un estado terminal desconocido es un error, no una causa adivinada. Otro rechazo, o un comando
 * aceptado, no llevan causa. Contra sim_comando real: servidor-detencion.mjs (DETS-causa).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const CO = await importa('lib/servidor/comando.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const U = iso => Date.parse(iso) / 1000
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

// el estado tal como lo guarda sim_sessions.estado (jsonb), y el calculo del servidor sobre esa fila
const guardado = x => JSON.parse(CA.serializa(x))
const pide = (x, tipo = 'abrir') => CO.calcula({
  fila: { estado: guardado(x), date_from: '2025-01-06' },
  intencion: { tipo, carga: tipo === 'abrir' ? { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: 0 } : {} },
  puertos: {},
})
const base = () => CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' })
const reto = () => RT.creaReto({ motor: base(), fase: 1, inicio: U('2025-01-06T00:00:00Z'), reglas: RT.SUITE_1F })
const recibo = r => ({ resultado: r.resultado, motivo: r.motivo, causa: r.resumen?.causa ?? null, resumen: { resultado: r.resumen?.resultado, motivo: r.resumen?.motivo } })
const TERMINADA = causa => tx({ resultado: 'rechazado', motivo: 'sesion_terminada', causa, resumen: { resultado: 'rechazado', motivo: 'sesion_terminada' } })

titulo('1 · reto: la causa es la del estado del reto guardado')
{
  const r0 = reto()
  const casos = [
    ['superada, con el motor en breach', { ...r0, estado: 'superada', motor: { ...r0.motor, estado: 'breach' } }, 'fase_superada'],
    ['breach, con la cuenta sana y sin breach en el motor', { ...r0, estado: 'breach' }, 'breach'],
    ['breach, con el motor en objetivo', { ...r0, estado: 'breach', motor: { ...r0.motor, estado: 'objetivo' } }, 'breach'],
  ]
  ver('control: el reto de partida esta en curso, con el motor activo, sin breach y con el saldo en el capital', r0.estado === 'en_curso' && r0.motor.estado === 'activo' && r0.breach === null && r0.motor.saldo_µ === r0.capital_inicial_µ, tx({ e: r0.estado, m: r0.motor.estado }))
  for (const [nombre, x, causa] of casos) {
    const r = await pide(x)
    oraculo('CAUSA', `reto ${nombre}: { rechazado: sesion_terminada, causa: ${causa} } en el recibo (resumen.causa)`, tx(recibo(r)) === TERMINADA(causa), tx(recibo(r)))
  }
}

titulo('2 · practica: la causa es la del estado de la cartera guardado')
{
  const b = base()
  ver('control: la cartera de partida esta activa, sin limites, sin posiciones y con el saldo en el capital', b.estado === 'activo' && b.limites.length === 0 && b.posiciones.length === 0, tx({ e: b.estado }))
  for (const [estado, causa] of [['breach', 'breach'], ['objetivo', 'objetivo_alcanzado']]) {
    const r = await pide({ ...b, estado })
    oraculo('CAUSA', `practica en ${estado} (sin limites que romper ni objetivo que alcanzar): causa ${causa}`, tx(recibo(r)) === TERMINADA(causa), tx(recibo(r)))
  }
}

titulo('3 · lo que no lleva causa, y lo que no se adivina')
{
  const r1 = await pide(reto())
  oraculo('CAUSA', 'otro rechazo (sin_cotizacion, reto en curso sin cursor): sin causa', r1.resultado === 'rechazado' && r1.motivo === 'sin_cotizacion' && !('causa' in r1.resumen), tx(recibo(r1)))
  const r2 = await pide({ ...reto(), estado: 'breach' }, 'checkpoint')
  oraculo('CAUSA', 'un comando aceptado (checkpoint): sin causa', r2.resultado === 'aceptado' && !('causa' in r2.resumen), tx(recibo(r2)))
  let err = null
  try { await pide({ ...reto(), estado: 'pausa' }) } catch (e) { err = e }
  oraculo('CAUSA', 'un reto con un estado terminal desconocido: error, ninguna causa adivinada', err instanceof Error, String(err?.message))
  // R2E3-07 (revisor interno): la comprobacion del servidor, con rechazos que el motor no da hoy
  const lanza = x => { try { CO.causaDe(x); return false } catch { return true } }
  oraculo('CAUSA', 'causaDe: sesion_terminada sin motivo, o con un motivo que no es causa, es error (no se omite en silencio)', lanza({ rechazado: 'sesion_terminada' }) && lanza({ rechazado: 'sesion_terminada', motivo: 'otra' }) && lanza({ rechazado: 'sesion_terminada', motivo: 'sesion_terminada' }))
  oraculo('CAUSA', 'causaDe: aceptado u otro rechazo, sin causa; las tres causas, tal cual', CO.causaDe('aceptado') === null && CO.causaDe({ rechazado: 'sin_cotizacion' }) === null && ['breach', 'fase_superada', 'objetivo_alcanzado'].every(c => CO.causaDe({ rechazado: 'sesion_terminada', motivo: c }) === c))
}

titulo('4 · el reset de la hora del comando quema el reto (R2E3-04): la causa es la del estado que se guarda con ese recibo')
{
  // el guion C7-01 (pruebas/motor/reto.mjs), con la cartera: el reto guardado esta EN CURSO; el reset de la
  // hora del comando lo quema en ese mismo comando, y sim_comando guarda ese estado terminal con el recibo
  const M = await importa('lib/motor/motor.mjs')
  const cero = Object.freeze({ version: 'prueba:EURUSD:0:0', spread_pips: Object.freeze({ EURUSD: 0 }), comision_lote_µ: 0n, swap_µ: 0n })
  const vs = filas => M.velas('EURUSD', filas.map(([iso, p]) => ({ time: U(iso), open: p, high: p, low: p, close: p })))
  const vM = vs([['2026-10-05T08:00:00Z', '1.10000'], ['2026-10-06T08:00:00Z', '1.10000'], ['2026-10-07T08:00:00Z', '1.10000'], ['2026-10-07T09:00:00Z', '1.20000'], ['2026-10-07T21:58:00Z', '1.10000'], ['2026-10-07T21:59:00Z', '1.08000'], ['2026-10-08T08:00:00Z', '1.08000']])
  const gM = [['avanza', '2026-10-05T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p1'], ['avanza', '2026-10-06T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p2'], ['avanza', '2026-10-07T08:00:00Z'], ['abrir', 'BUY', '2'], ['avanza', '2026-10-07T09:00:00Z'], ['cerrar', 'p3'], ['avanza', '2026-10-07T21:58:00Z'], ['abrir', 'BUY', '5'], ['avanza', '2026-10-07T21:59:00Z']]
  let r = RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: cero, capital: '100000' }), inicio: U('2026-10-05T07:00:00Z') })
  for (const paso of gM) {
    const x = paso[0] === 'avanza' ? RT.avanzaReto(r, U(paso[1]), { EURUSD: vM })
      : RT.aplicaReto(r, paso[0] === 'abrir' ? { tipo: 'abrir', par: 'EURUSD', lado: paso[1], orden: 'mercado', lotes: paso[2], cotizadoEn: r.motor.reloj.cursor } : { tipo: 'cerrar', id: paso[1] })
    r = x.reto
  }
  ver('control: el reto guardado sigue en curso antes del comando', r.estado === 'en_curso', r.estado)
  const x = await CO.calcula({ fila: { estado: guardado(r), date_from: '2026-10-05' }, intencion: { tipo: 'cerrar', carga: { id: 'p4' } }, puertos: {} })
  oraculo('CAUSA', 'reset que quema el reto en la hora del comando: recibo sesion_terminada con causa breach, y el estado que se guarda con el es breach (reset_diario, breach, cierre)', x.resultado === 'rechazado' && x.motivo === 'sesion_terminada' && x.resumen.causa === 'breach' && x.estado.estado === 'breach' && x.eventos.map(e => e.tipo).join(',') === 'reset_diario,breach,cierre', tx({ r: x.resultado, m: x.motivo, c: x.resumen.causa, e: x.estado.estado, ev: x.eventos.map(e => e.tipo) }))
}

titulo('5 · avanzar sobre una sesion terminada (CTO 16-oct, respuesta 4): la misma causa, de la misma tabla')
{
  // el avance que no calcula (detencion sesion_terminada) copia la causa con causaTerminal, la misma tabla que
  // usa el rechazo del motor; aqui, que las dos dan lo mismo sobre los mismos estados guardados
  const r0 = reto(), b = base()
  const estados = [
    ['reto superada, motor en breach', { ...r0, estado: 'superada', motor: { ...r0.motor, estado: 'breach' } }, 'fase_superada'],
    ['reto breach, cuenta sana', { ...r0, estado: 'breach' }, 'breach'],
    ['practica breach', { ...b, estado: 'breach' }, 'breach'],
    ['practica objetivo', { ...b, estado: 'objetivo' }, 'objetivo_alcanzado'],
  ]
  for (const [nombre, x, causa] of estados) {
    const g = CA.deserializa(JSON.stringify(guardado(x)))
    const rech = await pide(x)
    oraculo('CAUSA', `${nombre}: causaTerminal del estado guardado = ${causa} = la causa del rechazo`, RT.causaTerminal(g) === causa && rech.resumen.causa === causa, `${RT.causaTerminal(g)} · ${rech.resumen.causa}`)
  }
  const lanzaT = x => { try { RT.causaTerminal(x); return false } catch { return true } }
  oraculo('CAUSA', 'causaTerminal: un estado que no es terminal conocido (en curso, activo, pausa) lanza', lanzaT(reto()) && lanzaT(base()) && lanzaT({ ...reto(), estado: 'pausa' }) && lanzaT({ ...base(), estado: 'pausa' }))
  const fuente = readFileSync(path.join(REPO, 'lib', 'servidor', 'comando.mjs'), 'utf8')
  oraculo('CAUSA', 'el servidor la copia en el avance que no calcula (sesion_terminada) con causaTerminal, la tabla del motor', /detencion\?\.motivo === 'sesion_terminada' \? causaTerminal\(actual\) : null/.test(fuente))
}
fin()
