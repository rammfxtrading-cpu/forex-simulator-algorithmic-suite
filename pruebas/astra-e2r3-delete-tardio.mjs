/**
 * LA CONTRAPRUEBA DE ASTRA E2R3-01 (revision de a25a1d9, 14-oct:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r3.md), permanente por
 * orden del CTO (14-oct). Original, sin tocar:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r3-evidencias/delete-tardio.mjs
 *
 * El escenario de Astra, paso a paso, con el cerrojo en la base (sql/mercado-
 * 000-cerrojo.sql, aqui pruebas/cerrojo-falso.mjs con su semantica):
 *   1. A esta muerto y dejo su cerrojo. R1 libera A: su DELETE se queda en el
 *      servidor (respuesta agotada, ETIMEDOUT) y R1 termina con codigo 3.
 *   2. R2, despues, libera A bien.
 *   3. B toma el cerrojo y se para antes de su primer trozo.
 *   4. Termina el DELETE pendiente de R1.
 *   5. C intenta publicar GBPUSD; B termina EURUSD.
 * El oraculo de Astra, tal cual: ninguna escritura del publicador sin cerrojo
 * («ESCRITURAS SIN CERROJO» vacio). Lo que cambia es solo el puerto: el DELETE
 * de R1 es DELETE ... WHERE dueno = A, y no puede tocar el cerrojo de B.
 * Ademas (controles): R1 da codigo 3 sin decir que lo libero; C no publica
 * (cerrojo puesto) y no escribe nada; el puntero final es el de B.
 */
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const { ordenLibera } = await importa('lib/mercado/liberar-v1.mjs')
const { publica, RECURSO } = await importa('lib/mercado/publica-v1.mjs')
const { planificaPar } = await importa('lib/mercado/publicador-v1.mjs')
const A = '11111111-2222-4333-8444-555555555555', B = '22222222-3333-4444-8555-666666666666', C = '33333333-4444-4555-8666-777777777777'
const now = '2026-10-14T10:00:00.000Z'
let pause, signal, waiting = true, primerSuelta = true
const gate = new Promise(r => { pause = r }), reached = new Promise(r => { signal = r })
// el DELETE de R1 (el primero) se queda pendiente en el servidor
const cer = cerrojoEnMemoria({ fallos: { suelta: () => { if (primerSuelta) { primerSuelta = false; return 'tarde' } } } })
cer.pon(RECURSO, { dueno: A, descripcion: 'mercado-v1-publica', desde: now })
const m = new Map(), writes = []
const s = {
  async lee(k) { return m.has(k) ? Buffer.from(m.get(k)) : null },
  async sube(k, b, { upsert } = {}) {
    if (k.endsWith('.bin.br') && waiting) { waiting = false; signal(); await gate }
    if (m.has(k) && !upsert) return 'existe'
    m.set(k, Buffer.from(b)); writes.push([k, cer.filas.get(RECURSO)?.dueno ?? null]); return 'ok'
  },
  async borra(k) { m.delete(k) },
  async lista() { return [...m].map(([ruta, b]) => ({ ruta, bytes: b.length })) },
}
const deps = fecha => ({ cerrojo: () => cer, almacen: () => s, ahora: () => fecha, entorno: {} })

titulo('E2R3-01 · un DELETE incierto que llega tarde')
const r1 = await ordenLibera(['--confirmo', A], deps(now))
ver('control: R1 timeout: codigo 3, A sigue y no dice que lo libero', r1.codigo === 3 && cer.filas.get(RECURSO)?.dueno === A && !/liberado;/.test(r1.lineas.at(-1)) && cer.tardias.length === 1, r1.lineas.at(-1))
const r2 = await ordenLibera(['--confirmo', A], deps('2026-10-14T10:01:00.000Z'))
ver('control: R2 libera A', r2.codigo === 0 && !cer.filas.has(RECURSO), r2.lineas.at(-1))
const velas = []; for (let t = Date.parse('2026-03-02T00:00Z') / 1000; t < Date.parse('2026-03-05T00:00Z') / 1000; t += 60) velas.push({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 })
const p = planificaPar({ par: 'EURUSD', velas }); if (p.estado !== 'publica') throw Error('control plan')
const pb = publica({ almacen: s, cerrojo: cer, planes: [p], dueno: 'mercado-v1-publica', ahora: now, id: B }); await reached
ver('control: B paso sus guardas y espera su primera subida, con su cerrojo', cer.filas.get(RECURSO)?.dueno === B)
const tarde = cer.terminaTardias()
oraculo('E2R3-01', 'el DELETE tardio de R1 (WHERE dueno = A) no borra nada: el cerrojo de B sigue', tarde.join() === '0' && cer.filas.get(RECURSO)?.dueno === B, JSON.stringify({ tarde, dueno: cer.filas.get(RECURSO)?.dueno }))
let pc; try { pc = await publica({ almacen: s, cerrojo: cer, planes: [planificaPar({ par: 'GBPUSD', velas })], dueno: 'mercado-v1-publica', ahora: now, id: C }) } catch (e) { pc = { error: e.message } }
ver('control: C no publica mientras B tiene el cerrojo (cerrojo puesto)', /cerrojo puesto/.test(pc.error ?? ''), JSON.stringify(pc))
pause(); const rb = await pb
ver('control: B termina publicado y suelta su cerrojo', rb.estado === 'publicado' && rb.cerrojoSuelto === true && !cer.filas.has(RECURSO), rb.estado)
const without = writes.filter(([k, owner]) => !k.startsWith('v1/_') && owner === null)
oraculo('E2R3-01', 'ESCRITURAS SIN CERROJO: ninguna (oraculo de Astra)', without.length === 0, JSON.stringify(without))
const puntero = JSON.parse(m.get('v1/actual.json'))
oraculo('E2R3-01', 'todas las escrituras del publicador las hizo B con su cerrojo, y el puntero final es el de B (EURUSD)', writes.filter(([k]) => !k.startsWith('v1/_')).every(([, o]) => o === B) && Object.keys(puntero.pares).join() === 'EURUSD' && !writes.some(([k]) => k.includes('GBPUSD')), JSON.stringify(writes.map(([k, o]) => `${k.split('/').slice(1, 3).join('/')} ${o}`)))
fin()
