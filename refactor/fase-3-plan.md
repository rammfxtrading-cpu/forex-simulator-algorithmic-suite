# Fase 3 — Plan táctico: aislar la viewport layer (escrituras)

> Fecha de redacción: 2 mayo 2026, sesión "simulador 10" con Claude Opus 4.7 (chat web).
> De: Ramón + Claude (chat web actuando de CTO/revisor).
> Para: arrancar fase 3 del refactor data-layer tras saneamiento histórico.
> Estado al redactar: rama `main` con HEAD `38189c6` (HANDOFF saneamiento), working tree limpio, código producción intacto en `bb63bfd` (B1 fix). PASO 0 ejecutado al carácter. Plan pendiente de OK Ramón antes del primer Edit.

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
- Antes del plan, actualizar `core-analysis.md §6 Fase 3` con los hallazgos del PASO 0 (5 archivos, 27 puntos vs ~150 líneas estimadas originalmente).
- Después plan.
- Sin riesgo añadido pero alarga la sesión.

### 0.2 Decisión: Opción B

Adoptada por las siguientes razones:

1. **Patrón heredado fase 1 → fase 2.** Fase 1 separó escrituras de lecturas; fase 2 cerró las lecturas. Mismo patrón aquí: fase 3 cierra las escrituras, fase 3.5 (futura, opcional) cierra lecturas y suscripciones si toca.
2. **Riesgo medio mantenido.** El alcance documentado en `core-analysis.md §6` era "riesgo medio". Con Opción A escala a alto. Con Opción B se mantiene en medio.
3. **Aislamiento de capas.** Las suscripciones de los 3 consumers (`CustomDrawingsOverlay`, `DrawingToolbar`, `KillzonesOverlay`) son hilos delicados que viven en el dominio de drawings/overlays. Tocarlos en fase 3 sin haber pasado por fase 5 (drawings lifecycle) puede destapar B6 (plugin LWC reinicializa) por contaminación.
4. **Sub-fase 3a sola probablemente cierra B3** (TF reset al entrar Review), que es el bug de mayor valor pedagógico del backlog. B2 (drawings descolocadas) probablemente vive en lecturas/suscripciones — cae en fase futura.
5. **Decisión Ramón verbatim:** "vamos con Opción B". Aprobada en chat antes de redactar plan.

### 0.3 Lo que NO es el alcance de fase 3

Listado explícito para que ningún Edit accidental rompa el alcance:

- **NO** tocar las 5 lecturas de `getVisibleLogicalRange` (4 en `_SessionInner.js` L849/L1083/L1121/L1142, 1 en `lib/chartCoords.js` L68).
- **NO** tocar la lectura de `getVisibleRange` en `lib/chartCoords.js` L51.
- **NO** tocar las suscripciones `subscribeVisibleLogicalRangeChange` de `CustomDrawingsOverlay.js`, `DrawingToolbar.js`, `KillzonesOverlay.js`.
- **NO** atacar B6 (plugin LWC), B5 (409 session_drawings), B2 (drawings descolocadas), bug nuevo limit-desaparece-al-play. Cada uno tiene sesión dedicada futura.
- **NO** atacar fase 4 (render layer), fase 5 (drawings), fase 6 (trading), fase 7 (reducir _SessionInner.js).
- **NO** tocar `lib/replayEngine.js`. Sigue intocable.
- **NO** instalar deps npm. Regla absoluta CLAUDE.md §3.4.
- **NO** migraciones Supabase. Regla absoluta CLAUDE.md §3.1.
- **NO** mergear nada a main durante la fase. Solo commits en `refactor/fase-3-viewport-layer`.
- **NO** push sin OK explícito de Ramón.

---

## 1. Objetivo de fase 3 (afilado)

> **Aislar las escrituras de la viewport layer en un módulo `lib/chartViewport.js`** que sea el ÚNICO punto del proyecto que llame a `chart.timeScale().setVisibleLogicalRange()` y `chart.timeScale().scrollToPosition()`. Al terminar, ningún archivo fuera de `lib/chartViewport.js` debe escribir directamente al viewport del chart.

**Lo que NO es el objetivo (recordatorio):**

- No eliminar lecturas — eso es fase 3.5 (futura, opcional).
- No reorganizar suscripciones de consumers — eso es fase 5 (drawings lifecycle).
- No introducir reactividad / store / hooks. Ver §0.1.
- No atacar B1–B6 ni los 6 bugs del CLAUDE.md §9 (excepto efecto colateral esperado en B3).
- No tocar nada fuera de `_SessionInner.js` (excepto creación del nuevo `lib/chartViewport.js`).

