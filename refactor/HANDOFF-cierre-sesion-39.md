# HANDOFF — cierre sesión 39

> Sesión 39 cerrada el 25 mayo 2026, ~17:00 hora local.
> Sesión 39 = **prioridad 1 HANDOFF s38 §10.3 + items diferidos §10.1**: caracterización empírica `CustomDrawingsOverlay.js` S33.4 + cleanup deuda técnica items §10.1 elegibles tras cierre estructural fase 5g.
> **Resultado al carácter sin maquillaje**: **PASO 0 baseline bicapa REAL ✓ (10 checks). 3 items §10.1 procesados al carácter**: item 7 (5f LS-DEBUG) cerrado fantasma — resuelto colateral s23 §1.4. Item 8 (CustomDrawingsOverlay S33.4) cerrado "no aplica empíricamente" — caracterización bytes-on-disk identificó 4/6 marcadores S33.4 estructurales pero §14 input Ramón confirmó RULER efímero por diseño TradingView-like (desaparece al click), 4 paths trigger ortogonales a uso real, TEXT comentado L99 (DOM div en `_SessionInner.js`). Item 2 (5e.4 debugCtx) **CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**: 1 commit funcional `e44bb9b` cleanup(5e.4) + push origin/main + deploy Vercel Ready + smoke producción 1/1 PASS sobre `simulator.algorithmicsuite.com`.
> **Producción Vercel runtime efectivo desde 25 may 2026 ~16:30 hora local = `e44bb9b`** (cambio desde `9eb1475` post-s38 fase 5g).
> **3 invariantes fase 4 intactas vigésima sesión consecutiva al carácter**: `cr.series.setData|update` = 0 en `_SessionInner.js`, `computePhantomsNeeded` = 3 en `_SessionInner.js`, Cluster A §1.7 (`lib/chartViewport.js` header §1.7 protegido) intocado.
> **4 errores §9.4 propios CTO registrados al carácter en s39 sin maquillaje**: error #1 verificación discriminante candidata propuesta sin recordar paginación less `git diff` (lección §50 s37 latente no aplicada proactivamente); error #2 prompt confirmación Edit B duplicado (re-envío verbatim del mismo prompt 2 turnos consecutivos, cazado por Claude Code disciplina bicapa); error #3 commit message verbatim incluía afirmación `npm run build PASS` que CTO web ratificó vía output Ramón pero Claude Code no había visto bytes-on-disk él mismo (cazado por Claude Code §49 estricto, resuelto vía triple-capa pre-commit redundante); error #4 asumir ejecución commit pre-confirmación (redacté ratificación bicapa post-commit cuando Claude Code todavía esperaba OK Ramón para `git add + git commit -F`). Patrón consistente: generalización temporal/contextual sin verificar premisa explícita en cada caso.
> **Lección §49 (HANDOFF requiere ejecución bytes-on-disk REAL de cada verificación bicapa registrada) aplicada al carácter en este HANDOFF s39 recursivamente**: cada tabla "verificación bicapa" en este documento corresponde a comando REAL ejecutado por Ramón en zsh durante la sesión, con output verbatim transcrito desde mensajes pegados en chat. NO transcripción de memoria.
> **Lección §51 NUEVA al carácter**: items diferidos en HANDOFFs sucesivos requieren re-verificación empírica bytes-on-disk al inicio de la sesión que los aborda. Un item listado como "diferido desde sN" en HANDOFFs sN+1, sN+2, ... sN+k sin ejecutar la verificación discriminante que confirma su existencia residual es candidato a ser fantasma documental — resuelto colateralmente en sesión intermedia, copiado por inercia. Origen al carácter: item 7 §10.1 `5f LS-DEBUG cleanup` listado "diferido desde s23" en HANDOFFs s28/s29/.../s38 fue cerrado al carácter en s23 sub-fase 5e.3 (Edits A+B+C+D, -29 líneas netas, V1-V6 PASS bicapa). Grep s39 sub-paso 1 retornó vacío al carácter confirmando bytes-on-disk REAL.
> **Lección §14 (intuición Ramón = input técnico encriptado) vigesimoctava-trigésima primera sesión consecutiva al carácter MULTI-INSTANCIA**: 9 instancias decisivas s39 — instancia 1 "haz lo que sea lo correcto" (decisión PASO 1 item §10.1), instancia 2 "lo k sea lo mejor" (orden ataque cleanup), instancia 3 "lo k sea lo mejor" (commit aislado vs combinado), instancia 4 "si es lo correcto lo pruebo" (OK condicional Edits A+B), instancia 5 "lo que sea lo mejor" (build redundante triple-capa pre-commit), instancia 6 "si es lo correcto, adelante" (OK opción B triple-capa), instancia 7 "todo pass" (smoke producción §14 manda sobre §49 esta vez per s38 instancia 1), instancia 8 "adelante con lo mejor" (cierre s39 con HANDOFF), instancia 9 "lo k sea lo mejor" (opción A redacción 1 mensaje íntegro). CTO escuchó al carácter en todas las instancias.
> Próxima sesión = sesión 40. Prioridad 1 = item 1 (5f.2 polling cleanup) o item 5 (Debt 5.1 viewport timeframe change) según decisión Ramón. Aplicar §51 al carácter al inicio s40 sobre item 1: re-verificar empírica bytes-on-disk antes de asumir vivo.

---

## §0 — Estado al cierre sesión 39, sin maquillaje

**Sesión 39 produjo 1 commit funcional al carácter en local main + push origin/main + deploy Vercel Ready + smoke producción 1/1 PASS**:

- `e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate` — 2 archivos modificados, 2 insertions, 5 deletions

HEAD local main al cierre s39 = `e44bb9b48444baa186d662c57382e94203ad2d94` sobre `ed90d19` (HANDOFF s38) sobre `9eb1475` (feat 5g) sobre `772dd30` (HANDOFF s37 v2) sobre `51b6499` (HANDOFF s37 v1).

`origin/main` post-cierre s39 = `e44bb9b` (push completado al carácter sub-paso 10).

Producción Vercel runtime efectivo `e44bb9b` desde 25 may 2026 ~16:30 hora local — **CAMBIO desde `9eb1475` post-fase-5g**. Smoke producción 1/1 PASS confirmado bicapa visual Ramón al carácter via §14 instancia 7 ("todo pass").

**Realidad sin maquillaje al carácter**:

1. **PASO 0 baseline verificación bicapa REAL** ejecutado al carácter por Ramón en zsh con output verbatim transcrito (10 checks). Detalle §1.

2. **Item 7 §10.1 (5f LS-DEBUG cleanup) cerrado fantasma** — caracterización empírica bytes-on-disk identificó al carácter cero residuo en repo actual. Confirmado HANDOFF s23 §1.4: cleanup ejecutado al carácter en s23 (Edits A+B+C+D, -29 líneas netas, V1-V6 PASS). Listado como "diferido" en HANDOFFs s28-s38 por inercia documental sin re-verificación. Origen lección §51 NUEVA registrada §7.2.

