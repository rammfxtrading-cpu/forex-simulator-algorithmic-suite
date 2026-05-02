# Plan táctico fase 4 — render layer (v1)

> Fecha: 2 mayo 2026, sesión "simulador 11".
> Autor: Claude Opus 4.7 (chat web, CTO/revisor) + Ramón Tarinas (pegamento humano).
> Estado al redactar: `main` HEAD = `aad131b` (fase 3 cerrada y deployada en producción Vercel). Working tree limpio. Pendiente de OK Ramón sobre este plan v1 antes de comitear y crear rama feature.

---

## §0. PASO 0 — Inventario al carácter

PASO 0 ejecutado al inicio de la sesión 11 con greps recursivos sobre bytes en disco desde shell zsh nativo (NO Claude Code), validación al carácter (lección §8.2 HANDOFF fase 3).

### §0.1 Inventario de escrituras al render layer

**Escrituras identificadas fuera de `lib/chartViewport.js`:** 6 escrituras, todas en `components/_SessionInner.js`, todas dentro de la función `updateChart` (L1058-L1218).

| # | Línea | API | Rama | Contexto |
|---|---|---|---|---|
| 1 | L1084 | `cr.series.setData` | init/full | Primera carga del par o TF change. Full rebuild. |
| 2 | L1106 | `cr.series.update` | one-bar-new (happy) | Una vela TF nueva — actualizar última real. |
| 3 | L1108 | `cr.series.update × N` | one-bar-new (happy) | Bucle phantoms tras vela nueva (typ N=10). |
| 4 | L1112 | `cr.series.update` | within-bucket | Tick simple — actualizar última real (mismo bucket). |
| 5 | L1118 | `cr.series.update` | within-bucket | Bucle phantoms in-place si `_lastC` cambió. |
| 6 | L1124 | `cr.series.setData` | within-bucket fallback (catch) | Fallback si el `try` de within-bucket falla. |

Ocurrencias internas a `lib/chartViewport.js` (NO se tocan en fase 4):
- L152: `cr.series.setData` dentro del fallback de `restoreOnNewBar` (decisión §0.2.A).

### §0.2 Decisiones técnicas pendientes — requieren OK explícito Ramón antes de Op 1

#### §0.2.A — Camino X o Y para `chartViewport.js:152`

`chartViewport.js` tiene una llamada `cr.series.setData` dentro del fallback de `restoreOnNewBar` (L152). Es la única escritura al render layer fuera de `_SessionInner.js`.

**Camino X (mi voto):** `chartViewport` llama a `applyFullRender(cr, agg, phantoms)` desde su fallback. El render layer queda 100% aislado en `chartRender.js`. ChartViewport pasa a depender de chartRender.

**Camino Y:** ChartViewport sigue haciendo `setData` directamente en su fallback. El render layer queda con una pequeña fuga conceptual (1 setData fuera de chartRender) pero las dependencias entre módulos quedan más limpias.

**Voto:** Camino X. Razones: el fallback de `restoreOnNewBar` es de hecho un mini-render full, no un viewport thing. Aislar el render al carácter (cero `setData` fuera de chartRender) facilita debug futuro y deja el invariante grep-verificable nítido. El acoplamiento que añade es trivial (chartViewport → chartRender → sessionData) y unidireccional, sin ciclos.

**Verificación de no-ciclo:** chartRender importa de sessionData. ChartViewport importará de chartRender + (opcionalmente) sessionData. Ningún módulo importa de chartViewport. Cero ciclos.

**Pendiente OK Ramón:** Camino X o Y.

#### §0.2.B — Destino del bloque `[DEBUG TEMP]` en `_SessionInner.js:1109-1124`

El bloque está dentro del callback de `restoreOnNewBar` en la rama "una vela TF nueva". Está gateado por `window.__algSuiteDebugLS` (flag global) → si la flag es false, performance neutral. El bloque hace introspección al export de drawings buscando un `LongShortPosition` y loggea timestamps de phantoms.

**Razón de existir:** instrumentación específica del bug "long/short se contrae al play" que un sesión previa (Ramón + Claude previo) montó para debuggear. Es exactamente el bug que tu mensaje del CTO §3 vincula al de Luis "salta al play".

3 opciones:

- **Opción A — mantener inline donde está.** El bloque se queda en `_SessionInner.js:1109-1124`, fuera del callback de `restoreOnNewBar` migrado. La rama "una vela TF nueva" del render queda dividida: la API encapsula update + bucle phantoms, el debug log se queda inline con la flag.
- **Opción B (mi voto) — migrar dentro de `applyNewBarUpdate`.** El bloque entero (con su flag y su gating) se mueve dentro de la nueva función de chartRender. Quedará gateado igual, performance neutral si flag false. La función recibe los pocos extras que el log necesita (`tf`, `lastT`) por parámetro.
- **Opción C — limpiar.** Eliminar el bloque por completo. Riesgo: perdemos instrumentación útil para el bug que vamos a atacar en sesión post-fase-4. **Descartada.**

