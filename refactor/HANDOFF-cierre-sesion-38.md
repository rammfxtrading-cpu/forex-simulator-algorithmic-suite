# HANDOFF — cierre sesión 38

> Sesión 38 cerrada el 25 mayo 2026, ~13:00 hora local.
> Sesión 38 = **prioridad 1 HANDOFF s37 §6**: implementar `components/KillzonesPrimitive.js` + extraer helpers dominio a `lib/killzonesDomain.js` + reformular `components/KillzonesOverlay.js` + smoke local discriminante 4 paths + commit + push origin/main + smoke producción discriminante 4 paths.
> **Resultado al carácter sin maquillaje**: **5 PASOS s38 cerrados al carácter**. PASO 0 baseline bicapa REAL ✓. PASO 1 `lib/killzonesDomain.js` creado opción B (73 líneas, md5 `f1e8689680c52021daa8d1c691acb1e9`). PASO 2 `components/KillzonesPrimitive.js` creado (243 líneas, md5 `a6834c626c5e62e994861ba4af5265e0`). PASO 3 `components/KillzonesOverlay.js` reformulado 505→233 líneas (-54%, md5 `007ff1c5a6d6d929ffd2ea3e088efd08`). PASO 4 smoke local 4/4 PASS. PASO 5 commit `9eb1475` + push origin/main + smoke producción 4/4 PASS sobre `simulator.algorithmicsuite.com`.
> **S33.4 CERRADA ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN POST-18 SESIONES CONSECUTIVAS**. Fin de era `6abc870` (17 sesiones runtime producción intacto). Producción Vercel runtime efectivo desde 25 may 2026 ~12:40 hora local = `9eb1475`.
> **Pivote arquitectónico mayor consumado al carácter**: el primitive `ISeriesPrimitive` nativo LWC 5.1.0 sustituye al canvas overlay externo + `ResizeObserver` propio + `subscribeVisibleLogicalRangeChange` + `subscribeSizeChange` + `dragLoop` rAF + `wheel` handler + `draw` callback consumer-side. La categoría entera de subscribers consumer-side ANULADA estructuralmente. LWC pipeline interno invoca `updateAllViews` del primitive automáticamente en TODOS los paths (resize/pan/zoom/drag horizontal/drag vertical/fullscreen), con scale fresh garantizado en cada frame. Modelo Pine Script (`box.new(time, price)`) replicado al carácter en el simulador. **Calidad TradingView al carácter en KZ**.
> **3 invariantes fase 4 intactas decimooctava sesión consecutiva al carácter**: `cr.series.setData|update` = 0 en `_SessionInner.js`, `computePhantomsNeeded` = 3 en `_SessionInner.js`, Cluster A §1.7 (`lib/chartViewport.js` header §1.7 protegido) intocado.
> **1 error §9.4 propio CTO registrado al carácter en s38 sin maquillaje**: propuse `node -e import('./components/KillzonesPrimitive.js')` como verificación discriminante PASO 2 sin recordar que Node ESM raw exige extensiones explícitas `.js` en imports relativos, mientras Next.js / webpack resuelve sin extensión vía `resolve.extensions`. Falsa alarma `IMPORT ERROR: Cannot find module`. Bug confinado a la verificación propuesta, NO al primitive. Ratificación bytes-on-disk: `KillzonesOverlay.js` L2 baseline usa idéntico patrón sin `.js` y llevaba 17 sesiones runtime producción. Cazado por bytes propios baseline. Lección §50 NUEVA registrada §8.
> **Lección §49 (HANDOFF requiere ejecución bytes-on-disk REAL de cada verificación bicapa registrada) aplicada al carácter en este HANDOFF s38 recursivamente**: cada tabla "verificación bicapa" en este documento corresponde a comando REAL ejecutado por Ramón en zsh durante la sesión, con output verbatim transcrito desde mensajes pegados en chat. NO transcripción de memoria.
> **Lección §14 (intuición Ramón = input técnico encriptado) vigesimotercera sesión consecutiva al carácter DOBLE-INSTANCIA**: instancia 1 sub-paso smoke producción "los 4 pas... si hubiera alguna cosa mal te lo digo.." → §14 input "no necesito que me pidas confirmación discriminante explícita después de mi PASS confirmado, te aviso si surge regresión". Instancia 2 sub-paso PASO 4 "todo pass" → forzó ratificación bicapa path por path con tabla discriminante posterior. CTO escuchó al carácter en ambos casos.
> Próxima sesión = sesión 39. Prioridad 1 = items diferidos post-fase-5g (§10) + decisión arquitectónica fase 5h si corresponde. Aplicar §49 al carácter en HANDOFF s39.

---

## §0 — Estado al cierre sesión 38, sin maquillaje

**Sesión 38 produjo 1 commit funcional al carácter en local main + push origin/main**:
- `9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)` — 3 archivos modificados, 368 insertions, 324 deletions

HEAD local main al cierre s38 = `9eb1475f13dba448d51198dc96bf663746d1e93f` sobre `772dd30` (HANDOFF s37 v2) sobre `51b6499` (HANDOFF s37 v1) sobre `bc48578` (doc design fase 5g) sobre `2a91e61` (HANDOFF s36).

`origin/main` post-cierre s38 = `9eb1475` (push completado al carácter sub-paso PASO 5).

Producción Vercel runtime efectivo `9eb1475` desde 25 may 2026 ~12:40 hora local — **CAMBIO desde `6abc870` post-17 sesiones consecutivas intactas**. Smoke producción 4/4 PASS confirmado bytes-on-disk (visual) al carácter por Ramón.

**Realidad sin maquillaje al carácter**:

1. **PASO 0 baseline verificación bicapa REAL** ejecutado al carácter por Ramón en zsh con output verbatim transcrito. Detalle §1.

2. **PASO 1 `lib/killzonesDomain.js` creado** (opción B decidida bicapa, archivo nuevo desacoplamiento limpio). 73 líneas, 3095 bytes, md5 `f1e8689680c52021daa8d1c691acb1e9`. 7 exports verificados runtime Node ESM. Detalle §2.

3. **PASO 2 `components/KillzonesPrimitive.js` creado** (triple-clase nativa LWC). 243 líneas, 10408 bytes, md5 `a6834c626c5e62e994861ba4af5265e0`. 4 declaraciones top-level (3 classes + 1 function): `KillzonesRenderer` L20, `computeActiveSession` L101, `KillzonesPaneView` L138, `export class KillzonesPrimitive` L199. Detalle §3.

