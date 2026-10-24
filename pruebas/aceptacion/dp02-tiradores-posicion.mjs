/**
 * DP02 · LOS TIRADORES DEL DIBUJO DE POSICION, SIN NAVEGADOR (ordenes 1-105 y 1-110 del CTO; la prueba de navegador es
 * pruebas/navegador/dp01-tiradores-posicion.mjs, con el turno). La clase que registra la app
 * (components/posicionTradingView.js sobre la del plugin de vendor/) con una serie doble (minMove 0,00001):
 *   · los cuatro tiradores salen donde dice Ramon: circulo a la izquierda de la entrada, SL y TP a la izquierda,
 *     cuadrado a la derecha de la entrada
 *   · cada tirador mueve SOLO lo suyo, en largo y en corto (lo que llega a setPoint es el punto del raton, con su
 *     hora y su precio: la mano nunca va recta)
 *   · los tres puntos guardados no cambian de forma (los dibujos ya guardados se abren igual)
 * Contra 785d9a8 (sin components/posicionTradingView.js) sale en rojo.
 */
import { oraculo, ver, fin, importa } from '../lib.mjs'
const M = await importa('components/posicionTradingView.js').catch(() => null)
// los de vendor/, como la app (alias de next.config.js): el long-short se carga con su import del core apuntando al de vendor
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { REPO } from '../lib.mjs'
const CORE_URL = pathToFileURL(REPO + 'vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js').href
const CORE = await import(CORE_URL).catch(e => e)
mkdirSync(REPO + '.pruebas', { recursive: true })
writeFileSync(REPO + '.pruebas/dp02-long-short.mjs', readFileSync(REPO + 'vendor/lightweight-charts-line-tools-long-short-position/dist/lightweight-charts-line-tools-long-short-position.js', 'utf8')
  .replace(/from 'lightweight-charts-line-tools-core'/, `from '${CORE_URL}'`))
const LS = await import(pathToFileURL(REPO + '.pruebas/dp02-long-short.mjs').href).catch(e => e)
ver('control: el plugin de vendor y su core cargan', !!LS?.LineToolLongShortPosition && !!CORE?.AnchorPoint, String(LS?.message ?? CORE?.message ?? ''))
if (!M?.clasePosicion) { for (let i = 0; i < 12; i++) oraculo('DP02', `caso ${i}: sin components/posicionTradingView.js no hay tiradores como TradingView`, false, 'no esta'); fin() }
const Clase = M.clasePosicion(LS.LineToolLongShortPosition, { AnchorPoint: CORE.AnchorPoint, PaneCursorType: CORE.PaneCursorType })

// una herramienta ya creada y soltada, sin grafico: solo lo que usan setPoint y la normalizacion del plugin
function herramienta(entry, sl, tp, t0 = 1000, t1 = 5000) {
  const h = Object.create(Clase.prototype)
  Object.assign(h, { _points: [{ timestamp: t0, price: entry }, { timestamp: t1, price: sl }, { timestamp: t1, price: tp }],
    _clickCount: 2, _isLong: entry > sl, _flipModeActive: false, getSeries: () => ({ options: () => ({ priceFormat: { minMove: 0.00001 } }) }) })
  return h
}
const r5 = x => Math.round(x * 1e5) / 1e5
const foto = h => h._points.map(p => [p.timestamp, r5(p.price)])

for (const [lado, entry, sl, tp] of [['largo', 1.1, 1.098, 1.106], ['corto', 1.1, 1.102, 1.094]]) {
  const aleja = lado === 'largo' ? -1 : 1   // hacia donde se aleja el SL de la entrada
  // SL: llega un punto con otra hora y otro precio; solo cuenta el precio
  let h = herramienta(entry, sl, tp); h.setPoint(M.TIRADOR.SL, { timestamp: 9999, price: sl + aleja * 0.0005 })
  oraculo('DP02', `${lado}: el tirador del SL solo cambia el precio del SL`, JSON.stringify(foto(h)) === JSON.stringify([[1000, entry], [5000, r5(sl + aleja * 0.0005)], [5000, tp]]), JSON.stringify(foto(h)))
  h = herramienta(entry, sl, tp); h.setPoint(M.TIRADOR.TP, { timestamp: 200, price: tp - aleja * 0.0007 })
  oraculo('DP02', `${lado}: el tirador del TP solo cambia el precio del TP`, JSON.stringify(foto(h)) === JSON.stringify([[1000, entry], [5000, sl], [5000, r5(tp - aleja * 0.0007)]]), JSON.stringify(foto(h)))
  // circulo: la mano baja 15 pips mientras ensancha; el precio de entrada no se mueve
  h = herramienta(entry, sl, tp); h.setPoint(M.TIRADOR.ENTRADA_ANCHO, { timestamp: 400, price: entry + 0.0015 })
  oraculo('DP02', `${lado}: el circulo de la entrada solo ensancha por la izquierda (precio bloqueado)`, JSON.stringify(foto(h)) === JSON.stringify([[400, entry], [5000, sl], [5000, tp]]), JSON.stringify(foto(h)))
  // circulo que intenta pasar el borde derecho: no se da la vuelta
  h = herramienta(entry, sl, tp); h.setPoint(M.TIRADOR.ENTRADA_ANCHO, { timestamp: 6000, price: entry })
  oraculo('DP02', `${lado}: el circulo no cruza el borde derecho`, JSON.stringify(foto(h)) === JSON.stringify([[1000, entry], [5000, sl], [5000, tp]]), JSON.stringify(foto(h)))
  // cuadrado: precio de entrada y borde derecho a la vez (el TP sigue en el borde derecho)
  h = herramienta(entry, sl, tp); h.setPoint(M.TIRADOR.ENTRADA, { timestamp: 7000, price: entry - aleja * 0.0003 })
  oraculo('DP02', `${lado}: el cuadrado de la entrada cambia el precio de entrada y ensancha por la derecha`, JSON.stringify(foto(h)) === JSON.stringify([[1000, r5(entry - aleja * 0.0003)], [7000, sl], [7000, tp]]), JSON.stringify(foto(h)))
}

// donde salen los tiradores (la vista del plugin con sus tres puntos de pantalla: entrada izquierda, SL y TP derecha)
const h = herramienta(1.1, 1.098, 1.106)
const pintados = []
const vista = { _points: [{ x: 100, y: 300 }, { x: 400, y: 380 }, { x: 400, y: 60 }], createLineAnchor: d => (pintados.push(...d.points), { d }) }
const tir = M.tiradores
oraculo('DP02', 'los tiradores: circulo entrada-izquierda, SL-izquierda, TP-izquierda y cuadrado entrada-derecha', !!tir && (() => {
  tir(vista, { append() {} }, CORE.AnchorPoint, CORE.PaneCursorType)
  const p = pintados.map(a => [a.x, a.y, a.data, !!a.square])
  return JSON.stringify(p) === JSON.stringify([[100, 300, 0, false], [100, 380, 1, false], [100, 60, 2, false], [400, 300, 3, true]])
})(), JSON.stringify(pintados.map(a => [a.x, a.y, a.data, !!a.square])))
oraculo('DP02', 'los dibujos guardados no cambian de forma: siguen siendo tres puntos y el plugin sigue con 3 tiradores maximos', h._points.length === 3 && Clase.prototype.maxAnchorIndex.call(h) === 2)
fin()
