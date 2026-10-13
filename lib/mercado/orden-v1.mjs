// lib/mercado/orden-v1.mjs — las ORDENES de los scripts del mercado v1 (etapa
// 2; diseño sim-004 p.9), con las dependencias inyectadas para probarlas sin
// red. Los scripts (scripts/mercado-v1-publica.mjs, -verifica.mjs) solo
// construyen las dependencias reales.
//
//   publica  --base DIR | --descarga-autorizada   [--pares A,B] [--informe RUTA]
//            [--vigente] [--publica [--anota]]
//     SIMULACRO POR DEFECTO: sin --publica no escribe en Storage. Sin
//     --vigente ni siquiera lo lee (planifica como primera publicacion); con
//     --vigente lee el puntero con un almacen de SOLO LECTURA.
//     --descarga-autorizada lee los anuales de forex-data (regla del CTO del
//     5-oct: hasta el 2-nov, ninguno sin su si); --base, la copia local.
//     --anota (con --publica): añade al fichero de aceptaciones las
//     publicaciones (entra por commit).
//   verifica [--base DIR | --descarga-autorizada] [--pares A,B]
//     SOLO LECTURA. Sin datos con que comparar: «no comprobado» (codigo 3).
// Codigos: 0 bien · 1 incidente o problema · 3 algo sin comprobar o que no se
// pudo hacer · 4 uso.
//
// deps: { leeCopia(base, par), descarga(par), almacen(), leeTexto(),
//         escribeTexto(t), escribeInforme(ruta, t), diasAceptadosDe(par), ahora() }
// BF-02: las dependencias lanzan errores YA SANEADOS (scripts/mercado-v1-
// dependencias.mjs); los mensajes de lib/ son propios (rutas, dias, huellas).
import { planificaPar, informe, resumen } from './publicador-v1.mjs'
import { publica, leePuntero, leeManifiesto } from './publica-v1.mjs'
import { verifica } from './verifica-v1.mjs'
import { anota } from './aceptaciones.mjs'

export const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']

// un almacen que solo lee: subir o borrar lanzan
export const soloLectura = a => ({
  lee: r => a.lee(r), lista: p => a.lista(p),
  sube: async () => { throw new Error('solo lectura: no se sube nada') },
  borra: async () => { throw new Error('solo lectura: no se borra nada') },
})

function analiza(args, banderas, conValor) {
  const o = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (banderas.includes(a)) o[a] = true
    else if (conValor.includes(a) && i + 1 < args.length && !String(args[i + 1]).startsWith('--')) o[a] = args[++i]
    else o._.push(a)
  }
  return o
}
function paresDe(o) {
  if (!o['--pares']) return PARES
  const l = String(o['--pares']).toUpperCase().split(',').filter(Boolean)
  return l.length && l.every(p => PARES.includes(p)) ? l : null
}
async function datosDe(o, deps, par) {
  return o['--base'] ? deps.leeCopia(o['--base'], par) : deps.descarga(par)
}

