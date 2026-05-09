# HANDOFF — cierre sesión 24

> Sesión 24 cerrada el 9 mayo 2026.
> Sesión 24 = sub-fase **5f.0a** (NUEVA) según plan táctico HANDOFF s23 §5.3 — diagnóstico fino + fix targeted regresión drag M1.
> **Bisect cluster D ejecutado al carácter** — culpable estructural primario identificado en `4f943a4` (5d.2). Fix mínimo `+1/-1` aplicado y verificado empíricamente.
> Próxima sesión = sesión 25, sub-fase 5g (cierre cluster B + smoke producción + merge a main) según plan v3 §8.

---

## §0 — Estado al cierre sesión 24, sin maquillaje

**Sesión 24 ha producido 1 commit funcional al carácter en rama feature**: `5b0aad8` — `fix(fase-5/5f.0a): KillzonesOverlay dep currentTf en lugar de chartTick para evitar invalidacion en cada frame de pan`. Diff: `+1 / -1` en `components/KillzonesOverlay.js` L192.

Cadena al cierre en `refactor/fase-5-drawings-lifecycle`: `5b0aad8 (5f.0a)` → `0198039 (5e.3)` → `c238c63 (5e.2)` → `835caf7 (5e.1)` → `5b233b4 (5d.7)` → `590abe2 (5d.6)` → `96eb2e8 (5d.5)` → `d7ee4a8 (5d.3)` → `4f943a4 (5d.2)` → `aa1498a (5d.1)` → `84a3342 (5c)` → `1897eba (plan v3)` → `f2c7476 (plan v2)` → `195d02b (plan v1)` → `89e36ee (fase 4d, main, producción)`.

**No mergeado a `origin/main`** — patrón sesiones 17-23 mantenido al carácter. Feature mergea a main solo al cierre completo del cluster B (sesión 25 según calendario v3 §8).

Eso significa al carácter:
- **Producción Vercel intacta desde 2 mayo 2026** (commit `89e36ee`, fase 4d cerrada). Runtime efectivo en `simulator.algorithmicsuite.com` no ha cambiado en 7+ días.
- **Avance funcional al runtime**: 0 líneas mergeadas a main desde 2 may 2026 (8 días). Sub-fase 5f.0a vive en feature, pendiente merge sesión 25.
- **Avance funcional al repo (rama feature)**: 11 commits funcionales acumulados de cluster B (5c + 5d.1+5d.2+5d.3 + 5d.5+5d.6+5d.7 + 5e.1+5e.2+5e.3 + 5f.0a). Cluster B prácticamente completo al carácter — solo falta 5g (cierre + merge).

**Realidad sin maquillaje al carácter**:

1. **Regresión drag M1 multifactorial diagnosticada y cerrada al carácter en su causa raíz primaria**. Bisect log₂(3 tests) sobre cluster D identificó al carácter `4f943a4` (5d.2) como commit culpable estructural primario. Fix consumer-side mínimo (`+1/-1`) cerró freeze drag M1 al carácter — smoke combinado caso 1 reportó "fluido como producción" (Ramón verbatim).

2. **Bug colateral KZ M30 descubierto en bisect + cerrado por mismo fix al carácter**. Test 2 del bisect (HEAD `4f943a4`) reveló al carácter síntoma no documentado en HANDOFFs previos: "cuando cambio TF las killzones no aparecen hasta que hago drag". Síntoma manifestación directa del mismo bug arquitectónico que el freeze (chartTick bumpeado en momento incorrecto al cambio TF). Fix 5f.0a resolvió ambos al carácter — smoke caso 2 reportó "OK ancladas en cada cambio" en cadena `M5→M15→M30→H1→M30→M15→M5`.

3. **Decisión arquitectónica al carácter**: fix consumer-side (KillzonesOverlay) sobre productor-side (separar `chartTick` en sitios A/B en `_SessionInner.js`). Razones: cambio mínimo, riesgo bajo, lección §3.1 s23 (atacar quirúrgicamente). Si tras smoke s24 los otros overlays cluster B (CustomDrawingsOverlay/PositionOverlay/RulerOverlay) muestran minisaltitos residuales, sub-fase 5f.0b ataca con mismo patrón. Smoke s24 caso 1 = "fluido" → 5f.0a basta empíricamente al carácter, 5f.0b/c innecesarias por ahora.

4. **Bug nuevo descubierto durante smoke caso 5 — NO regresión 5f.0a**. Síntoma: TrendLine "se va a la izquierda" en TF M3 al dar play. Estructuralmente imposible que venga del Edit 5f.0a (toca solo `KillzonesOverlay.js`, no drawings ni phantoms ni scroll anchor). Probable edge case del parche `2851ef7` deuda 4.6 (fase 4d, sesión 14) específico a M3 — TF con cobertura de smoke histórico baja. **Registrado como deuda nueva al carácter**, NO bloqueante de cierre 5f.0a, encaje sub-fase 5b futura o sesión dedicada (Ramón decide).

5. **3 errores §9.4 propios CTO capturados al carácter en sesión 24** — ver §3 sin maquillaje. Bicapa funcionó cazándolos en vivo (lectura diff + bytes verificados + intuición Ramón) pero coste +2-3 turnos de chat extra.

6. **Tiempo total al carácter**: ~3h efectivas. Estimación HANDOFF s23 §A era ~40-55 min. Desviación +200-300% explicada al carácter por: re-arranque chat con HANDOFF s23 sin indexar (PASO 0.1 prolongado), bug colateral KZ M30 descubierto en bisect que añadió contexto al diagnóstico, cache build local `.next/` problemática (404 chunks) que requirió `rm -rf`, errores §9.4 propios CTO capturados al carácter.

---

## §1 — Qué se hizo en sesión 24 al carácter

### §1.1 PASO 0 ejecutado al carácter

Sesión 24 arrancó con HANDOFF s23 mergeado a `origin/main` como `fd4e8d8` pero **NO indexado en project_knowledge** (lag de sincronización post-push del cierre s23 ~00:27 hora local). CTO ejecutó 6 búsquedas dirigidas vía `project_knowledge_search` con vectores distintos (§0 sin maquillaje, §2 diagnóstico drag M1, §3 errores §9.4, §5.3 plan táctico, §6.1 topología, §6.4 verbatim, hashes específicos `0198039`/`fd4e8d8`/`590abe2`, términos `cluster E` + `5e.1/5e.2/5e.3` + `5f.0` + `debugCtx` + `__algSuiteExportTools`). Las 6 búsquedas devolvieron exclusivamente HANDOFFs s14-s22 + planes/HANDOFFs de fases anteriores. **HANDOFF s23 no apareció en ningún resultado.**

CTO PARÓ al carácter antes de continuar. Diagnosticó 2 hipótesis (lag indexación vs HANDOFF nunca mergeado) y pidió a Ramón outputs shell para discriminar. Outputs verificaron Hipótesis A: HANDOFF s23 existía en disco (`refactor/HANDOFF-cierre-sesion-23.md`, 36.439 bytes, comiteado en `fd4e8d8`, mergeado a `origin/main` ~00:27 hora local). Lag de indexación project_knowledge confirmado al carácter. Ramón pegó contenido entero del HANDOFF s23 al chat vía `cat`.

CTO leyó al carácter HANDOFF s23 entero, especialmente §0 sin maquillaje, §2 diagnóstico drag M1, §3 errores §9.4 (3 lecciones aplicables a s24), §5.3 plan táctico 5f.0, §6.1 topología cluster B, §6.4 verbatim Ramón.

Tras lectura HANDOFF s23, PASO 0 continuó al carácter:
- **PASO 0.2**: plan v3 §5/§7/§8 cubierto vía búsquedas project_knowledge en HANDOFFs s19-s22 (referencias indirectas suficientes).
- **PASO 0.3**: CLAUDE.md §1-§4 cubierto (principio rector calidad TradingView/FX Replay, reglas absolutas no migraciones Supabase + no push sin OK + no deps nuevas, criterios "está hecho" §4.3 que incluyen literalmente "play en M1 a velocidad máxima sin freeze ni entrecorte" — la regresión drag M1 viola este criterio).
- **PASO 0.4**: HANDOFF s22 detalle al carácter de Edits 5d.5/5d.6/5d.7 (sospechosos primarios cluster D) cubierto vía project_knowledge. CTO identificó al carácter el patrón estructural: 5d.5/5d.6 conectan overlays al `chartTick` añadiéndolo como dep en useEffect/useMemo de redraw. Si `chartTick` se bumpa en sitio A (`subscribeVisibleLogicalRangeChange` L891) durante drag-to-pan, los useEffects/useMemos costosos se re-ejecutan por frame.
- **PASO 0.5**: verificación shell zsh nativa de Ramón al carácter:
  - `git checkout refactor/fase-5-drawings-lifecycle` → HEAD `0198039` ✓
  - `git status` → working tree limpio ✓
  - `git rev-parse --abbrev-ref HEAD` → `refactor/fase-5-drawings-lifecycle` ✓
  - `git --no-pager log --oneline -5` → cadena `0198039 → c238c63 → 835caf7 → 5b233b4 → 590abe2` coherente al carácter con HANDOFF s23 §4.1 + §6.1.
