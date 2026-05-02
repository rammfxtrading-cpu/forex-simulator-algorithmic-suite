# Fase 3 — Plan táctico v2: aislar la viewport layer (escrituras)

> Fecha de redacción: 2 mayo 2026, sesión "simulador 10" con Claude Opus 4.7 (chat web).
> **Versión 2** — refinada tras inventario PASO 0 con bytes literales del shell. Cambios principales en §3 (diseño de API), §4 (sub-fases). v1 mantenía estructura correcta pero confundía el rol de L1142/L1145 (catch fallback, no rama tick simple) y omitía el bloque DEBUG TEMP en L1126-L1136 y el rAF anidado de L1234.
> De: Ramón + Claude (chat web actuando de CTO/revisor).
> Para: arrancar fase 3 del refactor data-layer tras saneamiento histórico.
> Estado al redactar: rama `refactor/fase-3-viewport-layer` con HEAD `e99571c` (plan v1 comiteado), working tree limpio, código producción intacto en `bb63bfd`. PASO 0 ejecutado al carácter con greps + sed sobre bytes en disco. Plan v2 pendiente de OK Ramón antes del primer Edit.

---

## 0. Decisión arquitectónica §0 — Alcance reducido (Opción B)

### 0.1 Las opciones consideradas

**Opción A — Plan completo (escrituras + lecturas + suscripciones de consumers).**
- Mover las 5 escrituras + las 5 lecturas + reorganizar las 4 suscripciones de consumers.
- Toca 5 archivos: `_SessionInner.js`, `lib/chartCoords.js`, `CustomDrawingsOverlay.js`, `DrawingToolbar.js`, `KillzonesOverlay.js`.
- Probablemente cierra B3 + parte de B2.
- Riesgo: alto. Tocar consumers de drawings/killzones sin haber atacado fase 5 (drawings lifecycle) puede destapar B6 inadvertidamente.

**Opción B — Plan reducido (escrituras + variables de estado solo).**
- Mover las 5 escrituras (4 setVisibleLogicalRange + 1 scrollToPosition) y las 4 variables de estado (`_savedRange`, `userScrolled`, `hasLoaded`, `isAutoSettingRange`) de `_SessionInner.js` a un nuevo `lib/chartViewport.js`.
- Lecturas (`getVisibleLogicalRange`, `getVisibleRange`) y suscripciones de consumers se quedan donde están.
- Toca 1 archivo principal (`_SessionInner.js`) + crea 1 nuevo (`lib/chartViewport.js`).
- Probablemente cierra B3 (TF reset al entrar Review).
- Riesgo: medio.

**Opción C — Recalibrar antes (actualizar core-analysis.md primero).**
- Antes del plan, actualizar `core-analysis.md §6 Fase 3` con los hallazgos del PASO 0.
- Sin riesgo añadido pero alarga la sesión.

### 0.2 Decisión: Opción B (confirmada por Ramón)

Razones registradas en plan v1 §0.2.

### 0.3 Decisión §2.5: arreglar `isAutoSettingRange` durante fase 3 (confirmada por Ramón)

Activar correctamente la flag (set true antes de cada escritura programática, set false tras el rAF). Coste ~3 líneas extra dentro de cada función de la API.

### 0.4 Lo que NO es el alcance

- **NO** tocar las 5 lecturas de `getVisibleLogicalRange` (4 en `_SessionInner.js` L849/L1083/L1121/L1142, 1 en `lib/chartCoords.js` L68).
- **NO** tocar la lectura de `getVisibleRange` en `lib/chartCoords.js` L51.
- **NO** tocar las suscripciones `subscribeVisibleLogicalRangeChange` de `CustomDrawingsOverlay.js`, `DrawingToolbar.js`, `KillzonesOverlay.js`.
- **NO** atacar B2/B5/B6 ni el bug nuevo "limit desaparece al play". Cada uno tiene sesión dedicada futura.
- **NO** atacar fase 4 (render layer), fase 5 (drawings), fase 6 (trading), fase 7 (reducir _SessionInner.js).
- **NO** tocar `lib/replayEngine.js`. Sigue intocable.
- **NO** tocar el bloque `[DEBUG TEMP]` L1126-L1136 (`__algSuiteDebugLS`). Se preserva al carácter durante la migración. Su limpieza es alcance separado (cuando el bug long/short se contrae al play se cierre).
- **NO** instalar deps npm. Regla absoluta CLAUDE.md §3.4.
- **NO** migraciones Supabase. Regla absoluta CLAUDE.md §3.1.
- **NO** mergear nada a main durante la fase. Solo commits en `refactor/fase-3-viewport-layer`.
- **NO** push sin OK explícito de Ramón.