export async function ordenPublica(args, deps) {
  const lineas = [], log = l => lineas.push(l)
  const o = analiza(args, ['--descarga-autorizada', '--vigente', '--publica', '--anota'], ['--base', '--pares', '--informe'])
  const pares = paresDe(o)
  const uso = 'Uso: node scripts/mercado-v1-publica.mjs --base DIR | --descarga-autorizada [--pares EURUSD,GBPUSD] [--informe RUTA] [--vigente] [--publica [--anota]]'
  if (o._.length || !pares || !!o['--base'] === !!o['--descarga-autorizada'] || (o['--anota'] && !o['--publica'])) {
    log(uso); log('=== ⚠️ ATENCION: no se ha pedido nada (codigo 4) ==='); return { codigo: 4, lineas }
  }
  const modo = o['--publica'] ? 'PUBLICACION' : 'SIMULACRO (no se escribe nada en Storage)'
  log(`=== MERCADO V1 · ${modo} · ${pares.length} par(es) · ${deps.ahora()} ===`)
  let alm = null
  if (o['--publica']) alm = deps.almacen()
  else if (o['--vigente']) alm = soloLectura(deps.almacen())
  else log('sin --vigente: no se lee Storage; se planifica como primera publicacion')
  try {
    const texto = await deps.leeTexto()
    const puntero = alm ? await leePuntero(alm) : null
    const planes = []
    for (const par of pares) {
      let velas
      try { velas = await datosDe(o, deps, par) } catch (e) { log(`${par}: no se pudieron leer los datos (${e?.message})`); log('=== ⚠️ ATENCION: datos ilegibles (codigo 3) ==='); return { codigo: 3, lineas } }
      const e = puntero?.pares?.[par]
      const anterior = e ? await leeManifiesto(alm, e.ruta, e.huella) : null
      const p = planificaPar({ par, velas, texto, anterior, diasAceptados: deps.diasAceptadosDe(par) })
      planes.push(p)
      log(resumen(p))
    }
    if (o['--informe']) { await deps.escribeInforme(o['--informe'], informe(planes, { generado: deps.ahora() })); log(`informe: ${o['--informe']}`) }
    const incidentes = planes.filter(p => p.estado === 'incidente')
    if (incidentes.length) { log(`=== ⚠️ INCIDENTE en ${incidentes.map(p => p.par).join(', ')}: no se publica nada (codigo 1) ===`); return { codigo: 1, lineas, planes } }
    if (!o['--publica']) { log('=== ✓ SIMULACRO terminado: nada escrito en Storage (codigo 0) ==='); return { codigo: 0, lineas, planes } }
    const r = await publica({ almacen: alm, planes, dueno: `mercado-v1-publica ${deps.ahora()}`, ahora: deps.ahora() })
    if (r.estado === 'nada') { log('=== ✓ nada nuevo que publicar (codigo 0) ==='); return { codigo: 0, lineas, planes } }
    for (const x of r.pares) log(`publicado ${x.par} ${x.version} (${x.nuevos} trozos nuevos) ${x.huella}`)
    const pubs = planes.map(p => p.publicacion).filter(Boolean)
    if (o['--anota'] && pubs.length) {
      let t = texto
      for (const reg of pubs) t = anota(t, reg)
      await deps.escribeTexto(t)
      log(`anotadas ${pubs.length} publicacion(es) en lib/mercado/huecos-aceptados.jsonl: entran por commit`)
    } else if (pubs.length) log(`hay ${pubs.length} publicacion(es) sin anotar: repetir con --anota no vuelve a publicar; o añadirlas a mano por commit`)
    log('=== ✓ PUBLICADO (codigo 0) ===')
    return { codigo: 0, lineas, planes }
  } catch (e) {
    log(`error: ${e?.message}`)
    log(`=== ⚠️ ATENCION: no terminado (codigo ${/incidente/.test(e?.message ?? '') ? 1 : 3}) ===`)
    return { codigo: /incidente/.test(e?.message ?? '') ? 1 : 3, lineas }
  }
}

export async function ordenVerifica(args, deps) {
  const lineas = [], log = l => lineas.push(l)
  const o = analiza(args, ['--descarga-autorizada'], ['--base', '--pares'])
  const pares = paresDe(o)
  if (o._.length || !pares || (o['--base'] && o['--descarga-autorizada'])) {
    log('Uso: node scripts/mercado-v1-verifica.mjs [--base DIR | --descarga-autorizada] [--pares EURUSD,GBPUSD]')
    log('=== ⚠️ ATENCION: no se ha pedido nada (codigo 4) ==='); return { codigo: 4, lineas }
  }
  log(`=== MERCADO V1 · VERIFICACION (solo lectura) · ${deps.ahora()} ===`)
  try {
    const alm = soloLectura(deps.almacen())
    const texto = await deps.leeTexto()
    const conDatos = o['--base'] || o['--descarga-autorizada']
    const r = await verifica({
      almacen: alm, texto,
      velasDe: async par => (!pares.includes(par) || !conDatos ? null : datosDe(o, deps, par)),
      diasAceptadosDe: deps.diasAceptadosDe,
    })
    for (const [par, x] of Object.entries(r.pares)) log(`${par}: ${x.version}, cadena de ${x.cadena}, ${x.dias} dias, ${x.bytes} bytes`)
    log(`bytes de los trozos vigentes: ${r.bytes}`)
    for (const p of r.problemas) log(`✗ ${p}`)
    for (const a of r.avisos) log(`⚠️ ${a}`)
    const codigo = r.problemas.length ? 1 : r.avisos.length ? 3 : 0
    log(codigo === 0 ? '=== ✓ TODO OK (codigo 0) ===' : `=== ⚠️ ATENCION: ${codigo === 1 ? 'hay problemas' : 'algo no se pudo comprobar'} (codigo ${codigo}) ===`)
    return { codigo, lineas }
  } catch (e) {
    log(`error: ${e?.message}`); log('=== ⚠️ ATENCION: no se pudo verificar (codigo 3) ==='); return { codigo: 3, lineas }
  }
}