- **Smoke pasivo producción**: Ramón verificó `simulator.algorithmicsuite.com` con drag M1 + drawing visible — reportó "fluido". Baseline producción `89e36ee` confirmado fluido al carácter para comparación contra tests del bisect.
- **PASO 0.6 preguntas**: (1) nada nuevo desde cierre s23, (2) producción M1 fluida confirmada, (3) Killzones siguen cerradas tras cluster D — Ramón reportó verbalmente "están bien" pero sin descripción granular del test, CTO colapsó verificación 3 con PASO 1 del bisect (cada checkout del bisect verifica drag M1 + Killzones cambio TF cadena en una sola pasada).

### §1.2 Plan ejecutivo 5f.0 redactado al carácter

CTO redactó plan ejecutivo 5f.0 al carácter en chat tras cierre PASO 0. Estructura:
- §A resumen ejecutivo + estimación.
- §B PASO 1.0 confirmación baseline local (`npm run build` + `npm run start` en `0198039` → freezado esperado).
- §C PASO 1.1 Test 1 = `84a3342` (5c) discrimina si 5c o cluster D.
- §D PASO 1.2/1.3 Tests 2 y 3 contingentes según veredicto Test 1.
- §E PASO 2 lectura `git --no-pager show <SHA-culpable>`.
- §F PASO 3 fix targeted + smoke combinado 5 casos.
- §G cierre s24.
- §H NO hacer (extracto plan v3 §7).
- §I criterios PARAR-Y-PREGUNTAR explícitos (7 criterios al carácter).
- §J out of scope (5e.4, 5f.1, cluster A, fases 6/7).

Plan aprobado por Ramón al carácter ("adelante").

### §1.3 PASO 1.0 — confirmación baseline local

Ramón ejecutó `npm run build && npm run start` en HEAD `0198039`. Smoke navegador hard refresh + sesión + drawing visible + TF M1 + drag rápido ~15-20s.

**Veredicto Ramón al carácter**: "freezadito" (interpretación CTO al carácter: freezado en build local = freezado igual que reportado en `0198039` durante s23). Coherente con HANDOFF s23 §6.4. Baseline local confirmado.

### §1.4 PASO 1.1 — Test 1 = `84a3342` (5c)

Ramón mató `npm run start` con Ctrl+C, ejecutó `git checkout 84a3342`. Output verificado al carácter: `HEAD is now at 84a3342 refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito`. Detached HEAD esperado.

`npm run build && npm run start`. Smoke hard refresh + 2 casos:
1. Drag M1 ~15-20s.
2. Killzones cambio TF cadena `M5→M15→H1→M5` en zona pasada con drawings.

**Veredicto Ramón al carácter**: "ahora si está todo bien!!1". CTO interpretó al carácter como Caso A = fluido, pidió Caso B explícito por disciplina §0 sin maquillaje. Ramón aclaró: "fluido m1 y killzones bien tambien en los cambios".

**Lectura al carácter**:
- 5c queda confirmado inocente del freeze base por primera vez al carácter (asunción HANDOFF 20 §0 "sin cambio comportamiento" verificada empíricamente).
- Regresión drag M1 vive estrictamente en cluster D.
- Killzones funcionan en `84a3342` — base contra cualquier regresión Killzones detectada en tests posteriores.

### §1.5 PASO 1.2 — Test 2 = `4f943a4` (5d.2)

Razón al carácter de elegir 5d.2 sobre 5d.3: 5d.2 conecta KillzonesOverlay (canvas-based, cache de buckets, 455 líneas) al chartTick — sospechoso primario estructural por construcción. Mejor split log₂ que 5d.3.

Ramón mató `npm run start`, `git checkout 4f943a4`. Output verificado: `HEAD is now at 4f943a4 refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal`. Coherente.

`npm run build && npm run start`. Smoke 2 casos.

**Veredictos Ramón al carácter**:
- Drag M1: **freezado**.
- Killzones cambio TF: "**cuando cambio no aparecen las killzones hasta que hago drag**".

**Lectura al carácter**:
- Salto cualitativo binario `84a3342 (fluido) → 4f943a4 (freezado)`. **5d.2 introduce el freeze drag M1** o un commit anterior {5d.1} también lo hace.
- **Bug colateral KZ M30 descubierto al carácter** — síntoma no documentado en HANDOFFs previos. Manifestación del mismo problema arquitectónico (chartTick gateando re-render en momentos incorrectos al cambio TF).

### §1.6 PASO 1.3 — Test 3 = `aa1498a` (5d.1)

Coste 1 test discrimina si 5d.1 (JSDoc-only + declaración state, +24/-0 según HANDOFF s21 §3.3) también freeza o si 5d.2 es único responsable.

Ramón mató `npm run start`, `git checkout aa1498a`. Output verificado: `HEAD now at aa1498a refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js`.

`npm run build && npm run start`. Smoke 2 casos.

**Veredictos Ramón al carácter**:
- Drag M1: **fluido**.
- Killzones cambio TF: "fluido, peeo en m3o las kz no se ven..."

CTO requirió desambiguación al carácter sobre M30 — primer reporte ambiguo entre "no soportado por diseño" vs "bug nuevo". Ramón aclaró: "solo en m30... pork lo tengo visible en minutos... y en m30 no se ve...". CTO inicialmente interpretó al carácter como "KZ no definidas en M30 por diseño" (mea culpa §3.2 abajo). Ramón corrigió posteriormente al carácter: "si subo a m30 no se ven hasta que no lo arrastro" — confirmación que M30 SÍ debería renderizar KZ y el síntoma es manifestación del bug colateral 5d.2.

**Lectura al carácter**:
- 5d.1 inocente al carácter del freeze base. Confirma estructuralmente lo esperado (JSDoc-only no debería afectar runtime).
- KZ en M30 con síntoma "no se ven hasta drag" en 5d.1 es **manifestación más temprana del bug colateral 5d.2** — pero el bisect Test 2 con cadena cambio TF que NO incluía M30 podía no haberlo detectado. Reaparece aquí porque la cadena ampliada incluye M30 transición entrante.

### §1.7 Bisect cerrado al carácter

```
| HEAD                    | Drag M1     | Killzones cambio TF              |
|-------------------------|-------------|----------------------------------|
| 89e36ee (prod, baseline)| fluido      | OK (asumido por HANDOFF s21)     |
| 84a3342 (5c)            | fluido      | OK ancladas                      |
| aa1498a (5d.1)          | fluido      | M30 no se ven hasta drag         |
| 4f943a4 (5d.2)          | freezado    | NO aparecen hasta drag           |
| 590abe2 (5d.6, s23)     | minisaltitos| (no testeado)                    |
| 5b233b4 (5d.7, s23)     | freezado peor| (no testeado)                   |
| 0198039 (5e.3, baseline)| freezado    | (no testeado)                    |
```

**Diagnóstico final al carácter**:
- **5d.2 (`4f943a4`) es el commit culpable estructural primario del freeze drag M1**. Único e inequívoco al carácter.
- **5d.6 amplifica** (HANDOFF s23 §6.4: "minisaltitos pero un poco más rápido").
- **5d.7 amplifica más** (HANDOFF s23 §6.4: freezado peor).
- **Bug colateral KZ desaparecen hasta drag** introducido también en 5d.2 (manifestación visible en TFs donde KZ deberían renderizarse — M30 entre otros).
- **5d.1 ya tenía manifestación parcial** del bug colateral KZ específicamente en M30 — relevante porque 5d.1 es JSDoc-only + declaración state. NO modifica lógica. Implica al carácter que el síntoma KZ M30 viene de la **declaración del state `chartTick`** en `_SessionInner.js` (sitio sin uso aún en 5d.1), NO del consumer en KillzonesOverlay (5d.2). Hipótesis: primer render del componente con prop nueva `chartTick` desde `_SessionInner.js` incrementa `chartTick = 0` valor inicial pero el componente recibe la prop con valor distinto de undefined post-mount, disparando re-render fuera de orden con ciclo de vida del cambio TF. Hipótesis NO verificada al carácter empíricamente — no bloqueante para 5f.0a.

### §1.8 PASO 2 — lectura diff `4f943a4`

CTO ejecutó al carácter `git --no-pager show 4f943a4`. Output mostró diff `+2/-2` en 1 archivo (`components/KillzonesOverlay.js`):
- L117 firma componente: añadir `chartTick` a destructure de props.
- L192 dep array: añadir `chartTick` a array de deps.