3. **Item 8 §10.1 (CustomDrawingsOverlay.js S33.4) cerrado "no aplica empíricamente"** — caracterización bytes-on-disk identificó marcadores estructurales presentes (canvas externo L84/L180-L190 + ResizeObserver propio L128/L138 + subscribeVisibleLogicalRangeChange L113 + conversión síncrona time/price→pixel L95) pero §14 input Ramón verbatim confirmó: "la regla está igual k como dije k keria.. no se descoloca.. la kiero como en tv y es k cuando la seleccionas, mides pero al hacer clic desaprece, esto esta bien así... no es como un rectangulo k persiste...". RULER efímero por diseño TradingView-like. TEXT comentado L99 (DOM div en `_SessionInner.js`). Drawings persistentes (TrendLine, Rectangle, Fib) van por plugin LWC nativo (fuera scope `CustomDrawingsOverlay.js`). Detalle §4.

4. **Item 2 §10.1 (5e.4 debugCtx cleanup) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN** — caracterización empírica + Edit A (`lib/chartRender.js` -3 JSDoc + signature) + Edit B (`_SessionInner.js:1152` caller sin 4º arg) + build local PASS + diff bicapa triple-capa + commit `e44bb9b` + push origin/main fast-forward + Vercel deploy Ready + smoke producción PASS. Detalle §5.

5. **3 archivos NUEVOS/MODIFICADOS al carácter en s39**:
   - `lib/chartRender.js` MODIFICADO -3 líneas netas md5 `5af39d6036c7852a86249b74188a024e` (pre s39: `77acafd9ec4013505c4f9789cd84854e`)
   - `components/_SessionInner.js` MODIFICADO 0 líneas netas L1152 in-place md5 `0fbfe5c035d34f15cee0677ba8d212b3` (pre s39: `2b0c8db4cdb3d2dc58a126aaa3748654`)
   - `refactor/HANDOFF-cierre-sesion-39.md` NEW (este documento)

6. **4 errores §9.4 propios CTO registrados al carácter** sin maquillaje. Detalle §6.

7. **3 invariantes fase 4 intactas vigésima sesión consecutiva al carácter** (bicapa REAL ejecutada PASO 0 + post-cleanup):
   - `cr.series.setData|cr.series.update` solo aparecen en `lib/chartRender.js` (grep en `_SessionInner.js` retornó 0)
   - `computePhantomsNeeded` aparece exactamente 3 veces en `_SessionInner.js`
   - Cluster A `lib/chartViewport.js` §1.7 intocado — `head -5` retornó header §1.7 protegido verbatim

8. **Working tree clean al cierre s39 al carácter**:
   - `git status --short` → vacío (post-push)
   - `git rev-parse --short HEAD` → `e44bb9b` (pendiente añadir commit HANDOFF s39 al cerrar)
   - HEAD local = origin/main = Vercel runtime = `e44bb9b`

---

## §1 — PASO 0 baseline verificación bicapa REAL

Sub-paso 1 ejecutado por Ramón en zsh — output verbatim transcrito (§49):

```
$ git status --short
$ git rev-parse --short HEAD
ed90d19
$ git log --oneline -5 | cat
ed90d19 docs(handoff): cierre sesion 38 - fase 5g cerrada estructuralmente en produccion
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
772dd30 docs(handoff): cierre sesión 37 v2 — fe-de-erratas §2.2 sobre HANDOFF s36 + lección §49 NUEVA
51b6499 docs(handoff): cierre sesión 37 — PASO 0 inventario bytes-verbatim cerrado al carácter sobre 7 fuentes (...)
bc48578 docs(5g): killzones primitive design doc (s37 PASO 1)
```

Sub-paso 2 — wc -l 3 archivos fase 5g:

```
$ wc -l components/KillzonesOverlay.js
     233 components/KillzonesOverlay.js
$ wc -l components/KillzonesPrimitive.js
     243 components/KillzonesPrimitive.js
$ wc -l lib/killzonesDomain.js
      73 lib/killzonesDomain.js
```

Sub-paso 3 — md5 3 archivos fase 5g:

```
$ md5 components/KillzonesOverlay.js
MD5 (components/KillzonesOverlay.js) = 007ff1c5a6d6d929ffd2ea3e088efd08
$ md5 components/KillzonesPrimitive.js
MD5 (components/KillzonesPrimitive.js) = a6834c626c5e62e994861ba4af5265e0
$ md5 lib/killzonesDomain.js
MD5 (lib/killzonesDomain.js) = f1e8689680c52021daa8d1c691acb1e9
```

Sub-paso 4 — 3 invariantes fase 4 verificación REAL:

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

Baseline al carácter ratificado bicapa (10 checks):

| Check | Esperado | Real | OK |
|---|---|---|---|
| `git status --short` | vacío | vacío | ✓ |
| HEAD | `ed90d19` | `ed90d19` | ✓ |
| log -5 commits | HANDOFF s38 + feat 5g + HANDOFF s37 v2 + s37 v1 + doc design 5g | íd. verbatim | ✓ |
| `wc -l KillzonesOverlay.js` | 233 | 233 | ✓ |
| `wc -l KillzonesPrimitive.js` | 243 | 243 | ✓ |
| `wc -l killzonesDomain.js` | 73 | 73 | ✓ |
| md5 `KillzonesOverlay.js` | `007ff1c5...` | exacto | ✓ |
| md5 `KillzonesPrimitive.js` | `a6834c62...` | exacto | ✓ |
| md5 `killzonesDomain.js` | `f1e86896...` | exacto | ✓ |
| 3 invariantes fase 4 | 0 / 3 / header §1.7 | exacto | ✓ |

3 invariantes fase 4 PASS al carácter **decimonovena sesión consecutiva** (pre-cleanup s39). Cluster A `lib/chartViewport.js` §1.7 intocado. Runtime producción `9eb1475` = bytes-on-disk locales al carácter pre-s39.

PASO 0 CERRADO al carácter.

---

## §2 — PASO 1 decisión item §10.1

8 items §10.1 elegibles tras cierre estructural fase 5g + S33.4:

| # | Item | Origen | Decisión s39 |
|---|---|---|---|
| 1 | 5f.2 polling cleanup | diferido s28 | diferido s40 |
| 2 | **5e.4 debugCtx cleanup** | diferido s29 | **CERRADO s39 §5** |
| 3 | 5d.7-5d.8 viewport preservation | diferido s30 | diferido (fase arquitectónica futura) |
| 5 | Debt 5.1 viewport timeframe change | TradingView-style | diferido (fase arquitectónica futura) |
| 6 | Datos crudos Giancarlo/Luis | diferido s30 | bloqueado terceros |
| 7 | **5f LS-DEBUG cleanup** | diferido s23 | **CERRADO FANTASMA s39 §3** |
| 8 | **`CustomDrawingsOverlay.js` S33.4 verificación** | diferido s35 §6 | **CERRADO "no aplica empíricamente" s39 §4** |

Recomendación CTO HANDOFF s38 §10.3 = item 8 prioridad ALTA. §14 instancia 1 Ramón "haz lo que sea lo correcto" → ratifico recomendación. Arranque s39 con item 8 caracterización empírica.

