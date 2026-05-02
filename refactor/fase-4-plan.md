# Plan táctico fase 4 — render layer (v2)

> Fecha: 2 mayo 2026, sesión "simulador 11".
> Autor: Claude Opus 4.7 (chat web, CTO/revisor) + Ramón Tarinas (pegamento humano).
> Estado al redactar v2: rama `refactor/fase-4-render-layer` activa, HEAD = `d45c8da` (commit del plan v1). Working tree limpio. Pendiente de comitear v2 sobre rama feature antes de Op 4a-1.
> **v2 refina v1.** Cambios documentados en §13. Los bytes en disco del repo no han cambiado entre v1 y v2 — solo la precisión de los números de línea registrados en el plan, tras detección por Claude Code al lanzar greps verificadores PRE-Op.

---

## §0. PASO 0 — Inventario al carácter

PASO 0 ejecutado al inicio de la sesión 11 con greps recursivos sobre bytes en disco desde shell zsh nativo (NO Claude Code), validación al carácter (lección §8.2 HANDOFF fase 3).

### §0.1 Inventario de escrituras al render layer

**Escrituras identificadas fuera de `lib/chartViewport.js`:** 6 escrituras, todas en `components/_SessionInner.js`, todas dentro de la función `updateChart` (L1058-L1218).

| # | Línea | API | Rama | Contexto |
|---|---|---|---|---|
| 1 | L1084 | `cr.series.setData` | init/full | Primera carga del par o TF change. Full rebuild. |
| 2 | L1106 | `cr.series.update` | one-bar-new (happy) | Una vela TF nueva — actualizar última real (dentro del callback `applyUpdates` de `restoreOnNewBar`). |
| 3 | L1108 | `cr.series.update × N` | one-bar-new (happy) | Bucle phantoms tras vela nueva (typ N=10), dentro del mismo callback. |
| 4 | L1136 | `cr.series.update` | within-bucket | Tick simple — actualizar última real (mismo bucket TF). |
| 5 | L1143 | `cr.series.update` | within-bucket | Bucle phantoms in-place si `_lastC` cambió. |
| 6 | L1149 | `cr.series.setData` | within-bucket fallback (catch) | Fallback si el `try` de within-bucket falla. |

Ocurrencias internas a `lib/chartViewport.js` (NO se tocan en fase 4 fuera de Op 4a-6):
- L152: `cr.series.setData` dentro del fallback de `restoreOnNewBar` (alcance §0.2.A Camino X).

### §0.2 Decisiones técnicas pendientes — RESUELTAS por Ramón antes de comitear v2

#### §0.2.A — Camino X (RESUELTO)

`chartViewport.js:152` se sustituirá en Op 4a-6 por una llamada a `applyFullRender(cr, agg, cr.phantom)`. Render layer queda 100% aislado en `lib/chartRender.js`. ChartViewport pasa a depender de chartRender (acoplamiento unidireccional, sin ciclos).

**Verificación de no-ciclo:** chartRender importa de sessionData. ChartViewport importará de chartRender. Ningún módulo importa de chartViewport. Cero ciclos.

#### §0.2.B — Opción B (RESUELTO)

El bloque `[DEBUG TEMP]` (gateado por flag `window.__algSuiteDebugLS`) se migra dentro de `applyNewBarUpdate` en sub-fase 4c. Performance neutral si flag false. Consolida toda la rama "una vela TF nueva" en un solo sitio (chartRender), facilitando el ataque al bug "salta al play" en sesión post-fase-4.

#### §0.2.C — Mutación in-place ACEPTADA (RESUELTO)

La mutación in-place de `cr.phantom[i].open/high/low/close = lastClose` ocurre dentro de `applyTickUpdate` en `lib/chartRender.js`. El caller pasa `lastClose` como parámetro; el render decide cómo aplicarlo. Opción B estricta no prohíbe que chartRender mute el array recibido — prohíbe que chartRender posea el ciclo de vida del array.

