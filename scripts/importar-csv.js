// PLAN B: IMPORTAR UN DIA DE VELAS M1 BID DESDE UN CSV DESCARGADO A MANO
// (CTO, 7-oct-2026: el proveedor responde 429 desde casa y desde Actions).
// Instrucciones para descargar el CSV: revisiones/2026-10-07-plan-b-csv.md.
//
//   node scripts/importar-csv.js --par EURUSD --dia 2026-07-20 --csv FICHERO.csv
//        [--subir --subida-autorizada] [--objetivo EURUSD:2026-07-20,...]
//
// Valida el CSV de UN dia y UN par y, con --subir, lo publica por la funcion
// comun (lib/mercado/ficheros.mjs publicarAnio: cerrojo, relectura, validacion
// y verificacion). Sin --subir, en SECO: valida y dice que haria. --subir solo
// con --subida-autorizada (CTO, 7-oct: bloqueado hasta que Astra lo verifique).
//   · formato: cabecera «Gmt time,Open,High,Low,Close,Volume» y fechas
//     «dd.mm.aaaa HH:MM:SS.mmm» (el export web, SIN COMPROBAR contra un fichero
//     real), o «timestamp,open,high,low,close,volume» en milisegundos. «Local
//     time» o cualquier otra cabecera: rechazado (la zona tiene que ser UTC);
//   · fecha y hora de cada fila por rangos y por ida y vuelta (23:60, 24:00 o
//     el 50 de junio: rechazados, no normalizados);
//   · cada fila del dia pedido (UTC), en minutos enteros, estrictamente
//     crecientes: como mucho 1.440; OHLC numerico, positivo y coherente;
//   · velas planas con volumen 0 (O=H=L=C): fuera, como ignoreFlats del
//     actualizador;
//   · precio plausible para el par: la mediana del cierre a menos de un 10 %
//     del ultimo cierre guardado antes de ese dia (descarta el CSV de otro par);
//   · cada extremo a ≤ 2 % del cierre anterior y a ≤ 10 % del ultimo guardado
//     (CSV-02); si no, el CSV entero se rechaza;
//   · solo repara un dia con velas guardadas, interior o el ultimo: nunca
//     extiende el historico (CSV-03), antes y bajo el cerrojo;
//   · reparar nunca cambia ni borra una vela guardada (C6-01): el CSV trae
//     todos los minutos guardados del dia, con OHLC a ≤ 1 pip; se publican
//     las guardadas tal cual + los minutos nuevos (antes y bajo el cerrojo).
// Al terminar dice por cada objetivo (por defecto, el dia importado) si quedo
// completo (calidad.estadoDia, con la lista de dias aceptados).
// Codigos: 0 bien · 1 no publicado, objetivo incompleto o cerrojo · 4 entrada no
// valida (tambien si el CSV no casa con lo guardado, aunque sea bajo el cerrojo).
// Clave por nombre (como el resto de scripts), nunca impresa. MERCADO_GZIP: sin tocar.
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const SUBIR = process.argv.includes('--subir')
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
const fechaOk = f => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return false; const t = Date.parse(f + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === f }   // MER-R2: 2026-13-01 o 99-99 sin RangeError

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

const para = (motivo, codigo = 4) => { const e = new Error(motivo); e.propio = true; e.codigoSalida = codigo; return e }

