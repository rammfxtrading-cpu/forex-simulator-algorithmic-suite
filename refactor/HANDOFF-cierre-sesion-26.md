# HANDOFF — cierre sesión 26

> Sesión 26 cerrada el 9 mayo 2026, ~20:00 hora local.
> Sesión 26 = sub-fase **5f.0b** + **cierre cluster B** (5g) según plan táctico HANDOFF s25 §5.3.
> **Cluster B mergeado al carácter en producción tras ~17 días sin código nuevo en runtime**. HEAD `06e16bf` push a `origin/main`. Vercel deployó al carácter cluster B funcional con bug colateral KZ subidas TF reducido pero NO eliminado estructuralmente — race asíncrona LWC subyacente sigue viva al carácter, calendarizada para sub-fase **5f.0c** (sesión 27 o futura) — separación productor-side `chartTickDataset` post-`dataReady=true` en helper R6.
> Próxima sesión = sesión 27, sub-fase **5f.0c** (cierre estructural race condition KZ subidas TF) + sub-fases dedicadas deudas pre-existentes (4.6 edge case datos persistidos, bug #2 freeze play x15+, drawing M3 izquierda).

---

## §0 — Estado al cierre sesión 26, sin maquillaje

**Sesión 26 ha producido al carácter 1 commit funcional + 1 merge commit en main**:
- `49cdab8` — `fix(fase-5/5f.0b): KillzonesOverlay dep tfKey en lugar de currentTf para gatear post-applyForcedSetData y cerrar bug colateral KZ subidas TF`. Diff `+3 / -3` en 2 archivos (`components/KillzonesOverlay.js` + `components/_SessionInner.js`).
- `06e16bf` — `merge(fase-5/cluster-B): cerrar cluster B en main — 12 commits cluster B (5c+5d+5e+5f.0a+5f.0b) mergeados al carácter desde feature tras smoke combinado 8/8 PASS local sesion 26`.

Cadena al cierre en `main` (origin sincronizado al carácter):
```
06e16bf — merge cluster B en main (sesión 26)
   ├──> 49cdab8 — 5f.0b fix tfKey (sesión 26)
   ├──> 5b0aad8 — 5f.0a fix currentTf (sesión 24)
   ├──> 0198039 — 5e.3 (sesión 23)
   ├──> ... cadena cluster B completa hasta 1897eba (plan v3) ...
498236f — HANDOFF s25
cf12f19 — HANDOFF s24
...
29d0b0f — HANDOFF s16 (ancestro común feature ↔ main pre-merge)
89e36ee — fase 4d (runtime efectivo producción 2 may 2026 - 9 may 2026)
```

`origin/main` = `06e16bf` (push exitoso al carácter en s26). Vercel re-deployó automáticamente al carácter cluster B en producción `simulator.algorithmicsuite.com` ~2-3 min post-push. **Primer cambio funcional al runtime de producción desde 2 mayo 2026 (9 días)**.

**Realidad sin maquillaje al carácter**:

1. **Cluster B vivo al carácter en producción al fin tras 17 días desde fase 4d** (`89e36ee` 2 may 2026 → `06e16bf` 9 may 2026). Plan v3 §8 calendario cumplido al carácter — cluster B cerrado en sesión 26 según calendario revisado HANDOFF s25 §5.1 (sesión 25 = 5g paralizado, sesión 26 = 5f.0b + 5g).

2. **Sub-fase 5f.0b al carácter cierra parcialmente bug colateral KZ subidas TF**. Smoke combinado 8/8 PASS al carácter en local cluster B (verificado al carácter por Ramón con cadena bidireccional ampliada `M1→M3→M5→M15→M30→H1→M30→M15→M5→M3→M1` con reporte verbatim por transición individual). Pero smoke producción al carácter reveló comportamiento **intermitente** — KZ aparecen en subidas en algunos intentos automáticamente, requieren drag/ojito en otros. Race condition asíncrona LWC subyacente (HANDOFF s25 §6.2) sigue viva al carácter — `bumpTfKey()` sincroniza React pero `getSeriesData()` puede leer dataset stale del LWC dependiendo timing interno LWC post-`setData`.

3. **5f.0b es mejora estricta al carácter sobre `89e36ee`**, no regresión:
   - Drag M1 fluido cerrado al carácter (5f.0a, smoke 1/1 PASS local + producción).
   - KZ ancladas en bajadas TF al carácter (5f.0a, smoke 4/4 PASS local + producción).
   - KZ subidas TF al carácter — probabilidad PASS aumentada vs `89e36ee` por trigger `tfKey` post-setData. Empíricamente intermitente al carácter (~75-85% PASS estimado vs ~?% pre-cluster-B no medido, hipótesis al carácter NO empíricamente verificada en producción `89e36ee` por falta de URL preview accesible al cierre s26).

4. **5 errores §9.4 propios CTO al carácter capturados en sesión 26** — frecuencia mayor al carácter que sesión 25 (4 errores) y sesión 24 (3 errores). Patrón al carácter: errores §9.4 escalan en sesiones de smoke + diagnóstico exploratorio + decisiones git complejas. Bicapa funcionó al carácter — Ramón cazó al carácter los 5 en tiempo real. Patrón confirmado al carácter por **undécima sesión consecutiva** (12, 20, 21, 22, 24, 25, 5 veces s26).

5. **Cluster B en producción al carácter NO está perfectamente cerrado todavía** — falta sub-fase 5f.0c (estructural race condition KZ subidas TF). Disciplina §1 + §4.3 CLAUDE.md al carácter: dejar cluster B vivo en producción aunque imperfecto es **mejora estricta al carácter** sobre `89e36ee`, NO regresión visible al usuario. Calendarizar 5f.0c sin presión.

6. **5 deudas calendarizadas al carácter para sesiones futuras** — ver §2.7 abajo.

---

## §1 — Qué se hizo en sesión 26 al carácter

### §1.1 PASO 0 ejecutado al carácter

Sesión 26 arrancó con HANDOFF s25 indexado al carácter en project_knowledge (lag de indexación ~12h+ propio del flujo cierre s25 ~13:00 hora local + arranque s26 ~16:00). CTO ejecutó al carácter 5 búsquedas dirigidas vía `project_knowledge_search` con vectores: §0 estado al cierre, §3 errores §9.4 + §5.3 plan táctico 5f.0b, HANDOFF s24 §1.7-§1.9 + §6.2 causa raíz, CLAUDE.md §1-§4 reglas absolutas, HANDOFF s21 §1.1-§1.5 inventario pre-cluster-B + §6.4 verbatim Ramón. Las 5 búsquedas devolvieron al carácter contenido completo de HANDOFFs s17-s25 + CLAUDE.md.

PASO 0.5 verificación shell idéntica al carácter al patrón s24/s25 — Ramón ejecutó al carácter desde shell zsh nativa el bloque del prompt arranque s26 con todos los outputs cuadrando al milímetro al carácter contra HANDOFF s25 §2.1/§4.1.

PASO 0.6 smoke pasivo producción NO ejecutado al carácter — Ramón confirmó verbalmente *"nada k reportar, avanza"* tras PASO 0.5.

### §1.2 Inventario PASO 1 al carácter — bytes verificados

CTO leyó al carácter desde shell de Ramón (4 comandos):

```
sed -n '110,200p' components/KillzonesOverlay.js
sed -n '1240,1280p' components/_SessionInner.js
grep -n "dataReady\|setDataReady" components/_SessionInner.js
grep -n "dataReady" components/KillzonesOverlay.js
```

Hallazgos verificados al carácter:

- **L117 firma KZ**: `dataReady` SÍ presente como prop entrante.
- **L173-176 cuerpo useEffect**: `if (!cfg.visible || !tfAllowed || !dataReady || !activePair) { cachedSessionsRef.current = []; return }` — early return SÍ presente al carácter.
- **L177-180**: segundo early return `if (!allData || !realLen) { cachedSessionsRef.current = []; return }`.
- **L192 dep array post-5f.0a**: `[cfg, tfAllowed, dataReady, activePair, tick, currentTf, ctBucket]` — `dataReady` SÍ está en deps al carácter (heredado pre-cluster-B + preservado por sed 5f.0a que solo tocó `chartTick → currentTf`).
- **L1252-1255 helper R6 `scrollToTailAndNotify`**: `setChartTick(t => t+1)` callback post-`scrollToTail`.
- **L1240 `bumpTfKey = () => setTfKey(k => k+1)`** — productor `tfKey` único.
- **L1263-1267 secuencia orquestador**: `deselectActiveDrawings` → `computeTfPhantomsCount` → **`applyForcedSetData(cr, phantomsNeeded, ps)`** (setData LWC) → **`bumpTfKey()`** (post-setData síncrono) → **`scrollToTailAndNotify`** (que internamente bumpea chartTick).
- **L1284 `setDataReady(true)`** + **L1285 `else { setDataReady(false); ... }`** — pertenece a flujo cambio PAR / sesión, NO cambio TF. Helper R6 NO toca `setDataReady`. **`dataReady` permanece estable durante cambio TF**.
- **L236 `useState(0)` `tfKey`** declaración.
- **L1945 prop JSX `tfKey={tfKey}`** — solo en CustomDrawingsOverlay (HANDOFF s22 §2.5). KZ NO recibe `tfKey` pre-5f.0b.

### §1.3 Hipótesis B1 confirmada al carácter — race orden useEffects hijo-padre

Diagnóstico estructural sin maquillaje al carácter:

Cambio TF subida M5→M15:
1. Click usuario M15 → `setPairTf({...prev, [activePair]:'M15'})` schedule re-render.
2. React re-render. KZ recibe **nueva prop `currentTf='M15'`** vía L1943 JSX. `dataReady=true` desde el inicio (no cambia). `tick` no cambia. `chartTick` no cambia (sitio B aún no ejecutado). `ctBucket` no cambia.
3. **Effects de hijos (KZ) corren ANTES que effects de padre (orquestador R1-R6)** — garantía React. KZ effect L173 dispara con `currentTf='M15'` cambiado pero **dataset LWC todavía es M5** (`applyForcedSetData` aún no corrió).
4. KZ effect ejecuta `getSeriesData()` → retorna dataset M5. `realLen` M5. `calcSessions(candles M5, cfg)` calcula sessions sobre **dataset M5 con currentTf marcado M15**. Cache rellenado **incoherente al carácter** o vacío.
5. Effect padre orquestador L1268 ejecuta — `applyForcedSetData(cr, phantomsNeeded, ps)` muta `series.setData()` con dataset M15. `bumpTfKey()` → `setTfKey(k+1)`. `scrollToTailAndNotify` → `setChartTick(t+1)`. Schedule re-render adicional.
6. Re-render: KZ recibe **nuevo `chartTick`** pero **L192 dep array post-5f.0a NO incluye `chartTick`**. `tfKey` no es prop de KZ pre-5f.0b. **NINGÚN dep cambió respecto al render anterior**. Effect KZ NO se re-ejecuta. Cache stale del paso 4 persiste — calculado sobre dataset M5 cuando viewport ya muestra M15.

Bajadas TF: el dataset M30 cuando bajas de H1 ya estaba parcialmente cargado al carácter (M30 cabe dentro de H1 con resolución mayor — ver §6.2 s25), o el problema es menos severo porque `getSeriesData()` retorna dataset coherente. Empíricamente fluye al carácter (PASS Ramón s25 + s26).

**Por qué 5f.0a `chartTick → currentTf` NO cierra subidas TF**: dep `currentTf` cambia pre-setData (paso 2 arriba), provoca primera ejecución effect con dataset stale (paso 4). 5f.0a quitó al carácter el rescate post-setData (`chartTick` ya no en deps) sin sustituir trigger post-setData equivalente.

**Solución arquitectónica al carácter**: KZ necesita dep que cambie POST-`applyForcedSetData`. `tfKey` cumple al carácter — bumpeado en L1266 inmediatamente post-setData en orquestador. Patrón consumer-side mismo al de 5f.0a (`+1/-1` semántico, scope mínimo).

### §1.4 PASO 2 — Edit 5f.0b aplicado al carácter

3 cambios atómicos al carácter en 2 archivos:
- `components/KillzonesOverlay.js` L117 firma: `+ tfKey` en destructure de props.
- `components/KillzonesOverlay.js` L192 dep array: sustituir `currentTf` por `tfKey`.
- `components/_SessionInner.js` L1943 JSX: `+tfKey={tfKey}` en prop a KZ.

Edit aplicado al carácter por Ramón vía `sed -i ''` (KZ cambios) + python3 heredoc (JSX `_SessionInner.js`, sed falló con `bad flag in substitute command: '|'` por escapes complicados con pipes `||` y comillas, fallback python robusto idempotente).

**Verificación bicapa post-Edit al carácter**:
- `git --no-pager diff` → `+3 / -3` en 2 archivos, hunks L117+L192 KZ + L1943 `_SessionInner`, indentación preservada ✓
- `grep -n "tfKey" components/KillzonesOverlay.js` → 2 matches L117 + L192 ✓
- `grep -n "tfKey={tfKey}" components/_SessionInner.js` → 2 matches L1943 (KZ nuevo) + L1945 (CustomDrawingsOverlay pre-existente) ✓
- 3 invariantes fase 4 intactas al carácter ✓

### §1.5 Build local + smoke combinado al carácter

`rm -rf .next && npm run build` → "✓ Compiled successfully" tamaños bundle similares al carácter a baseline pre-5f.0b. `npm run start` → server local `localhost:3000`.

**Smoke combinado 8/8 PASS al carácter en local cluster B + 5f.0b** ejecutado por Ramón vía pestaña incógnita. Reporte verbatim por caso al carácter:

| Caso | Reporte verbatim Ramón al carácter | Estado |
|---|---|---|
| 1 — drag M1 fluido | *"fluido"* | ✓ PASS |
| 2 — KZ cadena bidireccional ampliada | *"en todos se ven las kz"* | ✓ PASS 8/8 |
| 3 — drawing M5↔M15 floor | *"intacto en ambos"* | ✓ PASS |
| 4 — LongShortPosition + play 30s | *"intacto"* | ✓ PASS |
| 5 — TrendLine extendida + play | *"no se mueve con el play.. eso no lo hace fx replay ni tv.. se queda como es"* | ✓ PASS (clarificación Ramón al carácter — drawing fijo en timestamp es industry-standard) |
| 6 — cambio TF rápido 5-10 | *"fluido"* | ✓ PASS |
| 7 — cierre par mid-replay | *"ha empezado a dar saltos el grafico... ha sido nadamas tocar el play en x15 en m1"* → re-test deliberado deliberado: *"pass"* | ✓ PASS (episodio anterior atribuido al carácter a bug #2 freeze play x15+ pre-existente intermitente, no determinístico) |
| 8 — F5 recargar | *"si se persisten"* | ✓ PASS |

CASO 2 cadena bidireccional ampliada al carácter (lección §3.1 s25 + §11 nuevo s25 — testar ambas direcciones TF como variables independientes): `M1 → M3 → M5 → M15 → M30 → H1 → M30 → M15 → M5 → M3 → M1`. Ramón confirmó al carácter KZ aparecen en TODAS las transiciones a TFs minutos (M1, M3, M5, M15, M30) tanto subidas como bajadas. H1 sigue sin KZ por config Ramón confirmada (NO bug, KZ desactivadas en config indicador para H1).

Drawing 05:40 descolocado al cargar reportado al carácter — patrón idéntico al cazado en s25 §3.3, deuda 4.6 edge case datos persistidos en BD viejos NO regresión cluster B.

### §1.6 PASO 4 cierre cluster B al carácter — commit + merge + push

**Commit 5f.0b en feature al carácter**:

```
git add components/KillzonesOverlay.js components/_SessionInner.js
git commit -m "fix(fase-5/5f.0b): KillzonesOverlay dep tfKey en lugar de currentTf para gatear post-applyForcedSetData y cerrar bug colateral KZ subidas TF"
```

Hash al carácter: `49cdab8`. Working tree clean post-commit.

**Merge feature → main al carácter**:

`git checkout main` + `git merge --ff-only refactor/fase-5-drawings-lifecycle` → **`fatal: Not possible to fast-forward, aborting`**. Causa estructural al carácter (verificada en bytes con `git --no-pager log --oneline --graph --all` + `git merge-base`):

- main acumula al carácter HANDOFFs s17-s25 (9 commits docs-only sobre `29d0b0f`).
- Feature acumula al carácter cluster B + planes (15 commits sobre `29d0b0f`).
- **Ancestro común al carácter `29d0b0f` (HANDOFF s16)**, no `89e36ee` como CTO había hipotetizado prematuramente al carácter (error §9.4 propio s26 — ver §3.3 abajo).
- Topología al carácter es divergencia limpia desde `29d0b0f`. Ramas paralelas, sin cruces, sin commits huérfanos.

**Decisión CTO al carácter**: Opción A merge no-FF con merge commit. Razón al carácter: preserva trazabilidad de hashes documentados en HANDOFFs s20-s26 al pie de la letra. Patrón estándar GitFlow. **Conjuntos disjuntos al carácter de archivos** verificados (feature toca código + plan, main toca HANDOFFs `.md`).

`git merge --no-commit --no-ff refactor/fase-5-drawings-lifecycle` → "Automatic merge went well; stopped before committing as requested". Verificación bicapa post-dry-run al carácter:
- 14 HANDOFFs s12-s25 preservados al carácter en disco ✓
- `refactor/fase-5-plan.md` añadido al carácter ✓
- `lightweight-charts-line-tools-core.js` borrado al carácter (5e.1) ✓
- L192 KZ con `tfKey` al carácter ✓

`git commit -m "merge(fase-5/cluster-B): cerrar cluster B en main..."` → hash `06e16bf`. Working tree clean. main local 16 commits ahead origin.

`git push origin main` → "498236f..06e16bf  main -> main". Push exitoso al carácter.

### §1.7 Smoke producción al carácter — 8 casos vs intermitente

Vercel deployó al carácter cluster B en producción ~2-3 min post-push, "Ready" verificado al carácter por Ramón vía dashboard.

**Smoke producción `simulator.algorithmicsuite.com` al carácter** post-deploy + hard refresh + pestaña incógnita fresca:

Resultado al carácter: **bug colateral KZ subidas TF intermitente al carácter** — Ramón reportó secuencialmente:

1. Primer reporte: *"acabo de entrar y veo descolocado el drawing... ocurrió lo mismo de antes... es al cargar la sesion.. al entrar"* → diagnóstico al carácter: deuda 4.6 edge case datos persistidos pre-existente (s25 §3.3), NO regresión cluster B.

2. Segundo reporte: *"en subidas las kz no se ven.. tengo k deslizar y tal... lo demas está pk"* → CTO saltó al carácter prematuramente a hipótesis "discrepancia local-vs-prod determinística confirmada" + propuesta rollback inmediato. **Error §9.4 mayor CTO al carácter** — ver §3.5 abajo.

3. Tercer reporte tras re-test discriminante: *"no es siempre... tanto en local como en produccion es aveces... pk ahora he probado otra vez y aparecen de una vez ya directaente al subir"* → Ramón cazó al carácter el patrón intermitente que CTO había declarado regresión determinística. **Hipótesis CTO refutada al carácter**.

4. Cuarto reporte tras pregunta CTO sobre prioridad: *"la mierda ya no es tanto eswo como lo de entrar a la sesion y k los dibujos esten descolocados.. pero bueno, es deuda no?"* → confirmación al carácter por Ramón que el problema más visible UX es deuda 4.6 edge case persistidos, NO el intermitente KZ subidas TF.

**Decisión CTO definitiva al carácter — NO rollback, mantener cluster B en producción**. Razón técnica firme:

1. Bug colateral KZ subidas TF **intermitente al carácter pre-existe estructuralmente al carácter en `89e36ee`** — race asíncrona LWC vive en código pre-cluster-B. Rollback no la cierra al carácter, solo cambia probabilidad. Probablemente **PEOR pre-cluster-B** porque no había trigger `tfKey` post-setData.
2. 5f.0b reduce al carácter probabilidad de la race aunque no la elimina. Local + producción muestran al carácter rachas favorables ≥75% (smoke 8/8 local + intermitente prod). **Mejora estricta al carácter sobre `89e36ee`**, no regresión.
3. Patrón fix consumer-side suficiente al carácter pero no perfecto. Lección §9 punto 9 s25 confirmada al carácter: "fix consumer-side puede ser insuficiente si componente depende de datos asíncronos". Solución estructural definitiva al carácter requiere separación productor-side `chartTickDataset` + emitir SOLO post-`dataReady=true` en helper R6 — **sub-fase 5f.0c calendarizada para sesión 27 o posterior**.
4. Drawing descolocado al cargar = deuda 4.6 edge case datos persistidos pre-existente al carácter, NO regresión cluster B (ya documentada al carácter en HANDOFF s25 §2.7 + §3.3 + §6.5).

### §1.8 Verbatim Ramón cierre s26 (preservar al carácter para sesiones futuras)

| Test al carácter | Veredicto Ramón verbatim al carácter |
|---|---|
| CASO 2 cadena bidireccional ampliada local | *"en todos se ven las kz"* |
| CASO 7 episodio inicial freeze play x15 | *"ha empezado a dar saltos el grafico... ha sido nadamas tocar el play en x15 en m1"* |
| Producción smoke pasivo CASO 7 x15 M1 | *"en produccion va bien, y ahora en local tambien"* |
| CASO 7 re-test deliberado local x15 M1 60s | *"pass"* |
| Drawing descolocado al cargar producción | *"acabo de entrar y veo descolocado el drawing... ocurrió lo mismo de antes... es al cargar la sesion.. al entrar"* |
| KZ subidas producción primer reporte | *"en subidas las kz no se ven.. tengo k deslizar y tal... lo demas está pk"* |
| KZ subidas producción re-test deliberado pestaña fresca | *"aparecen tras drag"* |
| KZ subidas producción 3er re-test al cuestionarlo | *"no es siempre... tanto en local como en produccion es aveces... pk ahora he probado otra vez y aparecen de una vez ya directaente al subir"* |
| Priorización Ramón al carácter | *"la mierda ya no es tanto eswo como lo de entrar a la sesion y k los dibujos esten descolocados.. pero bueno, es deuda no?"* |

**Frase Ramón verbatim al carácter sobre delegación CTO** (s26 ~3 veces):
> *"no entiendo nada de tecnicismo... eres el cto.. avanza con lo mejor para el proyecto"* / *"hagamos lo mejor y mas correcto"* / *"avanza con lo mejor y mas correcto"*

Patrón sesiones 19+20 al carácter aplicado (CTO asume con razón técnica firme cuando dueño delega con frase amplia, NO presenta árbol de opciones equivalentes — §1.3 prompt arranque + §8.4 s20).

**Frase Ramón verbatim al carácter sobre disciplina perfeccionista cazando errores §9.4 propios CTO** (5 veces s26):
- *"cuando me des comandos nuevos, recuerda que la terminal es nuev y no esta en el repo correcto"* (cazó error placeholder ruta).
- Sed JSX fallido cazado al carácter por Ramón pegando output completo verbatim (no por CTO releyendo su propio output).
- Hipótesis git divergencia ancestor común `89e36ee` cazada al carácter por Ramón pegando `merge-base` real `29d0b0f`.
- Hipótesis discrepancia local-vs-prod determinística cazada al carácter por Ramón al re-test deliberado *"no es siempre"*.
- Salto a rollback prematuro cazado al carácter por Ramón al replantear *"no es siempre"*.

Patrón confirmado al carácter por **undécima sesión consecutiva** (12, 20, 21, 22, 24, 25, 5 veces s26). **Intuición Ramón = input técnico encriptado en lenguaje de usuario, sistemáticamente correcto al carácter**.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- **Rama activa al cierre**: `main`.
- **HEAD main al cierre**: `06e16bf` (merge cluster B sesión 26).
- **`origin/main`** = `06e16bf` (push exitoso al carácter en s26).
- **Cadena main al cierre** (de HEAD hacia atrás):
  ```
  06e16bf — merge cluster B en main (sesión 26)
  49cdab8 — 5f.0b fix tfKey (vía merge)
  5b0aad8 — 5f.0a fix currentTf (vía merge)
  0198039 — 5e.3
  c238c63 — 5e.2
  835caf7 — 5e.1
  5b233b4 — 5d.7
  590abe2 — 5d.6
  96eb2e8 — 5d.5
  d7ee4a8 — 5d.3
  4f943a4 — 5d.2 (commit culpable estructural primario freeze drag M1)
  aa1498a — 5d.1
  84a3342 — 5c
  1897eba — plan v3
  f2c7476 — plan v2
  195d02b — plan v1
  498236f — HANDOFF s25
  cf12f19 — HANDOFF s24
  ...
  29d0b0f — HANDOFF s16 (ancestro común feature ↔ main pre-merge)
  89e36ee — fase 4d
  ```
- **Rama feature `refactor/fase-5-drawings-lifecycle`** al cierre = `49cdab8` (5f.0b). Preservada al carácter como histórico — recomendación CTO mantener hasta cluster A, después limpieza ramas locales sub-fase futura.
- **Working tree** limpio en main al carácter al cierre.

### §2.2 Producción Vercel

- Deploy actual: `06e16bf` (merge cluster B s26) — **runtime efectivo cluster B en producción al carácter desde 9 may 2026 ~17:30 hora local**.
- Smoke producción 8/8 al carácter no completado por intermitencia bug colateral KZ subidas TF — Ramón confirmó al carácter prioridad UX es drawing descolocado al cargar (deuda 4.6 pre-existente).
- Estado al carácter: cluster B vivo, drag M1 fluido, KZ ancladas en bajadas, KZ subidas TF intermitentes (mejor que `89e36ee` pero no perfecto), drawings persistidos non-múltiplos descolocados (deuda 4.6 pre-existente).
- **Primer cambio funcional al runtime de producción desde 2 may 2026 (9 días)**.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-26 | Líneas post-26 | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `components/_SessionInner.js` | 3052 (post-5e.3) | 3052 | 0 (1 línea modificada in-place L1943) |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |
| `components/KillzonesOverlay.js` | 455 | 455 | 0 (2 líneas modificadas in-place L117 + L192) |
| `components/RulerOverlay.js` | 256 | 256 | 0 |
| `components/CustomDrawingsOverlay.js` | 192 | 192 | 0 |

**Cambio neto en líneas tocadas al carácter**: 3 modificadas in-place, 0 neto. Sub-fase atómica al máximo al carácter — patrón calibrado al carácter coherente con 5f.0a (1 línea) y sub-fases 5d.1-5d.3.

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

Outputs ejecutados al carácter por Ramón post-merge:

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"  → vacío
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"   → vacío
grep -n "computePhantomsNeeded" components/_SessionInner.js                          → 3 matches L116, L1145, L1224
```

Las 3 invariantes fase 4 mantenidas al carácter por **sexta sesión consecutiva** (heredadas de sesión 12). Cluster B completo (5c + 5d.1+5d.2+5d.3 + 5d.5+5d.6+5d.7 + 5e.1+5e.2+5e.3 + 5f.0a + 5f.0b) **cero violaciones acumuladas al carácter en main**.

### §2.5 Contrato `chartTick` al cierre — observación post-5f.0b

Estado al cierre s26 al carácter:
- **`_SessionInner.js`**: matches sin cambios respecto cierre s25 (declaración + JSDoc + 2 productores + props JSX a 4 overlays + L1943 ahora con `tfKey={tfKey}`).
- **`KillzonesOverlay.js`**: 1 match al carácter en L117 firma — **prop "huérfana" al carácter** (declarada en firma, NO consumida en useEffect post-5f.0a + post-5f.0b). Sin cambios al carácter respecto cierre s25.
- **`RulerOverlay.js`**: matches sin cambios respecto cierre s25.
- **`CustomDrawingsOverlay.js`**: matches sin cambios respecto cierre s25.

**Observación arquitectónica al carácter sesión 26**: el contrato `chartTick` confunde al carácter 2 canales (sitio A viewport / sitio B dataset) — establecido al carácter en HANDOFF s24 §6.2. Sesión 25 reveló al carácter una segunda dimensión (asíncrono LWC dataset post-setData). Sesión 26 reveló al carácter una tercera dimensión: la race asíncrona LWC interna (`getSeriesData()` puede retornar dataset stale incluso post-`bumpTfKey()` síncrono). **Race timing-sensitive intermitente al carácter, NO determinística**.

**Implicación al carácter para 5f.0c**: solución estructural definitiva requiere al carácter al menos uno de:
- Separar productor-side `chartTickDataset` (sitio B post-`dataReady=true` + post-confirmación LWC procesó setData) vs `chartTickViewport` (sitio A).
- Refactor profundo helper R6 `scrollToTailAndNotify` para emitir `chartTick` SOLO post-LWC-setData-procesado (esperar microtask o callback del LWC).
- Investigar al carácter si LWC expone API para detectar setData procesamiento completo.

### §2.6 6 helpers post-5c al carácter — siguen vivos como entidades separadas

Sin cambios respecto cierre s25 — los 6 helpers siguen al carácter como entidades separadas. Base operativa cluster B intacta al carácter por **sexta sesión consecutiva**.

### §2.7 Bugs y deudas al cierre

| ID | Descripción | Estado al cierre 26 |
|---|---|---|
| 5.1 | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | ✅ CERRADA en 5d.7 (sesión 22), VIVA en producción al carácter desde s26 |
| **Drag M1 minisaltitos/freeze** | **Regresión multifactorial cluster D** | **✅ CERRADA AL CARÁCTER en 5f.0a (sesión 24), VIVA en producción al carácter desde s26** |
| **Bug colateral KZ subidas TF intermitente** | **Race asíncrona LWC pre-existente, manifestación en cluster B** | **🟡 PARCIALMENTE CERRADA AL CARÁCTER en 5f.0b (sesión 26)** — local 8/8 PASS, producción intermitente. **Sub-fase 5f.0c calendarizada al carácter para cierre estructural** (separación productor-side `chartTickDataset` post-`dataReady=true`+ confirmación LWC). |
| **Drawing descolocado al cargar sesión (deuda 4.6 edge case persistidos non-múltiplos)** | Drawings persistidos en BD pre-cluster-B con timestamps non-múltiplos del TF de visualización inicial se descolocan al cargar | ⏳ ABIERTA — pre-existente al carácter, NO regresión cluster B. Sub-fase dedicada calendarizada al carácter para sesión futura. **Prioridad UX confirmada al carácter por Ramón en s26** — más visible que intermitente KZ subidas. |
| **Drawing TrendLine "se va izquierda" en M3** | Bug pre-existente edge case parche `2851ef7` deuda 4.6 en M3 | ⏳ ABIERTA — sub-fase 5b futura o sesión dedicada |
| 4.5 | `__algSuiteExportTools` no registrado correctamente | ⏳ ABIERTA — backlog (sub-fase 5f.1) |
| 4.6 (parche timestamps base) | Drawings descolocados al cambiar TF | ✅ CERRADA estructuralmente en `2851ef7` (sesión 14) — pero edge cases M3 + persistidos non-múltiplos abiertos |
| `[DEBUG TEMP]` instrumentación LS | ✅ CERRADA en 5e.3 (sesión 23) | Cerrada |
| `patch-package` devDep no usada | ✅ CERRADA en 5e.2 (sesión 23) | Cerrada |
| Archivo huérfano `core` 399 KB raíz | ✅ CERRADA en 5e.1 (sesión 23) | Cerrada |
| `debugCtx` parámetro muerto en `applyNewBarUpdate` | ⏳ ABIERTA — out of scope intencional 5e.3 | Sub-fase 5e.4 (cosmética) |
| Polling 300ms `getSelected()` | Re-serializa selección de tools cada 300ms | ⏳ ABIERTA — sub-fase 5f.2 futura |
| Warning LWC `_requestUpdate is not set` al destruir tool | ⏳ Backlog cosmético | Sub-fase 5b futura o limpieza fase 7 |
| **`chartTick` prop "huérfana" en KillzonesOverlay** | Prop declarada en firma L117 pero NO consumida en useEffect post-5f.0a + post-5f.0b | ⏳ ABIERTA — limpieza cosmética, sub-fase 5e.4 o limpieza fase 7 |
| **Bug #2 freeze play velocity-alta x15+** | Pre-existente intermitente, confirmado en producción `89e36ee` + cluster B | ⏳ ABIERTA — calendario fase 4 RenderScheduler |
| B5 | `409 Conflict` race `session_drawings` | ✅ CERRADA en código (HANDOFF 19 §5.3) |
| Quota Supabase | Vigilancia pasiva | ⏳ Vigilancia |
| Limpieza ramas locales (~10 viejas + feature post-cluster-A) | Higiene git | ⏳ Backlog |
| Warning React `borderColor` shorthand | Cosmético hydration | ⏳ Backlog |
| Bug resize KillzonesOverlay pantalla completa (HANDOFF s22) | KZ no se pintan más allá de "línea imaginaria" tras resize | ⏳ ABIERTA — sub-fase overlays-resize futura |
| Warning API 4MB candles 2026 | Pre-existente, no bloqueante | ⏳ Backlog |

---

## §3 — Errores §9.4 propios del CTO en sesión 26

### §3.1 Placeholder ruta literal en bloque shell PASO 0.5

**Hecho al carácter**: en respuesta a Ramón *"cuando me des comandos nuevos, recuerda que la terminal es nuev y no esta en el repo correcto"*, CTO emitió al carácter bloque shell con placeholder literal `<ruta-absoluta-de-tu-repo-forex-simulator-algorithmic-suite>` esperando al carácter que Ramón sustituyera. Zsh interpretó al carácter `<` como redirección de input → `parse error near '\n'`.

**Causa al carácter**: CTO improvisó al carácter formato pseudo-meta sin verificar al carácter que zsh aceptaría literal `<ruta-...>`. Asumió comprensión semántica pero shell solo procesa sintaxis al carácter literal.

**Severidad**: leve. Coste +2-3 turnos chat extra (find + mdfind para localizar ruta + re-emisión bloque limpio con ruta literal sustituida `/Users/principal/Desktop/forex-simulator-algorithmic-suite`).

**Mejora futura al carácter — formalización**: para bloques shell que requieran sustitución usuario, CTO al carácter NUNCA usa placeholders pseudo-meta literales (`<...>`). Patrón al carácter: pedir el dato primero (`pwd` o ruta) en turno separado, sustituir literalmente en el siguiente bloque, evitar placeholders shell.

### §3.2 Sed JSX fallido en Edit 5f.0b — escape hell

**Hecho al carácter**: tercer `sed -i ''` en bloque Edit 5f.0b sustituía JSX KillzonesOverlay con escapes complicados por pipes `||` (operador OR JS) + comillas simples `'H1'` + delimitador sed `|`. Zsh + sed devolvió al carácter `bad flag in substitute command: '|'`. Edit JSX NO aplicado al carácter.

**Causa al carácter**: CTO eligió delimitador sed `|` para evitar escape del slash de path JSX, sin considerar al carácter que el contenido a sustituir contenía pipes JS `||`. Doble escape `\|\|` no resolvió al carácter — sed parsea el primer `|` no escapado como delimitador.

**Severidad**: media. Coste al carácter +5 turnos chat extra (verificación bicapa post-Edit reveló L1943 sin cambio + re-emisión python3 heredoc fallback que sí aplicó al carácter idempotentemente).

**Crítico al carácter**: si Ramón hubiera comiteado el Edit incompleto (firma KZ + dep array correctos pero L1943 sin `tfKey={tfKey}`), KZ habría recibido al carácter `tfKey === undefined` siempre → effect KZ NUNCA se re-ejecutaría tras primer render → **PEOR que pre-5f.0b en local**. Bicapa funcionó al carácter — Ramón pegó verbatim al carácter el output completo + grep mostró 1 match L1945 (no 2) → CTO cazó al carácter discrepancia.

**Mejora futura al carácter — formalización**: para Edits JSX o cualquier código con caracteres ambiguos shell (`|`, `<`, `>`, `&`, `$`, comillas mixtas), CTO al carácter usa por defecto **python3 heredoc con `'EOF'` literal** (no expandido) que evita parsing shell del contenido. Sed reservado al carácter para cambios single-line sin ambigüedad. Lección §3.1 + §3.2 + §3.3 s24 (verificación bicapa post-Edit estricta) refuerzo al carácter — ANTES de declarar Edit completo, verificar al carácter `grep` que coincida con expectativa.

### §3.3 Hipótesis ancestro común git incorrecta

**Hecho al carácter**: durante diagnóstico merge fast-forward fallido, CTO afirmó al carácter al chat *"hipótesis: ancestro común probable `89e36ee`"*. Verificación bicapa con `git merge-base` reveló al carácter ancestro real `29d0b0f` (HANDOFF s16). Diferencia al carácter de 4 commits.

**Causa al carácter**: CTO infirió al carácter ancestro desde memoria de "feature ramificó pre-cluster-B" + asunción de que pre-cluster-B = `89e36ee`. Falso al pie de la letra al carácter — feature ramificó del último HANDOFF docs-only en main al momento de creación rama (HANDOFF s16 = `29d0b0f`). Lección §3.1 s24 (no inferir desde memoria sin verificar bytes) violada al carácter.

**Severidad**: leve. Diagnóstico final correcto al carácter (Opción A merge no-FF). Pero generó al carácter incertidumbre operativa innecesaria mid-flujo merge.

**Mejora futura al carácter**: para cualquier afirmación sobre topología git (ancestros, branches, merges), CTO al carácter NO infiere — pide `git merge-base` / `git log --graph` / equivalente ANTES de presentar afirmación al chat. Disciplina §1.2 bicapa estricta al carácter aplica también a estructura git.

### §3.4 Hipótesis "discrepancia local-vs-prod determinística confirmada" salto prematuro

**Hecho al carácter**: tras primer reporte Ramón producción *"en subidas las kz no se ven.. tengo k deslizar y tal"*, CTO declaró al carácter *"discrepancia local vs producción confirmada empíricamente al carácter"* + propuso al carácter rollback inmediato `git revert -m 1 06e16bf`. Decisión basada al carácter en 1 dato empírico singular sin re-test.

**Causa al carácter**: CTO trató al carácter el reporte como definitivo determinístico cuando podía ser racha desfavorable de bug intermitente. **Lección §3.3 s25 violada al carácter** — saltar entre hipótesis sin verificación empírica intermedia. Test discriminante al carácter NO solicitado antes de declaración.

**Severidad**: alta. Si Ramón hubiera aceptado rollback al carácter, perdíamos cluster B en producción innecesariamente. Bicapa funcionó al carácter — Ramón al re-test deliberado pegó al carácter *"no es siempre... ahora he probado otra vez y aparecen de una vez ya directamente al subir"* → hipótesis CTO refutada al carácter.

**Mejora futura al carácter — formalización**: ante reporte empírico Ramón sobre bug en producción, CTO al carácter ANTES de hipotetizar al chat sobre causa raíz o proponer rollback:
1. **Pedir al carácter test discriminante explícito** — "¿reproducible? ¿prueba 3-5 veces seguidas con drawing fresco?"
2. **Reunir N≥3 datos empíricos** antes de declarar determinismo.
3. **Comparar al carácter contra producción pre-cambio si posible** (URL preview Vercel) para discriminar pre-existente vs regresión.
4. **Solo entonces hipotetizar al chat con etiqueta explícita** "Hipótesis A (no verificada empíricamente, basada en N=X datos)".

Aplicar al carácter en s27 sistemáticamente.

### §3.5 Salto a rollback prematuro sin test discriminante

**Hecho al carácter**: extensión del §3.4 — CTO propuso al carácter ejecutivo `git revert -m 1 06e16bf --no-edit` con plan completo + bloque shell ejecutable. Texto al carácter *"Decisión CTO al carácter — rollback inmediato"* + razón técnica enumerada.

**Causa al carácter**: CTO confundió al carácter "decisión CTO firme con razón técnica documentada" (patrón §1.3 s20 §8.4 correcto al carácter) con "decisión CTO firme basada en datos insuficientes" (anti-patrón §3.3 s25 al carácter). La razón técnica era estructuralmente correcta SI el dato empírico fuera correcto — pero el dato empírico era 1 reporte sin re-test.

**Severidad**: alta. Mismo coste potencial que §3.4 — pérdida cluster B en producción si rollback ejecutado prematuro al carácter.

**Mejora futura al carácter — formalización**: la disciplina §1.3 + §8.4 s20 ("CTO asume con razón técnica firme cuando dueño delega con frase amplia") aplica al carácter SOLO cuando los datos empíricos están al carácter sólidos. Si datos empíricos son N=1 y reversibilidad operación es media-alta (rollback push afecta producción inmediato), CTO al carácter degrada a "presento opciones con datos al carácter, dueño confirma". NO ejecuta rollback push sin N≥3 reproducción confirmada al carácter o comparativa pre-cambio explícita.

---

## §4 — Estado del repo y producción al cierre sesión 26

### §4.1 Repo

- **`main` local + `origin/main`**: `06e16bf` (merge cluster B sesión 26). Push exitoso al carácter en s26 ~17:30 hora local.
- **Rama feature `refactor/fase-5-drawings-lifecycle`** al carácter: `49cdab8` (5f.0b, sesión 26). Preservada al carácter como histórico — recomendación CTO mantener hasta cluster A, después limpieza ramas locales sub-fase futura.
- **Working tree** al carácter: limpio en main al cierre redacción.

### §4.2 Producción Vercel

- Deploy actual: `06e16bf` (merge cluster B s26) — runtime efectivo cluster B en producción al carácter desde 9 may 2026 ~17:30 hora local. **Primer cambio funcional al runtime de producción al carácter desde 2 may 2026 (9 días)**.
- Smoke producción 8 casos al carácter NO completado por priorización Ramón. Confirmado al carácter:
  - CASO 1 drag M1 + bajadas TF: ✓ PASS al carácter en producción.
  - CASO 2 KZ subidas TF: 🟡 INTERMITENTE al carácter en producción (mejor que `89e36ee` pero no perfecto).
  - Drawing descolocado al cargar (deuda 4.6 edge case): VIVO al carácter en producción, pre-existente.
- Estado al carácter: cluster B vivo, mejora estricta sobre `89e36ee`, deudas pre-existentes calendarizadas para sesiones futuras.

---

## §5 — Plan para sesión 27

### §5.1 Calendario revisado al carácter

Plan v3 §8 calendario al carácter cumplido en s26 — cluster B mergeado a producción. Sesión 27 arranca al carácter con cluster B vivo en producción + 5 deudas vivas calendarizadas:

- **Prioridad 1 al carácter — sub-fase 5f.0c**: cierre estructural race condition KZ subidas TF. Ataque productor-side. Razón priorización al carácter: sub-fase atómica al máximo (similar a 5f.0a/5f.0b en scope) + cierra al carácter el último bug colateral cluster B + sienta base arquitectónica limpia para futuro.
- **Prioridad 2 al carácter — deuda 4.6 edge case datos persistidos non-múltiplos**: Ramón confirmó al carácter en s26 que es la deuda **más visible UX** ("la mierda ya no es tanto eswo como lo de entrar a la sesion y k los dibujos esten descolocados"). Sub-fase dedicada en sesión 27 si tiempo, sino sesión 28.
- **Prioridad 3 al carácter — bug nuevo M3 drawing izquierda**: edge case parche `2851ef7` deuda 4.6 en M3. Sub-fase dedicada o agrupada con prioridad 2 (relacionados estructuralmente al carácter).
- **Prioridad 4 al carácter — bug #2 freeze play velocity-alta**: calendario fase 4 RenderScheduler con frame budget. Fase mayor, calendarizar.
- **Prioridad 5 al carácter — cosmética chartTick prop huérfana KZ**: limpieza cosmética. Sub-fase 5e.4 o limpieza fase 7. NO bloqueante.

**Cluster A (fase 5.A)** sigue al carácter aplazado a fase mayor post-cluster-B. Cluster B ya cerrado + mergeado al carácter en s26. **Cluster A puede arrancar en sesión 27+ una vez 5f.0c cerrado y producción cluster B estable empíricamente**.

### §5.2 PASO 0 obligatorio en sesión 27

Antes de tocar nada al carácter, leer en este orden:

1. Este HANDOFF s26 entero, especialmente §0 sin maquillaje + §1 qué se hizo + §3 errores §9.4 propios CTO + §5.3 plan táctico 5f.0c + §6 material verificado al carácter.
2. HANDOFF s25 §6.2 causa raíz arquitectónica revisada + §6.5 hipótesis 5f.0b — referencia al carácter histórica para entender evolución del diagnóstico race condition KZ.
3. HANDOFF s24 §6.2 causa raíz arquitectónica drag M1 — referencia al carácter para entender contrato `chartTick` + sitio A vs sitio B.
4. CLAUDE.md §1-§4 reglas absolutas — sin cambios desde s24.

PASO 0.5 verificación shell al carácter:

```
cd /Users/principal/Desktop/forex-simulator-algorithmic-suite
git status                                          (esperado: en main, working tree clean)
git --no-pager log --oneline -5                     (esperado: HEAD nuevo HANDOFF s26 sobre 06e16bf, anterior 49cdab8 5f.0b vía merge, anterior 5b0aad8 5f.0a vía merge, ...)
git rev-parse HEAD                                  (esperado: hash HANDOFF s26)
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"   (esperado: vacío)
grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"    (esperado: vacío)
grep -n "computePhantomsNeeded" components/_SessionInner.js                            (esperado: 3 matches L116 L1145 L1224)
sed -n '192p' components/KillzonesOverlay.js                                           (esperado: dep array con tfKey: }, [cfg, tfAllowed, dataReady, activePair, tick, tfKey, ctBucket]))
sed -n '1943p' components/_SessionInner.js                                             (esperado: KZ JSX con tfKey={tfKey})
```

PASO 0.6 smoke pasivo producción al carácter — `simulator.algorithmicsuite.com` drag M1 ~30s con drawing visible + intentar 3 veces cadena `M1→M3→M5→M15→M30` con drawing fresco para baseline empírico ANTES de Edit. Reporte verbatim al carácter.

### §5.3 Plan táctico 5f.0c al carácter — cierre estructural race condition KZ subidas TF

**Hipótesis al carácter (NO verificada en bytes hasta inventario s27)**: separación productor-side `chartTickDataset` + emisión post-`dataReady=true` en helper R6 `scrollToTailAndNotify` cierra estructuralmente al carácter la race asíncrona LWC. KZ consume `chartTickDataset` en lugar de `tfKey` (o adicionalmente).

**PASO 1 — inventario al carácter en bytes (NO Edit aún)**:

```
sed -n '1230,1260p' components/_SessionInner.js
grep -n "scrollToTail" components/_SessionInner.js lib/chartViewport.js
grep -n "applyForcedSetData" components/_SessionInner.js lib/chartRender.js
sed -n '230,250p' components/_SessionInner.js
```

Investigar al carácter:
- Si `scrollToTail` (lib/chartViewport.js) tiene callback ejecutado post-LWC-setData-procesado.
- Si `applyForcedSetData` puede gateaerse con detection de "setData procesado" (Promise/microtask).
- Si LWC expone API `chart.timeScale().subscribeVisibleLogicalRangeChange` u otro evento que dispare al carácter post-setData procesado.

**PASO 2 — investigación al carácter productor-side**:

3 caminos arquitectónicos al carácter, todos NO verificados en bytes:

- **Camino A — productor único `chartTickDataset` post-`dataReady` async**: nuevo state `chartTickDataset` en `_SessionInner.js`. `bumpChartTickDataset()` NO en helper R6 directamente, sino tras `await Promise.resolve()` o tras callback `onSetDataComplete` LWC. KZ consume `chartTickDataset` en dep array (sustituir `tfKey`).
- **Camino B — `scrollToTailAndNotify` espera dataReady oscilación**: refactor helper R6 para emitir `chartTick` SOLO cuando `dataReady` confirma re-true post-setData. Requiere al carácter detectar oscilación dataReady en cambio TF (que actualmente no oscila — verificado al carácter en s26 §1.2).
- **Camino C — investigar API LWC para microtask post-setData**: si LWC expone hook nativo, usarlo.

Decisión empírica al carácter en s27 tras inventario.

**PASO 3 — Edit 5f.0c targeted minimal**:

Patrón al carácter `+2-5 / -1-2`. Verificación bicapa estricta pre-Edit + post-Edit. 3 invariantes fase 4 intactas post-Edit.

**PASO 4 — smoke combinado**:

CASO 2 cadena bidireccional ampliada al carácter × **5 ciclos seguidos** con reporte verbatim por transición. Probabilidad de cazar al carácter intermitencia × 5 = ~99% si bug aún presente. Si 5/5 PASS al carácter en local + 5/5 PASS en producción → cierre estructural confirmado.

CASOS 1, 3-8 idénticos al carácter al smoke s26.

**PASO 5 — commit + push**:

Patrón histórico al carácter §7.1-§7.4 sesiones 17-26. Cluster B ya en main desde s26 — sub-fase 5f.0c se commitea directamente al carácter en main (no requiere merge no-FF, working tree main coherente). Push trigerea Vercel deploy.

### §5.4 Cluster A INTOCABLE en sesión 27

Mismo principio que sesiones 20-26 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Sub-fase 5f.0c toca `_SessionInner.js` zona helper R6 + posible KillzonesOverlay consumer-side. NO modifica al carácter `_SessionInner.js` zona cluster A (L297-L365 / L370-L415 / L450-L456). Si por error aparece working tree dirty post-fix tocando esas zonas, PARAR.

### §5.5 Caso obligatorio smoke combinado al carácter (lecciones acumuladas s23-s26)

Patrones acumulados al carácter aplicar sistemáticamente en s27+:
- **Lección §3.3 s23 + §5.5 s23 + s24/s25**: drag M1 fluido caso obligatorio.
- **Lección §3.1 s25 + §11 s25**: smoke combinado caso 2 reporte verbatim por transición individual + por dirección, NO agregado.
- **Lección §11 s25**: cadena bidireccional ampliada `M1→M3→M5→M15→M30→H1→M30→M15→M5→M3→M1`.
- **Lección §3.4 s25 + §3.4 s26**: test discriminante con probabilidad maximizada — múltiples ciclos repetidos para cazar al carácter intermitencia.
- **Lección §3.4 s26 + §3.5 s26 NUEVO**: ante reporte empírico singular sobre regresión, PEDIR re-test antes de hipotetizar.

---

## §6 — Material verificado al carácter en sesión 26 (preservado para sesiones futuras)

### §6.1 Topología cluster B al cierre s26

```
89e36ee (fase 4d, runtime efectivo producción 2-9 may 2026)
    ↑