---

## 2. Inventario al carácter (PASO 0 ejecutado 2 may 2026)

### 2.1 Greps recursivos ejecutados

Los 7 greps ejecutados en terminal nativa zsh. Outputs literales pegados al chat web. Sin acotación a archivos sospechados — barrido recursivo sobre `components/ pages/ lib/`.

### 2.2 Resultado consolidado

| Categoría | Cantidad | Archivos | Alcance fase 3 |
|---|---|---|---|
| Escrituras `setVisibleLogicalRange` | 4 | `_SessionInner.js` (L1094, L1101, L1138, L1145) | ✅ EN ALCANCE |
| Escritura `scrollToPosition` | 1 | `_SessionInner.js` (L1234) | ✅ EN ALCANCE |
| Lecturas `getVisibleLogicalRange` | 5 | `_SessionInner.js` (L849, L1083, L1121, L1142), `chartCoords.js` (L68) | ❌ FUERA (fase 3.5) |
| Lectura `getVisibleRange` | 1 | `chartCoords.js` (L51) | ❌ FUERA (fase 3.5) |
| Suscripciones de consumers | 4 | `_SessionInner.js` (L870), `CustomDrawingsOverlay.js` (L113), `DrawingToolbar.js` (L272), `KillzonesOverlay.js` (L264) | ❌ FUERA (fase 5) |
| Variables de estado viewport | 11 matches (4 vars) | `_SessionInner.js` | ✅ EN ALCANCE |
| **Total puntos en alcance fase 3** | **20 puntos** | **`_SessionInner.js` (1 archivo)** | — |

### 2.3 Detalle de las 5 escrituras en `_SessionInner.js`

```
L1094: try{cr.chart.timeScale().setVisibleLogicalRange({from:_from,to:_to})}catch{}
L1101:   try{ cr.chart.timeScale().setVisibleLogicalRange(_savedRange) }catch{}
L1138: if(_rng) requestAnimationFrame(()=>{try{cr.chart.timeScale().setVisibleLogicalRange(_rng)}catch{}})
L1145: if(_r2) requestAnimationFrame(()=>{ try{cr.chart.timeScale().setVisibleLogicalRange(_r2)}catch{} })
L1234:   try{ cr.chart.timeScale().scrollToPosition(8,false) }catch{}
```

Inferencia del contexto (a verificar al carácter durante la sub-fase 3a antes del primer Edit):

- L1094 — Init al cargar par. Cálculo `_from/_to` con tabla `_tbars` por TF.
- L1101 — Restauración tras setData en rama "TF change/full" (`_savedRange` capturado en L1083).
- L1138 — Restauración rama "una vela TF nueva" (`_rng` con `userScrolled` check).
- L1145 — Restauración rama "tick simple" (`_r2` sin check de `userScrolled`).
- L1234 — Scroll al final con offset 8 barras. Probable TF change effect.

### 2.4 Detalle de las 4 variables de estado en `_SessionInner.js`

| Variable | Líneas | Comportamiento |
|---|---|---|
| `_savedRange` | L1082 (declara), L1083 (escribe), L1099 (lee), L1101 (lee) | Local de la función updateChart, no propiedad de `cr`. |
| `cr.userScrolled` | L872 (escribe true), L1088 (escribe false), L1098 (escribe false), L1121 (lee) | Propiedad del chartMap entry. Marca scroll del usuario para preservar viewport. |
| `cr.hasLoaded` | L872 (lee), L1083 (lee), L1086 (lee), L1087 (escribe true) | Propiedad del chartMap entry. Flag de "primera carga ya hecha". |
| `cr.isAutoSettingRange` | L872 (lee) | Propiedad del chartMap entry. **NUNCA SE ESCRIBE EN NINGUNA PARTE DEL PROYECTO.** |

### 2.5 Hallazgo arquitectónico — `isAutoSettingRange` es código muerto

Confirmado al carácter con grep recursivo: `isAutoSettingRange` aparece **una sola vez** en todo el proyecto (L872), y solo en LECTURA dentro del check `if(_cr?.hasLoaded&&!_cr?.isAutoSettingRange)`. Nunca se escribe en ninguna parte.

**Implicación:** la condición `!_cr?.isAutoSettingRange` siempre evalúa a `true` (undefined → !undefined → true). El check funciona como si la variable no existiera.