// CSV → velas { time (s), open, high, low, close, volume }, del dia pedido
function leeCsv(texto, dia) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
  if (!lineas.length) throw para('el CSV esta vacio')
  const cab = lineas[0].split(',').map(x => x.trim().toLowerCase())
  const gmt = cab.join(',') === 'gmt time,open,high,low,close,volume'
  const ms = cab.join(',') === 'timestamp,open,high,low,close,volume'
  if (!gmt && !ms) throw para(`cabecera no reconocida («${lineas[0].slice(0, 60)}»): hace falta «Gmt time,Open,High,Low,Close,Volume» (hora UTC) o «timestamp,open,high,low,close,volume»`)
  const d0 = Date.parse(dia + 'T00:00:00Z') / 1000
  const velas = []
  for (const [i, l] of lineas.slice(1).entries()) {
    const c = l.split(',').map(x => x.trim())
    if (c.length !== 6) throw para(`fila ${i + 2}: no tiene 6 columnas`)
    let t
    if (gmt) {
      const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/.exec(c[0])
      if (!m) throw para(`fila ${i + 2}: fecha no es «dd.mm.aaaa HH:MM:SS.mmm» (UTC)`)
      if (m[6] !== '00' || (m[7] && m[7] !== '000')) throw para(`fila ${i + 2}: no es un minuto entero`)
      // CSV-01 (Astra, cierres-5): rangos y vuelta exacta; Date.UTC normaliza
      // 23:60, 24:00 o el 50 de junio en silencio
      const [D, Mo, A, H, Mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]]
      t = Date.UTC(A, Mo - 1, D, H, Mi) / 1000
      const f = new Date(t * 1000)
      if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || H > 23 || Mi > 59 || f.getUTCFullYear() !== A || f.getUTCMonth() !== Mo - 1 || f.getUTCDate() !== D || f.getUTCHours() !== H || f.getUTCMinutes() !== Mi) throw para(`fila ${i + 2}: fecha u hora inexistente («${c[0]}»)`)
    } else {
      const n = Number(c[0])
      if (!Number.isInteger(n) || n % 60000 !== 0) throw para(`fila ${i + 2}: timestamp no es un minuto entero en milisegundos`)
      t = n / 1000
    }
    if (t < d0 || t >= d0 + 86400) throw para(`fila ${i + 2}: no es del ${dia} (UTC)`)
    const [o, h, lo, cl, v] = c.slice(1).map(Number)
    if (![o, h, lo, cl].every(x => Number.isFinite(x) && x > 0) || !Number.isFinite(v) || v < 0) throw para(`fila ${i + 2}: OHLC o volumen no numerico`)
    if (lo > Math.min(o, cl) || h < Math.max(o, cl) || lo > h) throw para(`fila ${i + 2}: OHLC incoherente`)
    if (velas.length && t <= velas[velas.length - 1].time) throw para(`fila ${i + 2}: minuto repetido o desordenado`)
    velas.push({ time: t, open: o, high: h, low: lo, close: cl, volume: v })
  }
  if (velas.length > 1440) throw para(`${velas.length} minutos: un dia tiene como mucho 1.440`)
  const planas = velas.filter(x => x.volume === 0 && x.open === x.high && x.high === x.low && x.low === x.close)
  return { velas: velas.filter(x => !planas.includes(x)), planas: planas.length, todas: velas }
}

// CSV-02: umbrales de plausibilidad (fraccion). Un minuto de FX no se mueve un
// 2 %; un dia no se aleja un 10 % del cierre anterior (como la mediana).
const SALTO_MAX = 2, BANDA_MAX = 10           // en % (enteros)
// precios en ticks del par (enteros): 3 decimales los pares con JPY, 5 el resto
const DIGITOS = par => (par.endsWith('JPY') ? 3 : 5)
const PIP_TICKS = 10
let ticks = null                                // se fija con el par en main()
const mediana = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10)
const hm = t => new Date(t * 1000).toISOString().slice(11, 16)