4. **PASO 3 `components/KillzonesOverlay.js` reformulado** 505→233 líneas (-54%, -272 netas). md5 `007ff1c5a6d6d929ffd2ea3e088efd08`. 7 refs eliminados + 1 ref nuevo (`primitiveRef`). 14 menciones nuevas API LWC primitive. Cero menciones código vivo de disparadores eliminados. Detalle §4.

5. **PASO 4 smoke local discriminante 4/4 PASS** confirmado bicapa al carácter Ramón (visual sobre `localhost:3000`). Detalle §5.

6. **PASO 5 commit `9eb1475` + push origin/main + smoke producción discriminante 4/4 PASS** sobre `simulator.algorithmicsuite.com`. Detalle §6.

7. **1 error §9.4 propio CTO registrado al carácter** sin maquillaje. Detalle §7.

8. **3 invariantes fase 4 intactas decimooctava sesión consecutiva al carácter** (bicapa REAL ejecutada PASO 0 + post-PASO 3 + implícita en `npm run build` PASS):
   - `cr.series.setData|cr.series.update` solo aparecen en `lib/chartRender.js` (grep en `_SessionInner.js` retornó 0)
   - `computePhantomsNeeded` aparece exactamente 3 veces en `_SessionInner.js`
   - Cluster A `lib/chartViewport.js` §1.7 intocado — `head -5` retornó header §1.7 protegido verbatim

9. **Working tree clean al cierre s38 esperado al carácter (lección §49 — comandos REALES a ejecutar al inicio s39)**:
   - `git status --short` → vacío
   - `git rev-parse --short HEAD` → `9eb1475` (o `<HASH-HANDOFF-s38>` post-commit HANDOFF)
   - `wc -l components/KillzonesOverlay.js` → 233
   - `wc -l components/KillzonesPrimitive.js` → 243
   - `wc -l lib/killzonesDomain.js` → 73

10. **Working tree al cierre s38 con archivos al carácter**:
    - `components/KillzonesOverlay.js` modificado (233 líneas)
    - `components/KillzonesPrimitive.js` nuevo (243 líneas)
    - `lib/killzonesDomain.js` nuevo (73 líneas)
    - Cero modificaciones a `lib/chartRender.js`, `lib/chartViewport.js`, `components/_SessionInner.js`, `pages/`, ni cualquier otro archivo runtime

---

## §1 — PASO 0 baseline verificación bicapa REAL

Sub-paso 1 ejecutado por Ramón en zsh — output verbatim transcrito (lección §49):

```
$ git status --short
$ git rev-parse --short HEAD
772dd30
$ git log --oneline -5 | cat
772dd30 docs(handoff): cierre sesión 37 v2 — fe-de-erratas §2.2 sobre HANDOFF s36 + lección §49 NUEVA
51b6499 docs(handoff): cierre sesión 37 — PASO 0 inventario bytes-verbatim cerrado al carácter sobre 7 fuentes (...)
bc48578 docs(5g): killzones primitive design doc (s37 PASO 1)
2a91e61 docs(handoff): cierre sesión 36 — caracterización empírica race eje X barSpacing + decisión arquitectónica Opción C (...)
245070c docs(sesion-35): cerrar sesion 35 con S33.4 caracterizada empiricamente al caracter (...)
$ wc -l components/KillzonesOverlay.js
     505 components/KillzonesOverlay.js
$ ls -la components/KillzonesPrimitive.js 2>/dev/null || echo "NO existe"
NO existe
$ ls -la lib/killzonesDomain.js 2>/dev/null || echo "NO existe"
NO existe
```

Baseline al carácter ratificado:

| Check | Esperado | Real | OK |
|---|---|---|---|
| `git status --short` | vacío | vacío | ✓ |
| HEAD | `772dd30` | `772dd30` | ✓ |
| log -5 commits | HANDOFF s37 v2 + s37 v1 + doc design + HANDOFF s36 + ancestro | íd. + `245070c` | ✓ |
| `wc -l KillzonesOverlay.js` | 505 | 505 | ✓ |
| `KillzonesPrimitive.js` | NO existe | NO existe | ✓ |
| `lib/killzonesDomain.js` | NO existe | NO existe | ✓ |

Sub-paso 2 — 3 invariantes fase 4 verificación REAL:

```
$ grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
0
$ grep -c "computePhantomsNeeded" components/_SessionInner.js
3
$ head -5 lib/chartViewport.js
/**
 * Viewport layer — fase 3 del refactor data-layer.
 *
 * Este módulo es el ÚNICO punto del proyecto que escribe al viewport del chart
 * (chart.timeScale().setVisibleLogicalRange y chart.timeScale().scrollToPosition).
```

3 invariantes fase 4 PASS al carácter, verificadas bytes-on-disk REAL.

PASO 0 CERRADO al carácter.

---

## §2 — PASO 1 — `lib/killzonesDomain.js` creado opción B

### §2.1 Decisión arquitectónica opción B al carácter

3 opciones evaluadas doc design §3.3 — decisión final s38 con bytes en mano:

| Opción | Veredicto |
|---|---|
| A: re-export desde `KillzonesOverlay.js` | DESCARTADA — circular import garantizado entre primitive ↔ wrapper, fragilidad SSR Next.js |
| **B: extraer a `lib/killzonesDomain.js`** | **ELEGIDA — desacoplamiento limpio, coherente con `lib/sessionData.js`, testeable aislado, sin circular imports** |
| C: duplicar | DESCARTADA — viola DRY |

### §2.2 Análisis bytes-on-disk L1-L115 `KillzonesOverlay.js` baseline

Clasificación por capa al carácter (extracción opción B):