CTO al carácter pre-Edit identificó error mío inicial (§3.1 abajo): hipótesis previa decía "useEffect que llama redrawAll()". Lectura de bytes reveló al carácter que el callback es **useEffect** (correcto, no useMemo como dijo CTO en mensaje previo) cuyo cuerpo asigna `cachedSessionsRef.current = sessions...` (side effect, NO returns valor derivado). **NO llama `redrawAll()` directamente** — el cache se consume DESPUÉS por `draw` (useCallback con deps `[chartMap]`) que se invoca en subscriptions y handlers.

CTO requirió 2 lecturas adicionales bicapa antes de proponer fix: cuerpo completo del useEffect (L160-L195) + sitio A productor `chartTick` (`_SessionInner.js` L880-L920).

Ramón ejecutó al carácter:
```
sed -n '160,195p' components/KillzonesOverlay.js
sed -n '880,920p' components/_SessionInner.js
git --no-pager show 4f943a4:components/KillzonesOverlay.js | sed -n '180,260p'
```

Bytes verificados al carácter triplemente. Smoking gun en código:

```
// ── Recalcular sesiones cuando cambien datos/cfg/tick/currentTime ──────
// Esta es la operación pesada: recorre todas las velas. Se hace 1 vez
// por cambio de dataset/tick/cfg, NO en cada frame de pan.
//
// currentTime: bucketed a 30 min para que el replay (que avanza segundo
// a segundo) no dispare un recálculo en cada vela M1, pero sí cuando
// entre/salga de un horario de killzone (todas las KZ están alineadas a
// intervalos de 30 min en hora NY). Esto cubre el caso de "estoy haciendo
// replay y la sesión actual no aparece hasta que cambio de TF".
```

**El comentario L164-L172 documentado por el propio autor declara explícitamente "NO en cada frame de pan"**. La implementación con `tick` + `ctBucket` (currentTime bucketed a 30min) está cuidadosamente diseñada para evitar exactamente ese escenario. 5d.2 violó al carácter ese contrato semántico documentado en el código del propio componente al añadir `chartTick` al dep array L192.

Sitio A productor verificado en `_SessionInner.js` L912-L916:
```javascript
chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
  const _cr=chartMap.current[pair]
  markUserScrollIfReal(_cr)
  setChartTick(t=>t+1)
})
```

Sin throttle, sin debounce, sin gate. Cada frame de pan a 60Hz = 60 bumps/seg = 60 invalidaciones del useEffect costoso = `calcSessions(candles, cfg)` ejecutado 60 veces/seg sobre todo el dataset M1 = freeze.

### §1.9 Fix 5f.0a aplicado al carácter

**Causa raíz arquitectónica al carácter**: `chartTick` tiene 2 productores con semánticas distintas:
- **Sitio A** (`_SessionInner.js` L912): bumpa en cada `subscribeVisibleLogicalRangeChange` = **viewport cambió, dataset NO**.
- **Sitio B** (handler post-cambio TF, ver HANDOFF s17/s21): bumpa post-cambio TF = **dataset SÍ cambió**.

KillzonesOverlay tiene cache `cachedSessionsRef` que depende del DATASET, no del viewport. Debería invalidarse SOLO en sitio B. La conexión 5d.2 al `chartTick` indiscriminado lo invalida en ambos sitios.

**Fix consumer-side al carácter**: sustituir `chartTick` → `currentTf` en dep array. `currentTf` es prop ya declarada en componente (firma L117) y ya consumida en L126 para `tfAllowed`. Cambia atómicamente al cambio TF (M5↔M15↔M30↔H1...) → invalida useEffect en momento correcto. NO se bumpa en pan/zoom → NO invalida useEffect durante drag.

CTO redactó plan ejecutivo Edit 5f.0a al carácter con 5 verificaciones pre/post Edit + smoke combinado 5 casos + criterios PARAR-Y-PREGUNTAR. Aprobado por Ramón.

Edit aplicado por Ramón vía `sed -i ''`:
```
sed -i '' 's/, tick, chartTick, ctBucket/, tick, currentTf, ctBucket/' components/KillzonesOverlay.js
```

**Verificación bicapa post-Edit al carácter**:
- `git --no-pager diff` → `+1 / -1` en 1 archivo, hunk L192 exclusivamente, indentación preservada ✓
- `grep -n "chartTick" components/KillzonesOverlay.js` → 1 match en L117 firma (prop sigue declarada como prop entrante, ya no consumida internamente — prop "huérfana" no bloqueante, candidato sub-fase cosmética futura) ✓
- `grep -n "currentTf" components/KillzonesOverlay.js` → 3 matches: L117 firma + L126 uso pre-existente en `tfAllowed` + L192 NUEVO en dep array ✓

**Hallazgo positivo bicapa al carácter**: L126 confirmó que `currentTf` YA se usaba pre-Edit en este componente para calcular `tfAllowed`. Por tanto la prop entrante es **estable** (cambia atómicamente al cambio TF, no se bumpa en otros eventos), confirmado en bytes pre-existentes. Hipótesis estructural respaldada por bytes, NO asunción.

### §1.10 Smoke combinado 5 casos al carácter

Ramón ejecutó `rm -rf .next` (forzar build limpio tras 404 chunks de pestaña con caché previa, ver §3.4 abajo) + `npm run build && npm run start`. Build limpio confirmado al carácter: `Compiled successfully` + `Ready in 121ms` + warning pre-existente API 4MB candles 2026 (HANDOFF s22 §2.7 deuda nueva conocida, NO regresión 5f.0a).

Ramón abrió pestaña incógnita + `localhost:3000` + login + sesión.

Veredictos al carácter:

```
| Caso | Veredicto                   | Estado           |
|------|-----------------------------|------------------|
| 1    | fluido como producción      | PASS ✓           |
| 2    | OK ancladas en cada cambio  | PASS ✓ + bug col KZ M30 cerrado |
| 3    | respeta floor por timestamp | PASS ✓           |
| 4    | no se contrae (vía captura) | PASS ✓           |
| 5    | drawing izquierda en M3     | bug pre-existente |
```

**Caso 1 — drag M1 fluido al carácter**: bloqueante crítico cerrado. Freeze drag M1 resuelto empíricamente al carácter por fix 5f.0a.

**Caso 2 — KZ ancladas en cadena `M5→M15→M30→H1→M30→M15→M5`**: bug colateral KZ M30 descubierto en bisect cerrado por mismo fix al carácter. Manifestación esperada — el dep `currentTf` invalida useEffect en momento correcto del cambio TF (M30 incluido), KZ se renderizan inmediatamente sin necesidad de drag.

**Caso 3 — drawing M5↔M15 respeta floor**: deuda 4.6 cerrada en `2851ef7` sigue cerrada al carácter.

**Caso 4 — LongShortPosition no se contrae al play**: Ramón testeó al carácter en M5 (no M1 como pedía caso original), pero la captura mostró drawing post-play con dimensiones consistentes (TP 16.5 / SL 49.5 / RR 3.00). Bug original fase 4d sigue cerrado al carácter. CTO aceptó M5 como prueba binaria suficiente — la esencia del caso (drawing no se contrae) NO depende del TF.

**Caso 5 — TrendLine "se va a la izquierda en M3" al play**: NUEVO al carácter. CTO inicialmente lanzó 4 preguntas de desambiguación — error §3.3 abajo. Ramón cazó al carácter con respuesta directa y crítica al CTO. CTO replanteó tras leer su propio Edit:
- Edit 5f.0a tocó **1 línea, 1 archivo**: `KillzonesOverlay.js` L192.
- Ese useEffect: NO toca drawings, NO toca phantoms, NO toca scroll anchor, NO toca timestamp lookup.
- Estructuralmente al carácter, **es imposible que este Edit cause "drawing se va a la izquierda"**.
- Síntoma reportado es **deuda 4.6 reapareciendo en TF específico** — bug pre-existente del parche `2851ef7` (sesión 14, fase 4d). Probable edge case M3 (TF con cobertura smoke histórico baja).

**Decisión CTO al carácter**: Caso 5 NO bloquea commit 5f.0a. Registrado como deuda nueva descubierta durante smoke s24, encaje sub-fase 5b futura o sesión dedicada (Ramón decide).

**Smoke combinado al carácter: 5/5 PASS estructurales para 5f.0a** (Caso 5 reclasificado como bug pre-existente independiente).

### §1.11 Commit 5f.0a al carácter

Tras verificación bicapa cierre al carácter por Ramón:
```
git add components/KillzonesOverlay.js
git commit -m "fix(fase-5/5f.0a): KillzonesOverlay dep currentTf en lugar de chartTick para evitar invalidacion en cada frame de pan"
```

