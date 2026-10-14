/**
 * LAS CONTRAPRUEBAS NODE DE ASTRA DE LA ETAPA 2, RONDA 2 (revision de cd99f06,
 * 14-oct: revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r2.md, E2R2-03..05),
 * llevadas a pruebas/ como permanentes (CTO 14-oct). Original, sin tocar:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-r2-evidencias/node-adversario.mjs
 * (las de SQL, E2R2-01 y E2R2-02, van en pruebas/mercado-001-bucket.mjs).
 *
 * Las condiciones de los oraculos son las de Astra, salvo una (y lo que cambia
 * son las rutas y el sitio del fichero sintetico del script, .pruebas/):
 *   · E2R2-03: el disparador de Astra tal cual (durante la constancia, el cerrojo
 *     A desaparece y aparece el B) y su oraculo literal («B se conserva»)
 *     NO SE PUEDEN CUMPLIR: Storage no tiene borrado condicional (lo dice ella).
 *     El CTO (14-oct) eligio la congelacion: la garantia es que B, que toma el
 *     cerrojo con la congelacion puesta, NO ESCRIBE NADA. Aqui: el disparador de
 *     Astra con B como un publicador real (publica), su oraculo (B conserva la
 *     exclusion: no se escribe nada sin ella) y el del CTO. Y el otro liberador
 *     del paso 2 de Astra, real: con la congelacion puesta, no arranca.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
const { planificaPar } = await importa('lib/mercado/publicador-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const { MOTIVO_CORTO, anota } = await importa('lib/mercado/aceptaciones.mjs')
const { ordenLibera } = await importa('lib/mercado/liberar-v1.mjs')
const { publica, CERROJO, PUNTERO } = await importa('lib/mercado/publica-v1.mjs')
const { verifica } = await importa('lib/mercado/verifica-v1.mjs')
const idA = '11111111-2222-4333-8444-555555555555', idB = '22222222-3333-4444-8555-666666666666'
const ahora = '2026-10-14T10:00:00.000Z'
const ficha = (id = idA, dueno = 'mercado-v1-publica') => Buffer.from(JSON.stringify({ id, dueno, desde: ahora }))
function store() { const o = new Map(); return { o, async lee(k) { return o.has(k) ? Buffer.from(o.get(k)) : null }, async sube(k, b, { upsert } = {}) { if (o.has(k) && !upsert) return 'existe'; o.set(k, Buffer.from(b)); return 'ok' }, async borra(k) { o.delete(k) }, async lista() { return [...o].map(([ruta, b]) => ({ ruta, bytes: b.length })) } } }
const U = s => Date.parse(s) / 1000
const velas = []; for (let t = U('2025-12-21T00:00Z'); t < U('2025-12-30T00:00Z'); t += 60) { if (minutoCerrado(t) || (t >= U('2025-12-24T22:00Z') && t < U('2025-12-25T22:00Z'))) continue; velas.push({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }) }
const ac = { tipo: 'aceptacion', par: 'EURUSD', inicio: '2025-12-24T22:00Z', minutos: 1440, motivo: 'festivo', fecha: '2026-10-14', nota: 'sintetica' }
const corto = { tipo: 'corto', par: 'EURUSD', dia: '2025-12-25', velas: 120, motivo: MOTIVO_CORTO, fecha: '2026-10-14', nota: 'sintetica' }
const texto = [ac, corto].map(x => JSON.stringify(x) + '\n').join('')
const p = planificaPar({ par: 'EURUSD', velas, texto })
ver('control: el plan sintetico publica', p.estado === 'publica', p.estado)
// lo que escribe un publicador: todo lo que no es cerrojo, congelacion ni constancia
const escritoPorPublicador = s => [...s.o.keys()].filter(k => k !== CERROJO && !k.startsWith('v1/_'))

titulo('E2R2-03 · el intercalado de Astra: durante la constancia, A desaparece y un publicador B toma el cerrojo')
{
  const a = store(); a.o.set(CERROJO, ficha())
  const sub = a.sube; let b = null, otro = null, disparado = false
  a.sube = async (k, bytes, opts) => {
    const ret = await sub(k, bytes, opts)
    if (k.startsWith('v1/_liberados/') && !disparado) {
      disparado = true                                                                                      // una vez (sin congelacion, el otro liberador volveria a pasar por aqui)
      otro = await ordenLibera(['--confirmo', idA], { almacen: () => a, ahora: () => ahora, entorno: {} })   // paso 2 de Astra: otro liberador autorizado
      a.o.delete(CERROJO)                                                                                   // A desaparece (su dueño, o quien sea)
      try { b = await publica({ almacen: a, planes: [p], dueno: 'mercado-v1-publica', ahora, id: idB }) } catch (e) { b = { error: e.message } }
    }
    return ret
  }
  const release = await ordenLibera(['--confirmo', idA], { almacen: () => a, ahora: () => ahora, entorno: {} })
  ver('control: el otro liberador no arranca (hay congelacion) y no toca nada', otro?.codigo === 1 && /congelacion/.test(otro.lineas.join(' ')), JSON.stringify(otro?.lineas.at(-1)))
  oraculo('E2R2-03', 'liberador conserva la exclusion de B: B, que tomo el cerrojo durante la liberacion, no publica ni escribe nada', !!b?.error && /congelado/.test(b.error) && escritoPorPublicador(a).length === 0 && !a.o.has(PUNTERO), JSON.stringify({ b, escrito: escritoPorPublicador(a) }))
  oraculo('E2R2-03', 'y al final: ni cerrojo ni congelacion; el liberador lo cuenta (codigo 0)', release.codigo === 0 && !a.o.has(CERROJO) && !a.o.has('v1/_congelado'), JSON.stringify(release.lineas))
}

titulo('E2R2-04 · descripcion ajena')
const leak = store(); leak.o.set(CERROJO, ficha(idA, 'FUGA123'))
const lr = await ordenLibera([], { almacen: () => leak, ahora: () => ahora, entorno: {} })
oraculo('E2R2-04', 'descripcion ajena no se vuelca literalmente', !lr.lineas.join(' ').includes('FUGA123'), lr.lineas)

titulo('E2R2-05 · corregir un corto publicado sin dias nuevos')
const cambiado = texto + JSON.stringify({ ...corto, velas: 100 }) + '\n'
const siguiente = planificaPar({ par: 'EURUSD', velas, texto: cambiado, anterior: p.manifiesto })
oraculo('E2R2-05', 'corregir corto publicado sin nuevos dias es incidente', siguiente.estado === 'incidente', { estado: siguiente.estado, incidente: siguiente.incidente, retenido: siguiente.retenido })
const st = store(); await publica({ almacen: st, planes: [p], dueno: 'mercado-v1-publica', ahora })
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