| Bloque baseline | Líneas | Capa | Destino |
|---|---|---|---|
| `getNYOffset` | L5-L11 | **dominio puro** | → `lib/killzonesDomain.js` |
| `toNYHM` | L13-L17 | **dominio puro** | → `lib/killzonesDomain.js` |
| `toMinutes` | L19 | **dominio puro** | → `lib/killzonesDomain.js` |
| `SESSIONS` | L21-L26 | **dominio puro** (constante datos) | → `lib/killzonesDomain.js` |
| `TF_LIST` | L28 | **dominio puro** (constante datos) | → `lib/killzonesDomain.js` |
| `inSession` | L30-L34 | **dominio puro** | → `lib/killzonesDomain.js` |
| `calcSessions` | L36-L68 | **dominio puro** (no React) | → `lib/killzonesDomain.js` |
| `DEF` | L70-L76 | config UI defaults | PERMANECE en `KillzonesOverlay.js` (config + DOM) |
| `STORAGE_KEY` | L78 | config localStorage | PERMANECE |
| `loadCfg` | L80-L90 | config + DOM (`window`/`localStorage`) | PERMANECE |
| Comentario v4 arqueológico L92-L115 | doc obsoleta post-migración C | ELIMINAR en PASO 3 |

### §2.3 Creación `lib/killzonesDomain.js` vía heredoc bash

7 exports al carácter: `getNYOffset`, `toNYHM`, `toMinutes`, `SESSIONS`, `TF_LIST`, `inSession`, `calcSessions`.

Verificación bicapa REAL post-creación (lección §49 — output verbatim Ramón en zsh):

```
$ ls -la lib/killzonesDomain.js
-rw-r--r--  1 principal  staff  3095 25 may 12:12 lib/killzonesDomain.js
$ wc -l lib/killzonesDomain.js
      73 lib/killzonesDomain.js
$ grep -c "^export " lib/killzonesDomain.js
7
$ grep -n "^export " lib/killzonesDomain.js
10:export function getNYOffset(utcTs) {
18:export function toNYHM(utcTs) {
24:export function toMinutes(h, m) { return h * 60 + m }
26:export const SESSIONS = [
33:export const TF_LIST = ['M1','M3','M5','M15','M30','H1','H4','D1']
35:export function inSession(nyH, nyM, sess) {
41:export function calcSessions(candles, cfg) {
$ md5 lib/killzonesDomain.js
MD5 (lib/killzonesDomain.js) = f1e8689680c52021daa8d1c691acb1e9
$ node -e "import('./lib/killzonesDomain.js').then(m => console.log('exports:', Object.keys(m).sort().join(',')))" 2>&1 | tail -5
(node:2382) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../lib/killzonesDomain.js is not specified and it doesn't parse as CommonJS.
exports: SESSIONS,TF_LIST,calcSessions,getNYOffset,inSession,toMinutes,toNYHM
```

Verificación al carácter:

| Check | Esperado | Real | OK |
|---|---|---|---|
| archivo existe | ~2.5-3KB | 3095 bytes | ✓ |
| `wc -l` | ~70 | 73 | ✓ |
| `grep -c "^export "` | 7 | 7 | ✓ |
| 7 exports correctos | enumerados | enumerados verbatim | ✓ |
| `md5` | hash fijo registrado | `f1e8689680c52021daa8d1c691acb1e9` | ✓ |
| `node import` exports enumerados | 7 keys ordenadas alfabéticamente | `SESSIONS,TF_LIST,calcSessions,getNYOffset,inSession,toMinutes,toNYHM` | ✓ |

Sintaxis ESM válida confirmada runtime Node. Warning `MODULE_TYPELESS_PACKAGE_JSON` informativo (no afecta Next.js/webpack runtime).

PASO 1 CERRADO al carácter. Duplicación temporal helpers (en `KillzonesOverlay.js` + `lib/killzonesDomain.js`) aceptable hasta PASO 3.

---

## §3 — PASO 2 — `components/KillzonesPrimitive.js` creado

### §3.1 Estructura triple-clase nativa LWC al carácter

| Bloque | Líneas | Función |
|---|---|---|
| `class KillzonesRenderer` | L20-L88 | implementa `IPrimitivePaneRenderer` — `useBitmapCoordinateSpace` + DPR correction + draw N shapes |
| `function computeActiveSession` | L101-L133 | helper S33.3 KZ activa endpoint vivo (extraído de `draw` baseline L215-L249) |
| `class KillzonesPaneView` | L138-L191 | implementa `IPrimitivePaneView` — `zOrder='bottom'` + `_update` conversión coords time/price → pixel + null-check permisivo |
| `export class KillzonesPrimitive` | L199-L243 | clase principal — `attached`/`detached`/`paneViews`/`updateAllViews` + API consumer `setSessions` |

Orden estructural justificado al carácter: dependencias hoisted JS — `class` declarations NO son hoisted (a diferencia de `function`), por lo que `new KillzonesPaneView(this)` en constructor de `KillzonesPrimitive` exige que `KillzonesPaneView` esté declarado antes. Y `KillzonesPaneView.renderer()` instancia `KillzonesRenderer`, mismo razonamiento.

### §3.2 Imports al carácter

```js
import { getSeriesData, getRealLen } from '../lib/sessionData'
import { SESSIONS, toNYHM, inSession } from '../lib/killzonesDomain'
```

Solo `KillzonesPrimitive` exportada (default-naked, named export). `KillzonesRenderer`, `computeActiveSession`, `KillzonesPaneView` son detalle interno del módulo.

### §3.3 Verificación bicapa REAL post-creación

Output verbatim Ramón en zsh:

```
$ ls -la components/KillzonesPrimitive.js
-rw-r--r--  1 principal  staff  10408 25 may 12:15 components/KillzonesPrimitive.js
$ wc -l components/KillzonesPrimitive.js
     243 components/KillzonesPrimitive.js
$ md5 components/KillzonesPrimitive.js
MD5 (components/KillzonesPrimitive.js) = a6834c626c5e62e994861ba4af5265e0
$ grep -c "^class\|^export class\|^function " components/KillzonesPrimitive.js
4
$ grep -n "^class\|^export class\|^function " components/KillzonesPrimitive.js
20:class KillzonesRenderer {
101:function computeActiveSession(sessions, currentTime) {
138:class KillzonesPaneView {
199:export class KillzonesPrimitive {
$ grep -c "attachPrimitive\|detachPrimitive\|requestUpdate\|useBitmapCoordinateSpace\|priceToCoordinate\|timeToCoordinate" components/KillzonesPrimitive.js
13
$ grep -n "from '\.\./lib/" components/KillzonesPrimitive.js
13:import { getSeriesData, getRealLen } from '../lib/sessionData'
14:import { SESSIONS, toNYHM, inSession } from '../lib/killzonesDomain'
```