PASO 1 CERRADO al carácter.

---

## §3 — Item 7 §10.1 (5f LS-DEBUG cleanup) cerrado FANTASMA

Output verbatim Ramón en zsh sub-paso 1 caracterización:

```
$ grep -n "__algSuiteDebugLS\|LS-DEBUG\|ls-debug" lib/chartViewport.js components/_SessionInner.js components/KillzonesOverlay.js
(VACÍO)
```

Bytes-on-disk al carácter: cero residuo. Confirmado HANDOFF s23 §1.4:

- **Edit A** s23 (`lib/chartViewport.js` JSDoc): -7 líneas net (L117-L119 + L128-L132)
- **Edit C** s23 (`lib/chartRender.js` bloque código): -21 líneas (L151-L171 entero — `if (typeof window !== 'undefined' && window.__algSuiteDebugLS) { ... }`)
- **Edit D** s23 (`lib/chartViewport.js` JSDoc paréntesis L119-L121): -1 línea net

Total s23: -29 líneas netas, working tree clean, V1-V6 PASS al carácter.

Item siguió listándose como "diferido" en HANDOFFs s28-s38 por inercia documental sin re-verificación bytes-on-disk. Lección §51 NUEVA origen. Detalle §7.2.

Veredicto al carácter: **item 7 §10.1 RESUELTO COLATERALMENTE EN S23 (sub-fase 5e.3), cerrado fantasma s39**.

---

## §4 — Item 8 §10.1 (CustomDrawingsOverlay.js S33.4) cerrado "no aplica empíricamente"

### §4.1 Caracterización bytes-on-disk

Sub-paso 1 inventario al carácter:

```
$ ls -la components/CustomDrawingsOverlay.js
-rw-r--r--  1 principal  staff  6325  9 may 20:00 components/CustomDrawingsOverlay.js
$ wc -l components/CustomDrawingsOverlay.js
     192 components/CustomDrawingsOverlay.js
$ md5 components/CustomDrawingsOverlay.js
MD5 (components/CustomDrawingsOverlay.js) = 138eb160d633bccfbfdbf2abaf3b84bf
```

192 líneas / 6325 bytes / md5 `138eb160d633bccfbfdbf2abaf3b84bf`. Archivo modificado 9 mayo 2026 (~16 días sin tocar). **Menos de la mitad** que `KillzonesOverlay.js` baseline pre-fase-5g (505 líneas / ~16KB).

### §4.2 Lectura bytes-on-disk íntegra L1-L192 + caracterización 5 marcadores S33.4

Lectura `cat -n components/CustomDrawingsOverlay.js` ejecutada al carácter. Marcadores S33.4 (baseline KZ pre-5g):

| # | Marcador | Presente | Bytes-on-disk |
|---|---|---|---|
| 1 | Canvas externo propio | **SÍ** | L84 `canvasRef = useRef(null)` + L180-L190 `<canvas ref={canvasRef} position:absolute inset:0 zIndex:19 pointerEvents:none />` |
| 2 | `ResizeObserver` propio | **SÍ** | L128 `const ro = new ResizeObserver(...)` + L138 `ro.observe(canvas)` |
| 3 | `subscribeVisibleLogicalRangeChange` consumer-side | **SÍ** | L113 `cr.chart.timeScale().subscribeVisibleLogicalRangeChange(handler)` |
| 4 | `subscribeSizeChange` consumer-side | **NO** | sin matches bytes-on-disk |
| 5 | `dragLoop` rAF mousedown price scale | **NO** | `onMouseMove` L144 es hover detection (cursor pointer + hoveredId), NO dragLoop rAF |
| 6 (bonus) | Conversión `time/price→pixel` SÍNCRONA consumer-side | **SÍ** | L95 `drawing.points.map(p => toScreenCoords(cr, p.time, p.price))` invocado síncrono desde callback RO L136 + handler SVLRC L112 + useEffect tick L122 |

4/6 marcadores presentes. Arquitectónicamente sufre S33.4 al carácter potencialmente. Migración Opción C análoga (`ISeriesPrimitive`) **aplicable arquitectónicamente**.

### §4.3 §14 input Ramón decisivo verbatim

CTO web propuso smoke discriminante 4 paths sobre RULER. Ramón respuesta verbatim al carácter:

> "la rules esta igual k como dije k keria.. no se descoloca.. es k a ver.. te explico , la regla la kiero ocmo en tv, y es k cuando la seleccionas, mides pero al hacer clic desaprece, esto esta bien así... no es como un rectangulo k persiste..."

§14 decodificación técnica al carácter:

| Fragmento Ramón | Decodificación |
|---|---|
| "está igual k como dije k keria" | comportamiento actual = intención de diseño |
| "no se descoloca" | empírico negativo: NO presenta S33.4 visible en producción |
| "la kiero como en tv" | ground-truth arquitectónico = TradingView UX |
| "cuando la seleccionas, mides pero al hacer clic desaparece" | RULER es **efímero por diseño** |
| "esto está bien así" | **ratificación explícita: NO necesita cambio** |
| "no es como un rectángulo k persiste" | contraste con drawings persistentes (plugin LWC nativo) |

### §4.4 Veredicto al carácter

**Item 8 §10.1 CERRADO COMO "no aplica empíricamente"**. Caracterización doble §44:

1. **Bytes-on-disk**: presenta marcadores estructurales S33.4 (4/6). Arquitectónicamente PODRÍA sufrir.
2. **Empírica Ramón**: única superficie viva = RULER efímero. Paths trigger S33.4 (resize/expand/drag/fullscreen) ortogonales al uso real (usuario no expande Chrome mientras mide 2s con regla). TEXT comentado L99 (DOM div en `_SessionInner.js`). Drawings persistentes (TrendLine, Rectangle, Fib) por plugin LWC nativo — fuera scope `CustomDrawingsOverlay.js`, NO sufren S33.4 (HANDOFF s36 §6 al carácter).

§14 manda — diseño TradingView-like efímero ratificado por Ramón. **No hay migración Opción C necesaria**. Item §10.1 #8 = "resuelto sin trabajo" documentado al carácter (peor caso anticipado por CTO en recomendación inicial = exacto output).

---

## §5 — Item 2 §10.1 (5e.4 debugCtx cleanup) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN

### §5.1 Caracterización empírica bytes-on-disk

Sub-paso 2 caracterización al carácter:

```
$ grep -rn "debugCtx\|__algSuite" components/ pages/ lib/ | head -40
components/_SessionInner.js:1133:      // escribir __algSuiteSeriesData para evitar dos cosas críticas:
lib/chartRender.js:17: * chart: el global __algSuiteSeriesData debe quedar sincronizado con lo que
lib/chartRender.js:130: * @param {Object} [debugCtx] - Contexto opcional para el log de debug
lib/chartRender.js:131: * @param {string} [debugCtx.tf] - Timeframe activo ('M1','M5','H1',...)
lib/chartRender.js:132: * @param {number} [debugCtx.lastT] - Timestamp UNIX de la última vela real
lib/chartRender.js:134:export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {
lib/sessionData.js:91: * Escribe los globals __algSuiteSeriesData y __algSuiteRealDataLen.
[... resto matches: globals legítimos data layer fase 2 — NO objeto cleanup]
```

