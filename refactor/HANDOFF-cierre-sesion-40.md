# HANDOFF — cierre sesión 40

> Sesión 40 cerrada el 26 mayo 2026, ~12:30 hora local.
> Sesión 40 = **item 1 §10.1 (5f.2 polling cleanup) cerrado estructuralmente en producción + §51 NUEVA s39 aplicada al carácter en arranque**.
> **Resultado al carácter sin maquillaje**: **PASO 0 baseline bicapa REAL ✓ (10 checks). §51 NUEVA s39 aplicada al item 1: re-verificación empírica bytes-on-disk confirma item VIVO (no fantasma) — polling 300ms en `_SessionInner.js` L422-L433 caracterizado al carácter contra `fase-5-plan.md §2.8` y HANDOFF s32 §4**. Caracterización arquitectónica empírica concluyó: vendor fork LWC NO expone canal pub/sub selection (grep 8737 líneas = VACÍO), `chart.subscribeClick` LWC oficial ya conectado handler L443 con lógica solo CLEAR, mismo handler cubre SET + CLEAR bidireccionalmente con setTimeout 50ms ya validado. **Item 1 (5f.2 polling) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**: 1 commit funcional `ae29f16` cleanup(5f.2) + push origin/main fast-forward + Vercel deploy Ready + smoke producción 3/3 PASS sobre `simulator.algorithmicsuite.com`.
> **Producción Vercel runtime efectivo desde 26 may 2026 ~12:30 hora local = `ae29f16`** (cambio desde `e44bb9b` post-s39 cleanup 5e.4).
> **3 invariantes fase 4 intactas vigesimoprimera sesión consecutiva al carácter**: `cr.series.setData|update` = 0 en `_SessionInner.js`, `computePhantomsNeeded` = 3 en `_SessionInner.js`, Cluster A §1.7 (`lib/chartViewport.js` header §1.7 protegido) intocado.
> **7 errores §9.4 propios CTO registrados al carácter en s40 sin maquillaje**: 5 errores clase aritmética predicción (off-by-one en conteo old_str/new_str + heredoc wc -l) cazados por Claude Code post-Edit en cada paso; 1 error sistémico sobrecorrección plan (CTO propuso abortar push directo + smoke local 6 paths tras pregunta diagnóstica Ramón) cazado por Ramón "vefcel ready"; 1 error comprensión §14 input (CTO interpretó pregunta diagnóstica Ramón como orden de cambio plan + propuso revert post-deploy) cazado por Ramón "la confusion la creaste tu... ya que está deployado probamos". Patrón consistente: generalización temporal/contextual sin verificar premisa explícita en cada caso. Disciplina bicapa Claude Code + Ramón cazó 7 de 7 errores al carácter.
> **Lección §51 NUEVA s39 aplicada al carácter en s40 sobre item 1**: re-verificación empírica bytes-on-disk ANTES de asumir vivo. Resultado: polling 300ms confirmado VIVO (`grep setInterval` retornó 3 matches: L422 polling 300ms candidato, L2927 polling 150ms zoom Y NUEVO no listado §10.1, useAuth.js:80 fix acceso s32 legítimo). NO fantasma documental como item 7 §10.1 s39.
> **Lección §52 NUEVA al carácter**: contar líneas mecánicamente ANTES de declarar aritmética en HANDOFF/prompts/predicciones. NO fiarse de conteo visual aproximado. Verificación discriminante con `wc -l` o conteo bytes-on-disk en cualquier predicción aritmética. Origen al carácter: 5 errores §9.4 propios CTO clase aritmética predicción cazados por Claude Code post-Edit en s40.
> **Lección §53 NUEVA al carácter**: pregunta diagnóstica Ramón post-ejecución sobre patrón CTO establecido ≠ orden de cambio plan. Default = justificar patrón actual con histórico HANDOFFs bytes-on-disk, NO replantear. Solo cambiar plan si Ramón explícitamente pide cambio. Origen al carácter: error #6 sistémico s40 (CTO propuso abortar push directo + smoke local 6 paths tras pregunta diagnóstica Ramón "y no lo probamos en local ni nada?") cazado por Ramón "vefcel ready" + reconocimiento error CTO "la confusion la creaste tu".
> **Lección §14 vigesimosegunda-vigesimotercera sesión consecutiva al carácter MULTI-INSTANCIA**: 5 instancias decisivas s40 catalogadas §8.
> Próxima sesión = sesión 41. Items §10.1 elegibles restantes detallados §9.

---

## §0 — Estado al cierre sesión 40, sin maquillaje

**Sesión 40 produjo 1 commit funcional al carácter en local main + push origin/main + deploy Vercel Ready + smoke producción 3/3 PASS**:

- `ae29f16 cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial` — 1 archivo modificado, 10 insertions, 15 deletions

HEAD local main al cierre s40 = `ae29f16737ec411300ad2d6d4ff4d4c38a95f10e` sobre `122a8d2` (HANDOFF s39) sobre `e44bb9b` (cleanup 5e.4) sobre `ed90d19` (HANDOFF s38) sobre `9eb1475` (feat 5g).

`origin/main` post-cierre s40 = `ae29f16` (push completado al carácter via Ramón directo zsh nativo).

Producción Vercel runtime efectivo `ae29f16` desde 26 may 2026 ~12:30 hora local — **CAMBIO desde `e44bb9b` post-s39 cleanup 5e.4**. Smoke producción 3/3 PASS confirmado bicapa visual Ramón al carácter via §14 instancia 5 ("todo ñass" = "todo pass" typo iMac teclado español).

**Realidad sin maquillaje al carácter**:

1. **PASO 0 baseline verificación bicapa REAL** ejecutado al carácter por Ramón en zsh con output verbatim transcrito (10 checks). Detalle §1.

2. **§51 NUEVA s39 aplicada al carácter sobre item 1 §10.1 ANTES de asumir vivo**: grep amplio `setInterval|polling.*300|__algSuiteExportTools` retornó 3 matches discriminados al carácter. Detalle §2.

