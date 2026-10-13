// lib/mercado/copia-v1.mjs — CONFIRMAR, SIN DESCARGARLA, que la copia local de
// los anuales de forex-data sigue siendo lo vigente (etapa 2; CTO 14-oct,
// decision 1, opcion a: 2024–2025 se usan de la copia del 5-oct si info()
// confirma tamaño y fecha del 20-jul; si alguno no coincide, se para y se avisa).
//
// confirmaCopia({ pares, anios, info, listado, copia, dia }):
//   info(par, anio) → { estado: 'ok', ruta, size, fechas: { campo: valor } } | { estado: 'no-existe' } | { estado: 'error', motivo }
//   listado         el del 4-oct: [{ ruta, bytes, actualizado }]
//   copia(nombre)   → { bytes, shaOk } | null   (PAR_AAAA.json y su .sha256)
//   dia             el dia de la ultima actualizacion segun el listado ('2026-07-20')
// Por anual: lo vigente es la ruta del listado; size = bytes del listado = bytes
// de la copia; alguna fecha de info() cae en «dia» (sin fechas: no comprobado);
// la copia cuadra con su .sha256. → { lineas, fallos, confirmados }
export async function confirmaCopia({ pares, anios, info, listado, copia, dia }) {
  const lineas = [], fallos = [], confirmados = []
  const porRuta = new Map(listado.map(x => [x.ruta, x]))
  const falla = m => { fallos.push(m); lineas.push(`✗ ${m}`) }
  for (const par of pares) for (const anio of anios) {
    const ruta = `${par}/M1/${anio}.json`, nombre = `${par}_${anio}.json`, l = porRuta.get(ruta)
    if (!l) { falla(`${par} ${anio}: ${ruta} no esta en el listado del 4-oct`); continue }
    const i = await info(par, anio)
    if (i.estado === 'no-existe') { falla(`${par} ${anio}: no existe en Storage`); continue }
    if (i.estado !== 'ok') { falla(`${par} ${anio}: info() no se pudo leer (${i.motivo})`); continue }
    if (i.ruta !== ruta) { falla(`${par} ${anio}: lo vigente es ${i.ruta}, no ${ruta}`); continue }
    const fechas = Object.entries(i.fechas ?? {}).filter(([, v]) => typeof v === 'string' && !Number.isNaN(Date.parse(v)))
    const textoFechas = fechas.map(([k, v]) => `${k}=${v}`).join(', ') || '(ninguna)'
    if (i.size !== l.bytes) { falla(`${par} ${anio}: tamaño en Storage ${i.size}, en el listado del 4-oct ${l.bytes}`); continue }
    if (!fechas.length) { falla(`${par} ${anio}: info() sin fecha: no se puede comprobar que siga siendo la del ${dia}`); continue }
    const exacta = fechas.find(([, v]) => Date.parse(v) === Date.parse(l.actualizado))
    const mismoDia = fechas.find(([, v]) => new Date(Date.parse(v)).toISOString().slice(0, 10) === dia)
    if (!mismoDia) { falla(`${par} ${anio}: ninguna fecha de info() es del ${dia} (${textoFechas}; listado ${l.actualizado})`); continue }
    const c = await copia(nombre)
    if (!c) { falla(`${par} ${anio}: no esta la copia local ${nombre}`); continue }
    if (c.bytes !== l.bytes) { falla(`${par} ${anio}: la copia local ${nombre} mide ${c.bytes} y Storage ${l.bytes}`); continue }
    if (!c.shaOk) { falla(`${par} ${anio}: la copia local ${nombre} no cuadra con su .sha256`); continue }
    confirmados.push({ par, anio, nombre, bytes: l.bytes })
    lineas.push(`${par} ${anio}: ${ruta} · ${l.bytes} bytes (Storage = listado = copia) · fecha ${exacta ? `identica al ms (${exacta[0]})` : `mismo dia ${dia} (${mismoDia[0]})`} · fechas de info(): ${textoFechas} · sha256 de la copia: ok`)
  }
  return { lineas, fallos, confirmados }
}