**Voto:** Opción B. Razones: mantener instrumentación viva para sesión post-fase-4, y consolidar todo el código de la rama "una vela nueva" en un solo sitio (chartRender) facilita el ataque al bug.

**Pendiente OK Ramón:** A, B o C.

#### §0.2.C — Mutación in-place de `cr.phantom` dentro de `applyTickUpdate`

La rama within-bucket muta el array `cr.phantom` in-place si `_lastC` cambió (L1115-L1119):
```js
ph.open=_lastC; ph.high=_lastC; ph.low=_lastC; ph.close=_lastC
```

**Pregunta:** ¿la mutación se queda dentro de `applyTickUpdate` (chartRender), o se mueve a `_SessionInner.js` antes de llamar a `applyTickUpdate` con el array ya mutado?

**Voto:** mutación dentro de `applyTickUpdate`. Razones: (a) el caller queda más limpio — solo pasa `lastClose` como parámetro, el render decide cómo aplicarlo; (b) la mutación está acoplada con el `cr.series.update(ph)` que la sigue, separarlos genera estado intermedio raro; (c) Opción B estricta no prohíbe que chartRender mute el array recibido — prohíbe que chartRender posea el ciclo de vida del array.

**Pendiente OK Ramón:** acepto / muevo fuera.

#### §0.2.D — Nombre del módulo: `lib/chartRender.js` o `lib/renderLayer.js`

Convención hasta ahora: `lib/sessionData.js` (fase 2), `lib/chartViewport.js` (fase 3), `lib/chartCoords.js` (pre-existente del refactor de drawings).

**Voto:** `lib/chartRender.js`. Mantiene el patrón `chart*` de chartViewport y chartCoords.

**Pendiente OK Ramón:** chartRender / renderLayer / otro.

### §0.3 Conteos finales tras PASO 0

- **Escrituras al chart en `_SessionInner.js`:** 6 (todas dentro de `updateChart`).
- **Escrituras al chart fuera de `_SessionInner.js`:** 1 (en `chartViewport.js:152`, alcance §0.2.A).
- **Función `updateChart`:** L1058-L1218 (160 líneas). Es la zona quirúrgica.
- **Llamadas a `setSeriesData` dentro de `updateChart`:** 4 (L1085, L1104, L1113, L1125). Acompañan a las escrituras del chart porque mantenemos el array global sincronizado con lo que ve LWC.
- **Tamaño actual `_SessionInner.js`:** 2988 líneas (post-fase 3).
- **Tamaño actual `lib/chartViewport.js`:** 204 líneas.
- **Tamaño actual `lib/sessionData.js`:** 186 líneas.
- **Tamaño actual `lib/chartCoords.js`:** 117 líneas.

### §0.4 Lo que NO se toca en fase 4 (quedan inline o en sus módulos actuales)

- **`_mkPhantom`** (factory de phantoms) — local dentro de `updateChart`. Lógica de creación, no de render. Se queda.
- **`_phantomsNeeded`** (campo de cr) — gestión del tamaño del buffer. Se queda.
- **Cálculo de `phantomsNeeded` en effect TF change** (L1184-L1209) — toca `exportTools()` (drawings). Se queda.
- **`cr.phantom`** (array de phantoms) — propiedad de `chartMap.current[pair]`. Se queda gestionada por `_SessionInner.js`. ChartRender la recibe como parámetro.
- **`updateSeriesAt`** (escritura puntual al data layer global) — API de fase 2 (sessionData). Se sigue llamando, ahora desde dentro de chartRender.
- **`captureSavedRange`, `initVisibleRange`, `restoreSavedRange`, `restoreOnNewBar`, `scrollToTail`, `markUserScrollIfReal`** — API de fase 3 (chartViewport). Se siguen llamando desde `_SessionInner.js`, no se tocan.
- **Effect engine init (L791, L810), handleStep (L1264), seek por click (L2178)** — call sites de `updateChart`. La signatura de `updateChart` no cambia → no se tocan.

---

## §1. Resumen ejecutivo en lenguaje llano

Para Ramón, sin tecnicismos:

Vamos a hacer la fase 4 del refactor del simulador. **Igual que con fase 2 y fase 3, no vamos a cambiar nada visible** — el simulador se va a comportar exactamente igual que antes. Lo que vamos a hacer es una limpieza interna: sacar el código que dibuja velas en el chart de `_SessionInner.js` (el archivo gigante de 2988 líneas) y ponerlo en un archivo nuevo y pequeño llamado `lib/chartRender.js` (estimado: 150-200 líneas).

**¿Por qué?** Por la misma razón que hicimos fase 3: cuando todo está mezclado en un archivo gigante, es muy difícil arreglar bugs sin romper otras cosas. Después de fase 4, si en el futuro hay un problema relacionado con cómo se renderizan las velas o las phantoms, sabremos exactamente dónde mirar.