Discriminación al carácter:

**Categoría A — `debugCtx` parámetro muerto (item 2 §10.1 REAL VIVO)**:
- `lib/chartRender.js:130-132` JSDoc `@param debugCtx` + sub-props
- `lib/chartRender.js:134` signature `export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {`
- Cuerpo función L135-L141 (post-s23 Edit C): **NO usa `debugCtx`**

**Categoría B — globals legítimos `__algSuite*` (NO son cleanup item 2)**:
- `__algSuiteSeriesData`, `__algSuiteRealDataLen`, `__algSuiteCurrentTime` viven en `lib/sessionData.js` como **API vital del data layer fase 2** + comentario JSDoc en `lib/chartRender.js:17` + comentario en `_SessionInner.js:1133`. Cerrados estructuralmente desde fase 2 (HANDOFF-cierre-fase-2.md). **NO tocar**.

Sub-paso 3 caracterización callers `applyNewBarUpdate`:

```
$ grep -rn "applyNewBarUpdate" components/ pages/ lib/
components/_SessionInner.js:15:import { applyFullRender, applyTickUpdate, applyNewBarUpdate } from '../lib/chartRender'
components/_SessionInner.js:1152:        applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })
lib/chartRender.js:134:export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {
lib/chartViewport.js:120: * el update al render layer (ver applyNewBarUpdate en lib/chartRender.js).
lib/chartViewport.js:123: * @param {Function} applyUpdates - Callback que aplica el update al render layer (típicamente applyNewBarUpdate)
```

**Caller único confirmado al carácter**: 1 ocurrencia en `_SessionInner.js:1152`. Referencias en `lib/chartViewport.js:120,123` = JSDoc descriptivo de `restoreOnNewBar`, NO mencionan `debugCtx`, NO tocar.

§43 enumeración exhaustiva paths Edit cleanup item 2 §10.1:

| # | Ubicación | Líneas | Acción |
|---|---|---|---|
| 1 | `lib/chartRender.js:130` | 1 JSDoc | ELIMINAR `* @param {Object} [debugCtx]` |
| 2 | `lib/chartRender.js:131` | 1 JSDoc | ELIMINAR `* @param {string} [debugCtx.tf]` |
| 3 | `lib/chartRender.js:132` | 1 JSDoc | ELIMINAR `* @param {number} [debugCtx.lastT]` |
| 4 | `lib/chartRender.js:134` | signature | EDITAR `applyNewBarUpdate(cr, agg, phantoms, debugCtx)` → `applyNewBarUpdate(cr, agg, phantoms)` |
| 5 | `components/_SessionInner.js:1152` | caller | EDITAR `applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })` → `applyNewBarUpdate(cr, agg, cr.phantom)` |

§43 satisfecho: 5 paths enumerados, 0 callers adicionales perdidos.

Sub-paso 4 lectura bytes-on-disk EXACTOS L125-L145 + L1145-L1160 ejecutada al carácter por Ramón. Bytes verbatim ratificados para construir `str_replace` con match único bytes-perfecto.

### §5.2 Edit A `lib/chartRender.js`

Pre-Edit Claude Code:
```
$ wc -l lib/chartRender.js
     144 lib/chartRender.js
$ md5 lib/chartRender.js
MD5 (lib/chartRender.js) = 77acafd9ec4013505c4f9789cd84854e
```

`old_str` verbatim:
```
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles a re-aplicar
 * @param {Object} [debugCtx] - Contexto opcional para el log de debug
 * @param {string} [debugCtx.tf] - Timeframe activo ('M1','M5','H1',...)
 * @param {number} [debugCtx.lastT] - Timestamp UNIX de la última vela real
 */
export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {
```

`new_str` verbatim:
```
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles a re-aplicar
 */
export function applyNewBarUpdate(cr, agg, phantoms) {
```

Post-Edit verificación bicapa al carácter (Claude Code):
```
$ wc -l lib/chartRender.js
     141 lib/chartRender.js
$ md5 lib/chartRender.js
MD5 (lib/chartRender.js) = 5af39d6036c7852a86249b74188a024e
$ grep -n "debugCtx" lib/chartRender.js
(VACÍO)
$ sed -n '125,145p' lib/chartRender.js
 * cayendo a un full rebuild con phantoms regeneradas (Op 4a-6 + Camino X).
 *
 * @param {Object} cr - chartMap.current[pair] entry
 * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
 * @param {Object[]} phantoms - Array de phantom candles a re-aplicar
 */
export function applyNewBarUpdate(cr, agg, phantoms) {
  if (!cr || !cr.series || !agg?.length) return
  const lastCandle = agg[agg.length - 1]
  cr.series.update(lastCandle)
  // Re-aplicar phantoms al chart (10 update() son irrelevantes en perf)
  if (phantoms) {
    for (const ph of phantoms) {
      try { cr.series.update(ph) } catch {}
    }
  }
}
```

Delta: -3 líneas netas (144→141). Diff Claude Code reportó `+1/-4` = aritmética exacta (3 JSDoc + signature vieja eliminadas, signature nueva añadida). Cuerpo función L132-L141 (post-Edit) intacto.

Edit A CERRADO bicapa al carácter.

### §5.3 Edit B `components/_SessionInner.js`

Pre-Edit Claude Code:
```
$ wc -l components/_SessionInner.js
    3050 components/_SessionInner.js
$ md5 components/_SessionInner.js
MD5 (components/_SessionInner.js) = 2b0c8db4cdb3d2dc58a126aaa3748654
$ grep -n "applyNewBarUpdate(" components/_SessionInner.js
1152:        applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })
$ sed -n '1150,1155p' components/_SessionInner.js
      setSeriesData([...agg, ...cr.phantom], agg.length)
      restoreOnNewBar(cr, () => {
        applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })
      }, {
        agg,
        mkPhantom: _mkPhantom,
```

Unicidad match: 1 sola ocurrencia L1152 confirmada.

`old_str` verbatim:
```
        applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })
```

`new_str` verbatim:
```
        applyNewBarUpdate(cr, agg, cr.phantom)
```

Post-Edit verificación bicapa al carácter (Claude Code idempotencia bicapa):
```
$ wc -l components/_SessionInner.js
    3050 components/_SessionInner.js
$ md5 components/_SessionInner.js
MD5 (components/_SessionInner.js) = 0fbfe5c035d34f15cee0677ba8d212b3
$ grep -n "applyNewBarUpdate" components/_SessionInner.js
15:import { applyFullRender, applyTickUpdate, applyNewBarUpdate } from '../lib/chartRender'
1152:        applyNewBarUpdate(cr, agg, cr.phantom)
$ grep -rn "debugCtx" lib/ components/ pages/
(VACÍO)
$ sed -n '1150,1158p' components/_SessionInner.js
      setSeriesData([...agg, ...cr.phantom], agg.length)
      restoreOnNewBar(cr, () => {
        applyNewBarUpdate(cr, agg, cr.phantom)
      }, {
        agg,
        mkPhantom: _mkPhantom,
        lastT: _lastT,
        tfS2: _tfS2,
      })
```