#### §0.2.D — Nombre `lib/chartRender.js` (RESUELTO)

Sigue patrón `chart*` de chartViewport y chartCoords. Coherencia con resto del codebase.

### §0.3 Conteos finales tras PASO 0

- **Escrituras al chart en `_SessionInner.js`:** 6 (todas dentro de `updateChart`, L1058-L1218).
- **Escrituras al chart fuera de `_SessionInner.js`:** 1 (en `chartViewport.js:152`, alcance §0.2.A Camino X — se elimina en Op 4a-6).
- **Función `updateChart`:** L1058-L1218 (160 líneas). Es la zona quirúrgica de fase 4.
- **Llamadas a `setSeriesData` (data layer fase 2) dentro de `updateChart`:** 3 invocaciones reales (L1085 init/full, L1104 one-bar-new pre-callback, L1150 fallback within-bucket catch) + 1 paso por referencia como propiedad de `fallbackCtx` (L1127, dentro del objeto pasado a `restoreOnNewBar` para el fallback de chartViewport). Cada invocación acompaña a su escritura `cr.series.setData` correspondiente — el invariante es que el global `__algSuiteSeriesData` se mantiene sincronizado con lo que LWC ve en pantalla.
- **Llamadas a `updateSeriesAt`:** 1 (L1112 — within-bucket happy path tras `cr.series.update(agg[agg.length-1])`). Esta queda encapsulada dentro de `applyTickUpdate` en sub-fase 4b.
- **Tamaño actual `_SessionInner.js`:** 2988 líneas (post-fase 3).
- **Tamaño actual `lib/chartViewport.js`:** 204 líneas.
- **Tamaño actual `lib/sessionData.js`:** 186 líneas.
- **Tamaño actual `lib/chartCoords.js`:** 117 líneas.

### §0.4 Lo que NO se toca en fase 4 (queda inline o en sus módulos actuales)

- **`_mkPhantom`** (factory de phantoms) — local dentro de `updateChart`. Lógica de creación, no de render. Se queda.
- **`_phantomsNeeded`** (campo de cr) — gestión del tamaño del buffer. Se queda.
- **Cálculo de `phantomsNeeded` en effect TF change** (L1184-L1209) — toca `exportTools()` (drawings). Se queda.
- **`cr.phantom`** (array de phantoms) — propiedad de `chartMap.current[pair]`. Se queda gestionada por `_SessionInner.js`. ChartRender la recibe como parámetro.
- **`captureSavedRange`, `initVisibleRange`, `restoreSavedRange`, `restoreOnNewBar`, `scrollToTail`, `markUserScrollIfReal`** — API de fase 3 (chartViewport). Se siguen llamando desde `_SessionInner.js`, no se tocan.
- **Effect engine init (L791, L810), handleStep (L1264), seek por click (L2178)** — call sites de `updateChart`. La signatura de `updateChart` no cambia → no se tocan.

---

## §1. Resumen ejecutivo en lenguaje llano

Para Ramón, sin tecnicismos:

Vamos a hacer la fase 4 del refactor del simulador. **Igual que con fase 2 y fase 3, no vamos a cambiar nada visible** — el simulador se va a comportar exactamente igual que antes. Lo que vamos a hacer es una limpieza interna: sacar el código que dibuja velas en el chart de `_SessionInner.js` (el archivo gigante de 2988 líneas) y ponerlo en un archivo nuevo y pequeño llamado `lib/chartRender.js` (estimado: 150-200 líneas).

**¿Por qué?** Por la misma razón que hicimos fase 3: cuando todo está mezclado en un archivo gigante, es muy difícil arreglar bugs sin romper otras cosas. Después de fase 4, si en el futuro hay un problema relacionado con cómo se renderizan las velas o las phantoms, sabremos exactamente dónde mirar.