**Lo que NO incluye fase 4 (importante):** **NO** vamos a atacar el bug "salta al play TF bajo + speed máxima" dentro de fase 4. Ese bug se ataca en una sesión separada e inmediata DESPUÉS de cerrar fase 4. Razones: (1) fase 4 quedará con el render layer aislado, lo que hace más fácil el ataque al bug; (2) si metemos el ataque del bug dentro de fase 4 podemos contaminar el alcance y arriesgarnos a un PR sucio. Disciplina §7 CLAUDE.md: cierre parcial validado > cierre total roto.

**Bonus posible (sin promesa):** durante fase 4 vamos a mantener vivo el bloque de logging que ya estaba puesto para investigar el bug "long/short se contrae al play" (que es el mismo bug que reportó Luis). Si durante la migración descubrimos algo relevante sobre el bug, lo anotamos para la sesión post-cierre.

**Tiempo estimado:** rango 4-10 horas según cómo de fluida sea la ejecución. Si fase 4 se complica más de lo esperado, paramos donde validemos. Tu ventana de tiempo es amplia hoy → estimación honesta debería caber.

---

## §2. Decisión arquitectónica — Opción A vs B vs C

### §2.1 Opción A — render layer "amplio"

Un solo módulo `lib/chartRender.js` que encapsula:
- 6 escrituras al chart (`setData`, `update`, bucles phantoms).
- Gestión del array `cr.phantom` (creación, regeneración, mutación in-place).
- Cálculo de `phantomsNeeded` en effect TF change (L1184-L1209).

**Pro:** todo el render queda en un sitio.
**Contra:** acopla render con drawings (porque el cálculo de `phantomsNeeded` necesita `exportTools()`). Riesgo similar al que descartamos en fase 3.5 plan v2.
**Veredicto:** descartada. Misma razón que en fase 3 plan v2 §0.2 (Opción A descartada).

### §2.2 Opción B — render layer "estricto" (voto)

Un módulo `lib/chartRender.js` que encapsula SOLO las 6 escrituras al chart + `setSeriesData` que las acompaña + mutación in-place de phantoms cuando hace falta para que el render sea correcto. Gestión del array `cr.phantom` (creación / regeneración) y cálculo de `phantomsNeeded` se quedan en `_SessionInner.js`.

**Pro:** alcance acotado, blast radius pequeño, simétrica con fase 3 (chartViewport encapsula escrituras al viewport, chartRender encapsula escrituras al chart).
**Contra:** queda lógica de phantoms inline en `_SessionInner.js` que será raro de leer hasta que se haga fase 4.5 / fase 5.
**Veredicto:** **voto Opción B.**

### §2.3 Opción C — render layer + phantom buffer en paralelo

Dos módulos nuevos: `lib/chartRender.js` (escrituras al chart) + `lib/phantomBuffer.js` (estado y mutación de `cr.phantom`).

**Pro:** separación arquitectónica clara, ambos módulos pequeños.
**Contra:** 2 archivos nuevos en una fase = más superficie de revisión por commit. Mayor coordinación entre los dos módulos durante la migración. Para una primera fase de extracción es overengineering — mejor sacar render primero, luego decidir si phantom buffer merece su propio módulo.
**Veredicto:** descartada para fase 4. Phantom buffer puede ser fase 4.5 (opcional) o fase 5.

### §2.4 Decisión

**Opción B — render layer "estricto".** Sub-fases 4a / 4b / 4c / 4d como detallado en §4.

---

## §3. API de `lib/chartRender.js`

Asumo §0.2.A = Camino X y §0.2.B = Opción B y §0.2.C = mutación in-place y §0.2.D = `chartRender.js`. Si Ramón vota distinto, esta sección se ajusta antes de Op 1.

### §3.1 Header del módulo

Estructura simétrica al header de `chartViewport.js`:

- Documento que el módulo es el ÚNICO punto del proyecto que escribe a `cr.series.setData` y `cr.series.update`.
- Documenta que el array `cr.phantom` NO vive aquí — es propiedad de `chartMap.current[pair]` y se recibe por parámetro.
- Documenta que `setSeriesData` (data layer fase 2) se llama desde dentro de la API porque está acoplado con cada escritura al chart (mantener el array global sincronizado con LWC).
- Lista de funciones públicas con su responsabilidad.
- Anota explícitamente lo que NO está en alcance: creación/regeneración de phantoms, cálculo de `phantomsNeeded`, viewport reads/writes (fase 3), drawings (fase 5).

### §3.2 Funciones públicas

#### `applyFullRender(cr, agg, phantoms)`

Encapsula el patrón `setData + setSeriesData` para full rebuild del chart.

**Reemplaza:**
- `_SessionInner.js:1084-1085` (rama init/full)
- `_SessionInner.js:1124-1125` (fallback within-bucket catch)
- `chartViewport.js:152-153` (fallback `restoreOnNewBar`, alcance §0.2.A Camino X)