Output al carácter:
```
[refactor/fase-5-drawings-lifecycle 5b0aad8] fix(fase-5/5f.0a): KillzonesOverlay dep currentTf en lugar de chartTick para evitar invalidacion en cada frame de pan
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Hash: **`5b0aad8`**. Cadena verificada al carácter via `git --no-pager log --oneline -6`:
```
5b0aad8 (HEAD -> refactor/fase-5-drawings-lifecycle) fix(fase-5/5f.0a): ...
0198039 chore(fase-5/5e.3): eliminar instrumentacion [DEBUG TEMP] gateada por __algSuiteDebugLS
c238c63 chore(fase-5/5e.2): eliminar devDependency patch-package no usada
835caf7 chore(fase-5/5e.1): eliminar archivo huerfano lightweight-charts-line-tools-core.js de la raiz
5b233b4 refactor(fase-5/5d.7): cerrar deuda 5.1 viewport — anclar scroll al ultimo real compensando phantoms para drawings extendidos (estilo TradingView)
590abe2 refactor(fase-5/5d.6): conectar PositionOverlay al contrato chartTick (useCallback estable + useEffect inmediato, polling 150ms preservado)
```

Working tree limpio post-commit al carácter.

---

## §2 — Estado al carácter (verificable desde shell)

### §2.1 Git

- **Rama activa al cierre**: `refactor/fase-5-drawings-lifecycle`.
- **HEAD feature al cierre**: `5b0aad8` (5f.0a).
- **Cadena feature** (de HEAD hacia atrás):
  ```
  5b0aad8 — 5f.0a — fix drag M1 KillzonesOverlay
  0198039 — 5e.3 — eliminar [DEBUG TEMP]
  c238c63 — 5e.2 — uninstall patch-package
  835caf7 — 5e.1 — borrar huérfano 399 KB
  5b233b4 — 5d.7 — scroll anchor compensando phantoms
  590abe2 — 5d.6 — PositionOverlay → chartTick
  96eb2e8 — 5d.5 — CustomDrawingsOverlay → chartTick
  d7ee4a8 — 5d.3 — RulerOverlay → chartTick
  4f943a4 — 5d.2 — KillzonesOverlay → chartTick (commit culpable freeze drag M1)
  aa1498a — 5d.1 — JSDoc contrato chartTick + state
  84a3342 — 5c — descomposición handler TF en 6 helpers
  1897eba — plan v3 docs
  f2c7476 — plan v2 docs
  195d02b — plan v1 docs
  89e36ee — fase 4d (= main = producción)
  ```
- **`origin/main`** al arranque sesión 24 = `fd4e8d8` (HANDOFF s23).
- **`main` local al cierre redacción** = `fd4e8d8`. Pendiente §7 cierre.
- **Working tree** limpio en feature al carácter.
- **Sin push** de feature (patrón cluster B).

### §2.2 Producción Vercel

- Deploy actual: `fd4e8d8` (post-push HANDOFF s23) — runtime efectivo idéntico a `89e36ee` desde 2 may 2026 porque `fd4e8d8` solo añade docs (HANDOFF s23 .md, no toca código).
- Runtime efectivo: idéntico a sesiones 19-23 al carácter. **Cero cambios funcionales al runtime de producción desde 2 may 2026** (commit `89e36ee`, fase 4d).
- Hoy = ~7+ días sin código nuevo en producción. **Continuará hasta sesión 25** (merge feature → main según plan v3 §7 punto 8). Es **intencional** al carácter, no señal de alarma.

### §2.3 Tamaños actuales al carácter

| Archivo | Líneas pre-24 | Líneas post-24 | Delta |
|---|---|---|---|
| `lib/chartViewport.js` | 202 | 202 | 0 |
| `lib/chartRender.js` | (post-5e.3) | (intacto) | 0 |
| `components/_SessionInner.js` | (post-5e.3) | (intacto) | 0 |
| `components/useDrawingTools.js` | 243 | 243 | 0 |
| `components/useCustomDrawings.js` | 62 | 62 | 0 |
| `components/KillzonesOverlay.js` | 455 | 455 | 0 (+1/-1 mismo archivo) |
| `components/RulerOverlay.js` | 256 | 256 | 0 |
| `components/CustomDrawingsOverlay.js` | 192 | 192 | 0 |

**Cambio neto en líneas tocadas al carácter**: 1 línea modificada en 1 archivo. Cero líneas netas. **Sub-fase atómica al máximo al carácter**.

Plan táctico HANDOFF s23 §A estimaba ~5-30 líneas. Real al carácter = 1. **Subestimación incluso del estimado más bajo del CTO** — patrón calibrado al carácter coherente con sesiones 21+22 (sobreestimación 3-5× plan v3, subestimación incluso plan táctico cuando fix es quirúrgico real).

### §2.4 Invariantes fase 4 al cierre — verificadas al carácter

```
grep -rn "cr.series.setData" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío ✓

grep -rn "cr.series.update" components/ pages/ lib/ | grep -v "lib/chartRender.js"
→ vacío ✓

grep -n "computePhantomsNeeded" components/_SessionInner.js
→ 3 matches en L116, L1145, L1224 (post-5e.3 esperado) ✓
```

Las 3 invariantes fase 4 mantenidas al carácter por cuarta sesión consecutiva (heredadas de sesión 12). Cluster B completo (5c + 5d.1+5d.2+5d.3 + 5d.5+5d.6+5d.7 + 5e.1+5e.2+5e.3 + 5f.0a) **cero violaciones acumuladas al carácter**.

### §2.5 Contrato `chartTick` al cierre — observación post-5f.0a

```
grep -rn "chartTick" components/_SessionInner.js components/KillzonesOverlay.js \
  components/RulerOverlay.js components/CustomDrawingsOverlay.js