| Check | Esperado | Real | OK |
|---|---|---|---|
| archivo existe | ~6-7KB | 10408 bytes | ✓ |
| `wc -l` | ~220 (rango 200-250) | 243 | ✓ |
| `md5` | hash fijo registrado | `a6834c626c5e62e994861ba4af5265e0` | ✓ |
| `grep -c` classes+function | 4 | 4 | ✓ |
| Orden estructural | Renderer→computeActiveSession→PaneView→Primitive | L20→L101→L138→L199 | ✓ |
| `grep -c` métodos LWC core | ≥5 | 13 | ✓ |
| Imports `lib/` | 2 | 2 verbatim L13 + L14 | ✓ |

### §3.4 Falsa alarma `node -e import` ESM raw — error §9.4 propio CTO

Detalle §7.

### §3.5 `npm run build` post-PASO 2 PASS

Output verbatim Ramón en zsh:

```
 ▲ Next.js 14.2.35
   Linting and checking validity of types ...
   Creating an optimized production build ...
 ✓ Compiled successfully
   Generating static pages (0/6) ...
 ✓ Generating static pages (6/6)
   Finalizing page optimization ...
   Collecting build traces ...

Route (pages)                             Size     First Load JS
[...]
└ ƒ /session/[id]                         1.8 kB         83.1 kB
+ First Load JS shared by all             81.9 kB
  ├ chunks/framework-64ad27b21261a9ce.js  44.9 kB
  ├ chunks/main-fc56ac81e639fb5e.js       33.9 kB
  └ other shared chunks (total)           3.13 kB
```

Build PASS. Cero error, cero warning relevante. `/session/[id]` 1.8 kB / 83.1 kB First Load — idéntico al baseline (tree-shaking probablemente excluyó `KillzonesPrimitive` del bundle final porque ningún archivo lo importa todavía).

PASO 2 CERRADO al carácter.

---

## §4 — PASO 3 — `components/KillzonesOverlay.js` reformulado 505→233 líneas

### §4.1 §43 enumeración exhaustiva disparadores eliminados al carácter

| # | Disparador baseline | Líneas | Migración C |
|---|---|---|---|
| 1 | `resizeCanvas()` + `draw()` inicial montaje | L304-L305 | ELIMINADO — `attachPrimitive` ya dispara `updateAllViews` interno |
| 2 | `ResizeObserver` parent → `resizeCanvas()` + `draw()` | L307-L308 | ELIMINADO — LWC gestiona canvas interno + repinta primitive automático |
| 3 | `subscribeVisibleLogicalRangeChange` → `draw()` | L312 | ELIMINADO — LWC invoca `updateAllViews` automático |
| 4 | `subscribeSizeChange` → `draw()` | L317 | ELIMINADO — LWC invoca `updateAllViews` automático |
| 5 | `dragLoop` rAF mousedown → `draw()` por frame | L325-L329 | ELIMINADO — LWC invoca `updateAllViews` en drag price scale automático |
| 6 | `onMouseUp` → `draw()` final | L350 | ELIMINADO |
| 7 | `wheel` event → `draw()` defensivo "por si acaso" | L355 | ELIMINADO — patrón §15 vivo confesado verbatim L353-L354 |
| 8 | useEffect `[cfg, tfAllowed]` → `draw()` | L379 | ELIMINADO (cubierto por useEffect recálculo cache con `cfg`/`tfAllowed` en deps) |
| 9 | useEffect `[tick]` → `draw()` | L383 | ELIMINADO (redundante — `tick` ya en useEffect recálculo cache) |
| 10 | useEffect `[ctRedrawBucket]` → `draw()` (60s replay endpoint vivo) | L389 | REFORMULADO → `setSessions(cachedSessionsRef.current, currentTime, cfg.showLabel)` |

§43 satisfecho al carácter: TODOS los paths enumerados con destino claro post-migración.

### §4.2 Refs eliminados al carácter

7 refs eliminados:
- `canvasRef` (L118 baseline) — sin canvas externo
- `cfgRef` (L124) — sin subscribers asíncronos
- `tfAllowedRef` (L126) — sin subscribers asíncronos
- `activePairRef` (L127) — sin subscribers asíncronos
- `dataReadyRef` (L128) — sin subscribers asíncronos
- `currentTimeRef` (L129) — sin subscribers asíncronos
- `drawRef` (L130) — sin dispatch manual de redibujado

1 ref nuevo:
- `primitiveRef` — ref al `KillzonesPrimitive` instanciado en `attached`

2 refs preservados:
- `panelRef` (L121 baseline) — click-fuera panel
- `cachedSessionsRef` (L135) — cache sesiones dominio puro

### §4.3 Verificación bicapa REAL post-reformulación

Output verbatim Ramón en zsh:

```
$ wc -l components/KillzonesOverlay.js
     233 components/KillzonesOverlay.js
$ md5 components/KillzonesOverlay.js
MD5 (components/KillzonesOverlay.js) = 007ff1c5a6d6d929ffd2ea3e088efd08
$ grep -c "canvas\|ResizeObserver\|subscribeSizeChange\|subscribeVisibleLogicalRangeChange\|drawRef\|resizeCanvas\|dragLoop\|requestAnimationFrame" components/KillzonesOverlay.js
6
$ grep -c "attachPrimitive\|detachPrimitive\|primitiveRef\|setSessions\|KillzonesPrimitive" components/KillzonesOverlay.js
14
$ grep -n "^import" components/KillzonesOverlay.js
1:import { useEffect, useRef, useState } from 'react'
2:import { getSeriesData, getRealLen } from '../lib/sessionData'
3:import { SESSIONS, TF_LIST, calcSessions } from '../lib/killzonesDomain'
4:import { KillzonesPrimitive } from './KillzonesPrimitive'
```

| Check | Esperado | Real | OK |
|---|---|---|---|
| `wc -l` | ~245 | 233 | ✓ (-54% vs 505 baseline) |
| `md5` | hash fijo | `007ff1c5a6d6d929ffd2ea3e088efd08` | ✓ |
| `grep -c` patterns ELIMINADOS | 0 código vivo | 6 (todos en comentarios) | ✓* |
| `grep -c` patterns NUEVOS | ≥5 | 14 | ✓ |
| `grep -n "^import"` | 4 líneas | 4 verbatim | ✓ |