**Pseudocódigo:**
```js
export function applyFullRender(cr, agg, phantoms) {
  if (!cr || !cr.series) return
  cr.series.setData([...agg, ...phantoms])
  setSeriesData([...agg, ...phantoms], agg.length)
}
```

**Notas:**
- Recibe `agg` y `phantoms` por separado (NO unidos) para forzar al caller a haber decidido los phantoms antes de llamar.
- No toca `cr.prevCount` ni `cr.hasLoaded` — estado de session, no de render.
- Sin try/catch — si LWC falla aquí, queremos que el error suba al caller.

#### `applyTickUpdate(cr, lastCandle, phantoms, lastClose)`

Encapsula el patrón "tick simple" — actualizar la última vela y refrescar phantoms in-place si el close cambió.

**Reemplaza:**
- `_SessionInner.js:1110-1126` (rama within-bucket completa, incluido fallback try/catch).

**Pseudocódigo:**
```js
export function applyTickUpdate(cr, lastCandle, phantoms, lastClose) {
  if (!cr || !cr.series) return
  try {
    cr.series.update(lastCandle)
    updateSeriesAt(/* index */, lastCandle)  // index = realLen - 1 = aggLen - 1
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
    // Fallback: full rebuild si el update incremental falla
    applyFullRender(cr, /* agg ??? */, phantoms)
  }
}
```

**Punto crítico de diseño — el fallback necesita `agg`, no solo `lastCandle`:**

El fallback hace `setData([...agg, ...phantoms])` — necesita el array entero, no solo la última vela. Hay 2 caminos:

- **A:** la API recibe `agg` y `lastCandle` por separado. El caller pasa los dos (`agg` para fallback, `lastCandle = agg[agg.length-1]` para happy path).
- **B:** la API recibe solo `agg`, calcula `lastCandle = agg[agg.length-1]` internamente.

**Voto:** B. Más limpio, el caller pasa una sola fuente de verdad.

**Pseudocódigo final ajustado:**
```js
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
```

**Notas:**
- Mutación in-place de `phantoms` aceptada (§0.2.C).
- Try/catch interno preservado del original.

#### `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`

Encapsula el patrón "una vela TF nueva" — actualizar la última vela real + re-aplicar todas las phantoms al chart. Incluye el bloque [DEBUG TEMP] gateado por flag (§0.2.B Opción B).

**Reemplaza:**
- `_SessionInner.js:1106-1124` (callback `applyUpdates` que se pasa a `restoreOnNewBar`).

**Pseudocódigo:**
```js
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
```

**Notas:**
- Sin try/catch principal — el catch de `restoreOnNewBar` (en chartViewport.js:144-162) sigue siendo el fallback global. El callback que pasamos solo hace updates incrementales, igual que antes.
- `debugCtx` opcional. Si no se pasa, el log no rompe (usa `?.`).
- El log se envuelve en un try/catch propio para no romper el render si la flag está activa pero el export de drawings falla por algún motivo.

### §3.3 Importaciones del módulo

```js
import { setSeriesData, updateSeriesAt } from './sessionData'
```

Sin imports de `chartViewport` (no se necesita). Sin imports de `chartCoords` (no se necesita).

### §3.4 Tamaño estimado del módulo

~150-200 líneas (código + headers JSDoc completos similares a `chartViewport.js`).

---

## §4. Sub-fases

Patrón heredado de fase 3: cada sub-fase es un commit atómico con baselines pre/post, validación al carácter, y aprobación explícita Ramón antes de cada Edit.

### §4.1 Sub-fase 4a — `applyFullRender` + migración rama init/full + fallback within-bucket catch + Camino X chartViewport

**Alcance:** crear `lib/chartRender.js` con la primera función pública (`applyFullRender`). Migrar los 3 sitios donde se hace full rebuild.

**Operaciones:**

- **Op 4a-1 — crear `lib/chartRender.js`** con header JSDoc + función `applyFullRender` exportada + import de `setSeriesData` y `updateSeriesAt` de `sessionData`. Aprobación.
- **Op 4a-2 — extender import en `_SessionInner.js:13`** añadiendo `applyFullRender` desde `'../lib/chartRender'`. Aprobación.
- **Op 4a-3 — sustituir L1084-L1085** (rama init/full) por `applyFullRender(cr, agg, cr.phantom)`. Aprobación.
- **Op 4a-4 — sustituir L1124-L1125** (fallback within-bucket catch) por `applyFullRender(cr, agg, cr.phantom)`. Aprobación.
- **Op 4a-5 — extender import en `lib/chartViewport.js`** añadiendo `applyFullRender` desde `'./chartRender'`. Aprobación.
- **Op 4a-6 — sustituir `lib/chartViewport.js:152-153`** (fallback `restoreOnNewBar`) por `applyFullRender(cr, agg, cr.phantom)`. Aprobación.