3. **Item 1 §10.1 (5f.2 polling cleanup) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN** — caracterización empírica + Edit A (eliminar polling 300ms L422-L433 + clearInterval del cleanup return) + Edit B (extender handler subscribeClick L443 con rama SET + comentario actualizado) + build local PASS triple-capa + commit `ae29f16` + push origin/main fast-forward + Vercel deploy Ready + smoke producción 3/3 PASS. Detalle §3-§5.

4. **2 archivos NUEVOS/MODIFICADOS al carácter en s40**:
   - `components/_SessionInner.js` MODIFICADO -5 líneas netas (3050→3045) md5 `6eaa3b56a8252277e9073245623f8f45` (pre s40: `0fbfe5c035d34f15cee0677ba8d212b3`)
   - `refactor/HANDOFF-cierre-sesion-40.md` NEW (este documento)

5. **7 errores §9.4 propios CTO registrados al carácter** sin maquillaje. Detalle §6.

6. **3 invariantes fase 4 intactas vigesimoprimera sesión consecutiva al carácter** (bicapa REAL ejecutada PASO 0 + post-cleanup):
   - `cr.series.setData|cr.series.update` solo aparecen en `lib/chartRender.js` (grep en `_SessionInner.js` retornó 0)
   - `computePhantomsNeeded` aparece exactamente 3 veces en `_SessionInner.js`
   - Cluster A `lib/chartViewport.js` §1.7 intocado — `head -5` retornó header §1.7 protegido verbatim

7. **Working tree clean al cierre s40 al carácter**:
   - `git status --short` → vacío (post-push)
   - `git rev-parse --short HEAD` → `ae29f16` (pendiente añadir commit HANDOFF s40 al cerrar)
   - HEAD local = origin/main = Vercel runtime = `ae29f16`

---

## §1 — PASO 0 baseline verificación bicapa REAL

Sub-paso 1a ejecutado por Ramón en zsh — output verbatim transcrito (§49):

```
$ git status --short
$ git rev-parse --short HEAD
122a8d2
$ git log --oneline -5 | cat
122a8d2 docs(handoff): cierre sesion 39 - cleanup 5e.4 debugCtx cerrado estructuralmente en produccion + items 7/8 cerrados (fantasma + no aplica empiricamente) + leccion §51 NUEVA
e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
ed90d19 docs(handoff): cierre sesion 38 - fase 5g cerrada estructuralmente en produccion
9eb1475 feat(5g): migrate KillzonesOverlay to ISeriesPrimitive (closes S33.4)
772dd30 docs(handoff): cierre sesión 37 v2 — fe-de-erratas §2.2 sobre HANDOFF s36 + lección §49 NUEVA
```

Sub-paso 1b — wc + md5:

```
$ wc -l lib/chartRender.js components/_SessionInner.js
     141 lib/chartRender.js
    3050 components/_SessionInner.js
$ md5 lib/chartRender.js components/_SessionInner.js
MD5 (lib/chartRender.js) = 5af39d6036c7852a86249b74188a024e
MD5 (components/_SessionInner.js) = 0fbfe5c035d34f15cee0677ba8d212b3
```

Sub-paso 1c — 3 invariantes fase 4 verificación REAL:

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
| HEAD | `122a8d2` | `122a8d2` | ✓ |
| log -5 | HANDOFF s39 + e44bb9b + ed90d19 + 9eb1475 + 772dd30 | íd. verbatim | ✓ |
| `wc -l chartRender.js` | 141 | 141 | ✓ |
| `wc -l _SessionInner.js` | 3050 | 3050 | ✓ |
| md5 `chartRender.js` | `5af39d60...` | exacto | ✓ |
| md5 `_SessionInner.js` | `0fbfe5c0...` | exacto | ✓ |
| grep cr.series.setData|update | 0 | 0 | ✓ |
| grep computePhantomsNeeded | 3 | 3 | ✓ |
| head -5 chartViewport.js | header §1.7 | exacto | ✓ |

3 invariantes fase 4 PASS al carácter **vigesimoprimera sesión consecutiva** (pre-cleanup s40). Cluster A `lib/chartViewport.js` §1.7 intocado. Runtime producción `e44bb9b` = bytes-on-disk locales al carácter pre-s40.

PASO 0 CERRADO al carácter.

---

## §2 — §51 NUEVA s39 aplicada al item 1 §10.1 ANTES de asumir vivo

Grep amplio discriminante:

```
$ grep -rn "setInterval" components/ pages/ lib/ | head -20
components/_SessionInner.js:422:    const iv=setInterval(()=>{
components/_SessionInner.js:2927:    const iv=setInterval(update,150)
lib/useAuth.js:80:    const revalidateInterval = setInterval(revalidate, 45000)
```

Discriminación al carácter:

| Línea | Match | Caracterización |
|---|---|---|
| `_SessionInner.js:422` | `setInterval(()=>{` | **CANDIDATO PRINCIPAL** — verificar contexto contra plan v3 §2.8 (polling 300ms `getSelected()` listado L397-L408, código se movió ~25 líneas por cleanups previos) |
| `_SessionInner.js:2927` | `setInterval(update,150)` | 150ms ≠ 300ms — **NUEVO no listado §10.1**, polling defensivo PositionsOverlay/OrdersOverlay zoom Y |
| `useAuth.js:80` | `setInterval(revalidate, 45000)` | 45s revalidación auth fix s32 LEGÍTIMO — NO tocar |

Verificación contexto L422 (sed L415-L445) confirmó al carácter:
- `setInterval(...,300)` con `getSelected()` + `setSelectedTool` + `setActiveToolKey` (match exacto plan v3 §2.8)
- useEffect deps `[pluginReady,activePair]`
- Cleanup `return()=>{ clearInterval(iv) + offAfterEdit + offDoubleClick }`

**Veredicto al carácter**: item 1 §10.1 VIVO confirmado bytes-on-disk. NO fantasma documental (a diferencia item 7 §10.1 s39).