---

## 1. Objetivo de fase 3

> **Aislar las escrituras de la viewport layer en un módulo `lib/chartViewport.js`** que sea el ÚNICO punto del proyecto que llame a `chart.timeScale().setVisibleLogicalRange()` y `chart.timeScale().scrollToPosition()`. Al terminar, ningún archivo fuera de `lib/chartViewport.js` debe escribir directamente al viewport del chart.

---

## 2. Inventario al carácter (bytes en disco verificados 2 may 2026)

### 2.1 Mapa real del flujo `updateChart` y zonas adyacentes

Tras `sed` literal sobre bytes del repo, el flujo de viewport en `_SessionInner.js` se distribuye así:

**Zona A — Handler subscribe (L865-L880):**

```
870:    chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
871:      const _cr=chartMap.current[pair]
872:      if(_cr?.hasLoaded&&!_cr?.isAutoSettingRange) _cr.userScrolled=true
873:      setChartTick(t=>t+1)
874:    })
```

**Zona B — Rama "init o full rebuild" dentro de `updateChart` (L1078-L1102):**

```
1082:      let _savedRange=null
1083:      try{ if(cr.hasLoaded) _savedRange=cr.chart.timeScale().getVisibleLogicalRange() }catch{}
1084:      cr.series.setData([...agg,...cr.phantom])
1085:      setSeriesData([...agg, ...cr.phantom], agg.length)
1086:      if(!cr.hasLoaded){
1087:        cr.hasLoaded=true
1088:        cr.userScrolled=false
1089:        const _tbars={'M1':80,'M3':75,'M5':70,'M15':60,'M30':50,'H1':60,'H4':50,'D1':40}
1090:        const _show=_tbars[tf]||80
1091:        const _to=agg.length+5
1092:        const _from=Math.max(0,_to-_show)
1093:        requestAnimationFrame(()=>{
1094:          try{cr.chart.timeScale().setVisibleLogicalRange({from:_from,to:_to})}catch{}
1095:        })
1096:      } else {
1097:        // TF change or rebuild — restore previous range
1098:        if(full) cr.userScrolled=false
1099:        if(_savedRange){
1100:          requestAnimationFrame(()=>{
1101:            try{ cr.chart.timeScale().setVisibleLogicalRange(_savedRange) }catch{}
1102:          })
1103:        }
```

**Zona C — Rama "una vela TF nueva cerrada" dentro de `updateChart` (L1115-L1148):**

```
1117:      const _phN = cr.phantom?.length || 10
1118:      cr.phantom = Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
1119:      setSeriesData([...agg, ...cr.phantom], agg.length)
1120:      try{
1121:        const _rng=cr.userScrolled?cr.chart.timeScale().getVisibleLogicalRange():null
1122:        cr.series.update(agg[agg.length-1])
1123:        for(const ph of cr.phantom){ try{ cr.series.update(ph) }catch{} }
1124-1136:        // [DEBUG TEMP] bloque __algSuiteDebugLS — preservar al carácter
1137:        // (12 líneas, ver §2.2)
1138:        if(_rng) requestAnimationFrame(()=>{try{cr.chart.timeScale().setVisibleLogicalRange(_rng)}catch{}})
1139:      }catch{
1140:        // Fallback
1141:        cr.phantom=Array.from({length:10},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
1142:        const _r2=cr.chart.timeScale().getVisibleLogicalRange()
1143:        cr.series.setData([...agg,...cr.phantom])
1144:        setSeriesData([...agg, ...cr.phantom], agg.length)
1145:        if(_r2) requestAnimationFrame(()=>{ try{cr.chart.timeScale().setVisibleLogicalRange(_r2)}catch{} })
1146:      }
```

**Zona D — TF change effect, scrollToTail (L1225-L1240):**