**Verificadores 4a:**
- Grep: `grep -rn "series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"` → vacío.
- `npm run build` verde.
- Pruebas manuales: cargar par, cambiar TF, hacer click en barra de progreso, ver que el chart se renderiza idénticamente.

**Commit 4a:** `refactor(fase-4a): crear chartRender y migrar full rebuild (init/full + within-bucket catch + chartViewport fallback)`.

### §4.2 Sub-fase 4b — `applyTickUpdate` + migración rama within-bucket

**Alcance:** añadir `applyTickUpdate` a `lib/chartRender.js`. Migrar la rama within-bucket completa (try + catch).

**Pre-condición:** sub-fase 4a comiteada.

**Operaciones:**

- **Op 4b-1 — extender `lib/chartRender.js`** con `applyTickUpdate(cr, agg, phantoms, lastClose)`. La función incluye el try/catch propio con fallback a `applyFullRender`. Aprobación.
- **Op 4b-2 — extender import en `_SessionInner.js:13`** añadiendo `applyTickUpdate`. Aprobación.
- **Op 4b-3 — sustituir L1110-L1126** (rama `else` within-bucket completa, incluyendo el try/catch externo) por `applyTickUpdate(cr, agg, cr.phantom, _lastC)`. Aprobación.

**Punto delicado:** la rama within-bucket actual tiene un `try/catch` externo que envuelve update + bucle. La nueva API mete ese try/catch DENTRO de `applyTickUpdate`. **Verificar al carácter que la sustitución preserve la semántica:** la línea entera `} else { try{ ... }catch{ ... } }` se sustituye por `} else { applyTickUpdate(cr, agg, cr.phantom, _lastC) }`.

**Verificadores 4b:**
- Grep: `grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/chartViewport.js"` → cero líneas en `_SessionInner.js`.
- `npm run build` verde.
- Pruebas manuales: play a velocidad media en TF M5, ver que las phantoms siguen el precio en tiempo real (cola plana visible a la derecha sin lag ni saltos).

**Commit 4b:** `refactor(fase-4b): migrar rama within-bucket a applyTickUpdate`.

### §4.3 Sub-fase 4c — `applyNewBarUpdate` + migración rama "una vela TF nueva" + [DEBUG TEMP]

**Alcance:** añadir `applyNewBarUpdate` a `lib/chartRender.js`, incluyendo el bloque [DEBUG TEMP] gateado por flag. Migrar el callback de `restoreOnNewBar`.

**Pre-condición:** sub-fase 4b comiteada.

**Operaciones:**

- **Op 4c-1 — extender `lib/chartRender.js`** con `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`. Incluye el bloque [DEBUG TEMP] migrado al pseudocódigo de §3.2. Aprobación.
- **Op 4c-2 — extender import en `_SessionInner.js:13`** añadiendo `applyNewBarUpdate`. Aprobación.
- **Op 4c-3 — sustituir el callback `applyUpdates`** de `restoreOnNewBar` (L1105-L1124) por `() => applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })`. Mantener intacto el resto de la llamada a `restoreOnNewBar` (los argumentos `cr` y `fallbackCtx` no cambian). Aprobación.

**Verificadores 4c:**
- Grep: `grep -rn "DEBUG TEMP\|LS-DEBUG" components/ pages/ lib/` → solo aparece en `lib/chartRender.js`, NO en `_SessionInner.js`.
- Grep: `grep -rn "series.update\|series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/chartViewport.js"` → vacío.
- `npm run build` verde.
- Pruebas manuales — escenario de validación específico:
  - Activar flag `window.__algSuiteDebugLS = true` desde consola.
  - Crear un LongShortPosition.
  - Iniciar play.
  - Verificar que aparecen logs `[LS-DEBUG] new candle` en consola con los mismos datos que aparecían pre-fase-4.
  - Desactivar flag, verificar que no aparecen más logs.

**Commit 4c:** `refactor(fase-4c): migrar rama una-vela-TF-nueva a applyNewBarUpdate (incluye bloque DEBUG TEMP gateado por flag)`.

### §4.4 Sub-fase 4d (condicional) — limpieza pendiente y consolidación

**Alcance:** únicamente si tras 4a/4b/4c quedan loose ends. Por ejemplo:

- Comentarios obsoletos en `chartViewport.js` que mencionan responsabilidades que ya no son suyas.
- Firma de `restoreOnNewBar` cuyo `fallbackCtx` puede simplificarse si chartViewport ahora llama a `applyFullRender` y ya no necesita `mkPhantom`/`lastT`/`tfS2` por separado.
- Posibles renames o ajustes de tipos.

**Operaciones:** se redactan en plan v2 (refinamiento post-PASO 0 sobre rama feature) si fueran necesarias. Por defecto, esta sub-fase **NO existe** y fase 4 cierra con 4a + 4b + 4c.

**Pendiente:** decisión durante 4c sobre si fallbackCtx de `restoreOnNewBar` puede simplificarse. Si sí, va a 4d. Si no, no hay 4d.