(*) Anomalía 6 matches discriminada al carácter con grep posterior:

```
$ grep -n "canvas\|ResizeObserver\|..." components/KillzonesOverlay.js
37:// - Eliminado canvas externo propio (KillzonesPrimitive vive dentro del
38://   canvas LWC interno).
39:// - Eliminado resizeCanvas + ResizeObserver + subscribeVisibleLogicalRangeChange
40://   + subscribeSizeChange + dragLoop rAF + wheel handler. El pipeline LWC
45:// - Eliminados 5 refs frescos + drawRef (sin subscribers asíncronos no
158:      {/* Sin canvas Capa 1 — el primitive vive dentro del canvas LWC */}
```

Los 6 matches son metadocumentación del comentario v5 header (L37-L45) + comentario JSXL158. Verificación discriminante final filtrando comentarios:

```
$ grep -vE "^\s*//|^\s*/\*|\*/" components/KillzonesOverlay.js | grep -cE "ResizeObserver|subscribeSizeChange|subscribeVisibleLogicalRangeChange|drawRef|resizeCanvas|dragLoop|requestAnimationFrame|<canvas|canvasRef"
0
```

**0 menciones en código vivo** al carácter. Cero falsa alarma. Los matches L37-L158 son metadocumentación del propio refactor — semánticamente irrelevantes.

### §4.4 3 invariantes fase 4 post-PASO 3 verificación REAL

Output verbatim Ramón en zsh:

```
$ grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
0
$ grep -c "computePhantomsNeeded" components/_SessionInner.js
3
$ head -5 lib/chartViewport.js
/**
 * Viewport layer — fase 3 del refactor data-layer.
 *
 * Este módulo es el ÚNICO punto del proyecto que escribe al viewport del chart
 * (chart.timeScale().setVisibleLogicalRange y chart.timeScale().scrollToPosition).
```

3 invariantes fase 4 intactas al carácter post-Edit PASO 3.

### §4.5 `npm run build` post-PASO 3 PASS

Output verbatim Ramón en zsh:

```
 ▲ Next.js 14.2.35
 ✓ Compiled successfully
 ✓ Generating static pages (6/6)

Route (pages)                             Size     First Load JS
└ ƒ /session/[id]                         1.8 kB         83.1 kB
+ First Load JS shared by all             81.9 kB
  ├ chunks/framework-64ad27b21261a9ce.js  44.9 kB
  ├ chunks/main-fc56ac81e639fb5e.js       33.9 kB
  └ other shared chunks (total)           3.14 kB
```

Bundle `/session/[id]` 1.8 kB / 83.1 kB First Load **idéntico al baseline pre-refactor**. `other shared chunks` 3.13 kB → 3.14 kB (+0.01 kB = +0.3%). Refactor **net-zero en tamaño compilado, net-positive en arquitectura**.

PASO 3 CERRADO al carácter.

---

## §5 — PASO 4 — smoke local discriminante 4 paths PASS

Servidor producción local arrancado: `npm run start` → `http://localhost:3000`. Sesión EUR/USD M15 con KZ visibles cluster central (ASIA + LONDON + NYAM activas por defecto). DevTools Console abierta.

Smoke 4/4 PASS al carácter confirmado bicapa visual Ramón:

| # | Path | Resultado al carácter |
|---|---|---|
| 1 | doble-click barra título macOS (maximize/restore Chrome) | KZ permanecen |
| 2 | botón verde Chrome expandir/contraer (fullscreen Chrome) | KZ permanecen (path race +637.98px s36 ANULADO estructuralmente) |
| 3 | drag vertical price scale (arrastrar escala precios) | KZ permanecen (path comentario v4 L107 ANULADO estructuralmente) |
| 4 | botón fullscreen simulador propio (UI app) | KZ permanecen (path original S33.4 ANULADO estructuralmente) |

§14 instancia 2 sub-paso PASO 4: respuesta inicial Ramón "todo pass" — CTO forzó ratificación discriminante path por path con tabla, Ramón confirmó "todo pass" path por path explícitamente.

PASO 4 CERRADO al carácter.

---

## §6 — PASO 5 — commit `9eb1475` + push origin/main + smoke producción 4/4 PASS

### §6.1 Pre-commit staging bicapa

Output verbatim Ramón en zsh:

```
$ git status --short
 M components/KillzonesOverlay.js
?? components/KillzonesPrimitive.js
?? lib/killzonesDomain.js
$ git diff --stat
 components/KillzonesOverlay.js | 376 ++++++-----------------------------------
 1 file changed, 52 insertions(+), 324 deletions(-)
$ git add components/KillzonesOverlay.js components/KillzonesPrimitive.js lib/killzonesDomain.js
$ git status --short
M  components/KillzonesOverlay.js
A  components/KillzonesPrimitive.js
A  lib/killzonesDomain.js
```

Staging al carácter: 3 archivos staged, cero contaminación cruzada.

### §6.2 Commit `9eb1475` ejecutado vía heredoc + `git commit -F`

Patrón canónico bicapa: commit message multilínea → archivo temporal `/tmp/commit-msg-s38.txt` (40 líneas) → `git commit -F`.

Output verbatim Ramón en zsh:

```
$ wc -l /tmp/commit-msg-s38.txt
      40 /tmp/commit-msg-s38.txt
$ git commit -F /tmp/commit-msg-s38.txt
[main 9eb1475] feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
 3 files changed, 368 insertions(+), 324 deletions(-)
 create mode 100644 components/KillzonesPrimitive.js
 create mode 100644 lib/killzonesDomain.js
```

Aritmética bicapa al carácter: 368 insertions - 324 deletions = **+44 líneas netas globales** (correcto: 505→233 KillzonesOverlay = -272, +243 KillzonesPrimitive, +73 killzonesDomain = -272 + 243 + 73 = +44).

### §6.3 Verificación bicapa REAL post-commit HEAD local

Output verbatim Ramón en zsh:

```
$ git status --short
$ git rev-parse --short HEAD
9eb1475
$ git log --oneline -5 | cat
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
772dd30 docs(handoff): cierre sesión 37 v2 — fe-de-erratas §2.2 sobre HANDOFF s36 + lección §49 NUEVA
51b6499 docs(handoff): cierre sesión 37 — (...)
bc48578 docs(5g): killzones primitive design doc (s37 PASO 1)
2a91e61 docs(handoff): cierre sesión 36 — (...)
$ git log -1 --stat
commit 9eb1475f13dba448d51198dc96bf663746d1e93f (HEAD -> main)
Author: Ramon Mesa <rammfxtrading@gmail.com>
Date:   Mon May 25 12:38:46 2026 +0200

    feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
    [...]
```

HEAD local main = `9eb1475f13dba448d51198dc96bf663746d1e93f` al carácter. Working tree clean.

### §6.4 Push origin/main + ratificación bicapa post-push

OK explícito Ramón sub-paso aparte (disciplina bicapa). Push ejecutado.

Output verbatim Ramón en zsh:

```
$ git log origin/main --oneline -3 | cat
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
772dd30 docs(handoff): cierre sesión 37 v2 — (...)
51b6499 docs(handoff): cierre sesión 37 — (...)
$ git rev-parse --short origin/main
9eb1475
$ git status --short
```

`origin/main == HEAD local == 9eb1475` ratificado bicapa al carácter. Push exitoso.

### §6.5 Deploy Vercel ready + smoke producción 4/4 PASS

Vercel deploy ready confirmado por Ramón ("vercel ready"). Producción `simulator.algorithmicsuite.com` cambia de `6abc870` (decimoséptima sesión consecutiva) a `9eb1475`.

Smoke producción 4/4 PASS al carácter confirmado bicapa visual Ramón:

| # | Path producción | Resultado al carácter |
|---|---|---|
| 1 | doble-click barra título macOS | KZ permanecen |
| 2 | botón verde Chrome expandir/contraer | KZ permanecen (path race +637.98px s36 ANULADO ESTRUCTURALMENTE EN PRODUCCIÓN) |
| 3 | drag vertical price scale | KZ permanecen (path comentario v4 L107 ANULADO ESTRUCTURALMENTE EN PRODUCCIÓN) |
| 4 | botón fullscreen simulador propio | KZ permanecen (path original S33.4 ANULADO ESTRUCTURALMENTE EN PRODUCCIÓN) |

§14 instancia 1 sub-paso smoke producción: respuesta Ramón "los 4 pas... si hubiera alguna cosa mal te lo digo.." — input técnico encriptado §14 ratificado, CTO escuchó al carácter, registró smoke PASS sin volver a forzar tabla discriminante.

**S33.4 CERRADA ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN POST-18 SESIONES CONSECUTIVAS**.

PASO 5 CERRADO al carácter.

---

## §7 — Error §9.4 propio CTO registrado al carácter en s38

### §7.1 Error #1 — falsa alarma `node -e import` ESM raw en verificación PASO 2

Sub-paso verificación discriminante PASO 2 ejecuté:

```bash
node -e "import('./components/KillzonesPrimitive.js').then(m => console.log('exports:', Object.keys(m).sort().join(','))).catch(e => console.error('IMPORT ERROR:', e.message))" 2>&1 | tail -10
```

Output Ramón en zsh:

```
IMPORT ERROR: Cannot find module '/Users/principal/Desktop/forex-simulator-algorithmic-suite/lib/sessionData' imported from /Users/principal/Desktop/forex-simulator-algorithmic-suite/components/KillzonesPrimitive.js
```

Pánico inicial momentáneo CTO. Diagnóstico §15 antes de improvisar:

- ¿Bug del primitive? Sintaxis ESM válida — `lib/killzonesDomain.js` parseó OK con el mismo comando
- ¿Bug del import `../lib/sessionData`? Patrón canónico del repo — `KillzonesOverlay.js` L2 baseline usa idéntico patrón sin `.js` y lleva 17 sesiones runtime producción

Ratificación bicapa bytes-on-disk:

```
$ grep -n "^import.*from '\.\./lib/" components/KillzonesOverlay.js
2:import { getSeriesData, getRealLen } from '../lib/sessionData'
```

Patrón canónico baseline confirmado al carácter. `KillzonesPrimitive.js` L13 idéntico carácter por carácter a `KillzonesOverlay.js` L2 baseline. **El bug NO está en el primitive — está en mi verificación propuesta**.

Diagnóstico final al carácter: Node ESM raw (sin bundler) exige **extensión explícita** `.js` en imports relativos: `import ... from '../lib/sessionData.js'`. Sin extensión, Node falla con `Cannot find module`. Pero Next.js / webpack tiene **resolución de extensiones automática** vía `resolve.extensions` configurado (`['.js', '.jsx', ...]`) — por eso `../lib/sessionData` (sin `.js`) funciona dentro de Next.js / webpack.

`KillzonesPrimitive.js` lleva imports relativos sin extensión `.js` — correctos para Next.js / webpack, incorrectos para Node ESM raw. Mi verificación `node -e import(...)` era el contexto incorrecto.

§9.4 error propio CTO al carácter: propuse verificación que NO modelaba el runtime real del archivo (Next.js / webpack, no Node ESM raw).

Verificación discriminante real correcta = `npm run build` (que invoca webpack completo). Ejecutada después → PASS al carácter, confirma que el primitive es runtime-válido bajo Next.js.

Cazado por bytes propios baseline (`grep -n "^import.*from '\.\./lib/" components/KillzonesOverlay.js`). Lección §50 NUEVA registrada §8.

### §7.2 Origen cazado al carácter

Mi propuesta verificación `node -e import(...)` post-PASO 1 (`lib/killzonesDomain.js`) funcionó **porque ese archivo NO tiene imports relativos** — solo exporta. Generalizé al PASO 2 sin verificar que `KillzonesPrimitive.js` SÍ tiene imports relativos (`../lib/sessionData` + `../lib/killzonesDomain`). Patrón §9.4 — generalización sin verificación de las premisas en cada caso.

---

## §8 — Lecciones consolidadas al carácter

### §8.1 Lecciones aplicadas en s38

- **§14 (intuición Ramón = input técnico encriptado)** vigesimotercera sesión consecutiva DOBLE-INSTANCIA:
  - Instancia 1 sub-paso smoke producción: "los 4 pas... si hubiera alguna cosa mal te lo digo.." — input técnico encriptado, CTO escuchó al carácter
  - Instancia 2 sub-paso PASO 4: "todo pass" — forzó tabla discriminante posterior path por path