**Lo que NO incluye fase 4 (importante):** **NO** vamos a atacar el bug "salta al play TF bajo + speed máxima" dentro de fase 4. Ese bug se ataca en una sesión separada e inmediata DESPUÉS de cerrar fase 4. Razones: (1) fase 4 quedará con el render layer aislado, lo que hace más fácil el ataque al bug; (2) si metemos el ataque del bug dentro de fase 4 podemos contaminar el alcance y arriesgarnos a un PR sucio. Disciplina §7 CLAUDE.md: cierre parcial validado > cierre total roto.

**Bonus posible (sin promesa):** durante fase 4 vamos a mantener vivo el bloque de logging que ya estaba puesto para investigar el bug "long/short se contrae al play" (que es el mismo bug que reportó Luis). Si durante la migración descubrimos algo relevante sobre el bug, lo anotamos para la sesión post-cierre.

**Tiempo estimado:** rango 4-10 horas según cómo de fluida sea la ejecución. Si fase 4 se complica más de lo esperado, paramos donde validemos.

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

### §2.2 Opción B — render layer "estricto" (ELEGIDA)

Un módulo `lib/chartRender.js` que encapsula SOLO las 6 escrituras al chart + `setSeriesData`/`updateSeriesAt` que las acompañan + mutación in-place de phantoms cuando hace falta para que el render sea correcto. Gestión del array `cr.phantom` (creación / regeneración) y cálculo de `phantomsNeeded` se quedan en `_SessionInner.js`.

**Pro:** alcance acotado, blast radius pequeño, simétrica con fase 3 (chartViewport encapsula escrituras al viewport, chartRender encapsula escrituras al chart).
**Contra:** queda lógica de phantoms inline en `_SessionInner.js` que será raro de leer hasta que se haga fase 4.5 / fase 5.

### §2.3 Opción C — render layer + phantom buffer en paralelo

Dos módulos nuevos: `lib/chartRender.js` (escrituras al chart) + `lib/phantomBuffer.js` (estado y mutación de `cr.phantom`).

**Pro:** separación arquitectónica clara, ambos módulos pequeños.
**Contra:** 2 archivos nuevos en una fase = más superficie de revisión por commit. Mayor coordinación entre los dos módulos durante la migración. Para una primera fase de extracción es overengineering — mejor sacar render primero, luego decidir si phantom buffer merece su propio módulo.
**Veredicto:** descartada para fase 4. Phantom buffer puede ser fase 4.5 (opcional) o fase 5.

### §2.4 Decisión

**Opción B — render layer "estricto".** Sub-fases 4a / 4b / 4c como detallado en §4.

---

## §3. API de `lib/chartRender.js`

### §3.1 Header del módulo

Estructura simétrica al header de `chartViewport.js`:

- Documenta que el módulo es el ÚNICO punto del proyecto que escribe a `cr.series.setData` y `cr.series.update`.
- Documenta que el array `cr.phantom` NO vive aquí — es propiedad de `chartMap.current[pair]` y se recibe por parámetro.
- Documenta que `setSeriesData` / `updateSeriesAt` (data layer fase 2) se llaman desde dentro de la API porque están acoplados con cada escritura al chart (mantener el array global sincronizado con LWC).
- Lista de funciones públicas con su responsabilidad.
- Anota explícitamente lo que NO está en alcance: creación/regeneración de phantoms, cálculo de `phantomsNeeded`, viewport reads/writes (fase 3), drawings (fase 5).

### §3.2 Funciones públicas

#### `applyFullRender(cr, agg, phantoms)`

Encapsula el patrón `setData + setSeriesData` para full rebuild del chart.

**Reemplaza:**
- `_SessionInner.js:1084-1085` (rama init/full)
- `_SessionInner.js:1149-1150` (fallback within-bucket catch)
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

#### `applyTickUpdate(cr, agg, phantoms, lastClose)`

Encapsula la rama "within-bucket" — actualizar la última vela y refrescar phantoms in-place si el close cambió.

**Reemplaza:** rama `else` within-bucket completa de `updateChart` (incluido try/catch externo). **Rango exacto verificar al carácter al ejecutar Op 4b-3 — estimación L1129-L1152.**