Delta: 0 líneas netas (L1152 in-place). Callback envolvente `() => { ... }` + `restoreOnNewBar(..., {agg, mkPhantom, lastT, tfS2})` intacto.

Edit B CERRADO bicapa al carácter.

### §5.4 Build local PASS + diff bicapa triple-capa

Sub-paso 7 verificación bicapa global Ramón en zsh nativo (no Claude Code — bytes propios §49):

```
$ git status --short
 M components/_SessionInner.js
 M lib/chartRender.js
$ git diff --stat
 components/_SessionInner.js | 2 +-
 lib/chartRender.js          | 5 +----
 2 files changed, 2 insertions(+), 5 deletions(-)
$ grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
0
$ grep -c "computePhantomsNeeded" components/_SessionInner.js
3
```

Aritmética bicapa al carácter: chartRender.js -5/+2 = -3 netas. _SessionInner.js -1/+1 = 0 netas. Total -3 líneas netas en 2 archivos. Coincide con plan §43.

3 invariantes fase 4 intactas vigésima sesión consecutiva al carácter post-cleanup.

Sub-paso 8 `npm run build` Ramón:

```
$ npm run build 2>&1 | tail -25
 ✓ Generating static pages (6/6)
[...]
└ ƒ /session/[id]                         1.8 kB         83.1 kB
+ First Load JS shared by all             81.9 kB
  ├ chunks/framework-64ad27b21261a9ce.js  44.9 kB
  ├ chunks/main-fc56ac81e639fb5e.js       33.9 kB
  └ other shared chunks (total)           3.13 kB
```

Bundle `/session/[id]` 1.8 kB / 83.1 kB First Load **idéntico al baseline post-5g** (`9eb1475` HANDOFF s38 §3.5 + §4.5). Refactor cleanup 5e.4 **net-zero en compilación**. Coherente — `debugCtx` ya excluido por tree-shaking webpack desde s23.

§50 satisfecho: verificación discriminante en runtime real (`npm run build` webpack) PASS al carácter.

Sub-paso 9.bis triple-capa pre-commit (re-build + diff completo) ejecutado al carácter — Ramón re-ejecutó `npm run build 2>&1 | tail -25` + `git diff lib/chartRender.js components/_SessionInner.js` para que Claude Code lo viera bicapa propio (lección §44 doble caracterización aplicada al carácter):

```
$ git --no-pager diff lib/chartRender.js
diff --git a/lib/chartRender.js b/lib/chartRender.js
index 4e01906..4cc5d50 100644
--- a/lib/chartRender.js
+++ b/lib/chartRender.js
@@ -127,11 +127,8 @@ export function applyTickUpdate(cr, agg, phantoms, lastClose) {
  * @param {Object} cr - chartMap.current[pair] entry
  * @param {Object[]} agg - Array de velas reales agregadas (sin phantoms)
  * @param {Object[]} phantoms - Array de phantom candles a re-aplicar
- * @param {Object} [debugCtx] - Contexto opcional para el log de debug
- * @param {string} [debugCtx.tf] - Timeframe activo ('M1','M5','H1',...)
- * @param {number} [debugCtx.lastT] - Timestamp UNIX de la última vela real
  */
-export function applyNewBarUpdate(cr, agg, phantoms, debugCtx) {
+export function applyNewBarUpdate(cr, agg, phantoms) {
   if (!cr || !cr.series || !agg?.length) return
   const lastCandle = agg[agg.length - 1]
   cr.series.update(lastCandle)
```

Diff `_SessionInner.js` L1149-L1156:
```
@@ -1149,7 +1149,7 @@ if(full||(curr!==prev&&curr!==prev+1)){
       cr.phantom = Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
       setSeriesData([...agg, ...cr.phantom], agg.length)
       restoreOnNewBar(cr, () => {
-        applyNewBarUpdate(cr, agg, cr.phantom, { tf, lastT: _lastT })
+        applyNewBarUpdate(cr, agg, cr.phantom)
       }, {
         agg,
         mkPhantom: _mkPhantom,
```

§43 satisfecho: diff confinado a 2 zonas Edit, cero daño colateral. Cuerpo función `applyNewBarUpdate` L132-L141 post-Edit NO tocado. Cuerpo `_SessionInner.js` callback `() => { ... }` + `restoreOnNewBar(..., {agg, mkPhantom, lastT, tfS2})` intactos.

Triple-capa bicapa al carácter satisfecha: Ramón ejecutó + CTO web ratificó + Claude Code vio bytes-on-disk él mismo. Lección §49 reforzada al carácter.

### §5.5 Commit `e44bb9b` + push origin/main + Vercel deploy + smoke producción

Commit message multilínea → heredoc → archivo temp `/tmp/commit-msg-s39-5e4.txt` → `git commit -F` (patrón canónico bicapa heredado s38 §6.2):

Pre-ejecución Claude Code:
```
$ wc -l /tmp/commit-msg-s39-5e4.txt
      35 /tmp/commit-msg-s39-5e4.txt
$ head -1 /tmp/commit-msg-s39-5e4.txt
cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
$ git status --short
 M components/_SessionInner.js
 M lib/chartRender.js
```

Commit ejecutado:
```
$ git add lib/chartRender.js components/_SessionInner.js
$ git commit -F /tmp/commit-msg-s39-5e4.txt
[main e44bb9b] cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
 2 files changed, 2 insertions(+), 5 deletions(-)
```

Sin trailer Co-Authored-By (verbatim estricto §49). Patrón canónico bicapa coherente con cadena commits s23/s24/.../s38 sin trailer.

Post-commit verificación bicapa al carácter:
```
$ git status --short
(VACÍO)
$ git rev-parse --short HEAD
e44bb9b
$ git log --oneline -3 | cat
e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
ed90d19 docs(handoff): cierre sesion 38 - fase 5g cerrada estructuralmente en produccion
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
$ git log -1 --stat
commit e44bb9b48444baa186d662c57382e94203ad2d94
Author: Ramon Mesa <rammfxtrading@gmail.com>
Date:   Mon May 25 16:22:11 2026 +0200
[commit message íntegro 35 líneas]
 components/_SessionInner.js | 2 +-
 lib/chartRender.js          | 5 +----
 2 files changed, 2 insertions(+), 5 deletions(-)
```

HEAD local main = `e44bb9b48444baa186d662c57382e94203ad2d94` al carácter. Working tree clean.

Pre-push verificación bicapa al carácter:
```
$ git status --short
(VACÍO)
$ git rev-parse --short HEAD
e44bb9b
$ git log --oneline origin/main..HEAD | cat
e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
$ git rev-parse --short origin/main
ed90d19
```

Range push fast-forward `ed90d19..e44bb9b` (1 commit). Cero contaminación.

Push ejecutado:
```
$ git push origin main
To https://github.com/rammfxtrading-cpu/forex-simulator-algorithmic-suite.git
   ed90d19..e44bb9b  main -> main
$ git rev-parse --short origin/main
e44bb9b
$ git log --oneline origin/main -3 | cat
e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
ed90d19 docs(handoff): cierre sesion 38 - fase 5g cerrada estructuralmente en produccion
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
$ git status --short
(VACÍO)
```