```
1229:    cr._phantomsNeeded = phantomsNeeded
1230:    cr.prevCount = 0
1231:    updateChart(activePair, ps.engine, true)
1232:    setTfKey(k => k+1)
1233:
1234:    // Scroll a la posición actual tras el cambio de TF.
1235:    requestAnimationFrame(()=>{
1236:      try{ cr.chart.timeScale().scrollToPosition(8,false) }catch{}
1237:      requestAnimationFrame(()=>setChartTick(t => t+1))
1238:    })
```

### 2.2 Hallazgos arquitectónicos vs plan v1

**Hallazgo 1 — La rama del catch (L1139-L1146) NO es "rama tick simple":** es el manejo de error de la rama "una vela TF nueva". Si el `try` falla (probablemente `cr.series.update` o el bucle de phantoms), el catch hace fallback completo: regenera 10 phantoms, captura rango, hace `setData` (no `update`), y restaura rango. La función nueva debe encapsular ESTE fallback, no diseñarse como flujo separado.

**Hallazgo 2 — Solo 2 ramas escriben viewport en `updateChart`:**
- Rama init/full (Zona B): 1 escritura en init L1094, 1 escritura en restore L1101.
- Rama "una vela TF nueva" (Zona C): 1 escritura en happy path L1138, 1 escritura en catch fallback L1145.

(La rama "within-bucket update" — `else` después del `else if(curr===prev+1)` — actualiza el último OHLC sin tocar viewport. Fuera de alcance.)

**Hallazgo 3 — `scrollToTail` (Zona D) tiene timing anidado:**
- 1er rAF: `scrollToPosition(8,false)`.
- 2º rAF anidado dentro: `setChartTick(t => t+1)`.

La función nueva DEBE preservar el rAF anidado. Si se aplana, el tick podría dispararse antes de que el scroll se aplique → drawings/overlays pueden recalcularse con viewport viejo.

**Hallazgo 4 — Bloque `[DEBUG TEMP]` L1124-L1136:** 12 líneas de logging para investigar bug "long/short se contrae al play". Vive dentro del `try` de la rama "una vela TF nueva", entre el `for` de phantoms (L1123) y el `if(_rng)` final (L1138). NO se mueve a la API nueva — sigue inline en `_SessionInner.js`. La función nueva (que reemplaza L1121 + L1138 + L1139-L1145) debe poder co-existir con ese bloque inline.

**Hallazgo 5 — `isAutoSettingRange` sigue siendo código muerto en bytes en disco.** Confirmado al carácter en grep (ya verificado en plan v1). Decisión §0.3 aplica.

### 2.3 Detalle de las 5 escrituras

| # | Línea | Patrón | Zona | Rol |
|---|---|---|---|---|
| 1 | L1094 | `setVisibleLogicalRange({from:_from,to:_to})` | B | Init al cargar par |
| 2 | L1101 | `setVisibleLogicalRange(_savedRange)` | B | Restauración tras TF change/rebuild |
| 3 | L1138 | `setVisibleLogicalRange(_rng)` | C try | Restauración tras tick que cierra vela TF (preserva si `userScrolled`) |
| 4 | L1145 | `setVisibleLogicalRange(_r2)` | C catch | Restauración fallback tras error en C-try |
| 5 | L1234 | `scrollToPosition(8,false)` | D | Scroll al final tras TF change effect |

### 2.4 Detalle de las 4 variables de estado

| Variable | Líneas (escrituras) | Líneas (lecturas) |
|---|---|---|
| `_savedRange` | L1083 | L1099, L1101 |
| `cr.userScrolled` | L1088 (=false), L1098 (=false), L872 (=true vía handler) | L1121 |
| `cr.hasLoaded` | L1087 (=true) | L872, L1083, L1086 |
| `cr.isAutoSettingRange` | NUNCA — código muerto, decisión §0.3 lo activa | L872 |

---

## 3. Diseño de la API `lib/chartViewport.js` (v2 — afilado a bytes reales)

### 3.1 Archivo NUEVO

`lib/chartViewport.js`. Exporta funciones puras sin estado de módulo (el estado vive en `cr` = `chartMap.current[pair]` como propiedades del entry).

### 3.2 Las 6 funciones (v2 — reduce de 7 a 6)

v1 tenía 7 funciones por confundir el rol del catch como "rama separada". v2 corrige: el catch es fallback de la misma rama, no rama propia. La función `restoreOnNewBar` encapsula el try-catch completo internamente.