---

## §5. Criterio "fase 4 terminada"

Tres criterios verificables al carácter (patrón heredado fase 3 §5):

### §5.1 Verificadores grep

```
grep -rn "series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío

grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/chartViewport.js"
→ vacío

# chartViewport conserva matches en JSDoc (header) — se ignoran si son comentarios.
# Verificación adicional: solo matches en líneas no-comentario fuera de chartRender.
grep -rn "cr.series.update\|cr\.series\.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "^[^:]*://"
→ vacío
```

### §5.2 Build verde

```
npm run build
→ 0 errores, 0 warnings nuevos respecto a baseline pre-fase-4.
```

### §5.3 Diff completo revisado y comportamiento idéntico

- `git diff main..refactor/fase-4-render-layer` revisado por Ramón en chat web.
- Cero archivos tocados fuera de alcance. Archivos esperados: `lib/chartRender.js` (nuevo), `lib/chartViewport.js` (1 línea modificada en fallback), `components/_SessionInner.js` (2 imports + 4-5 sustituciones), `refactor/fase-4-plan.md` (este plan).
- Pruebas manuales:
  - Cargar par EURUSD, ver que se renderiza igual que antes.
  - Cambiar TF M5 → H1 → M15, ver que el chart re-renderiza correctamente con phantoms.
  - Click en barra de progreso, ver seek correcto.
  - Play a velocidad media (no máxima), ver phantoms siguiendo precio.
  - Crear LongShortPosition, ver que se renderiza correctamente al cambiar TF.
  - Activar `window.__algSuiteDebugLS = true`, ver que el log aparece tras nueva vela TF.

**Cero regresiones funcionales detectadas → fase 4 terminada.** Pendiente OK Ramón para merge a main + push + smoke check producción + redacción HANDOFF-cierre-fase-4.md.

---

## §6. Bug "salta al play" — sesión post-fase-4 (NO incluido en este plan)

Decisión Ramón explícita en sesión 11: Opción 3 → fase 4 estricta + sesión inmediata después para el bug.

### §6.1 Qué NO se hace en fase 4

- NO se intenta fix del bug "salta al play TF bajo + speed máxima".
- NO se modifica el comportamiento del bloque [DEBUG TEMP] (solo se migra de sitio).
- NO se añade instrumentación nueva durante fase 4.

### §6.2 Qué SÍ queda preparado tras fase 4

- Render layer aislado en `lib/chartRender.js`. Cualquier fix futuro toca un solo archivo.
- Bloque [DEBUG TEMP] vivo y gateado por flag. Reproducible por Ramón o Luis con `window.__algSuiteDebugLS = true`.
- 3 funciones del render layer (`applyFullRender`, `applyTickUpdate`, `applyNewBarUpdate`) son los únicos sitios donde meter cualquier fix relacionado con render durante play.

### §6.3 Sesión post-fase-4 — outline de cómo se ataca el bug

(NO ejecutar dentro del scope de este plan. Solo documentación de cómo proceder en sesión separada.)

1. **Reproducción al carácter:** Ramón reproduce en producción con TF bajo (M1) + speed máxima + crear LongShortPosition. Activa flag `window.__algSuiteDebugLS = true` antes de play. Captura logs de `[LS-DEBUG] new candle`.
2. **Análisis de logs:** comparar `phantom_first_t` y `phantom_last_t` de cada nueva vela contra los `ls_points` del LongShortPosition. Si hay timestamps de drawing fuera del rango cubierto por phantoms, hipótesis confirmada.
3. **Hipótesis de fix:** la regeneración de phantoms en la rama "una vela TF nueva" (L1102-L1103 en `_SessionInner.js` actual, post-fase-4 dentro de `_SessionInner.js` antes de llamar a `applyNewBarUpdate`) usa `_phN = cr.phantom?.length || 10`. Si las phantoms previas tenían longitud 10 (default), pero en el TF actual hay drawings que necesitan más, el bucle se queda corto. Posible fix: re-leer drawings antes de regenerar y recalcular `phantomsNeeded`. Esto contamina con drawings → puede empezar a parecer fase 5.
4. **Decisión arquitectónica de la sesión post-fase-4:** si el fix es trivial y queda dentro del render, se hace en una mini-rama `fix/limit-desaparece-al-play`. Si requiere tocar drawings significativamente, se posterga a fase 5 con plan dedicado.

---

## §7. Decisión sobre `[DEBUG TEMP]` (resumen)

Voto Opción B en §0.2.B → bloque migrado dentro de `applyNewBarUpdate` en sub-fase 4c, gateado por flag global `window.__algSuiteDebugLS`. Performance neutral si flag false.

**Cuándo se limpia:** tras cerrar el bug "salta al play" en sesión post-fase-4 (o sesión posterior si se posterga). El cierre del bug incluye eliminar el bloque [DEBUG TEMP] como último Op de esa sesión.