---

## §3 — Caracterización arquitectónica empírica vendor fork + canal sustituto

### §3.1 Hook `useDrawingTools` API exhaustiva

```
$ wc -l components/useDrawingTools.js
     243 components/useDrawingTools.js
$ md5 components/useDrawingTools.js
MD5 (components/useDrawingTools.js) = d5c05f62d1a999f69d3b06835ba78dcb
$ grep -n "onAfterEdit\|onDoubleClick\|getSelected" components/useDrawingTools.js
236:  const onAfterEdit    = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsAfterEdit(h) } catch {} }, [])
237:  const offAfterEdit   = useCallback((h) => { try { pluginRef.current?.unsubscribeLineToolsAfterEdit(h) } catch {} }, [])
238:  const onDoubleClick  = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsDoubleClick(h) } catch {} }, [])
240:  const getSelected    = useCallback(() => { try { return JSON.parse(pluginRef.current?.getSelectedLineTools() || '[]') } catch { return [] } }, [])
```

Hook re-exporta 3 helpers vendor fork: `subscribeLineToolsAfterEdit`, `subscribeLineToolsDoubleClick`, `getSelectedLineTools`. **NO incluye evento selección single-click**.

### §3.2 Vendor fork API public — grep canal selección VACÍO

```
$ grep -n "subscribeLineToolsSelectionChange\|subscribeLineToolsSelected\|SelectionChange\|onSelectionChanged\|emitSelection" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js | head -20
(VACÍO)
$ grep -n "subscribeSelect\|onSelect\b\|selectedChange\|emit.*[Ss]elect\|fireSelect" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js | head -20
(VACÍO)
$ grep -n "getSelectedLineTools\|subscribeLineTools" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js | head -10
3140:     * const selected = JSON.parse(plugin.getSelectedLineTools());
3143:    getSelectedLineTools() {
3289:    subscribeLineToolsDoubleClick(handler) {
3295:     * @param handler - The specific callback function that was passed to {@link subscribeLineToolsDoubleClick}.
3298:    unsubscribeLineToolsDoubleClick(handler) {
3312:     * plugin.subscribeLineToolsAfterEdit((params) => {
3317:    subscribeLineToolsAfterEdit(handler) {
3326:     * @param handler - The specific callback function that was passed to {@link subscribeLineToolsAfterEdit}.
3329:    unsubscribeLineToolsAfterEdit(handler) {
3383:     * interaction on a tool. It triggers listeners subscribed via {@link subscribeLineToolsDoubleClick}.
```

API pública pub/sub fork al carácter:

```
L3143: getSelectedLineTools()                  // query síncrona, NO evento
L3289: subscribeLineToolsDoubleClick(handler)  // evento double-click
L3298: unsubscribeLineToolsDoubleClick(handler)
L3317: subscribeLineToolsAfterEdit(handler)    // evento post-edición
L3329: unsubscribeLineToolsAfterEdit(handler)
```

**Cero canal selección single-click**. Estrategia A (extender hook re-exportando canal del fork) descartada bytes-on-disk.

### §3.3 Vendor fork NO intercepta clicks DOM — grep VACÍO

```
$ grep -n "subscribeClick\|stopPropagation\|preventDefault\|handleClick\|_onClick\|mouseClick" vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js | head -25
(VACÍO)
```

Hipótesis "vendor fork captura click sobre tool primero" **refutada bytes-on-disk**. `chart.subscribeClick` LWC oficial recibe TODOS los clicks (vacío + sobre tool). El `setTimeout(50ms)` actual L451 espera porque `getSelected()` se actualiza post-render del plugin LWC, no porque haya captura DOM.

### §3.4 3 call sites `getSelected()` en `_SessionInner.js` enumerados §43

```
$ grep -n "onAfterEdit\|onDoubleClick\|getSelected\b" components/_SessionInner.js | head -10
298: API destructured del hook
397: dentro afterEditHandler (callback onAfterEdit)
420: onAfterEdit(afterEditHandler) registro
421: onDoubleClick(dblClickHandler) registro
424: dentro setInterval polling 300ms — ITEM 5f.2
452: dentro chart.subscribeClick(handler) + setTimeout 50ms
964: comentario "text drawings are not vendor tools so onAfterEdit never fires"
```

3 call sites `getSelected()`:
- L397 (afterEditHandler): sync selectedTool/activeToolKey + Callout TEXT input modal cuando `lineToolFinished`
- L424 (polling 300ms — ITEM 5f.2): sync selectedTool/activeToolKey en single-click selección
- L452 (chart.subscribeClick handler + setTimeout 50ms): **Clear** selectedTool cuando click área vacía

Hallazgo decisivo §38: handler L452 ya tiene canal pub/sub LWC oficial conectado. Cubre caso deselect. **Polling 300ms cubre el caso opuesto** (SET cuando click sobre tool). Mismo handler puede extenderse bidireccionalmente con setTimeout 50ms ya validado en producción.

---

## §4 — Item 1 §10.1 (5f.2 polling cleanup) Edit A + Edit B + commit + push + Vercel + smoke

### §4.1 Edit A `_SessionInner.js` — eliminar polling 300ms + cleanup clearInterval

Pre-Edit:
```
$ wc -l components/_SessionInner.js
    3050 components/_SessionInner.js
$ md5 components/_SessionInner.js
MD5 (components/_SessionInner.js) = 0fbfe5c035d34f15cee0677ba8d212b3
```

`old_str` verbatim 19 líneas (L420-L438 zona contigua polling + cleanup):

```
    onAfterEdit(afterEditHandler)
    onDoubleClick(dblClickHandler)
    const iv=setInterval(()=>{
      try{
        const sel=getSelected()
        if(sel&&sel.length>0){
          const t=sel[0]
          if(t?.id){
            setSelectedTool(prev=>prev?.id===t.id?prev:{id:t.id,toolType:t.toolType})
            if(t.toolType) setActiveToolKey(t.toolType)
          }
        }
      }catch{}
    },300)
    return()=>{
      clearInterval(iv)
      offAfterEdit(afterEditHandler)
      offDoubleClick(dblClickHandler)
    }
```

