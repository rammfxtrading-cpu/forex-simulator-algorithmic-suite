/**
 * Render layer — fase 4 del refactor data-layer.
 *
 * Este módulo es el ÚNICO punto del proyecto que escribe a cr.series.setData
 * y cr.series.update (escrituras al chart de lightweight-charts). Ningún
 * archivo fuera de este módulo debe llamar directamente a esas APIs.
 *
 * El array cr.phantom NO vive aquí — es propiedad del entry de
 * chartMap.current[pair] y lo gestiona _SessionInner.js (creación,
 * regeneración, dimensionado vía cr._phantomsNeeded). El render layer lo
 * recibe siempre por parámetro y, en el caso de applyTickUpdate (fase 4b),
 * muta sus elementos in-place cuando _lastC cambia, para que la cola plana
 * a la derecha siga el precio actual y no se quede anclada al close viejo.
 *
 * setSeriesData / updateSeriesAt (data layer fase 2) se invocan desde dentro
 * de las funciones públicas porque están acoplados con cada escritura al
 * chart: el global __algSuiteSeriesData debe quedar sincronizado con lo que
 * LWC ve en pantalla en cada frame. El caller no debe llamarlos por su
 * cuenta tras invocar una función de este módulo. Política de imports
 * (§3.3 plan v2): cada Op importa solo lo que su función nueva usa. En
 * Op 4a-1 solo se importa setSeriesData; updateSeriesAt se añadirá en
 * Op 4b-1 cuando entre en uso dentro de applyTickUpdate.
 *
 * Funciones públicas:
 *   - applyFullRender(cr, agg, phantoms): full rebuild (setData) +
 *     setSeriesData. Usado en init/full, en el fallback del catch de la
 *     rama within-bucket, y desde el fallback de restoreOnNewBar en
 *     chartViewport (Camino X §0.2.A del plan táctico fase 4).
 *
 * Lo que NO está en alcance de fase 4 (queda fuera de este módulo):
 *   - Creación / regeneración del array cr.phantom (sigue en _SessionInner.js).
 *   - Cálculo de cr._phantomsNeeded para acomodar drawings (effect TF change).
 *   - Lecturas / escrituras al viewport (lib/chartViewport.js, fase 3).
 *   - Drawings lifecycle (fase 5).
 *
 * Ver refactor/fase-4-plan.md §3 para el diseño completo de la API.
 */

import { setSeriesData, updateSeriesAt } from './sessionData'

/**
 * Full rebuild del chart — reemplaza todas las velas (reales + phantoms).
 *
 * Reemplaza el patrón inline de 3 sitios:
 *   - _SessionInner.js rama init/full (L1084-1085).
 *   - _SessionInner.js fallback del catch within-bucket (L1149-1150).
 *   - chartViewport.js fallback de restoreOnNewBar (L152-153).
 *
 * Sin try/catch — si LWC falla aquí, queremos que el error suba al caller
 * (mismo comportamiento que el código pre-fase-4: las 3 llamadas originales
 * tampoco envuelven setData en try/catch a este nivel).
 *
 * No toca cr.prevCount, cr.hasLoaded, cr.userScrolled ni cr.isAutoSettingRange
 * — esos son estado de session / viewport, no de render layer. El caller los
 * gestiona antes y después de invocar applyFullRender.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles a colocar tras agg
 */
export function applyFullRender(cr, agg, phantoms) {
  if (!cr || !cr.series) return
  cr.series.setData([...agg, ...phantoms])
  setSeriesData([...agg, ...phantoms], agg.length)
}