```js
// API pública lib/chartViewport.js

export function captureSavedRange(cr) {
  // Reemplaza L1082-L1083.
  // - Si cr.hasLoaded, lee getVisibleLogicalRange() y devuelve.
  // - Si no, devuelve null.
}

export function initVisibleRange(cr, tf, aggLength) {
  // Reemplaza L1086-L1095 (rama init dentro de Zona B).
  // - Marca cr.hasLoaded = true
  // - Marca cr.userScrolled = false
  // - Calcula _from/_to con tabla _tbars
  // - Hace setVisibleLogicalRange en rAF con isAutoSettingRange flag
}

export function restoreSavedRange(cr, savedRange, opts={full:false}) {
  // Reemplaza L1097-L1102 (rama restore dentro de Zona B).
  // - Si opts.full, marca cr.userScrolled = false
  // - Si savedRange no null, hace setVisibleLogicalRange en rAF con flag
}

export function restoreOnNewBar(cr, applyUpdates) {
  // Reemplaza L1120-L1146 (todo el try-catch de Zona C).
  // - Captura _rng = cr.userScrolled ? getVisibleLogicalRange() : null
  // - Ejecuta applyUpdates() (callback con cr.series.update + bucle phantoms + DEBUG TEMP)
  // - Si _rng, restaura en rAF con flag
  // - En catch: regenera 10 phantoms, captura _r2, hace setData, restaura _r2 en rAF
  //
  // applyUpdates es callback porque encapsula:
  //   - cr.series.update(agg[last])
  //   - bucle for de phantom updates
  //   - bloque [DEBUG TEMP]
  // que NO se mueven a la API (siguen inline en _SessionInner.js).
  //
  // El callback recibe nada y devuelve nada. Los datos (agg, phantom) los
  // captura por closure desde el scope de updateChart en _SessionInner.js.
}

export function scrollToTail(cr, offset=8) {
  // Reemplaza L1235-L1238 (Zona D, scrollToPosition + rAF anidado + setChartTick).
  // PERO el setChartTick NO se mueve aquí — eso es estado React de _SessionInner.
  // La función hace: rAF { scrollToPosition(offset, false); rAF { onScrolled() } }
  // donde onScrolled es callback opcional que el caller usa para setChartTick.
}

export function markUserScrollIfReal(cr) {
  // Reemplaza el body del handler L870-L873.
  // - Si cr.hasLoaded && !cr.isAutoSettingRange: marca cr.userScrolled = true
  // - Si no, no hace nada (scroll programático ignorado).
}
```

### 3.3 Sobre `isAutoSettingRange` (decisión §0.3 — ACTIVADA)

Cada función que ESCRIBE al viewport (`initVisibleRange`, `restoreSavedRange`, `restoreOnNewBar`, `scrollToTail`) debe:

```js
function ejemploEscritura(cr, range) {
  cr.isAutoSettingRange = true  // ANTES del rAF
  requestAnimationFrame(() => {
    try { cr.chart.timeScale().setVisibleLogicalRange(range) } catch {}
    cr.isAutoSettingRange = false  // DESPUÉS de la escritura, mismo rAF
  })
}
```

Con esto, cuando el `subscribeVisibleLogicalRangeChange` handler se dispare por NUESTRA escritura, leerá `isAutoSettingRange === true` y NO marcará `userScrolled=true`. Solo el scroll genuino del usuario marcará la flag.

### 3.4 Por qué `restoreOnNewBar` recibe un callback

L1120-L1146 NO es solo "captura + restaura rango". En medio hay:
- `cr.series.update(agg[last])` — actualización del chart.
- Bucle `for(const ph of cr.phantom)` — actualización de phantoms.
- Bloque `[DEBUG TEMP]` — logging para bug long/short.

Esos 3 bloques son responsabilidad del render layer (fase 4), no del viewport layer (fase 3). Pero comparten el try-catch con la lógica de viewport. **Diseño:** `restoreOnNewBar(cr, applyUpdates)` donde `applyUpdates` es un callback que el caller (`updateChart` en `_SessionInner.js`) provee. La función gestiona el try-catch + viewport, el callback gestiona render. Separación de capas sin mover código de fase 4.

### 3.5 Cambios esperados en `_SessionInner.js`