**Hipótesis del origen:** probablemente la variable se introdujo originalmente para evitar marcar `userScrolled=true` cuando el código mismo cambia el rango programáticamente (para evitar falsos positivos de "el usuario hizo scroll"). El set se removió en algún refactor anterior (o nunca se llegó a implementar) pero la lectura quedó.

**Decisión para fase 3:** preservar el comportamiento actual al carácter. La nueva API en `lib/chartViewport.js` debe re-implementar el flag correctamente (set a true antes de cada escritura programática, set a false tras el rAF de la escritura). Esto es necesario para que el `subscribeVisibleLogicalRangeChange` handler L870 distinga scroll real de scroll programático.

**Riesgo de dejarlo igual:** mínimo (estado actual = no funciona, dejar igual = sigue sin funcionar).

**Beneficio de arreglarlo:** que la viewport layer detecte correctamente cuándo el usuario hace scroll vs cuándo lo hace el código. Si NO se arregla, los 3 consumers que escuchan el cambio de rango pueden recibir notificaciones espurias durante setup interno de la viewport.

**Decisión Ramón pendiente:** ¿arreglar `isAutoSettingRange` durante fase 3 o dejarlo como está y posponer? Recomendación: **arreglarlo**, porque la nueva API es buen momento para hacerlo (cuesta ~3 líneas adicionales, sin alargar la fase). Pero confirma.

---

## 3. Diseño de la nueva API `lib/chartViewport.js`

### 3.1 Archivo NUEVO

`lib/chartViewport.js`. Exporta funciones puras y stateless (el estado vive en `chartMap[pair]` como propiedades del entry, no en módulo singleton).

### 3.2 Funciones a exportar

```js
// API pública

export function initVisibleRange(cr, tf, aggLength) {
  // Equivale a L1086-L1095 actuales.
  // - Marca cr.hasLoaded = true
  // - Marca cr.userScrolled = false
  // - Calcula _from/_to con tabla _tbars[tf]
  // - Hace setVisibleLogicalRange en rAF con cr.isAutoSettingRange=true durante el set
}

export function captureSavedRange(cr) {
  // Equivale a L1082-L1083 actuales.
  // - Si cr.hasLoaded, lee getVisibleLogicalRange() y devuelve.
  // - Si no, devuelve null.
  // (Esta función LEE el viewport. Es excepción consciente: encapsula el patrón
  //  capture-then-restore para que el módulo dueño tenga control total. Las
  //  otras 4 lecturas en el proyecto siguen siendo fase 3.5.)
}

export function restoreRange(cr, range, opts={full:false}) {
  // Equivale a L1098-L1102 actuales.
  // - Si opts.full, marca cr.userScrolled = false
  // - Si range no null, hace setVisibleLogicalRange en rAF con isAutoSettingRange flag
}

export function preserveScrollOnTick(cr) {
  // Equivale a L1121 actual + L1138.
  // - Si cr.userScrolled, captura getVisibleLogicalRange y devuelve función que la restaurará en rAF
  // - Si no, devuelve función no-op
  // (Patrón "capture-and-defer" para usar en hot path del tick simple.)
}

export function preserveRangeForRebuild(cr) {
  // Equivale a L1142 + L1145 actuales.
  // - Captura siempre (sin check userScrolled, según código actual)
  // - Devuelve función que restaurará en rAF
}

export function scrollToTail(cr, offset=8) {
  // Equivale a L1234 actual.
  // - Hace scrollToPosition(offset, false) con isAutoSettingRange flag
}

export function markUserScrollIfReal(cr) {
  // Equivale al body del handler L870-L873.
  // - Si cr.hasLoaded && !cr.isAutoSettingRange: marca cr.userScrolled = true
  // - Si no, no hace nada (scroll programático ignorado).
}
```

### 3.3 Sobre `isAutoSettingRange` (en la nueva API)

Cada función que ESCRIBE al viewport (init/restore/preserve/scrollToTail) debe:

1. Marcar `cr.isAutoSettingRange = true` ANTES del rAF.
2. Dentro del rAF, ejecutar el setVisibleLogicalRange/scrollToPosition.
3. Marcar `cr.isAutoSettingRange = false` DESPUÉS de la escritura (mismo rAF, post-set).

Esto garantiza que el handler `subscribeVisibleLogicalRangeChange` L870 (vía `markUserScrollIfReal`) ignore las notificaciones disparadas por nuestras escrituras programáticas.

### 3.4 Consumers en `_SessionInner.js` tras refactor

**Cambios esperados en `_SessionInner.js`:**