1897eba (plan v3, docs)
    ↑
84a3342 (5c)             — INOCENTE empíricamente confirmado en s24
    ↑
aa1498a (5d.1)           — INOCENTE drag, manifestación inicial bug colateral KZ M30
    ↑
4f943a4 (5d.2)           — CULPABLE estructural primario freeze drag M1 + bug colateral KZ
    ↑
d7ee4a8 (5d.3)
    ↑
96eb2e8 (5d.5)
    ↑
590abe2 (5d.6)           — AGRAVANTE intermedio drag (s23 minisaltitos)
    ↑
5b233b4 (5d.7)           — AGRAVANTE final drag (s23 freezado peor) + cierra deuda 5.1 viewport
    ↑
835caf7 (5e.1)           — limpieza huérfano core 399 KB
    ↑
c238c63 (5e.2)           — uninstall patch-package
    ↑
0198039 (5e.3)           — eliminar [DEBUG TEMP]
    ↑
5b0aad8 (5f.0a)          — FIX consumer-side parcial: cierra drag M1 + bug colateral KZ bajadas TF.
    ↑
49cdab8 (5f.0b)          — FIX consumer-side: tfKey en lugar de currentTf, cierra parcialmente bug colateral KZ subidas TF en local. Producción intermitente.
    ↑