**Imports L13:**
```js
import { captureSavedRange, initVisibleRange, restoreSavedRange,
         restoreOnNewBar, scrollToTail, markUserScrollIfReal } from '../lib/chartViewport'
```

**Zona A (L870-L874) — handler subscribe:**
```js
chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
  const _cr=chartMap.current[pair]
  markUserScrollIfReal(_cr)
  setChartTick(t=>t+1)
})
```

**Zona B (L1082-L1103) — rama init/full:**
```js
const _savedRange = captureSavedRange(cr)
cr.series.setData([...agg,...cr.phantom])
setSeriesData([...agg, ...cr.phantom], agg.length)
if(!cr.hasLoaded){
  initVisibleRange(cr, tf, agg.length)
} else {
  restoreSavedRange(cr, _savedRange, {full})
}
```

**Zona C (L1117-L1146) — rama "una vela TF nueva":**
```js
const _phN = cr.phantom?.length || 10
cr.phantom = Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
setSeriesData([...agg, ...cr.phantom], agg.length)
restoreOnNewBar(cr, () => {
  cr.series.update(agg[agg.length-1])
  for(const ph of cr.phantom){ try{ cr.series.update(ph) }catch{} }
  // [DEBUG TEMP] Log para investigar bug long/short se contrae al play
  if(typeof window!=='undefined' && window.__algSuiteDebugLS){
    const _expJson = (typeof window.__algSuiteExportTools === 'function') ? window.__algSuiteExportTools() : null
    const _tools = _expJson ? JSON.parse(_expJson) : []
    const _ls = _tools.find(t => t.toolType === 'LongShortPosition')
    if(_ls){
      console.log('[LS-DEBUG] new candle', {
        tf, agg_len: agg.length, last_real_t: _lastT,
        phantom_first_t: cr.phantom?.[0]?.time, phantom_last_t: cr.phantom?.[cr.phantom.length-1]?.time,
        ls_points: _ls.points,
      })
    }
  }
})
```

(El bloque DEBUG TEMP se preserva al carácter dentro del callback. Los `agg`, `cr.phantom`, `tf`, `_lastT` se capturan por closure.)

**Zona D (L1234-L1238) — scrollToTail:**
```js
// Scroll a la posición actual tras el cambio de TF.
scrollToTail(cr, 8, () => setChartTick(t => t+1))
```

### 3.6 Cambios totales esperados en `_SessionInner.js`

- 1 línea import (extender L13).
- 3 líneas en handler subscribe (L870-L873).
- ~22 líneas en Zona B (L1082-L1102) → ~6 líneas.
- ~27 líneas en Zona C (L1120-L1146) → ~3 líneas + callback inline (~22 líneas preservadas).
- 4 líneas en Zona D (L1234-L1238) → 2 líneas.

**Reducción neta esperada:** ~30 líneas en `_SessionInner.js`. **Adición:** ~120 líneas en `lib/chartViewport.js` con JSDoc.

---

## 4. Sub-fases ejecutables (v2 — reagrupadas según rol real de las zonas)

### 4.1 Sub-fase 3a — Crear `lib/chartViewport.js` y migrar Zonas A + B

**Objetivo:** crear módulo nuevo con las 6 funciones + migrar handler subscribe (Zona A) + rama init/full (Zona B).

**Operaciones:**

- **Op 1:** crear `lib/chartViewport.js` con las 6 funciones exportadas + JSDoc (~120 líneas).
- **Op 2:** extender import en `_SessionInner.js` L13.
- **Op 3:** sustituir handler subscribe L870-L873 (Zona A) por llamada a `markUserScrollIfReal`.
- **Op 4:** sustituir L1082-L1102 (Zona B) por `captureSavedRange` + `initVisibleRange`/`restoreSavedRange`.

**Pruebas manuales 3a:**

- 0: smoke check inicial. OK = sin errores en consola.
- 1: smoke con play. OK = chart avanza, drag funciona, sin saltos visuales.
- 2 (CRÍTICA): cambio de TF M15 → H1 → M15. OK = visible range se mantiene tras cada cambio.
- 3: scroll del usuario tras carga. OK = `cr.userScrolled=true` se marca correctamente.
- 4: scroll programático interno (cualquier acción que dispare init o restore) NO debe marcar `userScrolled=true`. Verificable con `window.__chartMap.current.EURUSD.userScrolled === false` tras un cambio de TF sin scroll manual.

