/**
 * LAS CONTRAPRUEBAS NODE DE ASTRA DE LA ETAPA 2, RONDA 2 (revision de cd99f06,
 * 14-oct: revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r2.md, E2R2-03..05),
 * llevadas a pruebas/ como permanentes (CTO 14-oct). Original, sin tocar:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r2-evidencias/node-adversario.mjs
 * (las de SQL, E2R2-01 y E2R2-02, van en pruebas/mercado-001-bucket.mjs).
 *
 * Las condiciones de los oraculos son las de Astra, salvo una (y lo que cambia
 * son las rutas y el sitio del fichero sintetico del script, .pruebas/):
 *   · E2R2-03: el disparador de Astra (durante la constancia, el cerrojo A
 *     desaparece y aparece el B), con B como un publicador real y el otro
 *     liberador del paso 2, real. Desde E2R3-01 (CTO 14-oct) el cerrojo esta en
 *     la base y el DELETE es condicional al dueño: su oraculo literal («B se
 *     conserva», la exclusion de B) se cumple tal cual, sin congelacion.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const { planificaPar } = await importa('lib/mercado/publicador-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const { MOTIVO_CORTO, anota } = await importa('lib/mercado/aceptaciones.mjs')
const { ordenLibera } = await importa('lib/mercado/liberar-v1.mjs')
const { publica, RECURSO, PUNTERO } = await importa('lib/mercado/publica-v1.mjs')
const { verifica } = await importa('lib/mercado/verifica-v1.mjs')
const idA = '11111111-2222-4333-8444-555555555555', idB = '22222222-3333-4444-8555-666666666666'
const ahora = '2026-10-14T10:00:00.000Z'
const ficha = (id = idA, descripcion = 'mercado-v1-publica') => ({ dueno: id, descripcion, desde: ahora })
function store() { const o = new Map(); return { o, cer: cerrojoEnMemoria(), async lee(k) { return o.has(k) ? Buffer.from(o.get(k)) : null }, async sube(k, b, { upsert } = {}) { if (o.has(k) && !upsert) return 'existe'; o.set(k, Buffer.from(b)); return 'ok' }, async borra(k) { o.delete(k) }, async lista() { return [...o].map(([ruta, b]) => ({ ruta, bytes: b.length })) } } }
const U = s => Date.parse(s) / 1000
const velas = []; for (let t = U('2025-12-21T00:00Z'); t < U('2025-12-30T00:00Z'); t += 60) { if (minutoCerrado(t) || (t >= U('2025-12-24T22:00Z') && t < U('2025-12-25T22:00Z'))) continue; velas.push({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }) }
const ac = { tipo: 'aceptacion', par: 'EURUSD', inicio: '2025-12-24T22:00Z', minutos: 1440, motivo: 'festivo', fecha: '2026-10-14', nota: 'sintetica' }
const corto = { tipo: 'corto', par: 'EURUSD', dia: '2025-12-25', velas: 120, motivo: MOTIVO_CORTO, fecha: '2026-10-14', nota: 'sintetica' }
const texto = [ac, corto].map(x => JSON.stringify(x) + '\n').join('')
const p = planificaPar({ par: 'EURUSD', velas, texto })
ver('control: el plan sintetico publica', p.estado === 'publica', p.estado)
titulo('E2R2-03 · el intercalado de Astra: durante la constancia, A desaparece y un publicador B toma el cerrojo')
// E2R3-01 (CTO 14-oct): el cerrojo esta en la base y el DELETE es condicional; ya no hay congelacion.
// El disparador de Astra (otro liberador autorizado durante la constancia; A desaparece; B toma el
// cerrojo y publica) y su oraculo: B conserva la exclusion (todo lo que escribe, con su cerrojo).
{
  const a = store(); a.cer.pon(RECURSO, ficha())
  const escrituras = []
  const sub = a.sube; let b = null, otro = null, disparado = false
  a.sube = async (k, bytes, opts) => {
    const ret = await sub(k, bytes, opts)
    escrituras.push([k, a.cer.filas.get(RECURSO)?.dueno ?? null])
    if (k.startsWith('v1/_liberados/') && !disparado) {
      disparado = true                                                                                                       // una vez
      otro = await ordenLibera(['--confirmo', idA], { cerrojo: () => a.cer, almacen: () => a, ahora: () => '2026-10-14T10:00:30.000Z', entorno: {} })   // paso 2 de Astra
      a.cer.filas.delete(RECURSO)                                                                                            // A desaparece (si el otro no lo borro ya)
      try { b = await publica({ almacen: a, cerrojo: a.cer, planes: [p], dueno: 'mercado-v1-publica', ahora, id: idB }) } catch (e) { b = { error: e.message } }
      a.cer.pon(RECURSO, ficha(idB))                                                                                         // y B vuelve a tener el cerrojo cuando llega el DELETE de R1
    }
    return ret
  }
  const release = await ordenLibera(['--confirmo', idA], { cerrojo: () => a.cer, almacen: () => a, ahora: () => ahora, entorno: {} })
  ver('control: el otro liberador libera A (codigo 0) y B publica', otro?.codigo === 0 && b?.estado === 'publicado', JSON.stringify({ otro: otro?.lineas.at(-1), b: b?.estado ?? b?.error }))
  oraculo('E2R2-03', 'liberador conserva la exclusion de B: todo lo que B escribe lo escribe con su cerrojo, y el DELETE de R1 (dueño A) no borra el de B', escrituras.filter(([k]) => !k.startsWith('v1/_')).every(([, o]) => o === idB) && a.cer.filas.get(RECURSO)?.dueno === idB, JSON.stringify({ escrituras: escrituras.map(([k, o]) => `${k.split('/').pop().slice(0, 12)} ${o?.slice(0, 8)}`), cerrojo: a.cer.filas.get(RECURSO) }))
  oraculo('E2R2-03', 'y R1 lo cuenta: codigo 0, el de A ya no estaba al borrar', release.codigo === 0 && /ya no estaba/.test(release.lineas.join(' ')), JSON.stringify(release.lineas.slice(-2)))
}

titulo('E2R2-04 · descripcion ajena')
const leak = store(); leak.cer.pon(RECURSO, ficha(idA, 'FUGA123'))
const lr = await ordenLibera([], { cerrojo: () => leak.cer, almacen: () => leak, ahora: () => ahora, entorno: {} })
oraculo('E2R2-04', 'descripcion ajena no se vuelca literalmente', !lr.lineas.join(' ').includes('FUGA123'), lr.lineas)

titulo('E2R2-05 · corregir un corto publicado sin dias nuevos')
const cambiado = texto + JSON.stringify({ ...corto, velas: 100 }) + '\n'
const siguiente = planificaPar({ par: 'EURUSD', velas, texto: cambiado, anterior: p.manifiesto })
oraculo('E2R2-05', 'corregir corto publicado sin nuevos dias es incidente', siguiente.estado === 'incidente', { estado: siguiente.estado, incidente: siguiente.incidente, retenido: siguiente.retenido })
const st = store(); await publica({ almacen: st, cerrojo: st.cer, planes: [p], dueno: 'mercado-v1-publica', ahora })
const txtV = anota(texto, p.publicacion) + JSON.stringify({ ...corto, velas: 100 }) + '\n'
const verificado = await verifica({ almacen: st, texto: txtV, velasDe: async () => velas, diasAceptadosDe: () => new Map() })
oraculo('E2R2-05', 'verificador detecta correccion publicada aunque no haya dias nuevos', verificado.problemas.length > 0, verificado)
const sinCambio = await verifica({ almacen: st, texto: anota(texto, p.publicacion), velasDe: async () => velas, diasAceptadosDe: () => new Map() })
ver('control: sin la correccion, el verificador no ve nada', sinCambio.problemas.length === 0, sinCambio.problemas)

titulo('E2R2-04 · el script de confirmacion con un listado que no es JSON')
mkdirSync(REPO + '.pruebas', { recursive: true })
writeFileSync(REPO + '.pruebas/listado-sintetico-invalido.json', 'FUGA123')
const cli = spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', 'scripts/mercado-v1-confirma-copia.mjs', '--consulta-autorizada', '--listado', '.pruebas/listado-sintetico-invalido.json', '--copia', 'inventada'], { cwd: REPO, encoding: 'utf8', env: { PATH: process.env.PATH } })
oraculo('E2R2-04', 'script confirma-copia no vuelca JSON ajeno al fallar', !(cli.stdout + cli.stderr).includes('FUGA123'), { exit: cli.status, stderr: cli.stderr })
ver('control: y dice que el listado no es JSON, codigo 3', cli.status === 3 && /listado_ilegible/.test(cli.stdout), cli.stdout)
fin()