**Hasta entonces:** se preserva. Es instrumentación viva.

---

## §8. Lo que NO entra en alcance de fase 4

- **Fase 4.5 / fase 5 — drawings lifecycle.** Reorganizar suscripciones de `CustomDrawingsOverlay`, `DrawingToolbar`, `KillzonesOverlay`. Tampoco tocar el cálculo de `phantomsNeeded` en effect TF change (acopla con drawings).
- **Fase 6 — trading layer.** Aislar entries / exits / SL / TP / pending orders. No se toca aunque haya escrituras al chart relacionadas con trading (no las hay directamente — las series.update son de velas, no de orders).
- **Fase 7 — reducir `_SessionInner.js`.** Tras fase 4 se queda en ~2800 líneas estimado. La reducción significativa vendrá tras fases 5/6.
- **Fix bug "salta al play".** Sesión inmediata post-fase-4 (§6).
- **B2 — drawings descolocadas Review.** Backlog. Probable cierre tras fase 5.
- **B3 — TF reset entrar Review.** Verificar con Luis si fase 3 lo cerró. Si no, sesión dedicada.
- **B5 — 409 session_drawings race.** Backlog.
- **B6 — drawings se pegan al cambiar TF.** Probable cierre tras fase 5.
- **Saneamiento histórico B4** — decisión separada.
- **Limpieza globales `__chartMap`, `__algSuiteDebugLS`, `__algSuiteExportTools`.** Backlog (post-fase-7).

---

## §9. Plan de rollback por sub-fase

Cada sub-fase es un commit atómico sobre rama feature. Rollback siempre por commit:

### §9.1 Rollback durante 4a (antes de commit)

```
git checkout components/_SessionInner.js
git checkout lib/chartViewport.js
rm lib/chartRender.js
```

Working tree vuelve a estado pre-4a (HEAD de rama = aún el commit del plan v1).

### §9.2 Rollback de 4a comiteado (antes de 4b)

```
git revert HEAD
```

O si se ha pusheado a main por error: `git revert <hash>` + push del revert. Sub-fases 4b/4c quedan canceladas hasta análisis post-mortem.

### §9.3 Rollback de 4b o 4c comiteado

`git revert <hash>` del commit problemático. Sub-fases posteriores se replanifican según diagnóstico.

### §9.4 Rollback total post-merge a main pre-push

```
git reset --hard <hash-merge-fase-3-cierre>
git branch -D refactor/fase-4-render-layer  # opcional
```

Pierde el merge commit y los 3 commits de sub-fase. El plan v1 queda comiteado en main por separado, no se pierde.

### §9.5 Rollback total post-push a producción

```
git revert <hash-merge-commit> -m 1
git push origin main
```

Vercel re-deploya con fase 3. Investigación post-mortem antes de re-attempt.

---

## §10. Cómo ejecutar — workflow bicapa

Patrón heredado de fase 3 §12. Reparto de roles:

- **Ramón (pegamento humano):** ejecuta comandos shell, pega outputs crudos al chat web, da OK explícitos antes de cada Edit, verifica al carácter con greps/sed/cat desde shell zsh nativo.
- **Claude Opus 4.7 (chat web, CTO/revisor):** lee bytes literales, redacta este plan, valida cada Edit propuesto por Claude Code antes de Ramón aprobar, lleva la cuenta de qué se ha hecho, escribe HANDOFF al cierre.
- **Claude Code (driver técnico):** ejecuta los Edits propuestos sobre el código una vez tenga OK explícito de Ramón. Solo entra en escena cuando hay plan v1 comiteado y rama feature creada.

### §10.1 Pre-arranque (chat web)

1. Ramón aprueba este plan v1 con decisiones §0.2.A/B/C/D resueltas.
2. Ramón comitea este plan en main: `refactor/fase-4-plan.md` con commit `docs(fase-4): redactar plan táctico fase-4-plan.md`.
3. Ramón crea rama feature: `git checkout -b refactor/fase-4-render-layer`.

### §10.2 Arranque (Claude Code)

4. Verificar rama `refactor/fase-4-render-layer` activa, HEAD = commit del plan v1.
5. Greps verificadores PRE-Op (ejecutados al inicio de la sesión Claude Code):
   - `grep -rn "series.setData" components/ pages/ lib/ | grep -v "lib/chartViewport.js"` → debe matchar L1084, L1124 (en `_SessionInner.js`).
   - `grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartViewport.js"` → debe matchar L1106, L1108, L1112, L1118 (en `_SessionInner.js`).

### §10.3 Ejecución

6. Op 4a-1 → 4a-6 (sub-fase 4a). Cada Op con aprobación explícita Ramón → Edit Claude Code → validación al carácter Ramón desde shell. Tras Op 4a-6: commit 4a.
7. Pruebas 4a (§4.1 verificadores). Si OK → arrancar 4b. Si KO → diagnóstico + rollback §9.
8. Op 4b-1 → 4b-3. Tras Op 4b-3: commit 4b. Pruebas 4b.
9. Op 4c-1 → 4c-3. Tras Op 4c-3: commit 4c. Pruebas 4c.
10. (Condicional) Sub-fase 4d si aparecen loose ends.