`new_str` verbatim 6 líneas:

```
    onAfterEdit(afterEditHandler)
    onDoubleClick(dblClickHandler)
    return()=>{
      offAfterEdit(afterEditHandler)
      offDoubleClick(dblClickHandler)
    }
```

Post-Edit A bicapa:
```
$ wc -l components/_SessionInner.js
    3037 components/_SessionInner.js
$ md5 components/_SessionInner.js
MD5 (components/_SessionInner.js) = daa1eb839a3fa356fa424a52af412012
$ grep -n "setInterval" components/_SessionInner.js
2914:    const iv=setInterval(update,150)
$ grep -n "clearInterval" components/_SessionInner.js
2915:    return()=>clearInterval(iv)
```

Delta Edit A: -13 líneas netas (3050→3037). Polling 300ms eliminado. clearInterval(iv) del polling 150ms zoom Y intacto (otro contexto, fuera scope 5f.2).

Edit A CERRADO bicapa al carácter.

### §4.2 Edit B `_SessionInner.js` — extender handler subscribeClick SET+CLEAR

Pre-Edit B baseline = post-Edit A (md5 `daa1eb83...`).

`old_str` verbatim 17 líneas (handler con solo lógica CLEAR):

```
  // Clear selectedTool when user clicks empty chart area
  useEffect(()=>{
    if(!dataReady) return
    const cr=chartMap.current[activePair]
    if(!cr?.chart) return
    const handler=()=>{
      // Small delay to let plugin process click first
      setTimeout(()=>{
        try{
          const sel=getSelected()
          if(!sel||sel.length===0) setSelectedTool(null)
        }catch{}
      },50)
    }
    cr.chart.subscribeClick(handler)
    return()=>{ try{cr.chart.unsubscribeClick(handler)}catch{} }
  },[dataReady,activePair])
```

`new_str` verbatim 25 líneas (handler bidireccional SET+CLEAR + comentario actualizado):

```
  // Sync selectedTool on click — reactivo vía subscribeClick LWC oficial (reemplaza polling 300ms s40 5f.2)
  useEffect(()=>{
    if(!dataReady) return
    const cr=chartMap.current[activePair]
    if(!cr?.chart) return
    const handler=()=>{
      // Small delay to let plugin process click first
      setTimeout(()=>{
        try{
          const sel=getSelected()
          if(!sel||sel.length===0){
            setSelectedTool(null)
          }else{
            const t=sel[0]
            if(t?.id){
              setSelectedTool(prev=>prev?.id===t.id?prev:{id:t.id,toolType:t.toolType})
              if(t.toolType) setActiveToolKey(t.toolType)
            }
          }
        }catch{}
      },50)
    }
    cr.chart.subscribeClick(handler)
    return()=>{ try{cr.chart.unsubscribeClick(handler)}catch{} }
  },[dataReady,activePair])
```

Post-Edit B bicapa:
```
$ wc -l components/_SessionInner.js
    3045 components/_SessionInner.js
$ md5 components/_SessionInner.js
MD5 (components/_SessionInner.js) = 6eaa3b56a8252277e9073245623f8f45
$ grep -n "Sync selectedTool on click" components/_SessionInner.js
430:  // Sync selectedTool on click — reactivo vía subscribeClick LWC oficial (reemplaza polling 300ms s40 5f.2)
```

Delta Edit B: +8 líneas netas (3037→3045). Rama SET añadida + comentario actualizado.

Edit B CERRADO bicapa al carácter.

### §4.3 Build local PASS + diff bicapa triple-capa

Sub-paso bicapa global Ramón zsh nativo (no Claude Code — bytes propios §49):

```
$ git status --short
 M components/_SessionInner.js
$ git diff --stat
 components/_SessionInner.js | 25 ++++++++++---------------
 1 file changed, 10 insertions(+), 15 deletions(-)
$ grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js
0
$ grep -c "computePhantomsNeeded" components/_SessionInner.js
3
```

Aritmética bicapa al carácter: +10 / -15 = -5 netas. Coincide post-Edit A + Edit B (3050 - 13 + 8 = 3045).

3 invariantes fase 4 intactas vigesimoprimera sesión consecutiva al carácter post-cleanup.

`npm run build` Ramón:

```
$ npm run build 2>&1 | tail -25
└ ƒ /session/[id]                         1.8 kB         83.1 kB
+ First Load JS shared by all             81.9 kB
  ├ chunks/framework-64ad27b21261a9ce.js  44.9 kB
  ├ chunks/main-fc56ac81e639fb5e.js       33.9 kB
  └ other shared chunks (total)           3.14 kB
```

Bundle `/session/[id]` 1.8 kB / 83.1 kB First Load **idéntico al baseline post-5e.4** (`e44bb9b` HANDOFF s39 §5.4). Refactor cleanup 5f.2 **net-zero en compilación** (setInterval JIT-inlineable + lógica SET compensa).

§50 satisfecho: verificación discriminante en runtime real (`npm run build` webpack) PASS al carácter.

Triple-capa pre-commit Claude Code redundante (lección §44 doble caracterización aplicada al carácter): Claude Code re-ejecutó `npm run build` + `git --no-pager diff` para verlo bytes-on-disk él mismo. Resultado: bundle idéntico baseline + diff confinado a 2 zonas Edit + stat +10/-15 ratificado.

### §4.4 Commit `ae29f16` + push origin/main + Vercel + smoke producción 3/3

Commit message multilínea → heredoc → archivo temp `/tmp/commit-msg-s40-5f2.txt` (39 líneas) → `git commit -F` (patrón canónico bicapa heredado s23-s39):

Pre-ejecución bicapa:
```
$ wc -l /tmp/commit-msg-s40-5f2.txt
      39 /tmp/commit-msg-s40-5f2.txt
$ head -1 /tmp/commit-msg-s40-5f2.txt
cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial
$ git status --short
 M components/_SessionInner.js
```