**Validación pre-commit:**
- `npm run build` → verde.
- `grep -rn "setVisibleLogicalRange" components/` → debe mostrar L1138 + L1145 todavía (no migradas en 3a, alcance 3b).
- `git diff` completo a Ramón.

**Commit:**
```
git add lib/chartViewport.js components/_SessionInner.js
git commit -m "refactor(fase-3a): crear chartViewport y migrar handler subscribe + rama init/full"
```

### 4.2 Sub-fase 3b — Migrar Zona C (rama "una vela TF nueva" con catch fallback)

**Objetivo:** migrar el try-catch completo de L1120-L1146 a `restoreOnNewBar` con callback inline para preservar render + DEBUG TEMP.

**Operaciones:**

- **Op 5:** sustituir L1120-L1146 por llamada a `restoreOnNewBar(cr, () => {...})` con el callback que contiene `cr.series.update(agg[last])` + bucle phantom + bloque DEBUG TEMP preservado al carácter.

**Pruebas manuales 3b:**

- 0: smoke check post-3b. OK.
- 1 (CRÍTICA): play en M15 a velocidad media. OK = velas aparecen, scroll se preserva si el usuario ha scrolleado, sino chart sigue al cursor.
- 2: scroll manual durante play. OK = `userScrolled` se marca, en los siguientes ticks el rango se preserva.
- 3: cambio de TF durante play. OK = transición fluida.
- 4: cambio de par durante play. OK = par nuevo aparece con su rango correcto.
- 5 (verificación DEBUG TEMP preservado): activar `window.__algSuiteDebugLS = true` en consola, dibujar un LongShortPosition, dejar que pase una vela TF nueva. OK = log `[LS-DEBUG] new candle` aparece con los mismos campos que antes.

**Validación pre-commit:**
- `npm run build` → verde.
- `grep -rn "setVisibleLogicalRange" components/` → debe mostrar 0 matches en `_SessionInner.js`.
- `git diff` completo a Ramón.

**Commit:**
```
git add components/_SessionInner.js
git commit -m "refactor(fase-3b): migrar rama 'una vela TF nueva' a restoreOnNewBar"
```

### 4.3 Sub-fase 3c — Migrar Zona D (scrollToTail con rAF anidado)

**Objetivo:** migrar L1234-L1238 a `scrollToTail` preservando el timing del rAF anidado.

**Operaciones:**

- **Op 6:** sustituir L1235-L1238 por llamada a `scrollToTail(cr, 8, () => setChartTick(t => t+1))`.

**Pruebas manuales 3c:**

- 0: smoke check post-3c. OK.
- 1 (CRÍTICA): cambio de TF — el scrollToTail NO debe marcar `userScrolled=true`. Verificable: `cr.userScrolled === false` tras un cambio de TF sin scroll manual.
- 2: scroll manual del usuario tras cambio de TF. OK = `userScrolled=true`.
- 3: cambio de par tras scroll manual. OK = par nuevo arranca con `userScrolled=false`, par viejo conserva `userScrolled=true`.
- 4 (potencialmente cierra B3): Review Session post-fix completo. OK = chart aparece en momento correcto, TF correcto, sin saltos.

**Validación pre-commit:**
- `npm run build` → verde.
- `grep -rn -E "setVisibleLogicalRange|scrollToPosition" components/` → 0 matches en `_SessionInner.js`.
- `grep -rn "isAutoSettingRange" components/ pages/ lib/` → matches en `lib/chartViewport.js` (escrituras dentro de las 4 funciones que escriben viewport) + en handler refactorizado de `_SessionInner.js` vía `markUserScrollIfReal`.
- `git diff` completo a Ramón.

**Commit:**
```
git add components/_SessionInner.js
git commit -m "refactor(fase-3c): migrar scrollToTail a chartViewport con rAF anidado preservado"
```

---

## 5. Criterio de "fase 3 terminada"