**Pseudocódigo:**
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
- El fallback llama a `applyFullRender` (no duplica `setData` + `setSeriesData`).

#### `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`

Encapsula el callback de `restoreOnNewBar` — actualizar la última vela real + re-aplicar todas las phantoms al chart. Incluye el bloque [DEBUG TEMP] gateado por flag (§0.2.B Opción B).

**Reemplaza:** callback `applyUpdates` de `restoreOnNewBar`. **Rango exacto verificar al carácter al ejecutar Op 4c-3 — estimación L1105-L1124, cierre antes del `}, { agg, mkPhantom...}`.**

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
- Sin try/catch principal — el catch de `restoreOnNewBar` (en chartViewport.js) sigue siendo el fallback global.
- `debugCtx` opcional. Si no se pasa, el log no rompe (usa `?.`).
- El log se envuelve en su propio try/catch para no romper el render si la flag está activa pero el export de drawings falla.

### §3.3 Importaciones del módulo — política

**Cada Op de creación importa SOLO lo que su función pública nueva usa.** No se anticipa import de funciones que aún no se usan, aunque vayan a usarse en Op posteriores. Razones: (a) cada commit auto-contenido; (b) evitar warning de unused import en `npm run build`; (c) diff entre commits más limpio.

- **Op 4a-1 (creación):** `import { setSeriesData } from './sessionData'`.
- **Op 4b-1 (extender):** ampliar import a `import { setSeriesData, updateSeriesAt } from './sessionData'`.
- **Op 4c-1 (extender):** sin cambios en import si `applyNewBarUpdate` no usa nada nuevo.

Sin imports de `chartViewport` (no se necesita). Sin imports de `chartCoords` (no se necesita).

### §3.4 Tamaño estimado del módulo

~150-200 líneas (código + headers JSDoc completos similares a `chartViewport.js`).

---

## §4. Sub-fases

Patrón heredado de fase 3: cada sub-fase es un commit atómico con baselines pre/post, validación al carácter, y aprobación explícita Ramón antes de cada Edit.

### §4.1 Sub-fase 4a — `applyFullRender` + migración rama init/full + fallback within-bucket catch + Camino X chartViewport

**Alcance:** crear `lib/chartRender.js` con la primera función pública (`applyFullRender`). Migrar los 3 sitios donde se hace full rebuild.

**Operaciones:**

- **Op 4a-1 — crear `lib/chartRender.js`** con header JSDoc + función `applyFullRender` exportada + `import { setSeriesData } from './sessionData'`. Aprobación.
- **Op 4a-2 — extender import en `_SessionInner.js:13`** añadiendo `applyFullRender` desde `'../lib/chartRender'`. Aprobación.
- **Op 4a-3 — sustituir L1084-L1085** (rama init/full) por `applyFullRender(cr, agg, cr.phantom)`. Aprobación.
- **Op 4a-4 — sustituir L1149-L1150** (fallback within-bucket catch) por `applyFullRender(cr, agg, cr.phantom)`. Aprobación.
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

- **Op 4b-1 — extender `lib/chartRender.js`** con `applyTickUpdate(cr, agg, phantoms, lastClose)`. Ampliar import a incluir `updateSeriesAt`. La función incluye el try/catch propio con fallback a `applyFullRender`. Aprobación.
- **Op 4b-2 — extender import en `_SessionInner.js:13`** añadiendo `applyTickUpdate`. Aprobación.
- **Op 4b-3 — sustituir rama `else` within-bucket completa** (try/catch externo + bucle phantoms in-place) por `applyTickUpdate(cr, agg, cr.phantom, _lastC)`. **Rango exacto verificar al carácter al ejecutar (estimación L1129-L1152, abrir desde `} else {` hasta cierre del `}` de la rama).** Aprobación.

**Punto delicado:** la rama within-bucket actual tiene un `try/catch` externo que envuelve update + bucle. La nueva API mete ese try/catch DENTRO de `applyTickUpdate`. **Verificar al carácter en momento de Op que la sustitución preserve la semántica:** la línea entera `} else { try{ ... }catch{ ... } }` se sustituye por `} else { applyTickUpdate(cr, agg, cr.phantom, _lastC) }`.

