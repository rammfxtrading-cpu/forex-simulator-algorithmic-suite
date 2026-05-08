/**
 * Viewport layer — fase 3 del refactor data-layer.
 *
 * Este módulo es el ÚNICO punto del proyecto que escribe al viewport del chart
 * (chart.timeScale().setVisibleLogicalRange y chart.timeScale().scrollToPosition).
 * Ningún archivo fuera de este módulo debe llamar directamente a esas APIs.
 *
 * Estado del viewport vive como propiedades del entry de chartMap.current[pair]
 * (cr.hasLoaded, cr.userScrolled, cr.isAutoSettingRange). El módulo no
 * mantiene estado propio — todas las funciones reciben cr por parámetro.
 *
 * isAutoSettingRange: flag activada ANTES de cada escritura programática y
 * desactivada DESPUÉS, para que el handler del subscribeVisibleLogicalRangeChange
 * (vía markUserScrollIfReal) ignore las notificaciones disparadas por nuestras
 * escrituras y solo marque userScrolled=true ante scroll genuino del usuario.
 *
 * Patrón de doble rAF para la flag:
 *   1er rAF: ejecuta la escritura (setVisibleLogicalRange / scrollToPosition)
 *   2º rAF anidado: desactiva la flag DESPUÉS de que LWC haya notificado al handler
 *
 * El doble rAF es necesario porque LWC notifica al handler asíncronamente en
 * su propio microtask DESPUÉS del rAF que dispara la escritura. Si la flag se
 * desactivara dentro del 1er rAF (patrón ingenuo), el handler vería
 * isAutoSettingRange=false y marcaría userScrolled=true falsamente.
 *
 * Las lecturas (getVisibleLogicalRange, getVisibleRange) y las suscripciones
 * (subscribeVisibleLogicalRangeChange) NO viven aquí. Quedan fuera del alcance
 * de fase 3 — son fase 3.5 (futura, opcional) y fase 5 (drawings lifecycle)
 * respectivamente.
 *
 * Ver refactor/fase-3-plan.md §3 para el diseño completo de la API.
 */

import { applyFullRender } from './chartRender'

/**
 * Captura el rango visible actual antes de un setData.
 * Reemplaza el patrón inline de _SessionInner.js L1082-L1083.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @returns {Object|null} Rango logical {from, to} o null si cr no ha cargado todavía.
 */
export function captureSavedRange(cr) {
  if (!cr || !cr.hasLoaded) return null
  try {
    return cr.chart.timeScale().getVisibleLogicalRange()
  } catch {
    return null
  }
}

/**
 * Inicializa el rango visible al cargar un par por primera vez.
 * Reemplaza el patrón inline de _SessionInner.js L1086-L1095 (rama init).
 * Marca cr.hasLoaded = true y cr.userScrolled = false. Calcula la ventana
 * visible según TF con la tabla _tbars y aplica setVisibleLogicalRange en
 * doble rAF con isAutoSettingRange flag activada durante la escritura.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {string} tf - Timeframe ('M1','M3','M5','M15','M30','H1','H4','D1')
 * @param {number} aggLength - Longitud del array de velas reales (sin phantoms)
 */
export function initVisibleRange(cr, tf, aggLength) {
  if (!cr) return
  cr.hasLoaded = true
  cr.userScrolled = false
  const _tbars = { 'M1': 80, 'M3': 75, 'M5': 70, 'M15': 60, 'M30': 50, 'H1': 60, 'H4': 50, 'D1': 40 }
  const _show = _tbars[tf] || 80
  const _to = aggLength + 5
  const _from = Math.max(0, _to - _show)
  cr.isAutoSettingRange = true
  requestAnimationFrame(() => {
    try { cr.chart.timeScale().setVisibleLogicalRange({ from: _from, to: _to }) } catch {}
    requestAnimationFrame(() => {
      cr.isAutoSettingRange = false
    })
  })
}

/**
 * Restaura el rango visible tras un setData (TF change o rebuild interno).
 * Reemplaza el patrón inline de _SessionInner.js L1097-L1102.
 * Si opts.full, marca cr.userScrolled = false (TF change limpia el scroll).
 * Si savedRange no null, restaura en doble rAF con isAutoSettingRange flag.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object|null} savedRange - Rango previamente capturado con captureSavedRange
 * @param {Object} [opts]
 * @param {boolean} [opts.full=false] - Si true, marca userScrolled=false antes del restore
 */
export function restoreSavedRange(cr, savedRange, opts = {}) {
  if (!cr) return
  if (opts.full) cr.userScrolled = false
  if (!savedRange) return
  cr.isAutoSettingRange = true
  requestAnimationFrame(() => {
    try { cr.chart.timeScale().setVisibleLogicalRange(savedRange) } catch {}
    requestAnimationFrame(() => {
      cr.isAutoSettingRange = false
    })
  })
}