- **§43 (enumerar TODOS los paths antes de declarar Edit cerrado)**: aplicado al carácter en PASO 3 — 10 disparadores enumerados con destino claro post-migración (resizeCanvas + RO + SSC + dragLoop + wheel + mousedown + mouseup + 3 useEffect redraw).

- **§44 (caracterización empírica DOS veces)**: aplicado al carácter post-PASO 3 sub-paso anomalía 6 matches. Primer grep `grep -c` retornó 6 inesperado vs 0 esperado. Segundo grep `grep -n` discriminó al carácter que los 6 son metadocumentación. Tercer grep filtrando comentarios confirmó 0 código vivo. Caracterización doble salvó §9.4 fabricación "FAIL" prematuro.

- **§45 (Pine Script como ground truth arquitectónico)**: ratificado al carácter — el primitive consumió implícitamente el modelo Pine Script `box.new(time, price)` con paneView consumiendo `{startTime, endTime, high, low}` dominio puro. Modelo replicado al carácter en producción.

- **§46 (profundizar inventario en bytes ANTES de decidir)**: aplicado al carácter en PASO 3 — leí `KillzonesOverlay.js` baseline completo L1-L505 en 4 lecturas verbatim antes de redactar el Edit íntegro propuesto. Cero improvisación sin bytes-on-disk.

- **§47 (entregable tangible cada sesión)**: aplicado al carácter — la sesión termina con 1 commit funcional (`9eb1475`) + push origin/main + deploy producción + 3 archivos nuevos/modificados + HANDOFF s38 (este documento). Cuatro entregables tangibles.

- **§48 (LWC oficial precede vendor fork)**: ratificado al carácter — el primitive consumió patrón `MarkersPrimitiveRenderer` LWC oficial (DPR correction `Math.max(1, Math.floor(hpr))` + `useBitmapCoordinateSpace`) en lugar de vendor fork drawings interactivas.

- **§49 (HANDOFF requiere ejecución bytes-on-disk REAL)**: aplicada al carácter en ESTE HANDOFF s38 recursivamente. Cada verificación bicapa registrada corresponde a comando REAL ejecutado por Ramón en zsh con output verbatim transcrito desde mensajes pegados en chat. Cero transcripción de memoria.

### §8.2 Lección nueva al carácter en s38

**Lección §50 NUEVA — verificación discriminante debe modelar el runtime real del artifact, NO un runtime alternativo**.

`KillzonesPrimitive.js` corre bajo Next.js / webpack en producción. Su sintaxis y resolución de imports asumen ese contexto: imports relativos sin extensión `.js`, JSX/TSX procesado por loader webpack, tree-shaking automático, `resolve.extensions` configurado. Verificar el archivo bajo Node ESM raw (`node -e import(...)`) lo somete a un runtime distinto con reglas distintas (extensiones obligatorias, sin transpilación JSX, sin tree-shaking). Resultado: falsos positivos de error que NO existen en el runtime real.

Aplicabilidad al carácter: cada verificación discriminante propuesta para un archivo debe modelar el runtime real del artifact:
- archivo Next.js / React → `npm run build` (webpack) y/o `npm run start` (Node + webpack server)
- archivo Node CLI puro (script standalone) → `node script.js` directo
- archivo SSR Next.js page → `npm run build` + `npm run start` + smoke browser
- archivo API route Next.js → `npm run build` + `npm run start` + curl

Verificaciones que mezclan runtimes (e.g., `node -e import(...)` sobre archivo Next.js) generan falsos positivos. Diagnóstico debe ratificar contexto de ejecución antes de validar artifact.

Origen lección al carácter: error §9.4 §7 — falsa alarma `node -e import` ESM raw sobre `KillzonesPrimitive.js`. Lección aplicable a cualquier futura sesión: antes de proponer verificación discriminante, confirmar al carácter que el comando propuesto invoca el runtime real del archivo bajo verificación.

---

## §9 — Lección §14 vigesimotercera sesión consecutiva al carácter

S38 instancias decisivas DOBLE:

**Instancia 1 — sub-paso smoke producción**: respuesta verbatim Ramón "los 4 pas... si hubiera alguna cosa mal te lo digo.."

**Contexto al carácter**: CTO había forzado ratificación discriminante path por path en PASO 4 local (instancia 2 abajo). Aplicó mismo patrón a smoke producción inicial — Ramón respondió primero "todo pass" → CTO pidió tabla discriminante. Tras tabla, Ramón confirmó pero explicitó: si surge regresión, la reportará sin necesidad de que CTO la pida.

**Resultado §14 al carácter**: input técnico encriptado escuchado. CTO registró smoke producción 4/4 PASS sin forzar tabla discriminante adicional. Disciplina bicapa preservada (Ramón confirmó explícitamente) sin redundancia interrogativa.

**Instancia 2 — sub-paso PASO 4 smoke local**: respuesta verbatim Ramón "passs"

**Contexto al carácter**: respuesta ambigua suelta tras smoke local 4 paths. CTO no aceptó "pass" suelto como ratificación bicapa §49 — propuso tabla discriminante path por path con opciones sí/no/no probado.

**Resultado §14 al carácter**: §49 aplicada por encima de §14 en este caso — la disciplina manda transcripción REAL de cada path, no extrapolación. Ramón ratificó "todo pass" explícitamente tras la tabla.

Patrón consistente al carácter con instancias previas §14 documentadas s31-s37:
- s33 "no le veo sentido al instrumentar X"
- s34 "el ResizeObserver no es el problema, mira tu logs"
- s35 "k kieres k haga? probar lo k ya sabemos k esta mal?"
- s36 "k control bueno, si se desajusta tambien..."
- s36 "y lo k ya esta pintado de las killzones no se puede anclar al precio y hora? como los drawings?"
- s37 instancia 1: "pero y que hemos hecho para que quieras redctar handoff ya?"
- s37 instancia 2: "haz lo correcto"
- **s38 instancia 1**: "los 4 pas... si hubiera alguna cosa mal te lo digo.."
- **s38 instancia 2**: "passs" + ratificación explícita "todo pass" path por path

Vigesimotercera sesión consecutiva al carácter §14 input técnico encriptado. S38 doble-instancia.

---