**Verificadores 4b:**
- Grep: `grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/chartViewport.js"` → cero líneas en `_SessionInner.js`.
- Grep: `grep -rn "updateSeriesAt" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/sessionData.js"` → vacío.
- `npm run build` verde.
- Pruebas manuales: play a velocidad media en TF M5, ver que las phantoms siguen el precio en tiempo real (cola plana visible a la derecha sin lag ni saltos).

**Commit 4b:** `refactor(fase-4b): migrar rama within-bucket a applyTickUpdate`.

### §4.3 Sub-fase 4c — `applyNewBarUpdate` + migración rama "una vela TF nueva" + [DEBUG TEMP]

**Alcance:** añadir `applyNewBarUpdate` a `lib/chartRender.js`, incluyendo el bloque [DEBUG TEMP] gateado por flag. Migrar el callback de `restoreOnNewBar`.

**Pre-condición:** sub-fase 4b comiteada.

**Operaciones:**

- **Op 4c-1 — extender `lib/chartRender.js`** con `applyNewBarUpdate(cr, agg, phantoms, debugCtx)`. Incluye el bloque [DEBUG TEMP] migrado al pseudocódigo de §3.2. Aprobación.
- **Op 4c-2 — extender import en `_SessionInner.js:13`** añadiendo `applyNewBarUpdate`. Aprobación.
- **Op 4c-3 — sustituir el callback `applyUpdates`** de `restoreOnNewBar` por `() => applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })`. Mantener intacto el resto de la llamada a `restoreOnNewBar` (los argumentos `cr` y `fallbackCtx` no cambian). **Rango exacto verificar al carácter al ejecutar (estimación L1105-L1124, cerrar antes del `}, { agg, mkPhantom...}`).** Aprobación.

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

**Operaciones:** se decide durante 4c. Por defecto, esta sub-fase **NO existe** y fase 4 cierra con 4a + 4b + 4c.

---

## §5. Criterio "fase 4 terminada"

Tres criterios verificables al carácter (patrón heredado fase 3 §5):

### §5.1 Verificadores grep

```
grep -rn "series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío

grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/chartViewport.js"
→ vacío (matches en chartViewport solo en JSDoc, son comentarios)

grep -rn "updateSeriesAt" components/ pages/ lib/ | grep -v "lib/chartRender.js" | grep -v "lib/sessionData.js"
→ vacío
```

### §5.2 Build verde

```
npm run build
→ 0 errores, 0 warnings nuevos respecto a baseline pre-fase-4.
```

### §5.3 Diff completo revisado y comportamiento idéntico

- `git diff main..refactor/fase-4-render-layer` revisado por Ramón en chat web.
- Cero archivos tocados fuera de alcance. Archivos esperados: `lib/chartRender.js` (nuevo), `lib/chartViewport.js` (1 línea modificada en fallback), `components/_SessionInner.js` (1 import + 4-5 sustituciones), `refactor/fase-4-plan.md` (este plan v2).
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
3. **Hipótesis de fix:** la regeneración de phantoms en la rama "una vela TF nueva" usa `_phN = cr.phantom?.length || 10`. Si las phantoms previas tenían longitud 10 (default), pero en el TF actual hay drawings que necesitan más, el bucle se queda corto. Posible fix: re-leer drawings antes de regenerar y recalcular `phantomsNeeded`. Esto contamina con drawings → puede empezar a parecer fase 5.
4. **Decisión arquitectónica de la sesión post-fase-4:** si el fix es trivial y queda dentro del render, se hace en una mini-rama `fix/limit-desaparece-al-play`. Si requiere tocar drawings significativamente, se posterga a fase 5 con plan dedicado.

---

## §7. Decisión sobre `[DEBUG TEMP]` (resumen)