Commit ejecutado:
```
$ git add components/_SessionInner.js
$ git commit -F /tmp/commit-msg-s40-5f2.txt
[main ae29f16] cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial
 1 file changed, 10 insertions(+), 15 deletions(-)
```

Sin trailer Co-Authored-By (verbatim estricto §49). Patrón canónico bicapa coherente con cadena commits s23/s24/.../s39.

Post-commit verificación bicapa al carácter:
```
$ git status --short
(VACÍO)
$ git rev-parse --short HEAD
ae29f16
$ git log --oneline -3 | cat
ae29f16 cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial
122a8d2 docs(handoff): cierre sesion 39 - cleanup 5e.4 debugCtx cerrado estructuralmente en produccion + items 7/8 cerrados (fantasma + no aplica empiricamente) + leccion §51 NUEVA
e44bb9b cleanup(5e.4): eliminar parametro muerto debugCtx en applyNewBarUpdate
```

HEAD local main = `ae29f16737ec411300ad2d6d4ff4d4c38a95f10e` al carácter. Working tree clean.

Pre-push verificación bicapa al carácter Ramón zsh nativo (§49):
```
$ git status --short
$ git rev-parse --short HEAD
ae29f16
$ git log --oneline origin/main..HEAD | cat
ae29f16 cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial
$ git rev-parse --short origin/main
122a8d2
```

Range push fast-forward `122a8d2..ae29f16` (1 commit). Cero contaminación.

Push ejecutado por Ramón directo zsh nativo. `origin/main` = `ae29f16` post-push.

Vercel deploy ready confirmado por Ramón ("vefcel ready" §14 instancia 4). Producción `simulator.algorithmicsuite.com` cambia de `e44bb9b` (cleanup 5e.4) a `ae29f16` (cleanup 5f.2).

Smoke producción 3/3 PASS discriminantes al carácter:

| # | Path producción | Resultado al carácter |
|---|---|---|
| 1 | Single-click sobre TrendLine/Rectangle/Fib ya existente — toolbar resalta tool seleccionado, selectedTool SET | PASS |
| 2 | Single-click sobre área vacía — toolbar deselecciona, selectedTool → null | PASS |
| 3 | Single-click tool A → tool B distinto — toolbar transición A→B | PASS |

§14 instancia 5 al carácter Ramón "todo ñass" = "todo pass" — input técnico encriptado typo iMac teclado español escuchado.

**Item 1 §10.1 (5f.2 polling cleanup) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**.

---

## §5 — Hallazgo NUEVO no listado §10.1 — polling 150ms zoom Y L2914

Caracterización al carácter sub-paso 2c s40:

```
$ sed -n '2920,2945p' components/_SessionInner.js (pre-Edit, L2920-L2945)

  // Polling 150ms — defensa contra zoom Y u otros eventos sin contrato formal.
  useEffect(()=>{
    if(!dataReady) return
    update()
    const iv=setInterval(update,150)
    return()=>clearInterval(iv)
  },[update,dataReady])
```

Polling 150ms defensa PositionsOverlay/OrdersOverlay (líneas precio drag) — comentario L2923 declara explícitamente "sin contrato formal". Patrón arquitectónico análogo a 5f.2 (overlay consumer-side sin canal pub/sub vivo).

**NO scope sub-fase 5f.2 actual** (principio §43 — un cleanup, un commit). Registro como **deuda nueva candidata post-5f.2** para sesión arquitectónica futura.

Post-Edit s40 polling 150ms zoom Y se renumera a L2914 (consecuencia -13 Edit A).

---

## §6 — Errores §9.4 propios CTO registrados al carácter en s40

### §6.1 Errores #1-#5 — aritmética predicción off-by-one (5 instancias)

| # | Predicción CTO | Real bytes-on-disk | Causa raíz |
|---|---|---|---|
| #1 | Edit A `-14 netas` | `-13 netas` | mal conté old_str 19 líneas / new_str 6 líneas → diff real -13. Declaré -14 |
| #2 | `grep clearInterval → vacío` | `1 match L2915` | NO conté que polling 150ms zoom Y tiene su propio clearInterval(iv) one-liner |
| #3 | `grep subscribeClick → 1 match` | `2 matches L444+L915` | NO consideré segundo subscribeClick L915 (contexto distinto, fuera scope 5f.2) |
| #4 | Edit B `+7 netas` | `+8 netas` | mal conté old_str 17 líneas / new_str 25 líneas → diff real +8. Declaré +7 |
| #5 | `wc -l archivo temp ~31 lineas` | `39 líneas` | conteo visual a ojo del heredoc, NO mecánico |

Patrón consistente: generalización aritmética sin verificar mecánicamente premisa. Disciplina bicapa Claude Code post-Edit cazó 5/5 al carácter. **Lección §52 NUEVA origen** §7.

### §6.2 Error #6 — sobrecorrección sistémica plan tras pregunta diagnóstica Ramón

Tras Ramón ejecutar `git push origin main` + ver Vercel deployando, preguntó verbatim:

> "y no lo probamos en local ni nada? o no es necesario?"

**CTO sobrerreaccionó al carácter**: declaró error #6 sistémico inventado ("CTO iba directo push → producción sin smoke local"), propuso opción smoke local 6 paths discriminantes + posible revert. Cazado por Ramón verbatim:

> "vefcel ready"

Decodificación correcta §14 input: pregunta diagnóstica Ramón post-ejecución = **pregunta curiosa-genuina sobre patrón CTO establecido** (push directo post-build-PASS-triple-capa cuando bundle idéntico baseline). NO era cuestionamiento del plan ni orden de cambio. CTO debía haber respondido justificando el patrón canónico s23-s39 con histórico HANDOFFs, NO replantear plan ni proponer abortar.

**Lección §53 NUEVA origen** §7.

### §6.3 Error #7 — comprensión §14 input + propuesta revert post-deploy