/**
 * Tick update — actualiza la última vela de la rama within-bucket y
 * refresca las phantoms in-place si el close ha cambiado.
 *
 * Reemplaza el patrón inline de la rama within-bucket completa de
 * _SessionInner.js (L1129-L1151 post-Op-4a-6, incluyendo el try/catch
 * externo). El catch interno ahora cae a applyFullRender como fallback.
 *
 * Mutación in-place de phantoms aceptada — §0.2.C plan v2. Cuando ph.close
 * difiere de lastClose, el bucle muta los 4 OHLC del phantom para que la
 * cola plana a la derecha siga el precio actual y no se quede anclada al
 * close viejo. Esto era el bloque ALGSUITE_PHANTOM_REFRESH histórico,
 * crítico en TFs grandes (H1, M30) donde una vela tarda mucho en cerrar.
 *
 * El try del bucle interno (try { cr.series.update(ph) } catch {}) preserva
 * el comportamiento original — si LWC rechaza un phantom puntual no
 * abortamos el ciclo. El try/catch externo captura cualquier fallo del
 * update incremental y cae a full rebuild.
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles (mutado in-place
 *                              cuando lastClose difiere)
 * @param {number} lastClose - Close de la última vela real (= agg[last].close)
 */
export function applyTickUpdate(cr, agg, phantoms, lastClose) {
  if (!cr || !cr.series || !agg?.length) return
  const lastCandle = agg[agg.length - 1]
  try {
    cr.series.update(lastCandle)
    updateSeriesAt(agg.length - 1, lastCandle)
    if (phantoms) {
      for (let i = 0; i < phantoms.length; i++) {
        const ph = phantoms[i]
        if (ph.close !== lastClose) {
          ph.open = lastClose
          ph.high = lastClose
          ph.low = lastClose
          ph.close = lastClose
          try { cr.series.update(ph) } catch {}
        }
      }
    }
  } catch {
    applyFullRender(cr, agg, phantoms)
  }
}

/**
 * New-bar update — actualiza la última vela de la rama "una vela TF nueva"
 * y re-aplica todas las phantoms al chart. Incluye el bloque [DEBUG TEMP]
 * gateado por flag global window.__algSuiteDebugLS para investigar el bug
 * "long/short se contrae al play" (sesión post-fase-4 §6 plan v2).
 *
 * Reemplaza el callback applyUpdates() pasado a restoreOnNewBar desde
 * _SessionInner.js (rama curr === prev+1, post-Op-4b-3 estimación L1105-L1121,
 * cuerpo del callback excluido el cierre `}, { ... }` del fallbackCtx).
 *
 * Sin try/catch principal — el catch de restoreOnNewBar (chartViewport.js)
 * es el fallback global y captura cualquier fallo del update incremental
 * cayendo a un full rebuild con phantoms regeneradas (Op 4a-6 + Camino X).
 *
 * El bloque [DEBUG TEMP] está envuelto en su propio try/catch para no
 * romper el render si la flag está activa pero el export de drawings falla.
 * Performance neutral cuando window.__algSuiteDebugLS es falsy (gateado
 * con cortocircuito antes del fetch al export).
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles a re-aplicar
 * @param {Object} [debugCtx] - Contexto opcional para el log de debug
 * @param {string} [debugCtx.tf] - Timeframe activo ('M1','M5','H1',...)
 * @param {number} [debugCtx.lastT] - Timestamp UNIX de la última vela real
 */
export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {
  if (!cr || !cr.series || !agg?.length) return
  const lastCandle = agg[agg.length - 1]
  cr.series.update(lastCandle)
  // Re-aplicar phantoms al chart (10 update() son irrelevantes en perf)
  if (phantoms) {
    for (const ph of phantoms) {
      try { cr.series.update(ph) } catch {}
    }
  }
  // [DEBUG TEMP] Log para investigar bug long/short se contrae al play.
  // Gateado por flag global window.__algSuiteDebugLS — performance neutral si false.
  if (typeof window !== 'undefined' && window.__algSuiteDebugLS) {
    try {
      const _expJson = (typeof window.__algSuiteExportTools === 'function')
        ? window.__algSuiteExportTools()
        : null
      const _tools = _expJson ? JSON.parse(_expJson) : []
      const _ls = _tools.find(t => t.toolType === 'LongShortPosition')
      if (_ls) {
        console.log('[LS-DEBUG] new candle', {
          tf: debugCtx?.tf,
          agg_len: agg.length,
          last_real_t: debugCtx?.lastT,
          phantom_first_t: phantoms?.[0]?.time,
          phantom_last_t: phantoms?.[phantoms.length - 1]?.time,
          ls_points: _ls.points,
        })
      }
    } catch {}
  }
}