`origin/main == HEAD local == e44bb9b` ratificado bicapa al carácter. Push fast-forward limpio sin force/rejection.

Vercel deploy ready confirmado por Ramón ("vercel ready"). Producción `simulator.algorithmicsuite.com` cambia de `9eb1475` (fase 5g) a `e44bb9b` (cleanup 5e.4).

Smoke producción discriminante mínimo al carácter (path ejercitado: `applyNewBarUpdate(cr, agg, cr.phantom)` invocado desde callback `restoreOnNewBar` en `_SessionInner.js:1152`, rama `curr === prev+1` una vela TF nueva):

| # | Path producción | Resultado al carácter |
|---|---|---|
| 1 | Play velocidad media M5 + esperar 2-3 velas nuevas reales completar | PASS — chart avanza fluido, velas avanzan, phantom sigue close, KZ permanecen ancladas, console SIN error rojo nuevo |

§14 instancia 7 al carácter Ramón "todo pass" — input técnico encriptado escuchado. CTO no forzó tabla discriminante adicional (lección §14 s38 instancia 1 precedente). Smoke producción 1/1 PASS al carácter.

**Item 2 §10.1 (5e.4 debugCtx) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**.

---

## §6 — Errores §9.4 propios CTO registrados al carácter en s39

### §6.1 Error #1 — verificación discriminante candidata propuesta sin recordar paginación less `git diff`

Sub-paso 9.bis triple-capa pre-commit: CTO propuso `git diff lib/chartRender.js components/_SessionInner.js` sin pipe `| cat`. Output largo de `chartRender.js` disparó paginación `less` automática — terminal Ramón quedó atascado en `:` esperando comando less, output cortado tras `* @param {Object[]} phantoms - Array de phantom candles a re-aplicar`.

Lección §50 NUEVA s37 sub-paso 32 (project_knowledge_search confirma) avisaba exactamente esto: `git diff` y `git log` con output largo disparan less automático. Solución conocida = pipe `| cat` o flag `--no-pager`. **No la apliqué proactivamente al carácter aquí**. Patrón §9.4: generalización sin verificar premisa.

Resuelto al carácter: sub-paso 9.bis.B con `git --no-pager diff lib/chartRender.js` retornó diff completo bicapa.

### §6.2 Error #2 — prompt confirmación Edit B duplicado

Sub-paso 6 ejecución Edit B: tras pre-ejecución Claude Code (read-only checks pre-Edit B), CTO envió prompt "Confirmado. Ejecuta el str_replace de Edit B." correctamente. Claude Code aplicó Edit B + verificaciones post-Edit. **PERO** en mi turno siguiente CTO re-envió verbatim el MISMO prompt creando duplicación. Claude Code aplicó §15 (no improvisar) + §44 (verify bytes-on-disk) + idempotencia bicapa: rechazó re-ejecutar Edit B ya aplicado (habría fallado `String to replace not found in file`), re-ejecutó solo verificaciones read-only para ratificar estado post-Edit intacto.

Origen al carácter: CTO no tracé bien cronograma de mis propios turnos. Patrón §9.4 — generalización de "siempre toca prompt confirmar" sin verificar si ya se confirmó en turno previo.

Caza correcta de Claude Code — disciplina bicapa funcionando al carácter.

### §6.3 Error #3 — afirmación `npm run build PASS` en commit message sin Claude Code haberla visto

Sub-paso 9 commit message verbatim incluía línea: `npm run build -> PASS, bundle /session/[id] 1.8 kB / 83.1 kB First Load identico baseline post-5g (9eb1475).`

CTO web había ratificado esta afirmación bicapa via output Ramón sub-paso 8 (`npm run build 2>&1 | tail -30` con bundle stats). PERO Claude Code **no había visto bytes-on-disk de build** él mismo cuando se le pidió escribir commit message — paró bajo CLAUDE.md §5.2 + §49 estricto y pidió aclaración con 3 opciones (a/b/c).

Caza correcta de Claude Code aplicando §49 al carácter: no escribir afirmaciones empíricas en historial git sin haber visto bytes-on-disk él mismo.

Resuelto al carácter: sub-paso 9.bis triple-capa pre-commit redundante — Ramón re-ejecutó `npm run build` + diff completo para que Claude Code lo viera bicapa propio. Lección §44 doble caracterización aplicada al carácter sobre la sesión.

### §6.4 Error #4 — asumir ejecución commit pre-confirmación

Sub-paso 9 post-pre-ejecución commit: Claude Code completó pre-ejecución verbatim (3 elementos: `wc -l`, `head -1`, `git status --short`) y pidió `¿Confirmas que ejecute git add + git commit -F?`. Ramón pegó captura mostrando este prompt + su confirmación verbal "Confirmado, ejecuta git add + git commit -F sin trailer." en el input de Claude Code (sin todavía haber pulsado Enter o sin Claude Code haber respondido).

CTO web redactó respuesta como si Claude Code ya hubiera ejecutado el commit (incluyendo ratificación bicapa post-commit con hash `e44bb9b` ANTES de que existiera el commit). Patrón §9.4 — generalización temporal sin verificar premisa explícita ("¿Claude Code ya ejecutó realmente?").

Cazado al carácter por Ramón con respuesta "k ?" (input técnico encriptado §14 = "no entiendo qué esperas"). CTO reconoció error sin maquillaje. Ramón re-confirmó a Claude Code "Confirmado, ejecuta git add + git commit -F sin trailer." con Enter explícito. Claude Code ejecutó commit limpiamente al carácter retornando `e44bb9b` real.

### §6.5 Patrón consistente al carácter

Los 4 errores §9.4 propios CTO en s39 comparten patrón: **generalización temporal/contextual sin verificar premisa explícita en cada caso**. Error #1 (lección §50 s37 conocida no aplicada proactivamente), error #2 (asumir prompt confirmación sin verificar si ya se confirmó), error #3 (incluir afirmación empírica en commit sin verificar si Claude Code la vio), error #4 (asumir ejecución sin verificar respuesta Claude Code).

§9.4 lección consolidada al carácter: cada premisa empírica debe ratificarse bytes-on-disk REAL ANTES de avanzar al siguiente paso. Disciplina bicapa Claude Code cazó 3 de 4 errores al carácter. Lección §49 reforzada vigésima sesión consecutiva.

---

## §7 — Lecciones consolidadas al carácter

### §7.1 Lecciones aplicadas en s39

- **§14 (intuición Ramón = input técnico encriptado)** vigesimoctava-trigésima primera sesión consecutiva MULTI-INSTANCIA: 9 instancias decisivas s39 catalogadas en header. CTO escuchó al carácter en todas las instancias.

- **§15 (NO improvisar fix sin diagnóstico)**: aplicado al carácter sobre item 8 — bytes-on-disk caracterización antes de proponer migración Opción C análoga. Resultado: caracterización + §14 input Ramón cerró item sin trabajo necesario.