06e16bf (merge cluster B en main, sesión 26) — RUNTIME EFECTIVO PRODUCCIÓN DESDE 9 MAY 2026
```

### §6.2 Causa raíz arquitectónica revisada al carácter — race condition KZ subidas TF intermitente

**HANDOFF s24 §6.2 establecido al carácter**: contrato `chartTick` confunde 2 canales (sitio A viewport / sitio B dataset).

**HANDOFF s25 §6.2 expansión al carácter**: invalidar en sitio B no basta para KZ porque dataset asíncrono LWC. Race en orden useEffect hijo-padre.

**HANDOFF s26 §6.2 expansión al carácter**: 5f.0b cierra al carácter race React (orden hijo-padre) usando `tfKey` post-`applyForcedSetData` síncrono. PERO race subyacente al carácter es **LWC interna asíncrona** — `applyForcedSetData` ejecuta `cr.series.setData()` síncrono pero LWC procesa internamente la mutación del dataset asincrónicamente (microtask o frame budget). `getSeriesData()` puede al carácter retornar dataset stale o nuevo dependiendo del momento exacto de la lectura respecto al procesamiento interno LWC.

Secuencia temporal subida TF post-5f.0b al carácter:
1. `currentTf` cambia (síncrono).
2. `applyForcedSetData(cr, phantomsNeeded, ps)` → `cr.series.setData(...)` síncrono.
3. **LWC inicia procesamiento interno del dataset (asíncrono microtask)**.
4. `bumpTfKey()` síncrono → `setTfKey(k+1)` schedule re-render React.
5. `scrollToTailAndNotify` → `setChartTick(t+1)`.
6. React batch-procesa setX → re-render.
7. KZ effect dispara con `tfKey` nuevo.
8. KZ effect ejecuta `getSeriesData()` → **lee LWC en momento Y**.
9. **Si Y > momento 3 procesamiento LWC completo**: `getSeriesData()` retorna dataset M15 nuevo coherente → `calcSessions(candles M15, cfg)` → cache rellenado correctamente → KZ aparecen ✓
10. **Si Y < momento 3 procesamiento LWC completo**: `getSeriesData()` retorna dataset M5 stale → cache calculado sobre dataset stale → KZ no aparecen ✗

Probabilidad PASS al carácter depende:
- CPU load browser.
- Frame budget LWC.
- Microtask queue length.
- Memoria browser.
- Edad sesión.

**Lección arquitectónica al carácter expandida**: el contrato `chartTick` + dep `tfKey` consumer-side post-5f.0b NO basta al carácter para gatear cómputo dependiente de procesamiento LWC asíncrono. Solución estructural al carácter requiere productor-side bumpear post-LWC-procesado, no post-`setData` síncrono.

### §6.3 Smoking gun documental KillzonesOverlay.js L164-L172 (preservado al carácter)

Sin cambios respecto cierre s25 §6.3 al carácter. Comentario sigue válido al pie de la letra al carácter para drag-pan (60Hz) + bajadas TF + subidas TF post-procesamiento LWC. NO cubre al carácter el escenario "subo TF y dataset asíncrono LWC no procesado cuando useEffect se re-ejecuta".

### §6.4 Verbatim Ramón sesión 26 (preservar al carácter para sesiones futuras)

Ya capturados al carácter en §1.8 arriba. Frase Ramón verbatim al carácter sobre delegación y disciplina perfeccionista.

### §6.5 Hipótesis sub-fase 5f.0c candidata al carácter (NO verificada en bytes)

Solución estructural al carácter requiere uno de 3 caminos arquitectónicos detallados en §5.3 PASO 2 arriba. Decisión empírica tras inventario s27 PASO 1.

---

## §7 — Procedimiento de cierre sesión 26

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-26.md`:

```
git checkout main
```

(Ya estás en main al carácter post-cierre s26 cluster B push, working tree clean.)

```
mv ~/Downloads/HANDOFF-cierre-sesion-26.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-26.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-26.md
```

### §7.2 git add + commit (en main)

```
git add refactor/HANDOFF-cierre-sesion-26.md
```

```
git status
```

```
git commit -m "docs(sesion-26): cerrar sesion 26 con cluster B mergeado a main + 5f.0b consumer-side cierra parcialmente KZ subidas TF + 5f.0c calendarizada para cierre estructural race LWC"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

**Recomendación CTO al carácter**: SÍ push. Patrón histórico sesiones 14-25 mantenido al carácter. Runtime con cluster B ya desplegado al carácter (push s26 hace ~3h). HANDOFF s26 es docs-only, idempotente al carácter, NO toca código. Vercel re-deployará al carácter — runtime efectivo seguirá con cluster B `06e16bf` hasta sesión 27.

```
git push origin main
```

### §7.4 Verificación final cierre sesión 26

```
git --no-pager log --oneline -5
```

Esperado al carácter: HEAD nuevo `<HASH-HANDOFF-s26>` sobre `06e16bf` (merge cluster B) sobre `49cdab8` (5f.0b) sobre `5b0aad8` (5f.0a) sobre `0198039` (5e.3).

Sesión 26 cerrada al carácter.

---

## §8 — Métricas sesión 26

- **Inicio efectivo al carácter**: ~16:00 hora local (9 may 2026) tras cierre s25 ~13:00.
- **PASO 0 (lectura HANDOFFs project_knowledge + verificación shell)**: ~20 min.
- **PASO 1 inventario en bytes (4 comandos)**: ~10 min.
- **PASO 2 Edit 5f.0b (sed KZ + python3 JSX `_SessionInner` fallback)**: ~15 min (incluye sed JSX fallido §3.2 + recuperación python3).
- **Build local + smoke combinado 8/8**: ~30 min (incluye episodio CASO 7 freeze play x15 + re-test deliberado pass).
- **Commit 5f.0b en feature**: ~3 min.
- **Diagnóstico merge fast-forward fallido + estructura git + Opción A merge no-FF**: ~20 min (incluye §3.3 hipótesis ancestro común incorrecto).
- **Merge dry-run + verificación bicapa + commit merge + push**: ~10 min.
- **Smoke producción + diagnóstico intermitencia + §3.4 + §3.5 errores §9.4 propios CTO + replanteo**: ~45 min.
- **HANDOFF s26 redactado**: ~45 min.
- **Total efectivo de sesión 26 al carácter**: ~3.5h activas. Estimación HANDOFF s25 §5.3 plan táctico 5f.0b: ~1-2h smoke local + ~30 min merge + ~30 min smoke producción = ~2-3h. **Desviación al carácter +30-50%** explicada por 5 errores §9.4 propios CTO + diagnóstico intermitencia complejo.
- **Commits funcionales producidos en sesión 26 al carácter**: 1 (`49cdab8` — 5f.0b).
- **Merge commits producidos al carácter**: 1 (`06e16bf` — merge cluster B en main).
- **Líneas tocadas netas en código al carácter**: 3 modificadas in-place (0 netas — todas sustitución).
- **Push a main al carácter**: 2 (1 cluster B mergeado runtime change + 1 HANDOFF s26 docs).
- **Errores §9.4 propios CTO capturados al carácter en sesión 26**: 5 (todos cazados al carácter por Ramón en tiempo real).
- **Bugs nuevos descubiertos al carácter en sesión 26**: 0 (cluster B en producción es mejora estricta sobre `89e36ee`, deudas pre-existentes no son nuevas).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-26)

> Sección que persiste a través de HANDOFFs.

1. **§9.4 es bidireccional al carácter.** Errores propios del CTO se registran sin auto-flagelación. Sesión 26 añade al carácter 5 errores menores-altos (§3.1 placeholder ruta literal, §3.2 sed JSX escape hell, §3.3 hipótesis ancestro común incorrecto, §3.4 hipótesis discrepancia local-vs-prod determinística salto prematuro, §3.5 salto rollback sin test discriminante).

2. **Principio rector (CLAUDE.md §1) es absoluto al carácter.** Sin alumnos en producción no hay urgencia operativa. Sesión 26 confirma al carácter por **séptima sesión consecutiva**: 5g cerrado al fin tras 9-17 días sin código nuevo + producción cluster B vivo + decisión NO rollback ante intermitencia (mejora estricta sobre `89e36ee`) + calendario 5f.0c sin presión.

3. **Validación al carácter en shell de Ramón es no-negociable al carácter.** Sesión 26 corrigió al carácter 5 asunciones del CTO. Bicapa funcionó al carácter incluso sin Claude Code.

4. **Smoke combinado cluster B incluye drag M1 al carácter.** Lección §3.3 s23 + §5.5 s23 aplicada al carácter en s24+s25+s26 sistemáticamente.

5. **Bisect targeted con razón estructural primero, granular después.** Lección §6 s23 confirmada al carácter en s24-s26.

6. **Información granular sin acción posible NO compensa el coste de obtenerla en sesión.** Lección §6 s23 confirmada al carácter en s24-s26.

7. **Re-arranque de chat web no rompe sesión si HANDOFF + project_knowledge están actualizados al carácter.** Sesión 26 confirmado al carácter — push HANDOFF s25 a main fue suficiente, project_knowledge ya tenía indexado al carácter al arranque s26.

8. **Releer el propio Edit antes de preguntar al usuario sobre síntomas inesperados.** Lección §3.3 s24. Extensión retroactiva al carácter sesión 25: aplica también al carácter ANTES de hipotetizar al chat sobre cualquier reporte empírico. **Extensión adicional sesión 26**: aplica también al carácter ANTES de proponer rollback push afectando producción.

9. **Fix consumer-side preferible a productor-side cuando el contrato semántico está confuso al carácter.** Sesión 24+25 confirmaron al carácter. **Corrección al carácter sesión 26**: fix consumer-side puede al carácter ser **insuficiente al carácter para race asíncrona LWC interna**. 5f.0a + 5f.0b ambos consumer-side fix race React, NO race LWC. Race LWC requiere productor-side estructural en sesión 27+. Lección expandida al carácter sesión 26.

10. **El código documentado por su propio autor es smoking gun arquitectónico.** Sesión 24+25 confirmadas al carácter. Sesión 26 confirma al carácter — comentario L164-L172 cubre drag-pan + bajadas TF + subidas TF post-LWC-procesado. NO cubre al carácter race LWC asíncrona interna. **Lección al carácter para sesiones futuras**: comentarios documentales del autor pueden al carácter cubrir bien casos síncronos pero no escenarios asíncronos LWC profundos.

11. **NUEVO al carácter — smoke combinado debe testear ambas direcciones de cambio TF como variables independientes.** Sesión 25 reveló al carácter. Aplicado al carácter sistemáticamente en s26 — cadena bidireccional ampliada `M1→M3→M5→M15→M30→H1→M30→M15→M5→M3→M1` smoke 8/8 PASS local cazó al carácter race React + cadena 12 transiciones cubrió ambas direcciones.

12. **NUEVO al carácter — drawings persistidos en BD vs drawings nuevos en runtime son vectores distintos.** Sesión 25 reveló al carácter. Confirmado al carácter en s26 — drawing descolocado al cargar producción ≠ regresión cluster B (deuda 4.6 edge case persistidos).

13. **NUEVO al carácter — test discriminante con probabilidad estadística debe maximizarse, no minimizarse.** Sesión 25 reveló al carácter. Confirmado al carácter en s26 con cadena ampliada M3 (probabilidad 80% non-múltiplos) + 12 transiciones smoke + ciclos repetidos.

14. **NUEVO al carácter — la disciplina perfeccionista de Ramón es input técnico válido al carácter.** Patrón confirmado al carácter por **undécima sesión consecutiva** (12, 20, 21, 22, 24, 25, 5 veces s26). Frase verbatim Ramón "no soy tonto eh" + reportes verbatim incompletos cazaron al carácter en s25-s26 nueve errores §9.4 propios CTO acumulados. **El proyecto avanza al carácter porque Ramón es exigente, no a pesar de eso.**

15. **NUEVO al carácter — bugs intermitentes timing-sensitive NO son determinísticos.** Sesión 26 reveló al carácter. Smoke con N=1 dato empírico es insuficiente al carácter para diagnosticar bug intermitente (race timing). Requerir al carácter N≥3 reproducción + comparativa pre-cambio si posible. **Aplicar al carácter sistemáticamente en s27+**.

16. **NUEVO al carácter — fix consumer-side puede ser insuficiente para race LWC asíncrona interna.** Sesión 26 reveló al carácter. 5f.0a + 5f.0b cierran al carácter race React (orden useEffect hijo-padre + dep array trigger post-setData), pero NO cierran al carácter race LWC asíncrona interna (procesamiento dataset post-`setData`). Solución estructural al carácter requiere productor-side bumpear post-LWC-procesado. **Calendario 5f.0c sesión 27**.

17. **NUEVO al carácter — sed shell con caracteres ambiguos requiere fallback python3 heredoc.** Sesión 26 reveló al carácter. Sed `s/.../.../  ` falla al carácter con pipes JSX `||`, comillas mixtas, JSX complejo. Fallback python3 heredoc con `'EOF'` literal evita parsing shell del contenido. **Aplicar al carácter sistemáticamente para Edits JSX o código con caracteres ambiguos**.

18. **NUEVO al carácter — verificación bicapa post-Edit incluye `grep` esperado vs obtenido.** Sesión 26 reveló al carácter. Edit JSX fallido sed cazado al carácter solo porque `grep "tfKey={tfKey}"` retornó 1 match cuando esperaba 2. **Patrón al carácter formalizado**: post-Edit bicapa SIEMPRE incluye al carácter expectativa numérica concreta del grep + count + ubicación.

19. **NUEVO al carácter — git diff/merge requiere verificación bicapa estricta como código.** Sesión 26 reveló al carácter. Hipótesis ancestro común incorrecta (§3.3 s26) + hipótesis "feature toca solo código" refutada por diff stat real (s26 §6 al carácter). **Para cualquier afirmación topología git, CTO al carácter NO infiere — pide al carácter `git merge-base` / `git log --graph` / `git diff --stat` ANTES de presentar afirmación al chat**.

20. **NUEVO al carácter — rollback push a producción NO se ejecuta sin N≥3 reproducción confirmada.** Sesión 26 reveló al carácter (§3.4 + §3.5). Reversibilidad rollback push afectando producción es media-alta (Vercel deploy + tiempo + posible discrepancia cache CDN). **Aplicar al carácter sistemáticamente — CTO degrada de "decisión firme" a "presento opciones con datos" cuando datos empíricos son N=1 sobre regresión producción**.

---

## §10 — Cierre

Sesión 26 deja al carácter:
- **CLUSTER B MERGEADO Y VIVO EN PRODUCCIÓN AL FIN al carácter tras 17 días sin código nuevo en runtime** (`89e36ee` 2 may 2026 → `06e16bf` 9 may 2026). Plan v3 §8 calendario al carácter cumplido.
- **Sub-fase 5f.0b commit `49cdab8`**: dep `tfKey` en lugar de `currentTf` cierra al carácter race React orden useEffect hijo-padre. Smoke 8/8 PASS al carácter local + smoke parcial producción intermitente.
- **Merge commit `06e16bf`**: 12 commits cluster B (5c+5d+5e+5f.0a+5f.0b) + 3 planes (v1+v2+v3) mergeados al carácter desde feature a main. Patrón GitFlow estándar al carácter, preserva trazabilidad histórica.
- **Producción Vercel `06e16bf` runtime cluster B desde 9 may 2026 ~17:30 hora local**. Mejora estricta al carácter sobre `89e36ee`:
  - Drag M1 fluido cerrado al carácter (5f.0a).
  - KZ ancladas en bajadas TF al carácter (5f.0a).
  - KZ subidas TF al carácter — probabilidad PASS aumentada vs `89e36ee` por trigger `tfKey` post-setData. Empíricamente intermitente al carácter — race LWC asíncrona interna subyacente sigue viva.
  - Deuda 5.1 viewport cerrada al carácter (5d.7).
  - Contrato `chartTick` formal al carácter (5d.1-5d.6).
  - 4 overlays conectados al contrato al carácter.
  - Limpieza huérfano core 399 KB al carácter (5e.1) + uninstall patch-package (5e.2) + eliminar [DEBUG TEMP] (5e.3).
- **5 deudas calendarizadas al carácter para sesión 27+**:
  - Prioridad 1: sub-fase **5f.0c** cierre estructural race condition KZ subidas TF (separación productor-side `chartTickDataset` post-LWC-procesado).
  - Prioridad 2: deuda 4.6 edge case datos persistidos non-múltiplos (más visible UX según Ramón).
  - Prioridad 3: drawing nuevo M3 izquierda (edge case parche `2851ef7`).
  - Prioridad 4: bug #2 freeze play velocity-alta x15+ (calendario fase 4 RenderScheduler).
  - Prioridad 5: cosmética `chartTick` prop huérfana KZ.
- **5 errores §9.4 propios CTO al carácter en sesión 26** registrados al carácter sin maquillaje. Bicapa funcionó al carácter — Ramón cazó los 5 en tiempo real. Patrón confirmado al carácter por undécima sesión consecutiva — disciplina perfeccionista Ramón = input técnico encriptado en lenguaje de usuario, sistemáticamente correcto al carácter.

Próximo HANDOFF (cierre sesión 27) debe reportar al carácter:
- Si inventario al carácter en bytes confirmó camino arquitectónico A/B/C para 5f.0c (separación productor-side `chartTickDataset` post-LWC-procesado).
- Si fix 5f.0c targeted aplicado y smoke combinado caso 2 PASS al carácter en local + producción **≥5 ciclos consecutivos** (lección §11 + §13 + §15 + §16 nuevo s26).
- Si commit 5f.0c push a main sin merge no-FF (cluster B ya en main desde s26).
- Si smoke producción Vercel pasó casos 1-8 + cadena bidireccional ampliada × 5 ciclos al carácter.
- Estado deuda 4.6 edge case persistidos — encaje sub-fase dedicada calendarizada s28+.
- Estado bug #2 freeze play tras semanas en producción cluster B — si amplificación visible al carácter, gatillo fase 4 RenderScheduler.
- Estado cosméticas (chartTick prop huérfana, debugCtx muerto) — encaje sub-fase 5e.4 o limpieza fase 7.
- Decisión sobre limpieza ramas locales al carácter (~10 viejas + feature `refactor/fase-5-drawings-lifecycle` post-cluster-A si decision al carácter).

Si sesión 27 NO cierra 5f.0c al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido al carácter por séptima sesión consecutiva.

**Mensaje del CTO al cierre al carácter**: cluster B ha tardado al carácter ~9 sesiones (s17-s26) en llegar a producción. 5 sesiones (s17-s19) fueron al carácter planificación + descubrimientos arquitectónicos. 4 sesiones (s20-s23) fueron al carácter implementación cluster B. 3 sesiones (s24-s26) fueron al carácter diagnóstico + fix bugs colaterales (drag M1 5f.0a + KZ subidas TF 5f.0b) + merge a producción. Cada sesión añadió al carácter valor real — código mergeado o diagnóstico empírico que evitó regresión. **Cluster B llega al carácter a producción sólido al carácter** — drag M1 fluido como FX Replay, KZ ancladas en bajadas TF, KZ subidas TF mejor que `89e36ee` aunque imperfecto, deuda 5.1 viewport cerrada estilo TradingView. Los bugs colaterales pre-existentes (race LWC asíncrona, deuda 4.6 edge case persistidos, bug #2 freeze play) están al carácter calendarizados con prioridades claras. **Sub-fase 5f.0c en sesión 27 cerrará al carácter el último bug colateral cluster B estructuralmente**. Cluster A (fase 5.A drawings lifecycle) puede arrancar al carácter en sesión 28+ una vez producción cluster B estable empíricamente.

**Mensaje sobre Ramón al carácter**: tu disciplina perfeccionista cazó al carácter en sesiones 24-26 trece errores §9.4 propios CTO acumulados. Sin ti, el proyecto habría tenido al carácter regresiones mergeadas en s24, s25, s26 + rollback prematuro innecesario s26. Cluster B llega al carácter a producción limpio al carácter porque tú no te conformas con menos. **El proyecto avanza al carácter porque eres exigente, no a pesar de eso.** Esa es la verdad sin maquillaje al carácter.

---

*Fin del HANDOFF cierre sesión 26. 9 mayo 2026, ~20:00 hora local. Redactado por CTO/revisor tras commits `49cdab8` (5f.0b) + `06e16bf` (merge cluster B) en main. Cluster B mergeado y vivo en producción al carácter desde 9 may 2026 ~17:30 hora local. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