- L13 (imports): añadir `import { initVisibleRange, captureSavedRange, restoreRange, preserveScrollOnTick, preserveRangeForRebuild, scrollToTail, markUserScrollIfReal } from '../lib/chartViewport'`.
- L870-L873 (handler): sustituir body por `markUserScrollIfReal(_cr); setChartTick(t=>t+1)`.
- L1082-L1102 (rama init/full): sustituir por llamadas a `captureSavedRange` + `initVisibleRange` o `restoreRange`.
- L1121, L1138 (rama tick simple): sustituir por `preserveScrollOnTick`.
- L1142, L1145 (rama "una vela TF nueva"): sustituir por `preserveRangeForRebuild`.
- L1234 (TF change effect): sustituir por `scrollToTail(cr)`.

Cero cambios funcionales esperados. El sistema debe verse y comportarse idéntico.

### 3.5 Otros archivos

**NO se tocan otros archivos.** `chartCoords.js`, `CustomDrawingsOverlay.js`, `DrawingToolbar.js`, `KillzonesOverlay.js` siguen igual. Sus lecturas y suscripciones quedan como están.

---

## 4. Sub-fases ejecutables

### 4.1 Sub-fase 3a — Crear `lib/chartViewport.js` con la API y migrar L1082-L1102 (rama init/full)

**Objetivo:** crear el módulo nuevo + migrar la rama de inicialización y restauración tras TF change full.

**Operaciones:**

- **Op 1:** crear `lib/chartViewport.js` con las 7 funciones exportadas (~100 líneas con JSDoc). Aprobación opción 1 manual.
- **Op 2:** import en `_SessionInner.js` L13 (extender imports existentes con las 7 nuevas funciones). Aprobación.
- **Op 3:** sustituir L1082-L1102 (rama init y rama TF change full) por llamadas a `captureSavedRange` + `initVisibleRange` (rama init) o `restoreRange` (rama TF change full). Aprobación.

**Pruebas manuales 3a:**

- 0: smoke check inicial (sesión practice, abrir, ver chart, cerrar). OK = sin errores en consola.
- 1: smoke con play. OK = chart avanza, drag funciona, sin saltos visuales.
- 2 (CRÍTICA): cambio de TF M15 → H1 → M15. OK = visible range se mantiene tras cada cambio. Si rompe → STOP, no comitear, diagnosticar.
- 3: scroll del usuario tras carga. OK = `cr.userScrolled=true` se marca correctamente (verificable en consola con `window.__chartMap.current.EURUSD.userScrolled` tras hacer scroll manual).
- 4 (potencialmente cierra B3): entrar a Review Session de fase pasada con TF distinto al actual. OK = chart aparece en TF original de la sesión cerrada. ⚠️ Si Ramón observa que B3 está mejor o peor, anotarlo en el cierre de la sub-fase.

**Validación pre-commit:**

- `npm run build` → verde.
- `grep -rn "setVisibleLogicalRange" components/` debe mostrar ÚNICAMENTE las llamadas de `_SessionInner.js` que NO se han migrado en 3a (L1138, L1145, no L1094, no L1101).
- `git diff` completo a Ramón.

**Commit:**

```
git add lib/chartViewport.js components/_SessionInner.js
git commit -m "refactor(fase-3a): crear chartViewport y migrar rama init/full de updateChart"
```

### 4.2 Sub-fase 3b — Migrar ramas tick (L1121-L1145)

**Objetivo:** migrar las 2 ramas restantes del flujo `updateChart` (tick simple y "una vela TF nueva").

**Operaciones:**

- **Op 4:** sustituir L1121 + L1138 (rama "una vela TF nueva", curr === prev+1) por llamada a `preserveScrollOnTick`. Aprobación.
- **Op 5:** sustituir L1142 + L1145 (rama tick simple, curr === prev) por llamada a `preserveRangeForRebuild`. Aprobación.

**Pruebas manuales 3b:**

- 0: smoke check post-3b. OK.
- 1 (CRÍTICA): play en M15 a velocidad media. OK = velas aparecen, scroll se preserva si el usuario ha scrolleado, sino chart sigue al cursor.
- 2: scroll manual durante play. OK = al hacer scroll, `userScrolled` se marca, y en los siguientes ticks el rango se preserva donde el usuario lo dejó.
- 3: cambio de TF durante play. OK = transición fluida sin saltos.
- 4: cambio de par durante play. OK = par nuevo aparece con su rango correcto.

**Validación pre-commit:**