### §10.4 Validación pre-merge

11. Greps verificadores §5.1.
12. `npm run build`.
13. `git diff main..refactor/fase-4-render-layer` revisado por Ramón en chat web.
14. OK explícito Ramón sobre el diff entero.

### §10.5 Merge + push

15. Decidir push hoy o mañana en frío (lección §8.4 fase 2).
16. Si OK: `git checkout main && git merge refactor/fase-4-render-layer && git push origin main`. Vercel re-deploya.
17. Smoke check producción Ramón (cargar simulador, par, TF, play breve).

### §10.6 Cierre

18. Redactar `HANDOFF-cierre-fase-4.md` (chat web).
19. Comitear HANDOFF en main + push.
20. Si decisión Ramón: arrancar sesión post-fase-4 para bug "salta al play" (§6).

---

## §11. Reglas absolutas heredadas

Sin cambios respecto a `HANDOFF.md` v3 §7 + `CLAUDE.md` §3 + lecciones HANDOFF fase 3 §8:

- NO push sin OK explícito Ramón.
- Bytes literales del shell para validación al carácter (NO Claude Code para verificación).
- PASO 0 con grep recursivo antes de plan (cumplido — §0).
- Plan antes de tocar código si >100 líneas o >2 archivos (cumplido — este documento).
- Resumen ejecutivo en lenguaje llano (cumplido — §1).
- Patrón bicapa: chat web CTO/revisor, Claude Code driver, Ramón pegamento humano.
- Aprobación Op 1 manual siempre.
- Distinguir lo verificado de lo inferido (§9.4 fase 3) — cuando dude, verificar con shell.
- `git diff` completo antes de cada commit + OK explícito Ramón.
- Cierre parcial validado > cierre total roto (§7 CLAUDE.md).

---

## §12. Cómo arrancar Op 1 — checklist Ramón

### §12.1 Decisiones pendientes que Ramón debe responder antes de Op 1

- [ ] §0.2.A — Camino X (mi voto) o Y para `chartViewport.js:152`.
- [ ] §0.2.B — Opción A / B (mi voto) / C para bloque [DEBUG TEMP].
- [ ] §0.2.C — Mutación in-place de `cr.phantom` dentro de `applyTickUpdate` (mi voto: aceptar) o moverla fuera.
- [ ] §0.2.D — Nombre del módulo: `chartRender.js` (mi voto) / `renderLayer.js` / otro.

### §12.2 Si Ramón vota igual que mis votos

Plan v1 queda como está. Pasos:

1. Ramón da OK explícito en chat web.
2. Mover `fase-4-plan.md` al directorio `refactor/` del repo.
3. `git add refactor/fase-4-plan.md`.
4. `git commit -m "docs(fase-4): redactar plan táctico fase-4-plan.md"`.
5. `git checkout -b refactor/fase-4-render-layer`.
6. Abrir Claude Code en el repo, prompt de arranque adjunto en §12.4.

### §12.3 Si Ramón vota distinto en alguna decisión §0.2

Refinamos plan v1 → plan v2 sobre la rama feature (patrón fase 3 plan v1 → v2). El plan v2 ajusta §3 API + §4 sub-fases + §5 verificadores según las decisiones distintas. Tras refinamiento, comiteamos plan v2 sobre rama feature antes de Op 1.

### §12.4 Prompt sugerido para arrancar Claude Code en sub-fase 4a

```
Hola. Soy Ramón, retomo fase 4 del refactor.
Estado: rama refactor/fase-4-render-layer activa, HEAD = commit del plan v1 (o v2).
Working tree limpio.

Plan táctico: refactor/fase-4-plan.md (leelo entero, especialmente §0 PASO 0,
§3 API de chartRender, §4.1 sub-fase 4a, §10 workflow bicapa, §11 reglas absolutas).

Reglas absolutas:
- NO Edit sin que Ramón haya dado OK explícito previo.
- Cada Op = Edit propuesto → mostrar a Ramón → Ramón valida con Claude web →
  Ramón aprueba → ejecutar Edit.
- NO usar Claude Code para validación de bytes (colapsa outputs). Ramón valida
  desde shell zsh nativo.
- Greps verificadores PRE-Op antes de tocar nada (§10.2).

Cuando hayas leído el plan, dime:
1. Qué entendiste de la sub-fase 4a en una frase.
2. Resultados de los 2 greps verificadores PRE-Op de §10.2.
3. Propón Op 4a-1 (crear lib/chartRender.js) y espera mi OK explícito.
```

---

**Fin del plan táctico fase 4 v1.**

Pendiente OK Ramón sobre §0.2.A/B/C/D + plan completo antes de comitear el plan a main y arrancar la rama feature.