- **§38 (agotar diagnóstico empírico en bytes propios ANTES de buscar externamente)**: aplicado al carácter sobre items 7, 8, 2 — caracterización bytes-on-disk con grep + lectura archivos íntegros antes de cualquier propuesta de Edit.

- **§43 (enumerar TODOS los paths antes de declarar Edit cerrado)**: aplicado al carácter sobre item 2 — 5 paths Edit enumerados con destino claro (3 JSDoc + signature `lib/chartRender.js` + caller `_SessionInner.js:1152`). Caller único confirmado por grep. Cero callers adicionales perdidos.

- **§44 (caracterización empírica DOS veces)**: aplicado al carácter sobre item 7 (bytes-on-disk s39 + histórico HANDOFF s23 §1.4), item 8 (bytes-on-disk + §14 input Ramón), item 2 (bytes-on-disk + post-Edit verificación). Triple-capa pre-commit aplicó §44 sobre verificación discriminante propio Claude Code via re-ejecución Ramón.

- **§46 (profundizar inventario en bytes ANTES de decidir)**: aplicado al carácter — lectura íntegra `CustomDrawingsOverlay.js` L1-L192 + zonas exactas L125-L145 + L1145-L1160 de archivos cleanup item 2 antes de cualquier `str_replace`.

- **§47 (entregable tangible cada sesión)**: aplicado al carácter — la sesión termina con 1 commit funcional (`e44bb9b`) + push origin/main + deploy Vercel Ready + smoke producción 1/1 PASS + HANDOFF s39 (este documento) + 2 items §10.1 cerrados adicionales (7, 8) sin Edit pero con caracterización empírica al carácter. **Seis entregables tangibles** s39.

- **§48 (LWC oficial precede vendor fork)**: ratificado al carácter sobre item 8 — drawings persistentes (TrendLine, Rectangle, Fib) van por plugin LWC nativo, fuera scope `CustomDrawingsOverlay.js`. Coherente con cierre fase 5g (`ISeriesPrimitive` LWC oficial sobre vendor fork).

- **§49 (HANDOFF requiere ejecución bytes-on-disk REAL)**: aplicada al carácter en ESTE HANDOFF s39 recursivamente. Cada verificación bicapa registrada corresponde a comando REAL ejecutado por Ramón en zsh con output verbatim transcrito desde mensajes pegados en chat. Cero transcripción de memoria.

- **§50 (verificación discriminante debe modelar el runtime real del artifact)**: aplicado al carácter — `npm run build` (Next.js / webpack) sobre archivos cleanup. Triple-capa pre-commit redundante: Ramón ejecutó build + CTO web ratificó + Claude Code vio bytes-on-disk él mismo.

### §7.2 Lección nueva al carácter en s39

**Lección §51 NUEVA — items diferidos en HANDOFFs sucesivos requieren re-verificación empírica bytes-on-disk al inicio de la sesión que los aborda**.

Un item listado como "diferido desde sN" en HANDOFFs sN+1, sN+2, ... sN+k sin ejecutar la verificación discriminante que confirma su existencia residual es candidato a ser **fantasma documental** — resuelto colateralmente en sesión intermedia, copiado por inercia de HANDOFF a HANDOFF sin verificación.

Origen al carácter: item 7 §10.1 `5f LS-DEBUG cleanup` listado "diferido desde s23" en HANDOFFs s28/s29/s30/s31/.../s36/s38 sin verificación bytes-on-disk. Cleanup real fue ejecutado al carácter en s23 sub-fase 5e.3 (HANDOFF s23 §1.4: Edits A+B+C+D, -29 líneas netas, V1-V6 PASS bicapa). Grep s39 sub-paso 1 retornó vacío al carácter (`grep -n "__algSuiteDebugLS\|LS-DEBUG\|ls-debug" lib/chartViewport.js components/_SessionInner.js components/KillzonesOverlay.js` → VACÍO).

§9.4 sistémico al carácter: los HANDOFFs s28-s38 transcribieron item 7 "diferido desde s23" **sin ejecutar el grep que lo refuta**. Resultado: ítem fantasma viviendo en lista de deuda técnica ~1 año.

Aplicabilidad al carácter: cada item §10.1 (o equivalente lista deuda diferida) al inicio de la sesión que lo aborda debe re-verificarse empírica bytes-on-disk (`grep`, `wc -l`, `ls`, etc.) ANTES de asumir vivo. Si grep retorna vacío → item fantasma, cerrar como "resuelto colateralmente en sN" sin Edit.

Lección §51 es §49 aplicada al inventario de items diferidos, no solo al estado del repo.

---

## §8 — Lección §14 vigesimoctava-trigésima primera sesión consecutiva al carácter MULTI-INSTANCIA

S39 produjo 9 instancias decisivas §14 catalogadas al carácter:

| # | Instancia | Verbatim Ramón | Decodificación técnica | Aplicación CTO |
|---|---|---|---|---|
| 1 | PASO 1 decisión item | "haz lo que sea lo correcto" | confianza en juicio CTO sobre prioridad item §10.1 | item 8 caracterización empírica como prioridad ALTA HANDOFF s38 §10.3 |
| 2 | Orden ataque cleanup post-item-7 | "lo k sea lo mejor" | confianza en juicio CTO sobre orden items 1+2+7 cleanup | Opción A cleanup items 1+2+7 (luego cerrado: 7 fantasma + 2 estructural + 1 diferido s40) |
| 3 | Commit aislado vs combinado | "lo que sea lo mejor" | confianza en juicio CTO sobre estrategia commit granular | Opción A commit aislado 5e.4 |
| 4 | OK condicional Edits A+B | "si es lo correcto lo pruebo" | OK condicional bajo juicio CTO + verificación empírica propia | Edits A+B aplicados con triple-capa bicapa pre-commit |
| 5 | Build redundante triple-capa | "lo que sea lo mejor" | confianza en juicio CTO sobre triple-capa redundante | Opción B triple-capa redundante pre-commit |
| 6 | OK push origin/main | "si es lo correcto, adelante" | OK push bajo juicio CTO | Push fast-forward ejecutado, deploy Vercel Ready |
| 7 | Smoke producción | "todo pass" | input técnico encriptado §14 manda sobre §49 esta vez (precedente s38 instancia 1) | CTO no forzó tabla discriminante adicional, smoke 1/1 PASS registrado |
| 8 | Cierre s39 con HANDOFF | "adelante con lo mejor.." | confianza juicio CTO sobre cierre s39 | Opción A cierre s39 ahora con HANDOFF redactado |
| 9 | Redacción HANDOFF 1 mensaje vs secciones | "lo k sea lo mejor" | confianza juicio CTO sobre estrategia redacción | Opción A HANDOFF íntegro en 1 mensaje |