/**
 * Encapsula el try-catch completo de la rama "una vela TF nueva" en updateChart.
 * Reemplaza el patrón inline de _SessionInner.js L1120-L1146.
 *
 * En el happy path:
 *   1. Captura _rng = userScrolled ? getVisibleLogicalRange() : null
 *   2. Ejecuta applyUpdates() (callback que aplica el update al render layer)
 *   3. Si _rng, restaura en doble rAF con isAutoSettingRange flag.
 *
 * En el fallback (catch):
 *   1. Regenera 10 phantoms desde cero.
 *   2. Captura _r2 = getVisibleLogicalRange().
 *   3. Llama applyFullRender(cr, agg, cr.phantom) con phantoms regeneradas.
 *   4. Si _r2, restaura en doble rAF con isAutoSettingRange flag.
 *
 * El callback applyUpdates es el punto donde el caller delega cómo se aplica
 * el update al render layer (ver applyNewBarUpdate en lib/chartRender.js).
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Function} applyUpdates - Callback que aplica el update al render layer (típicamente applyNewBarUpdate)
 * @param {Object} fallbackCtx - Contexto necesario para el catch fallback
 * @param {Array} fallbackCtx.agg - Array de velas reales agregadas
 * @param {Function} fallbackCtx.mkPhantom - Función _mkPhantom(time) que crea una phantom
 * @param {number} fallbackCtx.lastT - Timestamp de la última vela real
 * @param {number} fallbackCtx.tfS2 - Tamaño del bucket TF en segundos
 */
export function restoreOnNewBar(cr, applyUpdates, fallbackCtx) {
  if (!cr) return
  try {
    const _rng = cr.userScrolled ? cr.chart.timeScale().getVisibleLogicalRange() : null
    applyUpdates()
    if (_rng) {
      cr.isAutoSettingRange = true
      requestAnimationFrame(() => {
        try { cr.chart.timeScale().setVisibleLogicalRange(_rng) } catch {}
        requestAnimationFrame(() => {
          cr.isAutoSettingRange = false
        })
      })
    }
  } catch {
    // Fallback: regenerar 10 phantoms desde cero, capturar rango, full rebuild, restaurar
    const { agg, mkPhantom, lastT, tfS2 } = fallbackCtx
    cr.phantom = Array.from({ length: 10 }, (_, i) => mkPhantom(lastT + tfS2 * (i + 1)))
    let _r2 = null
    try { _r2 = cr.chart.timeScale().getVisibleLogicalRange() } catch {}
    applyFullRender(cr, agg, cr.phantom)
    if (_r2) {
      cr.isAutoSettingRange = true
      requestAnimationFrame(() => {
        try { cr.chart.timeScale().setVisibleLogicalRange(_r2) } catch {}
        requestAnimationFrame(() => {
          cr.isAutoSettingRange = false
        })
      })
    }
  }
}

/**
 * Scroll al final del chart con offset fijo de barras a la derecha.
 * Reemplaza el patrón inline de _SessionInner.js L1235-L1238 (TF change effect).
 * Preserva el rAF anidado del original: 1er rAF hace scrollToPosition, 2º rAF
 * anidado dispara onScrolled (típicamente setChartTick para que overlays
 * se redibujen con el nuevo viewport) Y desactiva la flag isAutoSettingRange
 * en el mismo 2º rAF.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {number} [offset=8] - Barras desde el final (LWC: positivo = más espacio a la derecha)
 * @param {Function} [onScrolled] - Callback opcional que se llama tras aplicar el scroll
 */
export function scrollToTail(cr, offset = 8, onScrolled) {
  if (!cr) return
  cr.isAutoSettingRange = true
  requestAnimationFrame(() => {
    try { cr.chart.timeScale().scrollToPosition(offset, false) } catch {}
    requestAnimationFrame(() => {
      cr.isAutoSettingRange = false
      if (typeof onScrolled === 'function') onScrolled()
    })
  })
}

/**
 * Marca cr.userScrolled = true SOLO si el cambio de rango fue genuino del usuario.
 * Reemplaza el patrón inline de _SessionInner.js L872 (handler de subscribe).
 * Si cr no ha cargado todavía o si una escritura programática está en curso
 * (isAutoSettingRange === true), no hace nada — el cambio de rango no es
 * scroll real del usuario.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 */
export function markUserScrollIfReal(cr) {
  if (!cr) return
  if (cr.hasLoaded && !cr.isAutoSettingRange) {
    cr.userScrolled = true
  }
}
