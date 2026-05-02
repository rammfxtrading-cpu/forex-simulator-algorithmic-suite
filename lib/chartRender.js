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

import { setSeriesData } from './sessionData'

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