Tras Ramón ejecutar push + reportar "vefcel ready", CTO confundió aún más: interpretó "vefcel ready" como si Ramón hubiera ejecutado push **mientras** CTO redactaba propuesta smoke local 6 paths (ejecución paralela), declaró "error #6 cazado" + lecciona §53 candidata. Cazado por Ramón verbatim:

> "nio pero vamos a ver.... la confusion la creaste tu.. dandome el comando de push.... luego que lo ejecuté y vi vercel deployando te pregunté pk siempre lo hacemos así.. y ahora kieres revertir? ya que está deployado probamos... no?"

Decodificación correcta §14 input al carácter al fin: la cronología REAL fue (T1) CTO da comando push + verificaciones, (T2) Ramón ejecuta push, ve Vercel deployando, (T3) Ramón pregunta diagnóstica "y no lo probamos en local?", (T4) CTO sobrerreaccionó proponiendo abortar/smoke local, (T5) Ramón aclara "vefcel ready" (push ya hecho, sigamos), (T6) CTO confunde MÁS interpretando T2 como paralelo a T4-T5, (T7) Ramón corrige al carácter.

CTO reconoció error sin maquillaje + procedió plan original (smoke producción 3 paths) que Ramón ya había estado intentando ejecutar 3 turnos atrás.

### §6.4 Patrón consistente al carácter

Los 7 errores §9.4 propios CTO en s40 comparten patrón: **generalización temporal/contextual sin verificar premisa explícita en cada caso**. 5 errores aritmética (predicción wc -l / conteo old_str-new_str sin verificar mecánicamente), 1 error sistémico sobrecorrección (cambiar plan tras pregunta diagnóstica), 1 error comprensión (interpretar pregunta diagnóstica como orden cambio).

§9.4 lección consolidada al carácter: cada premisa empírica debe ratificarse bytes-on-disk REAL ANTES de avanzar al siguiente paso. **Cada pregunta Ramón debe interpretarse default como pregunta diagnóstica sobre plan actual, NO orden cambio plan**, salvo evidencia explícita en contrario. Disciplina bicapa Claude Code + Ramón cazó 7 de 7 errores al carácter. Lecciones §49 + §52 + §53 reforzadas/nacidas en s40.

---

## §7 — Lecciones consolidadas al carácter

### §7.1 Lecciones aplicadas en s40