§0.2.B Opción B → bloque migrado dentro de `applyNewBarUpdate` en sub-fase 4c, gateado por flag global `window.__algSuiteDebugLS`. Performance neutral si flag false.

**Cuándo se limpia:** tras cerrar el bug "salta al play" en sesión post-fase-4 (o sesión posterior si se posterga). El cierre del bug incluye eliminar el bloque [DEBUG TEMP] como último Op de esa sesión.

**Hasta entonces:** se preserva. Es instrumentación viva.

---

## §8. Lo que NO entra en alcance de fase 4

- **Fase 4.5 / fase 5 — drawings lifecycle.** Reorganizar suscripciones de `CustomDrawingsOverlay`, `DrawingToolbar`, `KillzonesOverlay`. Tampoco tocar el cálculo de `phantomsNeeded` en effect TF change (acopla con drawings).
- **Fase 6 — trading layer.** Aislar entries / exits / SL / TP / pending orders.
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

Working tree vuelve a estado pre-4a (HEAD de rama = commit del plan v2).

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

Pierde el merge commit y los 3 commits de sub-fase. Los planes v1 y v2 quedan comiteados en main por separado, no se pierden.

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
- **Claude Code (driver técnico):** ejecuta los Edits propuestos sobre el código una vez tenga OK explícito de Ramón.

### §10.1 Pre-arranque (chat web — completado)

1. ✅ Plan v1 redactado, comiteado en main como `d45c8da`.
2. ✅ Rama feature `refactor/fase-4-render-layer` creada desde `d45c8da`.
3. ✅ Decisiones §0.2.A/B/C/D aprobadas por Ramón.
4. Pendiente: comitear este plan v2 sobre rama feature antes de Op 4a-1.

### §10.2 Arranque (Claude Code)

5. Verificar rama `refactor/fase-4-render-layer` activa, HEAD = commit del plan v2 sobre la rama.
6. Greps verificadores PRE-Op (ejecutados al inicio de la sesión Claude Code):
   - `grep -rn "series.setData" components/ pages/ lib/ | grep -v "lib/chartViewport.js"` → debe matchar L1084 y L1149 en `_SessionInner.js`.
   - `grep -rn "series.update" components/ pages/ lib/ | grep -v "lib/chartViewport.js"` → debe matchar L1106, L1108, L1136, L1143 en `_SessionInner.js`.

### §10.3 Ejecución

7. Op 4a-1 → 4a-6 (sub-fase 4a). Cada Op con aprobación explícita Ramón → Edit Claude Code → validación al carácter Ramón desde shell. Tras Op 4a-6: commit 4a.
8. Pruebas 4a (§4.1 verificadores). Si OK → arrancar 4b. Si KO → diagnóstico + rollback §9.
9. Op 4b-1 → 4b-3. Tras Op 4b-3: commit 4b. Pruebas 4b.
10. Op 4c-1 → 4c-3. Tras Op 4c-3: commit 4c. Pruebas 4c.
11. (Condicional) Sub-fase 4d si aparecen loose ends.

### §10.4 Validación pre-merge

12. Greps verificadores §5.1.
13. `npm run build`.
14. `git diff main..refactor/fase-4-render-layer` revisado por Ramón en chat web.
15. OK explícito Ramón sobre el diff entero.

### §10.5 Merge + push

16. Decidir push hoy o mañana en frío (lección §8.4 fase 2).
17. Si OK: `git checkout main && git merge refactor/fase-4-render-layer && git push origin main`. Vercel re-deploya.
18. Smoke check producción Ramón (cargar simulador, par, TF, play breve).

### §10.6 Cierre

19. Redactar `HANDOFF-cierre-fase-4.md` (chat web).
20. Comitear HANDOFF en main + push.
21. Si decisión Ramón: arrancar sesión post-fase-4 para bug "salta al play" (§6).

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

## §12. Cómo arrancar Op 4a-1 — checklist final

### §12.1 Estado actual al firmar plan v2