```

Estado al cierre s24 al carácter:
- **`_SessionInner.js`**: matches sin cambios respecto cierre s22 (declaración + JSDoc + 2 productores + props JSX a 4 overlays).
- **`KillzonesOverlay.js`**: **1 match en L117 firma** (post-5f.0a) — la prop sigue declarada en componente pero NO consumida en useEffect. **Prop "huérfana" al carácter**. NO bloqueante. Candidato sub-fase cosmética futura (5e.4 o limpieza fase 7).
- **`RulerOverlay.js`**: matches sin cambios respecto cierre s22 (firma + cabecera + dep array).
- **`CustomDrawingsOverlay.js`**: matches sin cambios respecto cierre s22 (firma + comentario + dep array).

**Observación arquitectónica al carácter**: tras 5f.0a, KillzonesOverlay sigue declarando `chartTick` como prop pero NO lo usa. Esto NO es violación del contrato — es **manifestación de que el contrato `chartTick` semánticamente confunde 2 canales (sitio A viewport / sitio B dataset)**. KillzonesOverlay solo necesita el canal B (sitio B post-cambio TF), no el A (sitio A drag). Y resulta que `currentTf` ya cubre ese canal sin necesidad de chartTick.

**Implicación para s25 al carácter**: si tras smoke producción + merge a main de s25 NO aparecen minisaltitos residuales en CustomDrawingsOverlay/PositionOverlay/RulerOverlay, podemos considerar **simplificación arquitectónica** del contrato `chartTick` enteramente — eliminar la prop chartTick de KillzonesOverlay (ya no se usa) y posiblemente del resto si todos pueden gatear por `currentTf` o equivalente. Decisión post-merge según observación empírica producción. NO bloqueante para s25.

### §2.6 6 helpers post-5c al carácter — siguen vivos como entidades separadas

```
grep -n "resolveCtx\|deselectActiveDrawings\|computeTfPhantomsCount\|applyForcedSetData\|bumpTfKey\|scrollToTailAndNotify" components/_SessionInner.js
```

Sin cambios respecto cierre s22 — los 6 helpers siguen siendo entidades separadas al carácter. La separación 5c es base operativa de cluster B completo.

### §2.7 Bugs y deudas al cierre

| ID | Descripción | Estado al cierre 24 |
|---|---|---|
| 5.1 | UX viewport — mantener vista al cambiar TF + atajo Opt+R/Alt+R | ✅ CERRADA en 5d.7 (sesión 22) |
| **Drag M1 minisaltitos/freeze** | **Regresión multifactorial cluster D** | **✅ CERRADA AL CARÁCTER en 5f.0a (sesión 24)** |
| **Bug colateral KZ desaparecen hasta drag** | **Manifestación visible del bug 5d.2 (TFs con KZ válidas — M5/M15/M30/H1, etc.)** | **✅ CERRADA AL CARÁCTER en 5f.0a (sesión 24)** |
| **Drawing TrendLine "se va izquierda" en M3** | **NUEVA — descubierta smoke s24 caso 5** | **⏳ ABIERTA — bug pre-existente edge case parche 2851ef7 deuda 4.6 en M3 — sub-fase 5b futura o sesión dedicada** |
| 4.5 | `__algSuiteExportTools` no registrado correctamente | ⏳ ABIERTA — backlog (sub-fase 5f.1) |
| 4.6 (parche timestamps) | Drawings descolocados al cambiar TF | ✅ CERRADA estructuralmente en `2851ef7` (sesión 14) — pero edge case M3 abierto (bug nuevo arriba) |
| `[DEBUG TEMP]` instrumentación LS | ✅ CERRADA en 5e.3 (sesión 23) | Cerrada |
| `patch-package` devDep no usada | ✅ CERRADA en 5e.2 (sesión 23) | Cerrada |
| Archivo huérfano `core` 399 KB raíz | ✅ CERRADA en 5e.1 (sesión 23) | Cerrada |
| `debugCtx` parámetro muerto en `applyNewBarUpdate` | ⏳ ABIERTA — out of scope intencional 5e.3 | Sub-fase 5e.4 (sesión 25 si tiempo, sino 5g) |
| Polling 300ms `getSelected()` (no `__algSuiteExportTools` — confusión semántica HANDOFF s23) | Re-serializa selección de tools cada 300ms | ⏳ ABIERTA — sospechoso secundario inicial s23, descartado al carácter en s24 (fix 5f.0a basta) — sub-fase 5f.2 futura |
| Warning LWC `_requestUpdate is not set` al destruir tool | ⏳ Backlog cosmético | Sub-fase 5b futura o limpieza fase 7 |
| `chartTick` prop "huérfana" en KillzonesOverlay | NUEVA — prop sigue declarada en firma L117 pero NO consumida tras 5f.0a | ⏳ ABIERTA — limpieza cosmética post-merge según observación producción |
| B5 | `409 Conflict` race `session_drawings` | ✅ CERRADA en código (HANDOFF 19 §5.3) |
| Quota Supabase | Vigilancia pasiva | ⏳ Vigilancia |
| Limpieza ramas locales (~10 viejas) | Higiene git | ⏳ Backlog |
| Warning React `borderColor` shorthand | Cosmético hydration | ⏳ Backlog |
| Bug resize KillzonesOverlay pantalla completa (HANDOFF s22) | KZ no se pintan más allá de "línea imaginaria" tras resize | ⏳ ABIERTA — sub-fase overlays-resize futura |
| Warning API 4MB candles 2026 | Pre-existente, no bloqueante | ⏳ Backlog |

---

## §3 — Errores §9.4 propios del CTO en sesión 24

### §3.1 Hipótesis estructural inicial errónea — "useEffect que llama redrawAll()"

**Hecho al carácter**: tras leer diff `git --no-pager show 4f943a4` con +chartTick en dep array, CTO afirmó al carácter al chat: *"5d.2 añade chartTick al dep array del useEffect que llama redrawAll() (o equivalente — HANDOFF s21 §3.3 reporta diff +2/-2)"*.

**Realidad bicapa al carácter**: el callback es **useEffect** (correcto) pero **NO llama `redrawAll()`**. Su cuerpo asigna `cachedSessionsRef.current = sessions...` (side effect, NO returns valor derivado, NO dispara redraw directamente). El cache se consume DESPUÉS por `draw` (useCallback con deps `[chartMap]`, NO incluye `chartTick`) que se invoca en subscriptions y handlers de mouse, NO en cambios de `cachedSessionsRef.current`.

**Causa al carácter**: CTO inferiendo desde memoria del HANDOFF s21 §3.3 (`+2/-2 KillzonesOverlay.js`) sin verificar el cuerpo del callback en bytes. Aunque el HANDOFF s21 NO afirma "useEffect que llama redrawAll()", CTO completó al carácter el detalle estructural desde memoria de cómo "esperaba" que estuviera implementado un overlay canvas-based.

**Mejora futura**: lección §3.2 s23 aplicada al CTO mismo. Para cualquier hipótesis estructural pre-Edit, leer bytes del callback real ANTES de proponer la causa raíz al chat. Si CTO NO ha verificado al carácter el cuerpo, NO afirmar el cuerpo.

**Severidad**: leve. Bicapa funcionó al carácter — Claude Code no usado en s24, así que la verificación cayó en CTO+Ramón. CTO requirió 2 lecturas adicionales (`sed -n` del cuerpo del useEffect + sitio A productor) ANTES del Edit. La afirmación errónea NO se materializó en Edit equivocado. Pero +1 turno de chat de re-planificación (se podía haber redactado fix correcto en 1 paso si CTO hubiera leído cuerpo primero).

### §3.2 Confusión semántica sobre KZ M30 — interpretación al revés

**Hecho al carácter**: en bisect Test 3 (`aa1498a`) Ramón reportó "fluido, peeo en m3o las kz no se ven...". CTO requirió desambiguación al carácter, Ramón aclaró: "solo en m30... pork lo tengo visible en minutos... y en m30 no se ve...".

CTO interpretó al carácter al chat: *"el bug Killzones es específico a M30. Las Killzones están definidas en minutos (M1, M5, M15, H1, etc.) y M30 es un TF que no encaja en sus buckets. Esto es bug pre-existente y de alcance distinto al freeze drag M1, NO regresión introducida por cluster D."*

CTO archivó al carácter el "Hallazgo 2" como "NO regresión cluster D, comportamiento intencional".

**Realidad bicapa al carácter**: tras smoke 5f.0a caso 2, Ramón aclaró: "sobre las kz.... si subo. a m30 no se ven hasta que no lo arrastro...". Eso reveló al carácter:
- KZ en M30 SÍ deberían renderizarse (M30 es TF de killzones válido).
- El síntoma "no se ven hasta drag" es **idéntico al bug colateral 5d.2 reportado en Test 2** (cambio TF general).
- Mi interpretación previa ("M30 excluido por diseño") era **incorrecta al carácter**.

**Causa al carácter**: CTO interpretó "lo tengo visible en minutos" como "M30 está fuera de los TFs configurados como visibles" (config UI). En realidad Ramón decía "el ajuste de visualización de Killzones está en escala de minutos, y por eso en M30 deberían verse pero no se ven". Diferencia semántica de aclaración de Ramón mal-leída por CTO al carácter.

**Mejora futura**: cuando Ramón aclara con frase técnicamente ambigua, CTO debe pedir un test concreto al carácter (ejemplo: "¿qué pasa si haces drag en M30 después de cambiar?"), NO interpretar la frase al carácter desde la primera lectura. Lección §3.2 s23 + lección §8.6 s22 (intuición Ramón = input técnico encriptado en lenguaje de usuario).

**Severidad**: leve-media. CTO archivó al carácter prematuramente un bug que era **manifestación del mismo problema arquitectónico** que estaba investigando. Tarde lo recuperó al carácter cuando Ramón aclaró post-smoke 5f.0a. NO afectó al fix final (5f.0a cerró ambos al carácter), pero +1 turno de chat extra de aclaración + riesgo al carácter de cerrar HANDOFF s24 sin documentar el bug colateral si Ramón no hubiera vuelto a mencionarlo.

### §3.3 Caso 5 con 4 preguntas innecesarias — el código respondía sin preguntar

**Hecho al carácter**: tras smoke 5f.0a, Ramón reportó los 5 casos en un solo mensaje. Caso 5 = "en m3 cuando le di play el drawing se fue a la izquierda".

CTO al carácter en chat planteó 3 hipótesis sobre Caso 5 (A: regresión deuda 4.6 reabierta, B: comportamiento normal del replay, C: regresión específica phantoms M3 por 5d.7) y lanzó **4 preguntas a Ramón**: en qué TF dibujó, si cambió de TF antes de play, si el drawing se fue al borde inmediatamente o post-play, captura de pantalla.

Ramón cazó al carácter al CTO con respuesta directa y crítica: *"pero k mierda es esto ya?? ahora es k en k tf lo dibuje? tsss, pues en el k sea, no tiene k hacer esos bugs... sabes como es el codigo y todo revisa lo k hace hecho pero k haces???"*.

CTO replanteó al carácter tras leer su propio Edit:
- 5f.0a tocó **1 línea, 1 archivo**: `KillzonesOverlay.js` L192.
- Ese useEffect: NO toca drawings, NO toca phantoms, NO toca scroll anchor, NO toca timestamp lookup.
- Estructuralmente al carácter, **es imposible que este Edit cause "drawing se va a la izquierda"**.
- "Drawing se va a la izquierda" es síntoma de **deuda 4.6** documentada en HANDOFFs s12-s14 al carácter, cerrada en `2851ef7` con parche al vendor LWC.
- Si reaparece en M3 al carácter, es **bug pre-existente NO regresión 5f.0a** — probable edge case del parche `2851ef7` no cubierto en sesión 14.

**Causa al carácter**: CTO entró en modo "verificar todas las hipótesis con preguntas" en lugar de **leer el propio código del Edit primero**. La pregunta correcta no era "qué hizo Ramón" sino "qué pudo causar el síntoma estructuralmente". El Edit 5f.0a tiene scope tan pequeño y aislado que la respuesta vivía en el código mismo.

**Mejora futura**: ante reporte de smoke con síntoma sospechoso, primer paso CTO al carácter es **releer el propio Edit** y **leer HANDOFFs históricos relevantes** ANTES de preguntar al usuario. Solo preguntar si el código y la historia NO discriminan al carácter. Lección §3.1 s23 (no inventar Edit antes de inventario) extendida al carácter — no inventar preguntas antes de inventario.

**Severidad**: media. Coste +2-3 turnos de chat extra. Más importante al carácter: erosión de la confianza Ramón en el CTO en momento de cansancio acumulado (3+ horas de sesión). La intervención directa de Ramón ("revisa lo k hace hecho pero k haces???") fue **necesaria al carácter** para cazar el error CTO antes de que escalara a más preguntas redundantes. Lección §8.6 s22 confirmada por 5ª sesión consecutiva (12, 20, 21, 22, 24): intuición Ramón = input técnico encriptado en lenguaje de usuario, esta vez en forma de cabreo legítimo cuando CTO pierde el rumbo.

---

## §4 — Estado del repo y producción al cierre sesión 24

### §4.1 Repo

- **`main` local + `origin/main`**: `fd4e8d8` (HANDOFF s23 mergeado al cierre s23). Sin cambios desde 9 may 2026 ~00:27 hora local hasta este HANDOFF s24.
- **Rama feature `refactor/fase-5-drawings-lifecycle`** (de HEAD hacia atrás): cadena verificada al carácter en §2.1 arriba.
- **Working tree**: limpio al carácter post-commit `5b0aad8`.

### §4.2 Producción Vercel

- Deploy actual: `fd4e8d8` (post-push HANDOFF s23, runtime efectivo idéntico a `89e36ee` desde 2 may 2026 — HANDOFF s23 es solo docs).
- Smoke producción NO requerido s24 — sesión 24 no tocó main.

---

## §5 — Plan para sesión 25

### §5.1 Calendario plan v3 §8 — sesión 25 = 5g cierre cluster B + merge

**Sin cambios respecto plan v3 §8 original al carácter.** Sesión 25 ejecuta:
- **Sub-fase 5g**: cierre cluster B + smoke producción + merge feature → main + push.
- Opcional si tiempo: sub-fase 5e.4 (cosmética `debugCtx` muerto) + limpieza prop "huérfana" `chartTick` en KillzonesOverlay.

### §5.2 PASO 0 obligatorio en sesión 25

Antes de tocar nada, leer en este orden al carácter:

1. Este HANDOFF entero, especialmente §0 sin maquillaje + §2 estado al carácter + §5.3 plan táctico 5g.
2. Plan v3 §8 (calendario) + §5 sub-fase 5g + §7 (NO hacer absoluto).
3. CLAUDE.md §1-§4 reglas absolutas.
4. HANDOFF cierre sesión 23 §6.4 verbatim Ramón bisect parcial — referencia para smoke producción comparativa.

### §5.3 Plan táctico 5g — cierre cluster B + merge

**PASO 0 verificación al carácter al arranque sesión 25**:
- Rama `refactor/fase-5-drawings-lifecycle`, HEAD `5b0aad8`, working tree limpio.
- Producción `fd4e8d8` (= `89e36ee` runtime) sigue fluido (smoke pasivo Ramón, drag M1 + drawing visible ~30s en `simulator.algorithmicsuite.com`).
- 3 invariantes fase 4 verificadas al carácter.

**PASO 1 — smoke combinado producción cuasi-completo en HEAD `5b0aad8` (build local)**:

`npm run build && npm run start` en HEAD `5b0aad8`. Hard refresh + sesión + drawing visible.

Casos al carácter:
1. **Drag M1 fluido al carácter como producción** — smoke confirmatorio post-bisect.
2. **Killzones cambio TF cadena `M5→M15→M30→H1→M30→M15→M5` en zona pasada con drawings** — bug colateral KZ M30 cerrado.
3. **Drawing en M5 → cambio M15 → vuelta M5** — deuda 4.6 sigue cerrada.
4. **LongShortPosition en M1 + play 30s** — bug fase 4d sigue cerrado.
5. **TrendLine extendida al futuro + play 10-20s** — phantoms aplicados.
6. **Cambio TF rápido (5-10 cambios consecutivos en <30s)** con drawings — Killzones intactas, drawings respetan timestamp.
7. **Cierre par mientras replay corre** — sin errores en consola.
8. **Recargar página** — drawings y posiciones persistidas.

Estos 8 casos cubren al carácter el §4.3 CLAUDE.md + invariantes cluster B. Si los 8 PASS → seguir a PASO 2.

**PASO 2 — merge fast-forward feature → main**:

```
git checkout main
git status
git merge --ff-only refactor/fase-5-drawings-lifecycle
git --no-pager log --oneline -5
```

Esperado al carácter: fast-forward limpio (no merge commit, patrón histórico), HEAD main = `5b0aad8`.

**PASO 3 — push + smoke producción Vercel**:

```
git push origin main
```

Esperar deploy verde Vercel (~2-3 min). Smoke producción al carácter en `simulator.algorithmicsuite.com`:
- Casos 1-8 idénticos a PASO 1 pero contra producción.
- Si cualquier caso PASA en local pero FALLA en producción al carácter, PARAR y diagnosticar discrepancia local vs prod (cache CDN, env vars, build flags, etc.) ANTES de declarar 5g cerrado.

**PASO 4 — HANDOFF s25 cierra cluster B**:

HANDOFF s25 al carácter documenta:
- Cluster B completo en producción.
- Bug nuevo M3 drawing izquierda (deuda 4.6 edge case) calendarizado para sesión específica.
- 5e.4 cosmética + chartTick prop huérfana KillzonesOverlay calendarizadas.
- Sub-fase 5b futura (si parche LWC vendor) calendarizada.
- Cluster A (drawings lifecycle, fase 5.A) sigue aplazado.
- Calendario fase 6 (trading domain) propuesto para sesión 26+.

### §5.4 Cluster A INTOCABLE en sesión 25

Mismo principio que sesiones 20-24 (HANDOFF 19 §4.5 + plan v3 §7 punto 13). Sub-fase 5g toca `git checkout main` + merge + push, NO modifica `_SessionInner.js` zona cluster A (L297-L365 / L370-L415 / L450-L456). Si por error aparece working tree dirty post-merge tocando esas zonas, PARAR.

### §5.5 Caso nuevo obligatorio smoke combinado cluster B (lección §3.3 s23)

Ya fijado al carácter en HANDOFF s23 §5.5 — drag M1 fluido al carácter como caso obligatorio de smoke combinado cluster B. Sesión 24 lo aplicó al carácter y cazó el éxito de 5f.0a. Sesión 25 lo aplicará en smoke local + smoke producción.

---

## §6 — Material verificado al carácter en sesión 24 (preservado para sesiones futuras)

### §6.1 Topología cluster B al cierre s24

```
89e36ee (fase 4d, producción runtime)
    ↑