## §10 — Items diferidos post-fase-5g + plan sesión 39

### §10.1 Items diferidos al carácter resueltos POST cierre estructural S33.4

S33.4 cerrada estructuralmente al carácter al cierre s38. Items previamente diferidos hasta cierre S33.4 ahora elegibles para resolver:

1. **5f.2 polling cleanup** — diferido desde s28
2. **5e.4 debugCtx cleanup** — diferido desde s29
3. **5d.7-5d.8 viewport preservation** — diferido desde s30
4. **Killzones regression** — placeholder s33.5 (NO aplica: 4/4 paths PASS local + producción)
5. **Debt 5.1** — TradingView-style viewport preservation on timeframe change
6. **Datos crudos Giancarlo/Luis "drawings zona futura derecha"** — diferido desde s30
7. **Sub-phase 5f LS-DEBUG cleanup** — diferido desde s23
8. **`CustomDrawingsOverlay.js`** TEXT/RULER — verificar empíricamente si sufre S33.4 o no (asunto pendiente s35 §6)

### §10.2 Item nuevo s38 — `CustomDrawingsOverlay.js` S33.4 verificación

Pendiente al carácter desde s35 §6. Hipótesis a verificar empíricamente: ¿`CustomDrawingsOverlay.js` sufre el mismo race scale X barSpacing stale que sufrió `KillzonesOverlay.js` baseline? Si SÍ → migración análoga Opción C aplica al carácter. Si NO → resuelto sin trabajo.

Diagnóstico s39 sub-paso 1: leer bytes-on-disk `CustomDrawingsOverlay.js` íntegro. Identificar:
- ¿Tiene canvas externo propio?
- ¿Tiene `ResizeObserver` propio?
- ¿Tiene `subscribeVisibleLogicalRangeChange` + `subscribeSizeChange` consumer-side?
- ¿Tiene `dragLoop` rAF?
- ¿Tiene patrón draw síncrono con conversión coords time/price → pixel?

Si responde SÍ a múltiples → migración Opción C análoga al carácter aplicable.

### §10.3 Plan sesión 39 — propuesta CTO

**PASO 0 s39**: baseline verificación bicapa REAL (lección §49):
1. `git status --short` → vacío esperado
2. `git rev-parse --short HEAD` → `<HASH-HANDOFF-s38>` esperado
3. `git log --oneline -5 | cat` → HANDOFF s38 + `9eb1475` + ancestros
4. `wc -l components/KillzonesOverlay.js` → 233 esperado
5. `wc -l components/KillzonesPrimitive.js` → 243 esperado
6. `wc -l lib/killzonesDomain.js` → 73 esperado
7. 3 invariantes fase 4 verificación REAL:
   - `grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js` → 0 esperado
   - `grep -c "computePhantomsNeeded" components/_SessionInner.js` → 3 esperado
   - `head -5 lib/chartViewport.js` → header §1.7 protegido

**PASO 1 s39**: decisión qué item §10.1 atacar primero. Recomendación CTO al carácter:
- **Prioridad alta**: item 8 `CustomDrawingsOverlay.js` S33.4 verificación — coherente con fase 5g recién cerrada, verificar si la migración Opción C aplica análogamente
- **Prioridad media**: items 1/2/7 cleanup (5f.2 polling + 5e.4 debugCtx + 5f LS-DEBUG) — deuda técnica
- **Prioridad baja**: items 3/5 viewport preservation — feature TradingView-style

**PASO 2-N s39**: dependiente de decisión PASO 1.

---

## §11 — Cierre sesión 38

Sesión 38 cerrada al carácter 25 mayo 2026, ~13:00 hora local.

HEAD local main = `9eb1475f13dba448d51198dc96bf663746d1e93f` (commit `9eb1475` feat(5g)) — pendiente añadir commit HANDOFF s38 al cerrar.
`origin/main` = `9eb1475` (pusheado).
Producción Vercel runtime efectivo = `9eb1475` (deploy ready confirmado).
Smoke producción 4/4 PASS al carácter.

**S33.4 CERRADA ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN POST-18 SESIONES CONSECUTIVAS.**

3 archivos nuevos/modificados al carácter:
- `lib/killzonesDomain.js` NEW 73 líneas md5 `f1e8689680c52021daa8d1c691acb1e9`
- `components/KillzonesPrimitive.js` NEW 243 líneas md5 `a6834c626c5e62e994861ba4af5265e0`
- `components/KillzonesOverlay.js` REFACTOR 505→233 líneas md5 `007ff1c5a6d6d929ffd2ea3e088efd08`

5 PASOS s38 completados al carácter:
- PASO 0 baseline verificación bicapa REAL ✓
- PASO 1 `lib/killzonesDomain.js` creado opción B ✓
- PASO 2 `components/KillzonesPrimitive.js` creado 243 líneas ✓
- PASO 3 `components/KillzonesOverlay.js` reformulado 505→233 líneas ✓
- PASO 4 smoke local 4/4 PASS ✓
- PASO 5 commit `9eb1475` + push origin/main + smoke producción 4/4 PASS ✓

1 error §9.4 propio CTO registrado al carácter:
- Error #1: falsa alarma `node -e import` ESM raw sobre archivo Next.js / webpack (cazado por bytes propios baseline, lección §50 NUEVA)

1 lección nueva al carácter:
- §50 verificación discriminante debe modelar el runtime real del artifact, NO un runtime alternativo

Lección §14 vigesimotercera sesión consecutiva DOBLE-INSTANCIA al carácter:
- Instancia 1: "los 4 pas... si hubiera alguna cosa mal te lo digo.." → input técnico encriptado escuchado
- Instancia 2: "passs" + ratificación explícita "todo pass" → §49 manda por encima de §14 en este caso

Próxima sesión = sesión 39. Prioridad 1 sugerida = item 8 §10.1 (`CustomDrawingsOverlay.js` S33.4 verificación empírica) o cualquier otro item §10.1 según decisión Ramón. **Aplicar §49 al carácter en HANDOFF s39**: cada verificación bicapa debe ejecutarse REALMENTE en zsh y transcribir output verbatim. NO transcribir de memoria.

**Pivote arquitectónico mayor consumado al carácter en producción**: fase 5g cerrada, S33.4 anulada estructuralmente, modelo Pine Script replicado al carácter en el simulador. Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