- ✅ Rama `refactor/fase-4-render-layer` activa, HEAD = `d45c8da` (plan v1).
- ✅ Working tree limpio.
- ⏳ Plan v2 pendiente de mover a `refactor/fase-4-plan.md` (sobrescribir v1) y comitear sobre rama feature.

### §12.2 Pasos para comitear plan v2 y arrancar Op 4a-1

1. Mover `fase-4-plan.md` (descargado, contiene v2) a `refactor/fase-4-plan.md`, sobrescribiendo v1.
2. `git status` → debe mostrar `refactor/fase-4-plan.md` como modificado.
3. `git add refactor/fase-4-plan.md`.
4. `git commit -m "docs(fase-4): refinar plan tras inventario PASO 0 con bytes literales"`. (Mensaje literal heredado de fase 3 plan v2.)
5. `git log --oneline -3` → debe mostrar el nuevo commit en HEAD seguido de `d45c8da` (plan v1) y `aad131b` (HANDOFF fase 3).
6. Abrir Claude Code en el repo, prompt de arranque adjunto en §12.3.

### §12.3 Prompt sugerido para arrancar Claude Code en sub-fase 4a

```
Hola. Soy Ramón, retomo el simulador. Arrancamos sub-fase 4a del refactor data-layer.

Estado al carácter:
- Repo: /Users/principal/Desktop/forex-simulator-algorithmic-suite
- Rama activa: refactor/fase-4-render-layer
- HEAD = commit del plan v2 (refinamiento)
- main local = d45c8da (plan v1, vive solo en local)
- origin/main = aad131b (fase 3 cerrada, sin tocar)
- Working tree limpio.

Plan táctico: refactor/fase-4-plan.md (versión v2, refina v1).
Léelo entero antes de proponer nada. En particular, atiende a:
- §0 PASO 0 (inventario al carácter ya hecho desde shell por Ramón).
- §0.2 decisiones técnicas (todas resueltas).
- §3 API de chartRender (incluye §3.3 política de imports — solo lo que cada Op usa).
- §4.1 sub-fase 4a.
- §10 workflow bicapa.
- §11 reglas absolutas heredadas.
- §13 transición v1 → v2 (qué cambió y por qué).

REGLAS ABSOLUTAS — no negociables:
1. NO Edit sin OK explícito previo de Ramón.
2. NO uses tu propia output para validar bytes — colapsa con "+N lines (ctrl+o)".
3. Greps verificadores PRE-Op antes de tocar nada (§10.2).
4. Sub-fase 4a tiene 6 ops (4a-1 a 4a-6) que van TODAS en un solo commit al final
   de 4a, no uno por op.
5. NO push a origin sin OK explícito.

Cuando hayas leído el plan, dime:
1. Qué entendiste de la sub-fase 4a en una frase llana.
2. Lanza los 2 greps verificadores PRE-Op de §10.2 y compáralos con lo esperado.
3. Propón Op 4a-1: crear lib/chartRender.js con header + applyFullRender +
   import { setSeriesData } from './sessionData' (SOLO setSeriesData, sin
   updateSeriesAt — política §3.3 del plan v2).
   Muéstrame el contenido completo del archivo a crear y espera mi OK.

NO empieces hasta que yo te apruebe el contenido propuesto.
```

### §12.4 Op 4a-1 ya tiene OK condicional dado por Ramón en sesión 11

Claude Code propuso contenido completo de `lib/chartRender.js` antes del refinamiento v2. La propuesta fue auditada al carácter por Claude Opus 4.7 web. Modificación pedida: import reducido a solo `setSeriesData` (política §3.3 plan v2). Con esa modificación, **OK Op 4a-1 firmado por Ramón**. Claude Code puede ejecutar tras leer plan v2.

---

## §13. Transición v1 → v2

### §13.1 Por qué existe v2

Al lanzar los greps verificadores PRE-Op (§10.2) sobre los bytes en disco antes de Op 4a-1, Claude Code detectó que **4 números de línea en plan v1 no coincidían con los bytes reales**:

| # | Plan v1 | Real | Sección afectada |
|---|---|---|---|
| 1 | L1112 (update within-bucket) | **L1136** | §0.1 tabla #4 |
| 2 | L1118 (update × N within-bucket) | **L1143** | §0.1 tabla #5 |
| 3 | L1124 (setData fallback within-bucket) | **L1149** | §0.1 tabla #6 + §3.2 + §4.1 + §10.2 |
| 4 | "4 setSeriesData (L1085, L1104, L1113, L1125)" | **3 invocaciones (L1085, L1104, L1150) + 1 paso por referencia (L1127)** | §0.3 conteos |

### §13.2 Causa raíz

**No fue error del PASO 0 ni de los outputs de Ramón.** Ramón pegó bytes literales correctos del shell. El error fue de Claude Opus 4.7 web al transcribir los bytes a la tabla §0.1 — aproximación inferida en lugar de copia al carácter. Violación directa de la disciplina §9.4 ("distinguir lo verificado de lo inferido"), redactada por el propio Claude pocos minutos antes en el plan v1.

### §13.3 Aprendizaje

- **Disciplina §9.4 aplica también al CTO/revisor**, no solo a Claude Code o al pegamento humano. Cuando se redacta un plan, los números deben copiarse al carácter desde los outputs de shell, NO sintetizarse.
- **La bicapa funciona.** Claude Code lanzó greps PRE-Op sobre bytes en disco y detectó la discrepancia inmediatamente. Sin esa verificación, los Ops 4a-4, 4b-3 y 4c-3 habrían tropezado al ejecutar.
- **El refinamiento v1 → v2 es práctica saludable, no penalización.** Ya pasó en fase 3 (commits `e99571c` v1 → `688c07e` v2). Forma parte del proceso de "PASO 0 con bytes literales antes de redactar API". El plan v1 capturó la arquitectura correcta; v2 ajusta los punteros precisos al código.

### §13.4 Cambios literales aplicados en v2

1. §0.1 tabla — 3 números corregidos (#4 L1112→L1136, #5 L1118→L1143, #6 L1124→L1149).
2. §0.3 conteos — línea de setSeriesData reescrita: "3 invocaciones reales (L1085, L1104, L1150) + 1 paso por referencia (L1127)". Añadido bullet sobre `updateSeriesAt`.
3. §3.2 applyFullRender JSDoc — "L1124-1125" → "L1149-1150".
4. §3.3 política de imports — sección nueva explicitando que cada Op importa solo lo que su función pública usa. Decisión Ramón sesión 11: import en Op 4a-1 reducido a solo `setSeriesData`.
5. §4.1 Op 4a-4 — "L1124-L1125" → "L1149-L1150".
6. §4.2 Op 4b-3 — añadida nota "rango exacto verificar al carácter al ejecutar Op (estimación L1129-L1152)".
7. §4.3 Op 4c-3 — añadida nota "rango exacto verificar al carácter al ejecutar Op (estimación L1105-L1124, cerrar antes del `}, { agg, mkPhantom...}`)".
8. §10.2 greps esperados — 3 números corregidos.
9. §10.1 pre-arranque — actualizado a estado real (plan v1 ya comiteado, rama ya creada, decisiones aprobadas).
10. §12 reescrito — checklist final adaptado al estado actual de sesión 11.
11. §13 nuevo — esta sección, autoría honesta de la transición.

### §13.5 Estado de los bytes en disco

**Sin cambios entre v1 y v2.** Los bytes en `_SessionInner.js`, `lib/chartViewport.js`, `lib/sessionData.js`, `lib/chartCoords.js` son los mismos que cuando se redactó v1. Solo cambia el documento `refactor/fase-4-plan.md`.

---

**Fin del plan táctico fase 4 v2.**

Pendiente: mover archivo, comitear v2 sobre rama feature, abrir Claude Code con prompt §12.3, ejecutar Op 4a-1 con import corregido (solo `setSeriesData`).