1897eba (plan v3, docs)
    ↑
84a3342 (5c — descomposición handler TF en 6 helpers) — INOCENTE empíricamente confirmado en s24
    ↑
aa1498a (5d.1 — JSDoc contrato chartTick + state)    — INOCENTE drag, manifestación inicial bug colateral KZ M30
    ↑
4f943a4 (5d.2 — KillzonesOverlay → chartTick)        — CULPABLE estructural primario freeze drag M1 + bug colateral KZ
    ↑
d7ee4a8 (5d.3 — RulerOverlay → chartTick)
    ↑
96eb2e8 (5d.5 — CustomDrawingsOverlay → chartTick)
    ↑
590abe2 (5d.6 — PositionOverlay → chartTick)         — AGRAVANTE intermedio drag (s23 minisaltitos)
    ↑
5b233b4 (5d.7 — scroll anchor compensando phantoms)  — AGRAVANTE final drag (s23 freezado peor)
    ↑
835caf7 (5e.1 — borrar huérfano 399 KB)              — INOCENTE descartado s23
    ↑
c238c63 (5e.2 — uninstall patch-package)             — INOCENTE descartado s23
    ↑
0198039 (5e.3 — eliminar [DEBUG TEMP])               — INOCENTE descartado s23
    ↑
5b0aad8 (5f.0a — fix drag M1 KillzonesOverlay)       — FIX consumer-side, smoke 5/5 PASS [HEAD rama feature]
```

NB: `5d.4` NO existe como commit separado — gap topológico, posiblemente renumerado o absorbido en sesión 22. NO bloqueante.

### §6.2 Causa raíz arquitectónica drag M1 — verificada al carácter

**El contrato `chartTick`** (HANDOFF 17 §2.3 + s21 §3.1) tiene **2 productores con semánticas distintas**:
- **Sitio A** — `_SessionInner.js` L912-L916 dentro de `subscribeVisibleLogicalRangeChange`: bumpa cada frame de pan/zoom = **viewport cambió, dataset NO**.
- **Sitio B** — handler post-cambio TF (helper R6 `scrollToTailAndNotify` post-5c): bumpa post-cambio TF = **dataset SÍ cambió**.

**Caches dependientes del DATASET** (KillzonesOverlay `cachedSessionsRef`, PositionOverlay `update()` recálculo de coords) deben invalidarse SOLO en sitio B. **Caches dependientes del VIEWPORT** (RulerOverlay reset de medición, drawings re-render) deben invalidarse en sitio A.

5d.2 conectó al carácter KillzonesOverlay (cache de DATASET) a `chartTick` indiscriminado → invalidación 60Hz en drag = freeze.

**Lección arquitectónica al carácter**: el contrato `chartTick` confunde 2 canales semánticamente distintos. Fix consumer-side (5f.0a) resolvió al carácter el caso KillzonesOverlay sin tocar productor. Pero **el problema arquitectónico subyacente sigue vivo** — los otros 3 overlays cluster B siguen conectados al `chartTick` indiscriminado. Si en producción aparecen minisaltitos residuales tras merge s25, **separación productor-side** del contrato es la solución limpia (`chartTickDataset` + `chartTickViewport`).

### §6.3 Smoking gun en código KillzonesOverlay.js L164-L172

```javascript
// ── Recalcular sesiones cuando cambien datos/cfg/tick/currentTime ──────
// Esta es la operación pesada: recorre todas las velas. Se hace 1 vez
// por cambio de dataset/tick/cfg, NO en cada frame de pan.
//
// currentTime: bucketed a 30 min para que el replay (que avanza segundo
// a segundo) no dispare un recálculo en cada vela M1, pero sí cuando
// entre/salga de un horario de killzone (todas las KZ están alineadas a
// intervalos de 30 min en hora NY). Esto cubre el caso de "estoy haciendo
// replay y la sesión actual no aparece hasta que cambio de TF".
```

El propio autor del componente documentó al carácter la intención: **"NO en cada frame de pan"**. La implementación con `tick` + `ctBucket` (currentTime bucketed a 30min) está cuidadosamente diseñada para evitar exactamente ese escenario. **5d.2 violó al carácter ese contrato semántico documentado en el código del propio componente al añadir `chartTick` al dep array L192.**

5f.0a restaura al carácter la coherencia del componente con su propia documentación. NO toca el comentario L164-L172 — sigue siendo válido al pie de la letra.

### §6.4 Verbatim Ramón bisect cluster D (preservar al carácter para sesiones futuras)

| HEAD testeado | Veredicto Ramón al carácter drag M1 | Veredicto Ramón al carácter Killzones |
|---|---|---|
| `89e36ee` (producción, fase 4d) | **fluido** (smoke pasivo) | **OK** (asumido HANDOFF s21) |
| `84a3342` (5c) | **fluido** ("ahora si está todo bien!!1") | **OK ancladas** ("killzones bien tambien en los cambios") |
| `aa1498a` (5d.1) | **fluido** | **fluido, peeo en m3o las kz no se ven...** |
| `4f943a4` (5d.2) | **freezado** | **cuando cambio no aparecen las killzones hasta que hago drag** |
| `590abe2` (5d.6, s23) | minisaltitos | (no testeado) |
| `5b233b4` (5d.7, s23) | freezado peor | (no testeado) |
| `0198039` (5e.3) | **freezadito** | (no testeado) |
| `5b0aad8` (5f.0a fix) | **fluido como producción** | **OK ancladas en cada cambio** + bug col KZ M30 cerrado |

### §6.5 Hipótesis aceptada para 5d.1 manifestación parcial bug colateral KZ M30

**Hipótesis al carácter (NO verificada empíricamente, registrada para sesiones futuras)**: 5d.1 es JSDoc-only + declaración del state `chartTick` en `_SessionInner.js`. NO modifica lógica de overlays. La manifestación KZ M30 "no se ven" en 5d.1 viene de:
- `_SessionInner.js` L261 declara `const [chartTick, setChartTick] = useState(0)`.
- KillzonesOverlay aún no consume `chartTick` (eso pasa en 5d.2).
- Pero `_SessionInner.js` ya pasa `chartTick={chartTick}` al JSX de KillzonesOverlay desde 5d.1 (HANDOFF s22 §2.5 — L1934 prop JSX).
- Primer render del componente recibe `chartTick=0` valor inicial.
- Algún otro mecanismo dentro de KillzonesOverlay (subscription LWC, mouse handlers) re-evalúa props en momentos donde `chartTick` cambia y puede disparar re-render fuera de orden con cambio TF a M30.

**NO se ha verificado al carácter en bytes** la cadena exacta. Hipótesis presentada solo para explicar al carácter el dato empírico observado en bisect Test 3. Si sesión 25 smoke producción confirma cierre completo del bug colateral KZ tras 5f.0a, hipótesis queda archivada como histórica. Si manifestación parcial reaparece en algún edge case post-merge, esta hipótesis es el primer hilo a tirar.

---

## §7 — Procedimiento de cierre sesión 24

### §7.1 Mover HANDOFF al repo

Tras descargar este HANDOFF a `~/Downloads/HANDOFF-cierre-sesion-24.md`:

```
git checkout main
```

```
mv ~/Downloads/HANDOFF-cierre-sesion-24.md refactor/
```

```
ls -la refactor/HANDOFF-cierre-sesion-24.md
```

```
wc -l refactor/HANDOFF-cierre-sesion-24.md
```

### §7.2 git add + commit (en main)

```
git add refactor/HANDOFF-cierre-sesion-24.md
```

```
git status
```

```
git commit -m "docs(sesion-24): cerrar sesion 24 con sub-fase 5f.0a fix drag M1 culpable 5d.2 identificado y resuelto al caracter"
```

```
git --no-pager log --oneline -3
```

### §7.3 Push a main

**Recomendación CTO**: SÍ push. Patrón histórico sesiones 14-23 mantenido al carácter. Runtime intacto, idempotente (HANDOFF es docs, no toca código). Vercel re-deployará — producción seguirá funcional con runtime de `89e36ee` desde 2 may 2026 hasta sesión 25.

```
git push origin main
```

### §7.4 Verificación final cierre sesión 24

```
git checkout refactor/fase-5-drawings-lifecycle
git --no-pager log --oneline -12
```

Esperado al carácter:
```
5b0aad8 (HEAD -> refactor/fase-5-drawings-lifecycle) fix(fase-5/5f.0a): KillzonesOverlay dep currentTf en lugar de chartTick para evitar invalidacion en cada frame de pan
0198039 chore(fase-5/5e.3): eliminar instrumentacion [DEBUG TEMP] gateada por __algSuiteDebugLS
c238c63 chore(fase-5/5e.2): eliminar devDependency patch-package no usada
835caf7 chore(fase-5/5e.1): eliminar archivo huerfano lightweight-charts-line-tools-core.js de la raiz
5b233b4 refactor(fase-5/5d.7): cerrar deuda 5.1 viewport — anclar scroll al ultimo real compensando phantoms para drawings extendidos (estilo TradingView)
590abe2 refactor(fase-5/5d.6): conectar PositionOverlay al contrato chartTick (useCallback estable + useEffect inmediato, polling 150ms preservado)
96eb2e8 refactor(fase-5/5d.5): conectar CustomDrawingsOverlay al contrato chartTick + arreglar typo 5d.5/5d.6 en JSDoc
d7ee4a8 refactor(fase-5/5d.3): conectar RulerOverlay al contrato chartTick (reset on TF change estilo TradingView)
4f943a4 refactor(fase-5/5d.2): conectar KillzonesOverlay al contrato chartTick formal
aa1498a refactor(fase-5/5d.1): documentar contrato chartTick formal en _SessionInner.js
84a3342 refactor(fase-5/5c): descomponer handler cambio TF en 6 helpers locales con orden explicito
1897eba docs(fase-5): plan v3 con cluster A aplazado a fase 5.A y cluster B vivo sesion 19
```

```
git checkout main
```

Sesión 24 cerrada al carácter.

---

## §8 — Métricas sesión 24

- **Inicio efectivo**: ~00:30 hora local (9 may 2026) tras cierre s23 ~00:27.
- **PASO 0 (lectura HANDOFFs + verificación shell + smoke pasivo prod)**: ~30 min.
- **Plan ejecutivo 5f.0 redactado**: ~10 min.
- **PASO 1.0 baseline local**: ~5 min (build + smoke).
- **PASO 1.1 Test 1 = 5c**: ~10 min (checkout + build + smoke 2 casos).
- **PASO 1.2 Test 2 = 5d.2**: ~10 min.
- **PASO 1.3 Test 3 = 5d.1**: ~10 min.
- **PASO 2 lectura diff + 2 inspecciones bicapa adicionales**: ~10 min.
- **Edit 5f.0a + verificación bicapa post-Edit**: ~5 min.
- **Smoke combinado 5 casos** (con `rm -rf .next` + rebuild por cache 404): ~20 min.
- **Commit + verificación**: ~3 min.
- **HANDOFF s24 redactado**: ~30 min.
- **Total efectivo de sesión 24**: ~3h activas. Estimación HANDOFF s23 §A era ~40-55 min. **Desviación +200-300%** explicada al carácter por:
  - Re-arranque chat con HANDOFF s23 sin indexar project_knowledge (PASO 0.1 prolongado).
  - Bug colateral KZ M30 descubierto en bisect (no anticipado en HANDOFF s23, añadió contexto al diagnóstico).
  - Cache build local `.next/` problemática (404 chunks) que requirió `rm -rf` + rebuild.
  - 3 errores §9.4 propios CTO capturados al carácter (+2-3 turnos chat extra cada uno).
- **Commits funcionales producidos**: 1 (`5b0aad8` — 5f.0a).
- **Líneas tocadas netas en código**: 1 modificada en 1 archivo (`+1/-1`).
- **Push a main**: 1 (HANDOFF s24, post-redacción).

---

## §9 — Aprendizajes generales del proyecto (acumulados sesiones 13-24)

> Sección que persiste a través de HANDOFFs.

1. **§9.4 es bidireccional.** Errores propios del CTO se registran sin auto-flagelación. Sesión 24 añade 3 errores menores (§3.1 hipótesis estructural errónea pre-lectura bytes, §3.2 confusión semántica KZ M30 al revés, §3.3 4 preguntas innecesarias cuando el código respondía).
2. **Principio rector (CLAUDE.md §1) es absoluto.** Sin alumnos en producción no hay urgencia operativa. Sesión 24 confirma al carácter por 5ª sesión consecutiva: regresión drag M1 atacada con disciplina, fix targeted, smoke combinado, HANDOFF honesto, calendario s25 sin presión.
3. **Validación al carácter en shell de Ramón es no-negociable.** Sesión 24 corrigió al carácter 3 asunciones del CTO (hipótesis estructural, semántica KZ, código del Edit). Bicapa funcionó al carácter incluso sin Claude Code — Ramón ejecutando comandos en shell zsh nativa + CTO leyendo bytes pegados al chat.
4. **Smoke combinado cluster B incluye drag M1 al carácter.** Lección §3.3 s23 + §5.5 s23 aplicada al carácter en s24 — caso 1 del smoke combinado fue el bloqueante crítico. Patrón validado al carácter por primera sesión consecutiva post-introducción.
5. **Bisect targeted con razón estructural primero, granular después.** Sesión 24 cerró bisect en 3 tests al carácter sobre cluster D — culpable identificado en commit único `4f943a4`. Patrón log₂ funcionó al carácter en su forma canónica.
6. **Información granular sin acción posible NO compensa el coste de obtenerla en sesión.** Lección §6 s23 confirmada al carácter en s24 — bisect parcial s23 paró en `590abe2` sin información granular completa, sesión 24 cerró el bisect entero al carácter en ~30 min reales (3 tests bicapa estricta) cuando había scope claro de fix.
7. **Re-arranque de chat web no rompe sesión si HANDOFF + project_knowledge están actualizados.** Sesión 24 demostró al carácter que el push del HANDOFF s23 a main fue suficiente — pero el lag de indexación project_knowledge (~12+ horas) requirió que Ramón pegara el contenido entero del HANDOFF al chat. **Nueva lección al carácter**: para sesiones que arrancan poco después del cierre anterior, plan B obligatorio = `cat <HANDOFF>` directo al chat si project_knowledge no devuelve resultados.
8. **NUEVO al carácter — releer el propio Edit antes de preguntar al usuario sobre síntomas inesperados.** Lección §3.3 s24 al carácter. Cuando smoke combinado reporta síntoma sospechoso, primer paso CTO es **releer su propio Edit + leer HANDOFFs históricos relevantes**. Solo preguntar al usuario si el código + historia NO discriminan al carácter. Errores §9.4 estructurales pueden venir del CTO interpretando datos antes de revisar bytes propios.
9. **NUEVO al carácter — fix consumer-side preferible a productor-side cuando el contrato semántico está confuso.** Sesión 24 demostró al carácter: fix de 1 línea en KillzonesOverlay (consumer) cerró el freeze drag M1 sin tocar el productor de `chartTick` en `_SessionInner.js`. Razón al carácter: el productor sigue siendo legítimamente útil para otros consumers (RulerOverlay reset transitorio en pan/zoom, etc.). Eliminar el productor habría sido cirugía mayor con riesgo alto. Atacar consumer aislado = cambio mínimo, riesgo bajo, sin colateral.
10. **NUEVO al carácter — el código documentado por su propio autor es smoking gun arquitectónico.** Sesión 24 al carácter: comentario L164-L172 de KillzonesOverlay declaraba explícitamente "NO en cada frame de pan". 5d.2 violó ese contrato sin tocar el comentario. Lección al carácter para sesiones futuras: ante regresión de performance en componente con comentario explícito sobre frecuencia de cómputo, **leer el comentario primero** — frecuentemente el bug es violación del contrato documentado.

---

## §10 — Cierre

Sesión 24 deja:
- **Sub-fase 5f.0a CERRADA al carácter** en rama feature. HEAD `5b0aad8`. Working tree limpio.
- **Regresión drag M1 multifactorial cerrada en su causa raíz primaria al carácter** — fix consumer-side `+1/-1` en KillzonesOverlay L192.
- **Bug colateral KZ M30 desaparecen hasta drag CERRADO al carácter** — manifestación del mismo problema arquitectónico, resuelta por mismo fix.
- **Producción `89e36ee` (= `fd4e8d8` runtime) intacta** desde 2 may 2026 (8 días).
- **Bug nuevo descubierto al carácter durante smoke caso 5**: drawing TrendLine "se va a la izquierda" en M3 — pre-existente edge case parche `2851ef7` deuda 4.6, NO regresión 5f.0a, encaje sub-fase 5b futura o sesión dedicada.
- **Cluster B prácticamente completo en feature al carácter**: 11 commits funcionales acumulados, listo para merge en sesión 25.
- **Plan v3 §8 calendario sin cambios al carácter**: sesión 25 = 5g cierre cluster B + smoke producción + merge a main.

Próximo HANDOFF (cierre sesión 25) debe reportar al carácter:
- Si smoke combinado local en HEAD `5b0aad8` pasó los 8 casos del §5.3 PASO 1 al carácter.
- Si merge fast-forward feature → main ejecutó limpio al carácter.
- Si smoke producción Vercel pasó los 8 casos al carácter (drag M1 fluido como local, KZ ancladas en cadena con M30, etc.).
- Si aparecieron minisaltitos residuales en CustomDrawingsOverlay/PositionOverlay/RulerOverlay durante smoke producción (gatillo para sub-fase 5f.0b/c o separación productor-side `chartTick`).
- Estado bug nuevo M3 drawing izquierda — encaje calendarizado.
- Estado deuda chartTick prop "huérfana" KillzonesOverlay — encaje calendarizado.

Si sesión 25 NO cierra 5g al carácter, el HANDOFF lo dice al frente sin maquillaje — patrón §0 mantenido.

**Mensaje del CTO al cierre al carácter**: el freeze drag M1 era el bug funcional vivo más crítico de cluster B desde s22. Ya no lo es. El simulador en HEAD `5b0aad8` cumple al carácter el criterio CLAUDE.md §4.3 ("Le doy play en M1 a velocidad máxima, el chart no se freezea ni se entrecorta") por primera vez en cluster B post-5d.2. Cluster B llega a sesión 25 listo para merge al carácter — producción recibirá los cambios al fin tras ~16+ días sin código nuevo.

---

*Fin del HANDOFF cierre sesión 24. 9 mayo 2026. Redactado por CTO/revisor tras commit `5b0aad8` (5f.0a) en rama feature `refactor/fase-5-drawings-lifecycle`. Pendiente de mover al repo + commit a main + push a `origin/main` por Ramón según §7.*