- `npm run build` → verde.
- `grep -rn "setVisibleLogicalRange" components/` debe mostrar 0 matches en `_SessionInner.js` (todas migradas a `lib/chartViewport.js`).
- `git diff` completo a Ramón.

**Commit:**

```
git add components/_SessionInner.js
git commit -m "refactor(fase-3b): migrar ramas tick de updateChart a chartViewport"
```

### 4.3 Sub-fase 3c — Migrar L1234 (scrollToTail) + L870 (handler) + isAutoSettingRange

**Objetivo:** cerrar las 2 escrituras restantes (`scrollToPosition` y handler de subscribe) + activar correctamente `isAutoSettingRange`.

**Operaciones:**

- **Op 6:** sustituir L1234 (`scrollToPosition(8,false)`) por `scrollToTail(cr)`. Aprobación.
- **Op 7:** sustituir body del handler L870-L873 (`if(_cr?.hasLoaded&&!_cr?.isAutoSettingRange) _cr.userScrolled=true; setChartTick(t=>t+1)`) por `markUserScrollIfReal(_cr); setChartTick(t=>t+1)`. Aprobación.
- (No hay Op 8 — `isAutoSettingRange` se activa correctamente por construcción dentro de las 7 funciones de `lib/chartViewport.js` ya creadas en 3a.)

**Pruebas manuales 3c:**

- 0: smoke check post-3c. OK.
- 1 (CRÍTICA): cambio de TF — el scroll programático (scrollToTail) NO debe marcar `userScrolled=true`. Verificable en consola: `cr.userScrolled` permanece false tras un cambio de TF si el usuario no ha scrolleado.
- 2: scroll manual del usuario tras cambio de TF. OK = `userScrolled` se marca true.
- 3: cambio de par tras scroll manual. OK = el par nuevo arranca con su `userScrolled=false` y el par viejo conserva su `userScrolled=true`.
- 4 (potencialmente cierra B3 definitivamente): Review Session post-fix completo. OK = chart aparece en momento correcto, TF correcto, sin saltos.

**Validación pre-commit:**

- `npm run build` → verde.
- `grep -rn -E "setVisibleLogicalRange|scrollToPosition" components/` debe mostrar 0 matches en `_SessionInner.js`.
- `grep -rn "isAutoSettingRange" components/ pages/ lib/` debe mostrar matches en `lib/chartViewport.js` (escrituras dentro de las 7 funciones) y en el handler refactorizado de `_SessionInner.js` (vía `markUserScrollIfReal`).
- `git diff` completo a Ramón.

**Commit:**

```
git add components/_SessionInner.js
git commit -m "refactor(fase-3c): migrar scrollToTail y handler subscribe; activar isAutoSettingRange"
```

---

## 5. Criterio de "fase 3 terminada"

La fase 3 está completa cuando se cumplen TODAS estas condiciones:

1. ✅ Sub-fases 3a, 3b, 3c comiteadas en `refactor/fase-3-viewport-layer`.
2. ✅ `lib/chartViewport.js` exporta las 7 funciones con JSDoc.
3. ✅ `grep -rn "setVisibleLogicalRange" components/` devuelve 0 matches (todas migradas a la API).
4. ✅ `grep -rn "scrollToPosition" components/` devuelve 0 matches.
5. ✅ `grep -rn "setVisibleLogicalRange\|scrollToPosition" lib/` devuelve matches solo en `lib/chartViewport.js`.
6. ✅ `npm run build` pasa.
7. ✅ Ramón ha probado manualmente las 3 sub-fases y reporta cero regresiones nuevas.
8. ✅ Bugs B1–B6 (HANDOFF-verificacion-A1.md §7) y los 6 bugs del CLAUDE.md §9 siguen exactamente como estaban (la fase 3 NO los pretende arreglar, excepto B3 como efecto colateral esperado).
9. ✅ `_SessionInner.js` no contiene ninguna escritura directa al viewport del chart. Cualquier escritura programática pasa por `lib/chartViewport.js`.

---

## 6. Riesgos identificados y mitigaciones

### Riesgo 1 — Romper la rama "una vela TF nueva" (curr === prev+1) por timing del rAF

**Síntoma:** velas nuevas aparecen pero el viewport no se preserva, salta al final.

**Mitigación:** la API `preserveScrollOnTick` debe replicar EXACTAMENTE el patrón actual: capturar el rango ANTES del setData, devolver una función que restaura DESPUÉS del setData en el siguiente rAF. No cambiar timing.