async function main() {
  // ── entrada ──
  // CTO 7-oct (cierres-5): el importador no publica hasta que Astra lo verifique;
  // --subir exige una opcion explicita que autoriza el CTO
  if (SUBIR && !process.argv.includes('--subida-autorizada')) throw para('--subir esta bloqueado hasta que se verifique el importador: hace falta tambien --subida-autorizada (solo con autorizacion del CTO). En seco (sin --subir) se puede validar.')
  const par = String(arg('--par') || '').toUpperCase(), dia = arg('--dia'), ruta = arg('--csv')
  if (!PARES.includes(par) || !fechaOk(dia) || !ruta) throw para('uso: node scripts/importar-csv.js --par PAR --dia AAAA-MM-DD --csv FICHERO.csv [--subir] [--objetivo PAR:AAAA-MM-DD,...]')
  // CSV-04 (Astra, cierres-5): si se da --objetivo, tiene que traer al menos un
  // elemento y ninguno vacio (',' no puede convertirse en «sin objetivos»)
  const hayObjetivo = process.argv.includes('--objetivo'), valorObjetivo = arg('--objetivo')
  if (hayObjetivo && (valorObjetivo == null || String(valorObjetivo).startsWith('--'))) throw para('--objetivo sin valor: hace falta una lista PAR:AAAA-MM-DD,...')
  const objetivos = hayObjetivo ? String(valorObjetivo).split(',').map(x => x.trim()) : [`${par}:${dia}`]
  if (objetivos.some(x => !x)) throw para(`--objetivo «${String(valorObjetivo).slice(0, 80)}»: lista vacia o con elementos vacios`)
  for (const o of objetivos) { const m = /^([A-Z]{6}):(.+)$/.exec(o); if (!m || m[1] !== par || !fechaOk(m[2]) || m[2].slice(0, 4) !== dia.slice(0, 4)) throw para(`--objetivo ${o}: tiene que ser ${par}:AAAA-MM-DD del mismo año`) }
  if (!fs.existsSync(ruta)) throw para(`no existe el fichero ${path.basename(ruta)}`)
  ticks = x => Math.round(x * 10 ** DIGITOS(par))
  const { velas: nuevas, planas, todas } = leeCsv(fs.readFileSync(ruta, 'utf8'), dia)
  console.log(`CSV ${path.basename(ruta)}: ${nuevas.length} velas del ${dia}${planas ? ` (${planas} plana(s) con volumen 0, fuera)` : ''}${nuevas.length ? `, de ${hm(nuevas[0].time)} a ${hm(nuevas[nuevas.length - 1].time)} UTC` : ''}`)
  if (!nuevas.length) throw para('el CSV no trae ninguna vela (quitadas las planas)')

  const F = await import('../lib/mercado/ficheros.mjs')
  const C = await import('../lib/mercado/calidad.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  const ACEPTADOS = (await import('../lib/mercado/aceptados.mjs')).cargaAceptados()
  const { url, key } = getEnv()
  const sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  const anio = Number(dia.slice(0, 4))

  // ── lectura y plausibilidad del precio ──
  const leido = await F.leerConFirma(sb, par, anio, F.LIMITES)
  if (leido.estado === 'error') throw para(`no se pudo leer ${par} ${anio}: ${leido.motivo}`, 1)
  const guardadas = leido.estado === 'ok' ? leido.velas : []
  const previas = guardadas.filter(v => v.time < Date.parse(dia + 'T00:00:00Z') / 1000)
  const ultimoGuardado = previas.length ? previas[previas.length - 1].close : null
  // C6-08 (Astra, cierres-6): en ticks enteros, |x − ref| × 100 ≤ max × ref; el
  // valor exactamente igual al umbral pasa (sin errores de coma flotante).
  // C7-02 (cierres-7): la misma regla para la mediana.
  const fuera = (x, ref, max) => Math.abs(ticks(x) - ticks(ref)) * 100 > max * ticks(ref)
  if (ultimoGuardado != null) {
    const ref = ultimoGuardado, med = mediana(nuevas.map(v => v.close))
    if (fuera(med, ref, BANDA_MAX)) throw para(`precio no plausible para ${par}: mediana del CSV ${med} frente al ultimo cierre guardado ${ref} (¿es de otro par?)`)
  }
  // CSV-02 (Astra, cierres-5): la mediana no certifica cada fila. Cada extremo
  // (O, H, L, C) a ≤ SALTO_MAX del cierre anterior (la primera vela, del
  // ultimo cierre guardado) y a ≤ BANDA_MAX del ultimo cierre guardado. Lo
  // anomalo se rechaza ENTERO: se revisa a mano, no se publica.
  let anterior = ultimoGuardado
  for (const v of nuevas) {
    for (const [k, x] of [['open', v.open], ['high', v.high], ['low', v.low], ['close', v.close]]) {
      if (anterior != null && fuera(x, anterior, SALTO_MAX)) throw para(`vela ${hm(v.time)} UTC: ${k} ${x} salta mas de un ${SALTO_MAX} % frente al cierre anterior ${anterior}: CSV rechazado entero, revisalo`)
      if (ultimoGuardado != null && fuera(x, ultimoGuardado, BANDA_MAX)) throw para(`vela ${hm(v.time)} UTC: ${k} ${x} a mas de un ${BANDA_MAX} % del ultimo cierre guardado ${ultimoGuardado}: CSV rechazado entero, revisalo`)
    }
    anterior = v.close
  }
  const delDia = g => (g || []).filter(v => ymd(v.time) === dia)
  // CSV-03 (Astra, cierres-5; CTO 7-oct): solo se repara un dia que YA tiene
  // velas guardadas y no es posterior al ultimo dia guardado (interior o el
  // ultimo). Nunca se extiende el historico: un hueco detras (domingo vacio,
  // ultimo dia a medias) no se salta (la barrera de M-01). Antes de publicar y
  // otra vez bajo el cerrojo, sobre lo releido.
  const noReparable = g => {
    const ultimo = g?.length ? ymd(g[g.length - 1].time) : null
    if (!ultimo || dia > ultimo) return `el ${dia} va despues del ultimo dia guardado (${ultimo ?? 'ninguno'}): el importador no extiende el historico`
    if (!delDia(g).length) return `el ${dia} no tiene velas guardadas: el importador solo repara dias interiores ya existentes o el ultimo`
    return null
  }
  // C6-01 (Astra, cierres-6; CTO 7-oct): reparar nunca cambia ni borra una vela
  // guardada. El CSV trae TODOS los minutos guardados del dia (planas incluidas)
  // y en ellos su OHLC coincide con lo guardado a ≤ 1 pip (el volumen no se
  // compara). Se publican las guardadas TAL CUAL mas los minutos nuevos.
  const csvPorMinuto = new Map(todas.map(v => [v.time, v]))
  const discrepa = g => {
    for (const s of delDia(g)) {
      const c = csvPorMinuto.get(s.time)
      if (!c) return `el CSV no trae el minuto guardado ${hm(s.time)} UTC: reparar no puede borrar velas`
      for (const k of ['open', 'high', 'low', 'close']) if (Math.abs(ticks(c[k]) - ticks(s[k])) > PIP_TICKS) return `minuto ${hm(s.time)} UTC: ${k} del CSV ${c[k]} frente a ${s[k]} guardado (mas de 1 pip): reparar no puede cambiar velas`
    }
    return null
  }
  const pre = noReparable(guardadas)
  if (pre) throw para(pre)
  const preDiscrepa = discrepa(guardadas)
  if (preDiscrepa) throw para(preDiscrepa)
  let bajoCerrojo = null, bajoCerrojoCodigo = 1
  const componer = g => {
    bajoCerrojo = noReparable(g); bajoCerrojoCodigo = 1
    if (bajoCerrojo) return null
    bajoCerrojo = discrepa(g); bajoCerrojoCodigo = 4                          // C6-01, otra vez sobre lo releido
    if (bajoCerrojo) return null
    const guardadasDia = delDia(g), tiene = new Set(guardadasDia.map(v => v.time))
    const nuevos = nuevas.filter(v => !tiene.has(v.time))
    if (!nuevos.length) return null                                           // nada nuevo que añadir
    return [...(g || []).filter(v => ymd(v.time) !== dia), ...guardadasDia, ...nuevos].sort((a, b) => a.time - b.time)
  }
  const antes = delDia(guardadas).length
  let final = guardadas, codigo = 0
  if (!SUBIR) {
    const previsto = componer(guardadas)
    if (!previsto) { console.log(`[SECO] no se publicaria: el CSV no trae minutos nuevos (${nuevas.length} velas; lo guardado del ${dia} tiene ${antes})`); codigo = 1 }
    else {
      const v = C.validaParaPublicar(previsto, leido.estado === 'ok' ? guardadas : null, { anio })
      console.log(`[SECO] ${v.ok ? 'publicaria' : 'NO publicaria'} ${par} ${dia}: ${antes} → ${delDia(previsto).length} velas${v.ok ? '' : ` — ${v.problemas.join(' · ')}`}`)
      if (!v.ok) codigo = 1
      else final = previsto
    }
  } else {
    const r = await F.publicarAnio(sb, { pair: par, year: anio, componer, dueno: 'importar-csv', previo: leido })
    const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
    if (r.estado === 'publicado') { console.log(`✓ PUBLICADO ${par} ${dia}: ${antes} → ${delDia(r.final).length} velas, verificado${avisos}`); final = r.final }
    else if (r.estado === 'sin-cambios' && bajoCerrojo) { console.log(`✗ NO PUBLICADO ${par} ${dia}: al releer bajo el cerrojo, ${bajoCerrojo}`); final = r.final ?? guardadas; codigo = bajoCerrojoCodigo }
    else if (r.estado === 'sin-cambios') { console.log(`✗ NO PUBLICADO ${par} ${dia}: el CSV no trae minutos nuevos frente a lo guardado`); final = r.final ?? guardadas; codigo = 1 }
    else { console.log(`✗ PUBLICACION ${r.estado} ${par} ${dia}: ${r.problemas.join(' · ')}${avisos}`); codigo = 1 }
  }

  // ── objetivos ──
  console.log(`\n=== OBJETIVOS${SUBIR ? '' : ' (en seco: como quedaria)'} ===`)
  for (const o of objetivos) {
    const d = o.slice(7), vd = (final || []).filter(v => ymd(v.time) === d)
    const ok = C.estadoDia(d, vd, ACEPTADOS.get(`${par}|${d}`)?.velas ?? null) !== 'pendiente'
    console.log(`  ${par} ${d}: ${ok ? '✓ completo' : '✗ incompleto'} · ${vd.length} velas${vd.length ? ` · ultima ${hm(vd[vd.length - 1].time)}` : ''}`)
    if (!ok && codigo === 0) codigo = 1
  }
  if (codigo === 0) console.log(`\n=== ✓ TODO OK — ${SUBIR ? 'publicado y verificado' : 'en seco: el CSV es valido y mejora lo guardado'} ===`)
  else console.log(`\n=== ⚠️ ATENCION: ${SUBIR ? 'no publicado o incompleto' : 'en seco: no se publicaria o quedaria incompleto'} (codigo ${codigo}) ===`)
  process.exitCode = codigo
}

main().catch(async e => {
  const E = await import('../lib/mercado/errores.mjs').catch(() => null)
  console.log(`✗ ${E ? E.texto(e) : 'Error'}`)
  console.log(`\n=== ⚠️ ATENCION: no se ha publicado nada (codigo ${e?.codigoSalida ?? 4}) ===`)
  process.exitCode = e?.codigoSalida ?? 4
})