- **§14 (intuición Ramón = input técnico encriptado)** vigesimosegunda-vigesimotercera sesión consecutiva MULTI-INSTANCIA: 5 instancias decisivas s40 catalogadas §8. CTO escuchó al carácter en 4 de 5 instancias (instancia 2 fallo en error #6/#7 corregido a tiempo).

- **§15 (NO improvisar fix sin diagnóstico)**: aplicado al carácter sobre item 1 — caracterización empírica vendor fork + hook + 3 call sites getSelected antes de proponer Estrategia B.

- **§38 (agotar diagnóstico empírico en bytes propios ANTES de buscar externamente)**: aplicado al carácter sobre item 1 — caracterización bytes-on-disk con grep recursivo sobre `setInterval`, `subscribeLineToolsSelectionChange`, `subscribeClick`, `stopPropagation`, `useDrawingTools` antes de cualquier propuesta de Edit.

- **§43 (enumerar TODOS los paths antes de declarar Edit cerrado)**: aplicado al carácter sobre item 1 — 3 call sites getSelected enumerados (L397, L424, L452) con destino claro. 5 paths Edit enumerados (Edit A zona contigua L420-L438 + Edit B zona L443-L458). Cero callers adicionales perdidos.

- **§44 (caracterización empírica DOS veces)**: aplicado al carácter sobre item 1 — bytes-on-disk caracterización inicial + post-Edit verificación. Triple-capa pre-commit aplicó §44 sobre verificación discriminante propio Claude Code via re-ejecución Ramón + Claude Code bytes-on-disk él mismo.

- **§46 (profundizar inventario en bytes ANTES de decidir)**: aplicado al carácter — lectura íntegra contexto L390-L460 + L915 + vendor fork L3140-L3329 antes de cualquier str_replace.

- **§47 (entregable tangible cada sesión)**: aplicado al carácter — la sesión termina con 1 commit funcional (`ae29f16`) + push origin/main + deploy Vercel Ready + smoke producción 3/3 PASS + HANDOFF s40 (este documento) + identificación deuda nueva candidata (polling 150ms zoom Y L2914) + 3 lecciones nuevas §52/§53 + verificación §51 NUEVA s39 aplicada. **Cinco entregables tangibles** s40.

- **§48 (LWC oficial precede vendor fork)**: ratificado al carácter sobre item 1 — `chart.subscribeClick` LWC oficial elegido sobre vendor fork inexistente. Patrón coherente con cierre fase 5g (`ISeriesPrimitive` LWC oficial sobre vendor fork).

- **§49 (HANDOFF requiere ejecución bytes-on-disk REAL)**: aplicada al carácter en ESTE HANDOFF s40 recursivamente. Cada verificación bicapa registrada corresponde a comando REAL ejecutado por Ramón en zsh con output verbatim transcrito desde mensajes pegados en chat. Cero transcripción de memoria.

- **§50 (verificación discriminante debe modelar el runtime real del artifact)**: aplicado al carácter — `npm run build` (Next.js / webpack) sobre archivo cleanup. Triple-capa pre-commit redundante: Ramón ejecutó build + CTO web ratificó + Claude Code vio bytes-on-disk él mismo.

- **§51 NUEVA s39 (items diferidos en HANDOFFs sucesivos requieren re-verificación empírica bytes-on-disk)**: aplicada al carácter en arranque s40 sobre item 1 §10.1. Grep amplio `setInterval` retornó 3 matches discriminados al carácter (L422 candidato principal, L2927 NUEVO no listado, useAuth.js fix s32 legítimo). Resultado: item 1 VIVO confirmado bytes-on-disk (no fantasma documental como item 7 §10.1 s39).

### §7.2 Lecciones nuevas al carácter en s40

**Lección §52 NUEVA — contar líneas mecánicamente ANTES de declarar aritmética**.

Cualquier predicción aritmética (wc -l esperado, conteo old_str/new_str líneas, conteo heredoc, delta neto Edit) debe verificarse mecánicamente con `wc -l` o equivalente bytes-on-disk ANTES de declararse en prompt/HANDOFF/commit message. NO fiarse de conteo visual aproximado ni estimación a ojo.

Origen al carácter: 5 errores §9.4 propios CTO clase aritmética predicción en s40 (#1 Edit A -14 vs -13 / #2 grep clearInterval / #3 grep subscribeClick / #4 Edit B +7 vs +8 / #5 heredoc 31 vs 39 líneas). Disciplina bicapa Claude Code cazó 5/5 al carácter.

Aplicabilidad al carácter: prefijo cualquier predicción aritmética con `wc -l`/`grep -c`/conteo bytes-on-disk literal. Si predicción visual incierta, redactar "aproximadamente N" o "verificar bytes-on-disk post-Edit", NO declarar número exacto sin haberlo contado mecánicamente.

**Lección §53 NUEVA — pregunta diagnóstica Ramón ≠ orden cambio plan**.

Pregunta Ramón post-ejecución sobre patrón CTO establecido ("¿no hacemos X?" / "¿por qué hacemos Y así?" / "¿es necesario?") = **pregunta diagnóstica curiosa-genuina por defecto**, NO orden de cambio de plan. Default CTO = **justificar patrón actual con histórico HANDOFFs bytes-on-disk**, NO replantear plan ni proponer abortar. Solo cambiar plan si Ramón explícitamente pide cambio.

Origen al carácter: errores #6 + #7 sistémicos s40. Ramón ejecutó push + Vercel deployando, preguntó "y no lo probamos en local ni nada?". CTO sobrerreaccionó proponiendo abortar/smoke local 6 paths + revert post-deploy. Cazado por Ramón verbatim "la confusion la creaste tu... ya que está deployado probamos".

Aplicabilidad al carácter: ante pregunta Ramón post-ejecución sobre patrón, responder PRIMERO justificando patrón actual con histórico HANDOFFs/precedentes bytes-on-disk. Solo replantear plan si Ramón explícitamente pide cambio ("entonces hagamos X" / "prefiero Y" / "para la próxima Z"). Sub-lección: cuando Ramón corrige a CTO sobre confusión que CTO creó, NO intentar lecciones nuevas inmediatas — reconocer error sin maquillaje + proceder plan original.

---

## §8 — Lección §14 vigesimosegunda-vigesimotercera sesión consecutiva al carácter MULTI-INSTANCIA

S40 produjo 5 instancias decisivas §14 catalogadas al carácter:

| # | Instancia | Verbatim Ramón | Decodificación técnica | Aplicación CTO |
|---|---|---|---|---|
| 1 | OK condicional Edits A+B | "opcion 1 si esta correcto todo" | OK condicional bajo juicio CTO + verificación empírica propia | Edits A+B aplicados con bicapa triple-capa pre-commit |
| 2 | Commit ratificación | "haz lo que sea lo correcto" | confianza juicio CTO sobre commit message tal como está | Commit ae29f16 aplicado limpio |
| 3 | Pregunta diagnóstica post-push | "y no lo probamos en local ni nada? o no es necesario?" | pregunta diagnóstica curiosa-genuina sobre patrón push directo | **CTO sobrerreaccionó** (error #6) → corregido tras instancia 4 |
| 4 | Aclaración post-deploy | "vefcel ready" | typo iMac "vercel ready" = push ya hecho, deploy listo, sigamos plan original | **CTO confundió aún más** (error #7) → corregido tras instancia 5 |
| 5 | Smoke producción + corrección errores #6+#7 | "nio pero vamos a ver.... la confusion la creaste tu... ya que está deployado probamos... no?" + "todo ñass" | (a) input encriptado corrección errores CTO #6+#7 sistémicos + (b) "todo ñass" = "todo pass" typo iMac teclado español | CTO reconoció errores sin maquillaje + smoke producción 3/3 PASS confirmado |

Patrón consistente al carácter con instancias previas §14 documentadas s31-s39:
- s39 9 instancias multi (s39 §8)
- s38 instancia 1 "los 4 pas... si hubiera alguna cosa mal te lo digo.."
- s38 instancia 2 "passs" + ratificación explícita "todo pass"
- s37 instancia 1 "pero y que hemos hecho para que quieras redctar handoff ya?"
- s37 instancia 2 "haz lo correcto"
- s36 "y lo k ya esta pintado de las killzones no se puede anclar al precio y hora? como los drawings?"
- s35 "k kieres k haga? probar lo k ya sabemos k esta mal?"
- s34 "el ResizeObserver no es el problema, mira tu logs"
- s33 "no le veo sentido al instrumentar X"

Vigesimosegunda-vigesimotercera sesión consecutiva al carácter §14 input técnico encriptado. S40 5 instancias decisivas incluyendo 2 instancias de corrección error CTO sistémico (instancia 3+4 propuesta cambio plan + instancia 5 corrección verbatim al carácter).

---

## §9 — Items diferidos post-s40 + plan sesión 41

### §9.1 Items §10.1 al carácter al cierre s40

| # | Item | Origen | Estado al cierre s40 |
|---|---|---|---|
| 1 | 5f.2 polling cleanup | diferido s28 | ✅ CERRADO s40 §4 |
| 2 | 5e.4 debugCtx cleanup | diferido s29 | ✅ CERRADO s39 §5 |
| 3 | 5d.7-5d.8 viewport preservation | diferido s30 | ⏳ ABIERTO — fase arquitectónica futura |
| 5 | Debt 5.1 viewport timeframe change | TradingView-style | ⏳ ABIERTO — fase arquitectónica futura (post-cleanups) |
| 6 | Datos crudos Giancarlo/Luis | diferido s30 | ⏳ ABIERTO — bloqueado terceros |
| 7 | 5f LS-DEBUG cleanup | diferido s23 | ✅ CERRADO FANTASMA s39 §3 |
| 8 | `CustomDrawingsOverlay.js` S33.4 | diferido s35 §6 | ✅ CERRADO "no aplica empíricamente" s39 §4 |
| 9 NUEVO | Polling 150ms zoom Y L2914 `_SessionInner.js` | detectado s40 §5 | ⏳ ABIERTO — deuda nueva candidata cleanup análoga a 5f.2 |

### §9.2 Plan sesión 41 — propuesta CTO

**PASO 0 s41**: baseline verificación bicapa REAL (§49 + §51 NUEVA aplicada):
1. `git status --short` → vacío esperado
2. `git rev-parse --short HEAD` → `<HASH-HANDOFF-s40>` esperado
3. `git log --oneline -5 | cat` → HANDOFF s40 + ae29f16 cleanup 5f.2 + 122a8d2 HANDOFF s39 + e44bb9b cleanup 5e.4 + ed90d19 HANDOFF s38
4. `wc -l components/_SessionInner.js` → 3045 esperado (post s40-5f.2)
5. md5 archivo → hashes s40
6. 3 invariantes fase 4 verificación REAL
7. **§51 NUEVA aplicada al item §10.1 prioritario**: re-verificar empírica bytes-on-disk ANTES de asumir vivo

**PASO 1 s41**: decisión qué item §10.1 atacar primero. Recomendación CTO al carácter:
- **Prioridad alta**: item 9 NUEVO `Polling 150ms zoom Y L2914` — patrón arquitectónico análogo a 5f.2 recién cerrado, momentum metodológico aprovechable, scope similar (~10-20 líneas)
- **Prioridad media**: items 3/5 viewport preservation TradingView-style — feature arquitectónica
- **Prioridad baja**: item 6 datos crudos Giancarlo/Luis — bloqueado terceros

**PASO 2-N s41**: dependiente decisión PASO 1.

### §9.3 Riesgos identificados al carácter para s41

- Item 9 NUEVO (polling 150ms zoom Y) puede revelar dependencias con PositionsOverlay/OrdersOverlay drag handlers (comentario L2923 "sin contrato formal" sugiere overlay consumer-side sin canal pub/sub). Caracterización empírica obligatoria antes de Edit similar a s40 5f.2.
- Items 3/5 viewport preservation exigen PASO 0 caracterización empírica vs FX Replay/TradingView. Sesión dedicada exclusiva recomendada.

---

## §10 — Cierre sesión 40

Sesión 40 cerrada al carácter 26 mayo 2026, ~12:30 hora local.

HEAD local main = `ae29f16737ec411300ad2d6d4ff4d4c38a95f10e` (commit `ae29f16` cleanup(5f.2)) — pendiente añadir commit HANDOFF s40 al cerrar.
`origin/main` = `ae29f16` (pusheado).
Producción Vercel runtime efectivo = `ae29f16` (deploy Ready confirmado).
Smoke producción 3/3 PASS al carácter (§14 instancia 5 "todo ñass" typo iMac).

**Item 1 §10.1 (5f.2 polling cleanup) CERRADO ESTRUCTURALMENTE AL CARÁCTER EN PRODUCCIÓN**.

1 item §10.1 procesado al carácter en s40:
- Item 1 (5f.2 polling) — ✅ CERRADO ESTRUCTURALMENTE — 1 commit funcional + push + Vercel deploy + smoke 3/3 PASS

1 archivo modificado al carácter:
- `components/_SessionInner.js` MODIFICADO 3050→3045 líneas (-5 netas) md5 `6eaa3b56a8252277e9073245623f8f45`

1 commit funcional al carácter:
- `ae29f16 cleanup(5f.2): reemplazar polling 300ms getSelected() con suscripcion reactiva subscribeClick LWC oficial`

7 errores §9.4 propios CTO registrados al carácter sin maquillaje:
- Errores #1-#5: aritmética predicción off-by-one (cazados Claude Code post-Edit)
- Error #6: sobrecorrección sistémica plan tras pregunta diagnóstica Ramón (cazado Ramón "vefcel ready")
- Error #7: comprensión §14 input + propuesta revert post-deploy (cazado Ramón "la confusion la creaste tu")

2 lecciones nuevas al carácter:
- §52 NUEVA — contar líneas mecánicamente ANTES de declarar aritmética
- §53 NUEVA — pregunta diagnóstica Ramón ≠ orden cambio plan

Lección §51 NUEVA s39 aplicada al carácter en arranque s40 sobre item 1 (re-verificación empírica bytes-on-disk confirma item VIVO no fantasma).

Lección §14 vigesimosegunda-vigesimotercera sesión consecutiva al carácter MULTI-INSTANCIA: 5 instancias decisivas s40 catalogadas §8.

3 invariantes fase 4 intactas vigesimoprimera sesión consecutiva al carácter post-cleanup.
Cluster A §1.7 `lib/chartViewport.js` intocado.

1 deuda nueva candidata identificada s40 §5: polling 150ms zoom Y L2914 `_SessionInner.js` (item 9 NUEVO §10.1, patrón arquitectónico análogo a 5f.2).

Próxima sesión = sesión 41. Prioridad 1 sugerida = item 9 NUEVO §10.1 `Polling 150ms zoom Y L2914` con §51 NUEVA aplicada al carácter (re-verificar empírica bytes-on-disk ANTES de Edit). **Aplicar §49 + §52 + §53 al carácter en HANDOFF s41**: cada verificación bicapa debe ejecutarse REALMENTE en zsh y transcribir output verbatim. NO transcribir de memoria. Conteo aritmético mecánico. Pregunta Ramón post-ejecución = pregunta diagnóstica default.

**Cleanup deuda técnica segundo item cerrado estructural post-fase-5g al carácter**. Disciplina bicapa estricta + §49 + §51 + §52 NUEVA + §53 NUEVA reforzados/nacidos. Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