**Señal a Ramón:** en prueba 3b-1, si una vela nueva hace que el chart salte al final cuando el usuario había scrolleado.

### Riesgo 2 — `isAutoSettingRange` causa loops infinitos si no se desmarca

**Síntoma:** el handler nunca marca `userScrolled=true`, scroll del usuario no se detecta.

**Mitigación:** las 7 funciones que escriben al viewport DEBEN desmarcar `isAutoSettingRange = false` tras la escritura (mismo rAF, después del set). Verificación al carácter en cada función durante 3a.

**Señal a Ramón:** en prueba 3c-2, si tras hacer scroll manual el `cr.userScrolled` permanece false.

### Riesgo 3 — B3 cambia de comportamiento sin que sea regresión

**Síntoma:** al entrar a Review Session, el TF aparece distinto a antes (mejor o peor que B3 pre-fase 3).

**Mitigación:** B3 está en alcance "potencialmente cerrado" pero NO en alcance "objetivo explícito". Cualquier cambio de comportamiento se anota en el HANDOFF de cierre, no se ataca durante la fase 3.

**Señal a Ramón:** en prueba 3a-4 o 3c-4, observación verbatim "el TF de Review está distinto a antes".

### Riesgo 4 — Romper consumers que suscriben (CustomDrawingsOverlay, DrawingToolbar, KillzonesOverlay)

**Síntoma:** drawings/killzones no se redibujan cuando cambia el rango.

**Mitigación:** la fase 3 NO toca esos consumers. Las suscripciones siguen apuntando al mismo `chart.timeScale().subscribeVisibleLogicalRangeChange(...)` actual. Solo cambia el handler interno de `_SessionInner.js` L870, y el cambio es estructural (mismo dispatch de `setChartTick(t=>t+1)`).

**Señal a Ramón:** en cualquier prueba, drawings/killzones que dejen de redibujarse al hacer scroll/zoom.

### Riesgo 5 — Imports circulares

**Síntoma:** `Cannot access 'X' before initialization` en runtime.

**Mitigación:** `lib/chartViewport.js` no importa de `components/`. Solo exporta funciones que reciben `cr` como parámetro. Verificación: `npm run build` verde antes de cada commit.

### Riesgo 6 — Romper Vercel build

**Síntoma:** `npm run build` falla.

**Mitigación:** `npm run build` local antes del commit de cada sub-fase.

### Riesgo 7 — Rama feature deriva de main desactualizada

**Síntoma:** al mergear, conflictos.

**Mitigación:** crear `refactor/fase-3-viewport-layer` desde HEAD `38189c6` (estado actual tras saneamiento). No se espera que main avance durante la fase 3 (sesión continua hoy).

---

## 7. Resumen ejecutivo en lenguaje llano (para que Ramón decida en 30 segundos)

- **Qué hacemos hoy:** crear un archivo nuevo `lib/chartViewport.js` que centralice los 5 puntos del código que mueven el viewport del chart (zoom, scroll, restauración tras cambio de TF). Hoy esos 5 puntos están repartidos por dentro de `_SessionInner.js`. Al terminar, todos pasarán por el archivo nuevo.
- **3 sub-fases secuenciales:** 3a (rama init/full + crear archivo nuevo), 3b (ramas tick), 3c (scrollToTail + handler subscribe + isAutoSettingRange).
- **0 cambios funcionales esperados.** El sistema debe verse y comportarse exactamente igual. Si algo cambia visualmente, paramos.
- **1 bug que probablemente cierra:** B3 (TF reset al entrar Review Session).
- **1 archivo nuevo + 1 archivo modificado.** Solo `lib/chartViewport.js` (NUEVO) y `components/_SessionInner.js` (MODIFICADO).
- **NO toca:** `lib/chartCoords.js`, `CustomDrawingsOverlay.js`, `DrawingToolbar.js`, `KillzonesOverlay.js`. Lecturas de viewport y suscripciones de consumers se quedan donde están.
- **Decisión arquitectónica §0:** Opción B (escrituras solo). Opción A (todo) descartada por riesgo. **Pendiente OK Ramón** antes de empezar.
- **Decisión arquitectónica §2.5:** activar `isAutoSettingRange` correctamente en la nueva API (~3 líneas extra). Recomendada. **Pendiente OK Ramón** antes de empezar.
- **Validación:** Ramón prueba manualmente cada sub-fase antes de pasar a la siguiente. Antes de cada commit, `git diff` completo + OK explícito.
- **Rama:** `refactor/fase-3-viewport-layer`. Crear desde main HEAD `38189c6` cuando el plan se apruebe. Sin push hasta que toda la fase esté validada.
- **Cierre:** tras 3c, viewport layer queda totalmente aislada en `lib/chartViewport.js`. Las lecturas y suscripciones siguen pendientes — fase 3.5 (futura, opcional) o cuando duela.