1. ✅ Sub-fases 3a, 3b, 3c comiteadas en `refactor/fase-3-viewport-layer`.
2. ✅ `lib/chartViewport.js` exporta las 6 funciones con JSDoc.
3. ✅ `grep -rn "setVisibleLogicalRange" components/` → 0 matches.
4. ✅ `grep -rn "scrollToPosition" components/` → 0 matches.
5. ✅ `grep -rn "setVisibleLogicalRange|scrollToPosition" lib/` → matches solo en `lib/chartViewport.js`.
6. ✅ `npm run build` pasa.
7. ✅ Ramón ha probado manualmente las 3 sub-fases y reporta cero regresiones nuevas.
8. ✅ Bugs B1–B6 siguen como estaban (excepto B3 como efecto colateral esperado).
9. ✅ Bloque `[DEBUG TEMP]` sigue funcionando al carácter (verificado en prueba 3b-5).
10. ✅ `_SessionInner.js` no contiene ninguna escritura directa al viewport del chart.

---

## 6. Riesgos identificados y mitigaciones

### Riesgo 1 — Closure rota en `restoreOnNewBar` callback

**Síntoma:** el callback no captura correctamente `agg`, `cr.phantom`, `tf`, `_lastT` porque el binding de variables en la nueva ubicación falla.

**Mitigación:** el callback se define inline dentro de `updateChart`, en el mismo scope donde están las variables. La closure es directa. Verificación al carácter durante Op 5.

**Señal a Ramón:** prueba 3b-5 falla (DEBUG TEMP no logguea, o logguea con valores incorrectos).

### Riesgo 2 — `isAutoSettingRange` causa loop infinito si no se desmarca

**Síntoma:** el handler nunca marca `userScrolled=true`, scroll del usuario no se detecta.

**Mitigación:** las 4 funciones que escriben viewport DEBEN desmarcar `isAutoSettingRange = false` tras la escritura (mismo rAF, después del set). Verificación al carácter en Op 1 (revisar el código de las 4 funciones antes del commit).

**Señal a Ramón:** prueba 3a-3 / 3b-2 / 3c-2 — scroll manual no marca `userScrolled`.

### Riesgo 3 — rAF anidado de `scrollToTail` mal preservado

**Síntoma:** drawings/overlays se redibujan con viewport viejo al hacer cambio de TF (porque el `setChartTick` se dispara antes de que el `scrollToPosition` aplique).

**Mitigación:** `scrollToTail(cr, offset, onScrolled)` debe llamar `onScrolled` dentro del 2º rAF anidado, no en el 1º. Verificación al carácter durante Op 1.

**Señal a Ramón:** prueba 3c-4 — Review Session muestra chart desplazado tras cambio de TF.

### Riesgo 4 — B3 cambia de comportamiento sin que sea regresión

**Síntoma:** Review Session muestra TF distinto a antes (mejor o peor que B3 pre-fase 3).

**Mitigación:** B3 está en alcance "potencialmente cerrado" pero NO en alcance "objetivo explícito". Cambios se anotan en HANDOFF, no se atacan.

### Riesgo 5 — Romper consumers que suscriben

**Síntoma:** drawings/killzones no se redibujan.

**Mitigación:** la fase 3 NO toca esos consumers. Las suscripciones siguen apuntando al mismo `chart.timeScale().subscribeVisibleLogicalRangeChange(...)`. Solo cambia el handler interno via `markUserScrollIfReal`, manteniendo el `setChartTick(t=>t+1)` final.

### Riesgo 6 — Imports circulares

**Síntoma:** `Cannot access 'X' before initialization` en runtime.

**Mitigación:** `lib/chartViewport.js` no importa de `components/`. Solo recibe `cr` por parámetro. Verificación: `npm run build` verde antes de cada commit.

### Riesgo 7 — Bloque `[DEBUG TEMP]` se rompe accidentalmente

**Síntoma:** el bloque `if(typeof window!=='undefined' && window.__algSuiteDebugLS){...}` deja de funcionar tras la migración.

**Mitigación:** el bloque se preserva al carácter dentro del callback de `restoreOnNewBar`. Op 5 hace copy-paste literal de las 12 líneas. Ramón valida en prueba 3b-5.

---

## 7. Resumen ejecutivo en lenguaje llano (30 segundos)