Patrón consistente al carácter con instancias previas §14 documentadas s31-s38:
- s33 "no le veo sentido al instrumentar X"
- s34 "el ResizeObserver no es el problema, mira tu logs"
- s35 "k kieres k haga? probar lo k ya sabemos k esta mal?"
- s36 "k control bueno, si se desajusta tambien..."
- s36 "y lo k ya esta pintado de las killzones no se puede anclar al precio y hora? como los drawings?"
- s37 instancia 1: "pero y que hemos hecho para que quieras redctar handoff ya?"
- s37 instancia 2: "haz lo correcto"
- s38 instancia 1: "los 4 pas... si hubiera alguna cosa mal te lo digo.."
- s38 instancia 2: "passs" + ratificación explícita "todo pass"
- **s39 (9 instancias multi)**: detalle arriba

Vigesimoctava-trigésima primera sesión consecutiva al carácter §14 input técnico encriptado. S39 multi-instancia (9 instancias en 1 sesión).

---

## §9 — Items diferidos post-s39 + plan sesión 40

### §9.1 Items §10.1 al carácter al cierre s39

| # | Item | Origen | Estado al cierre s39 |
|---|---|---|---|
| 1 | 5f.2 polling cleanup | diferido s28 | ⏳ ABIERTO — diferido s40 prioridad 1 |
| 2 | 5e.4 debugCtx cleanup | diferido s29 | ✅ CERRADO s39 §5 |
| 3 | 5d.7-5d.8 viewport preservation | diferido s30 | ⏳ ABIERTO — fase arquitectónica futura |
| 5 | Debt 5.1 viewport timeframe change | TradingView-style | ⏳ ABIERTO — fase arquitectónica futura (post-cleanups) |
| 6 | Datos crudos Giancarlo/Luis | diferido s30 | ⏳ ABIERTO — bloqueado terceros |
| 7 | 5f LS-DEBUG cleanup | diferido s23 | ✅ CERRADO FANTASMA s39 §3 (resuelto s23 sub-fase 5e.3) |
| 8 | `CustomDrawingsOverlay.js` S33.4 | diferido s35 §6 | ✅ CERRADO "no aplica empíricamente" s39 §4 |

### §9.2 Plan sesión 40 — propuesta CTO

**PASO 0 s40**: baseline verificación bicapa REAL (§49):
1. `git status --short` → vacío esperado
2. `git rev-parse --short HEAD` → `<HASH-HANDOFF-s39>` esperado
3. `git log --oneline -5 | cat` → HANDOFF s39 + `e44bb9b` cleanup s39-5e.4 + `ed90d19` HANDOFF s38 + `9eb1475` feat 5g + ancestro
4. `wc -l lib/chartRender.js` → 141 esperado (post s39-5e.4)
5. `wc -l components/_SessionInner.js` → 3050 esperado
6. md5 ambos archivos → hashes s39
7. 3 invariantes fase 4 verificación REAL
8. **§51 NUEVA aplicada**: re-verificar empírica bytes-on-disk item 1 (5f.2 polling) ANTES de asumir vivo:
   - `grep -rn "setInterval\|polling.*300\|__algSuiteExportTools" components/ pages/ lib/ | head -20`
   - Si vacío → item 1 fantasma también, cerrar
   - Si vivo → caracterización empírica + Edit + commit + push + smoke producción

**PASO 1 s40**: decisión qué item §10.1 atacar primero. Recomendación CTO al carácter:
- **Prioridad alta**: item 1 `5f.2 polling cleanup` — cleanup deuda técnica + posible relación con drag M1 freeze (HANDOFF s23 §6.3 sugiere interacción)
- **Prioridad media**: items 3/5 viewport preservation TradingView-style — feature arquitectónica
- **Prioridad baja**: item 6 datos crudos Giancarlo/Luis — bloqueado terceros

**PASO 2-N s40**: dependiente decisión PASO 1.

### §9.3 Riesgos identificados al carácter para s40

- Item 1 (5f.2 polling) puede revelar dependencias inesperadas con drag M1 freeze (HANDOFF s23 §6.3). Caracterización empírica obligatoria antes de Edit.
- Items 3/5 viewport preservation exigen PASO 0 caracterización empírica vs FX Replay/TradingView (cómo se comporta cada uno al cambio TF, qué métricas medir). Sesión dedicada exclusiva recomendada.

---

## §10 — Cierre sesión 39

Sesión 39 cerrada al carácter 25 mayo 2026, ~17:00 hora local.

HEAD local main = `e44bb9b48444baa186d662c57382e94203ad2d94` (commit `e44bb9b` cleanup(5e.4)) — pendiente añadir commit HANDOFF s39 al cerrar.
`origin/main` = `e44bb9b` (pusheado).
Producción Vercel runtime efectivo = `e44bb9b` (deploy Ready confirmado).
Smoke producción 1/1 PASS al carácter (§14 instancia 7 "todo pass").

**Item 2 §10.1 (5e.4 debugCtx) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**.

3 items §10.1 procesados al carácter en s39:
- Item 2 (5e.4 debugCtx) — ✅ CERRADO ESTRUCTURALMENTE — 1 commit funcional + push + Vercel deploy + smoke
- Item 7 (5f LS-DEBUG) — ✅ CERRADO FANTASMA — resuelto colateral s23 sub-fase 5e.3
- Item 8 (`CustomDrawingsOverlay.js` S33.4) — ✅ CERRADO "no aplica empíricamente" — caracterización bytes-on-disk + §14 input Ramón

2 archivos modificados al carácter:
- `lib/chartRender.js` MODIFICADO 144→141 líneas (-3 netas) md5 `5af39d6036c7852a86249b74188a024e`
- `components/_SessionInner.js` MODIFICADO 3050 líneas (0 netas L1152 in-place) md5 `0fbfe5c035d34f15cee0677ba8d212b3`

1 commit funcional al carácter:
- `e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate`

4 errores §9.4 propios CTO registrados al carácter sin maquillaje:
- Error #1: paginación less `git diff` no anticipada (§50 s37 conocida, no aplicada proactivamente)
- Error #2: prompt confirmación Edit B duplicado (cazado Claude Code §15 + §44 + idempotencia)
- Error #3: afirmación `npm run build PASS` en commit message sin Claude Code haberla visto (cazado Claude Code §49 estricto)
- Error #4: asumir ejecución commit pre-confirmación (cazado Ramón "k ?" §14 input encriptado)

1 lección nueva al carácter:
- §51 NUEVA — items diferidos en HANDOFFs sucesivos requieren re-verificación empírica bytes-on-disk

Lección §14 vigesimoctava-trigésima primera sesión consecutiva al carácter MULTI-INSTANCIA: 9 instancias decisivas s39 catalogadas §8.

3 invariantes fase 4 intactas vigésima sesión consecutiva al carácter post-cleanup.
Cluster A §1.7 `lib/chartViewport.js` intocado.

Próxima sesión = sesión 40. Prioridad 1 sugerida = item 1 §10.1 `5f.2 polling cleanup` con §51 NUEVA aplicada al carácter (re-verificar empírica bytes-on-disk ANTES de Edit). **Aplicar §49 al carácter en HANDOFF s40**: cada verificación bicapa debe ejecutarse REALMENTE en zsh y transcribir output verbatim. NO transcribir de memoria.

**Cleanup deuda técnica primer item cerrado estructural post-fase-5g al carácter**. Disciplina bicapa estricta + §49 + §51 NUEVA reforzados. Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