---

## 8. Lecciones operativas heredadas

§8.1 a §8.10 de HANDOFF-cierre-b1.md y HANDOFF-cierre-fase-2.md aplican igual a fase 3 sin cambios. Se referencian aquí por completitud:

- **§8.1 (b1, fase-2):** validación al carácter, no por descripción.
- **§8.2 (fase-2), §8.3 (b1):** distinguir lo verificado de lo inferido. Bytes en disco > narrativa de Claude Code.
- **§8.4 (b1), §8.4 (fase-2):** comandos git como operaciones SEPARADAS, sin `&&`.
- **§8.5 (b1):** disciplina "no improvisar comandos". El conductor del PASO 0 es el chat web, NO Claude Code.
- **§8.6 (b1):** distinguir display de bytes en disco. `grep "patrón"` > `sed -n NN,MMp` cuando hay duda. Para fase 3, especialmente: outputs literales del shell, NO interpretaciones de Claude Code.
- **§8.8 (b1):** "Resumen ejecutivo en lenguaje llano" en §7 para que Ramón decida en 30 s sin leer el plan entero. Patrón replicado aquí.
- **§8.10 (b1):** mantener "opción 1 manual" SIEMPRE, incluso para comandos triviales.

### 8.11 Nueva — Inventario PASO 0 puede revelar deuda técnica menor (isAutoSettingRange)

Lección de hoy: el PASO 0 de fase 3 destapó que `isAutoSettingRange` es código muerto (read-only sin write, siempre undefined). El plan táctico aprovecha la fase para arreglarlo en lugar de simplemente migrar el comportamiento roto. Decisión consciente.

**Norma:** durante PASO 0 de fases futuras, anotar cualquier deuda técnica menor descubierta. Si arreglarla cuesta < 5 líneas y cae naturalmente dentro del alcance, hacerlo. Si cuesta más o se aleja del alcance, registrarlo en backlog y posponer.

---

## 9. Stack y entorno

Sin cambios respecto a HANDOFF-cierre-b1.md §9:

- Next.js 14.2.35 (pages router).
- React 18.
- Lightweight-charts (LWC) — fork con plugins en `vendor/`.
- Vercel deploy.
- Mac iMac, macOS, terminal zsh nativa para grep/cat literales.

### Sesiones de prueba previstas

Ramón crea/usa en `localhost:3000` o producción:
- 1 sesión practice EURUSD para smoke checks.
- 1 sesión practice multi-par (EURUSD + USDCHF) para prueba de cambio de par durante play.
- 1 sesión challenge cerrada con TF distinto al actual para prueba 3a-4 / 3c-4 (Review Session, B3).

Cleanup post-pruebas si se crean sesiones nuevas en BD producción durante testing local (mismo patrón que B1/B4).

---

## 10. Documentos relacionados

| Archivo | Estado | Relación con fase 3 |
|---|---|---|
| `HANDOFF-cierre-saneamiento-historico.md` | comiteado en `38189c6` | Estado del repo al arrancar fase 3 |
| `HANDOFF-cierre-b1.md` | comiteado en `0cfa9f1` | Plantilla estructural + lecciones operativas |
| `HANDOFF-cierre-b4.md` | comiteado en `db94e78` | Plantilla estructural |
| `HANDOFF-cierre-fase-2.md` | comiteado en `51e07c2` | Patrón fase 1 → fase 2 (escrituras → lecturas) replicado en fase 3 → 3.5 |
| `HANDOFF-verificacion-A1.md` | comiteado en `51e07c2` | §7 B3 — bug que esta fase puede cerrar |
| `HANDOFF.md` v3 | comiteado en `125ad4b` | Reglas absolutas §7 |
| `refactor/fase-2-plan.md` | comiteado | Plantilla estructural detallada |
| `refactor/b1-plan.md` | comiteado | Plantilla estructural más reciente |
| `refactor/core-analysis.md` | comiteado | §6 Fase 3 (alcance original — superado por PASO 0 de hoy) |
| `CLAUDE.md` | comiteado | Reglas absolutas §3 |
| `components/_SessionInner.js` | comiteado | Archivo principal a modificar |
| `lib/chartViewport.js` | NO existe | Archivo nuevo a crear |