- **Qué hacemos:** crear `lib/chartViewport.js` que centralice los 5 puntos del código que mueven el viewport del chart. Hoy esos 5 puntos están repartidos por dentro de `_SessionInner.js`.
- **3 sub-fases:** 3a (crear archivo + migrar handler subscribe + rama init/full), 3b (migrar rama "una vela TF nueva" con su catch fallback), 3c (migrar scrollToTail).
- **0 cambios funcionales esperados.** Sistema debe verse y comportarse igual.
- **1 bug que probablemente cierra:** B3 (TF reset al entrar Review Session).
- **1 archivo nuevo + 1 archivo modificado.**
- **Decisiones aprobadas:** Opción B (escrituras solo) + arreglar `isAutoSettingRange` correctamente.
- **Alcance preservado al carácter:** bloque `[DEBUG TEMP]` para investigar long/short se contrae al play se mantiene inline, no se mueve a la nueva API.
- **Validación:** Ramón prueba manualmente cada sub-fase. Antes de cada commit, `git diff` completo + OK explícito.
- **Rama:** `refactor/fase-3-viewport-layer` (ya creada desde `e99571c`).

---

## 8. Lecciones operativas heredadas

§8.1 a §8.10 de HANDOFF-cierre-b1.md aplican. Adicionalmente:

### 8.11 PASO 0 con `sed` literal sobre bytes en disco antes de redactar API

Lección de hoy: el plan v1 confundió el rol de L1142/L1145 (catch fallback, no rama tick simple) y omitió el bloque DEBUG TEMP y el rAF anidado del scrollToTail. La diferencia entre v1 y v2 viene 100% de haber leído los bytes literales con `sed -n NN,MMp` antes del diseño de API. Norma adoptada: **antes de redactar API nueva, leer al carácter las zonas de código que se van a sustituir.** No fiar al análisis previo (core-analysis), ni al project knowledge (puede estar desfasado), ni a inferencias de plan v1.

---

## 9. Stack y entorno

Sin cambios respecto a HANDOFF-cierre-b1.md §9.

---

## 10. Documentos relacionados

| Archivo | Estado |
|---|---|
| `HANDOFF-cierre-saneamiento-historico.md` | comiteado en `38189c6` |
| `refactor/fase-3-plan.md` v1 | comiteado en `e99571c`, **sustituido por este v2** |
| `HANDOFF-cierre-b1.md` | comiteado en `0cfa9f1` |
| `refactor/core-analysis.md` | §6 Fase 3 (alcance original — superado por PASO 0) |
| `components/_SessionInner.js` | comiteado, archivo principal a modificar |
| `lib/chartViewport.js` | NO existe, archivo nuevo a crear |

---

## 11. Reglas absolutas

Sin cambios respecto a HANDOFF.md v3 §7.

---

## 12. Cómo arrancar fase 3

### 12.1 Pre-arranque (en chat web — completado)

1. ✅ Plan v2 redactado tras inventario PASO 0 con bytes literales.
2. ✅ Decisión §0.2 aprobada (Opción B).
3. ✅ Decisión §0.3 aprobada (arreglar `isAutoSettingRange`).
4. Pendiente: aprobación general plan v2 + commit del plan v2 sobre v1.

### 12.2 Arranque (en Claude Code)

1. Verificar rama `refactor/fase-3-viewport-layer` activa, HEAD = commit del plan v2.
2. Greps verificadores PRE-Op (ya ejecutados al inicio de la sesión).

### 12.3 Ejecución

3. Op 1 — crear `lib/chartViewport.js`. Aprobación.
4. Op 2 — extender import en `_SessionInner.js` L13. Aprobación.
5. Op 3 — sustituir handler subscribe Zona A. Aprobación.
6. Op 4 — sustituir Zona B (rama init/full). Aprobación.
7. Pruebas 3a → commit 3a.
8. Op 5 — sustituir Zona C (rama una vela TF nueva con catch). Aprobación.
9. Pruebas 3b → commit 3b.
10. Op 6 — sustituir Zona D (scrollToTail). Aprobación.
11. Pruebas 3c → commit 3c.

### 12.4 Validación pre-merge

12. Greps + `npm run build`.
13. `git diff main..refactor/fase-3-viewport-layer` a Ramón.
14. OK explícito.

### 12.5 Merge + push

15. Decidir push hoy o mañana en frío.
16. Si OK: merge a main, push.

### 12.6 Cierre

17. Redactar `HANDOFF-cierre-fase-3.md`.

---

**Fin del plan táctico fase 3 v2.**

Pendiente OK Ramón sobre el plan v2 antes de comitear el plan y arrancar Op 1.