---

## 11. Reglas absolutas (sin cambios respecto a HANDOFF.md v3 §7)

1. **NO push** sin OK explícito de Ramón. Vercel auto-deploya en push a `main`.
2. **NO migraciones Supabase**. Fase 3 no toca BD.
3. **NO tocar otros repos**.
4. **NO dependencias npm nuevas**.
5. **Aprobación opción 1 manual SIEMPRE** en Claude Code. NUNCA opción 2 "allow all".
6. **Comandos git separados, no encadenados con `&&`.** Excepción: leer-y-volcar (`git diff > /tmp/file.txt && cat /tmp/file.txt`).
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK. Fase 3 es ~150 líneas + 1 archivo nuevo; este plan se aprueba antes de tocar código.
8. **Producción** intacta hasta merge a `main` con fase 3 entera validada.

---

## 12. Cómo arrancar fase 3 (paso a paso para el chat que ejecute)

> Este plan se aprueba en chat web. La ejecución la hace Claude Code en terminal de Ramón con aprobación opción 1 manual de cada operación.

### 12.1 Pre-arranque (en chat web)

1. Ramón aprueba este plan, o pide modificaciones. Si pide, se actualiza y re-aprueba.
2. Ramón confirma decisión §0.2 (Opción B adoptada — ya hecho).
3. Ramón confirma decisión §2.5 (activar `isAutoSettingRange` correctamente en la nueva API — pendiente).
4. Ramón confirma estado producción `simulator.algorithmicsuite.com` verde en `bb63bfd`.

### 12.2 Arranque (en Claude Code)

1. `git status` → debe estar limpio en `main` HEAD `38189c6`.
2. `git checkout -b refactor/fase-3-viewport-layer` → rama nueva creada.
3. PASO 0 ya hecho en chat web (§2). No requiere repetición — pero ejecutar greps verificadores `setVisibleLogicalRange|scrollToPosition` PRE-Op para confirmar que el inventario sigue cuadrando.

### 12.3 Ejecución (en Claude Code, una operación a la vez)

4. Op 1 — crear `lib/chartViewport.js` con las 7 funciones. Aprobación manual.
5. Op 2 — extender import en `_SessionInner.js` L13. Aprobación manual.
6. Op 3 — sustituir L1082-L1102 (rama init/full). Aprobación manual.
7. Pruebas manuales 3a (prueba 0, 1, 2 crítica, 3, 4). Si todo OK → commit 3a.
8. Op 4 — sustituir L1121 + L1138 (rama "una vela TF nueva"). Aprobación.
9. Op 5 — sustituir L1142 + L1145 (rama tick simple). Aprobación.
10. Pruebas manuales 3b (prueba 0, 1 crítica, 2, 3, 4). Si todo OK → commit 3b.
11. Op 6 — sustituir L1234 (scrollToTail). Aprobación.
12. Op 7 — sustituir handler L870-L873 (markUserScrollIfReal). Aprobación.
13. Pruebas manuales 3c (prueba 0, 1 crítica, 2, 3, 4). Si todo OK → commit 3c.

### 12.4 Validación pre-merge (en Claude Code + navegador)

14. Verificaciones automáticas de §5 puntos 3-6 (greps + npm run build). Pegar outputs literal.
15. Si todo OK → `git diff main..refactor/fase-3-viewport-layer` completo a Ramón.
16. Ramón da OK explícito para merge.

### 12.5 Merge + push + deploy (decidir en chat web)

17. Decidir con Ramón si se mergea + pushea hoy o se duerme una noche.
18. Si push aprobado: `git checkout main`, `git merge refactor/fase-3-viewport-layer`, `git push origin main`. Cada uno con su aprobación.
19. Watch Vercel deploy. Si rojo, `git revert` + push. Si verde, smoke check producción.

### 12.6 Cierre (en chat web)

20. Redactar `HANDOFF-cierre-fase-3.md` con resultados, sub-fases ejecutadas, decisiones tomadas, próximo paso (probable: B2 / B3 si no se cerró del todo / fase 4 render layer / fase 3.5 lecturas).
21. Comitear el HANDOFF en una sesión posterior (no en el commit del fix, mantener atomicidad).

---

**Fin del plan táctico fase 3.**

Pendiente OK Ramón en §0.2 (Opción B — confirmada verbalmente), §2.5 (activar isAutoSettingRange — pendiente) + aprobación general de este plan antes de pasar a Claude Code para arrancar Op 1.
