# HANDOFF — cierre sesión 48

> Sesión 48 cerrada el 1 junio 2026, hora local.
> Sesión 48 = **ejecución de Fase 5.A-3 (persistencia per-par consumer-side)**. PASO 0 baseline bicapa REAL (9 checks repo + 3 checks BD) + cierre de las 5 preguntas de diseño abiertas de `fase-5A-3-plan.md` §2 + **Corte A (migración índice BD, gate §3.1, OK explícito Ramón)** + **Corte B (código per-par, 5 reemplazos + 1 renombrado en `_SessionInner.js`, commit local SIN push)**.
> **Resultado al carácter sin maquillaje**: **PASO 0 baseline bicapa REAL ✓ (12/12 checks)** — estado heredado s47 exacto, cero deriva. **Las 5 preguntas de diseño CERRADAS** con bytes y razonamiento de runtime: §2.1 fuente `activePairRef.current` + §2.2 normalización sin barra (`normPair`) + §2.3 deps `+activePair` + carga por closure + stale-guard (la lectura **corrige la hipótesis del plan** sobre el batching de React 18) + §2.4 filas válidas + §3.3 índice-primero. **Corte A ejecutado**: backup fresco `_backup_s48` (con RLS + política) + 0 colisiones verificadas + `ALTER DROP UNIQUE(session_id)` + `ALTER ADD UNIQUE(session_id, pair)` + verificación `pg_constraint` post al carácter. **Corte B ejecutado**: `normPair` + fuente par activo + 2 filtros `.eq('pair')` + deps + stale-guard, verificado bicapa 12/12, **commit `4e5fc7e` LOCAL — NO pusheado**. **Hallazgo de datos**: la tabla viva pasó de 21→20 filas desde s47 (CASCADE benigno) — dato heredado actualizado a **20 filas**.
> **2 ERRORES §9.4 PROPIOS CTO — sin maquillaje, ambos CONTENIDOS antes de causar daño**: (1) bloque de backup A.1 redactado SIN RLS pese a que `_backup_s45` consta con RLS → gap de seguridad potencial, **cazado por el guard de Supabase Studio ANTES de ejecutar**, corregido con `enable row level security` + política `service_role`, cero datos expuestos; (2) Edit Corte B introdujo variable local `loadPair` sin grep previo de colisión → shadowing de la `useCallback loadPair` L821, **cazado por Claude Code (segunda capa) ANTES del commit**, benigno en runtime (scope cerrado), corregido a `loadPairKey`, cero impacto. Ambos comparten raíz: enumeración insuficiente antes de redactar (§38/§43 en dominios de seguridad y nombres). Detalle §10. Streak: 7→3→0→0→0→0→2→0→**2**.
> **Estado BD al cierre s48**: `session_drawings` **20 filas**, `pair` text NOT NULL, 0 NULLs, todas `EURUSD`. **Constraint `UNIQUE (session_id, pair)` (`session_drawings_session_id_pair_key`) NUEVO — modelo migrado a per-par.** La vieja `UNIQUE (session_id)` ELIMINADA. `pkey(id)` + 2 FK CASCADE intactas. Backups: `_backup_s45` (21 filas, RLS) + `_backup_s48` (20 filas, RLS + política `service_role`), ambos conservados, drop diferido a cierre Bloque 2.
> **`components/_SessionInner.js`** md5 `41865af1791719cfb2287ce009f97374` (**3077 líneas — TOCADO este sesión**, era `702aaca5…` / 3060). **Cluster A `lib/chartViewport.js` §1.7 INTACTO vigesimonovena sesión consecutiva** md5 `06f531ca75abc1fc6e0919612f04ec9f`. **`lib/chartRender.js`** md5 `5af39d6036c7852a86249b74188a024e` (141 líneas). **3 invariantes fase 4 intactas vigesimonovena sesión consecutiva** (verificadas en PASO 0 y post-Corte B).
> **1 lección nueva formal (§56)**: antes de redactar un Edit que introduce un identificador nuevo o crea una tabla, enumerar en bytes lo que podría colisionar (grep del nombre candidato + estándar de seguridad establecido como RLS). Extiende §38/§43 a los dominios de nombres y seguridad. Detalle §11.
> **Producción Vercel runtime efectivo = `41d7477`** (feat fase-5A-2, desde s46) — **SIN CAMBIO** en s48 (Corte B NO pusheado). La BD SÍ migró a per-par, pero el código viejo en producción opera bajo la regla nueva sin chocar (superset permisivo, §3.3). Ventana entre cortes segura.
> Próxima sesión = sesión 49. **Prioridad = PUSH del código (`4e5fc7e` + este HANDOFF) → deploy Vercel → SMOKE multi-par discriminante en producción (§50, árbitro de §2.3)**, con `git revert` listo si el smoke falla. Cluster A NO se ratifica (Bloque 2 NO cerrado, Fase 6 NO desbloqueada) hasta el smoke PASS. Detalle §13.

---

## §0 — Estado al cierre sesión 48, sin maquillaje

**Sesión 48 produjo 1 commit de código LOCAL (sin push) + 1 commit HANDOFF (sin push)**:
- `4e5fc7e feat(fase-5A-3): persistencia per-par session_drawings consumer-side` — 1 archivo modificado (`components/_SessionInner.js`), +20/−3. **LOCAL, NO pusheado.**
- HANDOFF s48 (este documento) — patrón canónico §54, por commitear LOCAL sobre `4e5fc7e`, **NO pushear**.

HEAD local main al cierre operativo s48 (pre-HANDOFF) = `4e5fc7e`. `origin/main` = `895bba8` (HANDOFF s47). **Dos commits locales por delante de origin al cierre: `4e5fc7e` + HANDOFF s48.**

**Producción Vercel runtime efectivo = `41d7477`** — SIN CAMBIO en s48. El Corte B se commiteó local pero NO se pusheó; producción sigue corriendo el código viejo (filtra solo por `session_id`).

**Realidad sin maquillaje al carácter**:

1. **PASO 0 baseline verificación bicapa REAL** — 9 checks repo + 3 checks BD, 12/12 PASS. Estado heredado s47 exacto. Detalle §1.
2. **Las 5 preguntas de diseño de `fase-5A-3-plan.md` §2 CERRADAS** — con bytes (§2.1/§2.2/§2.4) + razonamiento de runtime (§2.3) + regla de orden (§3.3). Detalle §2.
3. **Corte A — migración del índice (gate §3.1, OK explícito Ramón)** — backup fresco + 0 colisiones + `ALTER DROP/ADD` + verificación `pg_constraint`. Atómico paso a paso. Detalle §3.
4. **Corte B — código per-par (commit local sin push)** — 5 reemplazos + 1 renombrado, verificado bicapa 12/12. Detalle §4.
5. **2 errores §9.4 propios CTO, ambos contenidos antes de causar daño** (Supabase guard + Claude Code). Detalle §10.
6. **1 lección nueva formal (§56)** + lecciones previas reforzadas. Detalle §11.
7. **Hallazgo de datos: tabla viva 21→20 filas (CASCADE benigno desde s47)** — dato heredado actualizado, no bloqueante. Detalle §3.A.1.
8. **3 invariantes fase 4 intactas vigesimonovena sesión consecutiva** + `chartViewport.js` §1.7 intacto vigesimonovena.

---

## §1 — PASO 0 baseline verificación bicapa REAL (12/12)

Ejecutado por Ramón en zsh nativo + SQL Editor Supabase Studio — output verbatim (§49). Bloques **agrupados** (ajuste de ritmo s48): un bloque repo + un bloque BD.

### §1.1 Repo (9 checks zsh)

| Check | Esperado | Real | OK |
|---|---|---|---|
| `git status --short` | vacío | vacío | ✓ |
| HEAD local | `895bba8` | `895bba8` | ✓ |
| origin/main | `895bba8` | `895bba8` | ✓ |
| log -5 | 895bba8+fc99339+f036f05+41d7477+8683c90 | íd. verbatim | ✓ |
| wc `_SessionInner.js` | 3060 | 3060 | ✓ |
| wc `chartViewport.js` | 201 | 201 | ✓ |
| wc `chartRender.js` | 141 | 141 | ✓ |
| md5 `_SessionInner.js` | `702aaca5…` | exacto | ✓ |
| md5 `chartViewport.js` (29ª) | `06f531ca…` | exacto | ✓ |
| md5 `chartRender.js` | `5af39d60…` | exacto | ✓ |
| invariantes (0/3/header §1.7) | íd. | exacto | ✓ |

**Reconciliación de HEAD confirmada**: el cuerpo del HANDOFF s47 cerraba en `fc99339` (estado pre-commit del propio HANDOFF). El commit del HANDOFF s47 = `895bba8`, ya en origin → HEAD esperado en s48 = `895bba8`, verificado. Cero deriva. **§1.7 chartViewport.js intacto: 29ª sesión consecutiva.**

### §1.2 BD (3 checks SQL Editor — ejecutados por separado, lección s47)

| Check | Esperado | Real | OK |
|---|---|---|---|
| columna `pair` NOT NULL | `pair, NO` | `pair, NO` | ✓ |
| `nulls_restantes` | 0 | 0 | ✓ |
| `pg_constraint` | `UNIQUE (session_id)` AÚN intacto (no migrado) + pkey + 2 FK CASCADE | exacto | ✓ |
| `backup_s45` | 21 | 21 | ✓ |

`pg_constraint` baseline al carácter: `session_drawings_pkey` (PK id) + `session_drawings_session_id_fkey` (FK→sim_sessions CASCADE) + `session_drawings_session_id_key` (UNIQUE session_id) + `session_drawings_user_id_fkey` (FK→auth.users CASCADE). **El FK `user_id → auth.users CASCADE` queda re-confirmado en bytes → ratifica el hallazgo s47 §2.5** (sigue no bloqueante). **PASO 0 ÍNTEGRO CERRADO al carácter (12/12).**

---

## §2 — PASO 1: las 5 preguntas de diseño CERRADAS

Read-only + diagnóstico empírico (§38) antes de cada decisión. Ninguna decisión se cerró de cabeza.

### §2.1 — Fuente del `pair` (CERRADA)

**Decisión**: cambiar la fuente del par de `sessionRef.current?.pair` (par principal de sesión, L324) a **`activePairRef.current`** (par activo). Per-par real exige el par ACTIVO en el guardado.
**Bytes**: `activePairRef` (L167 `useRef(null)`) es **mirror sincronizado** del state `activePair` vía L428 `useEffect(()=>{activePairRef.current=activePair},[activePair])`. Patrón ya vivo en el repo (lo leen L376, L835, L1853, etc.). Leerlo en el guardado es seguro.
**Guard NOT NULL**: como la columna es NOT NULL y `activePairRef` arranca `null`, la fuente lleva fallback: `normPair(activePairRef.current || sessionRef.current?.pair)`. No-null garantizado.

### §2.2 — Formato del par / normalización (CERRADA)

**Decisión**: normalizar **SIN BARRA** con helper puro `normPair(p) = (p||'').replace(/\//g,'')`, aplicado en las **dos caras** (guardado + carga).
**Bytes (landmine confirmado, no era hipótesis)**: conviven DOS formatos en el repo.
- Con barra `EUR/USD` → capa simulador/dashboard: `ALL_PAIRS` (`_SessionInner.js:36`), fallback L575, `sessionData.js` JSDoc, `pages/dashboard.js` (:69/:181/:264).
- Sin barra `EURUSD` → capa challenge: `ChallengeSetupModal.js:56`, `pages/api/challenge/create.js:13`.
- **Las 20 filas vivas = `EURUSD`** (sin barra). `normPair` colapsa challenge (ya sin barra) + dashboard/sim (con barra → strip) + las 20 filas existentes en una sola convención. **Cero migración de datos** (§2.4).
**Menor anotado (no bloqueante)**: `pages/dashboard.js` L264 incluye `XAU/USD` que `ALL_PAIRS` L36 no tiene. Ajeno al formato.

### §2.3 — Deps de carga `[pluginReady, id]` (la empírica — CERRADA; la lectura corrige la hipótesis del plan)

**Hipótesis del plan**: como el plugin se recrea por par y `pluginReady` hace false→true, la carga PODRÍA ya re-dispararse sin tocar deps → "basta `.eq('pair')`".
**Bytes (corrigen la hipótesis)**: secuencia real al cambiar par A→B:
- reset L179 `[activePair]` → `pluginRef=null` + `setPluginReady(false)`.
- initPlugin-runner L184 `[dataReady, initPlugin]` → `initPlugin` cambia identidad (su dep es `activePair`) → corre → `setPluginReady(true)`.
- Ambos effects corren en **el mismo flush** → React 18 batchea las dos `setState` → `pluginReady` neto se queda `true`, **sin `false` observable**. → el ciclo `pluginReady` **probablemente NO re-dispara** la carga. **Hace falta `activePair` en deps L390.**
**Dos trampas adicionales que la lectura destapó (§38/§43)**:
1. **Orden de effects**: carga L359 < sync del ref L428 → en el flush, `load()` corre ANTES de que `activePairRef.current` se actualice → en la **carga** hay que leer el **closure `activePair`** (valor fresco del re-run), NO el ref.
2. **Async stale**: A→B rápido, el `load()` de A (await) puede resolver con B ya activo → `importTools(A.v)` entraría en el plugin de B → contaminación cruzada. Necesita stale-guard.
**Decisión (robusta a las tres, caiga como caiga el batching real)**: deps L390 `+= activePair` + carga por **closure** (`const loadPairKey = normPair(activePair)`) + filtro `.eq('pair', loadPairKey)` + stale-guard `if(normPair(activePairRef.current)!==loadPairKey) return`. **Asimetría deliberada: ref para guardar (tiempo de evento, ya sincronizado), closure para cargar (effect re-run, ref aún viejo).**
**Árbitro pendiente**: smoke multi-par discriminante (§50) en s49 confirma cuál muerde de verdad. El corte ya queda blindado contra las tres.

### §2.4 — Filas existentes (CERRADA)

**Decisión**: las 20 filas `EURUSD` (sin barra) son válidas tras migrar índice; `normPair` las mantiene idénticas (no hay barra que quitar). Check de **0 colisiones `(session_id, pair)`** ejecutado **empíricamente** como gate pre-ALTER del Corte A (§38: no asumir en el momento de mutar), no por entailment. Resultado: 0 colisiones. Detalle §3.A.2.

### §3.3 — Orden índice/código (CERRADA: ÍNDICE-PRIMERO)

**Decisión**: índice-primero. **Razón dura (regla de oro: el código no puede romper en la ventana entre cortes)**:
- **Código-primero ROMPE**: con `UNIQUE (session_id)` aún vivo, al tocar un 2º par en una sesión el guardado cae a `INSERT (session_id=X, pair=B)` → choca con la fila de A (`session_id=X`) → viola el constraint → INSERT falla.
- **Índice-primero es SEGURO**: `UNIQUE (session_id, pair)` es superset permisivo del viejo. El código VIEJO (producción `41d7477`, filtra solo por `session_id`) opera idéntico bajo la regla más laxa — nunca crea 2ª fila/sesión porque no conoce pares. Las 20 EURUSD (session_id único) satisfacen el constraint nuevo sin tocarse.
Ratifica la tendencia CTO preliminar del plan, ahora con el porqué en bytes.

---

## §3 — PASO 2: Corte A — migración del índice (gate §3.1, OK explícito Ramón)

Ejecutado en SQL Editor Supabase Studio. **Atómico paso a paso, NO agrupado** (disciplina §3.1). La tabla viva se tocó únicamente en A.3.

### §3.A.1 — Backup fresco `_backup_s48` + hallazgo delta 21→20

**Por qué backup fresco**: `_backup_s45` es de antes de la columna `pair` (s45) → no sirve para restaurar el estado de hoy. Snapshot exacto del estado actual justo antes de tocar nada.
**Error §9.4 nº1 (contenido)**: el primer bloque A.1 (`create table as select` + count) se redactó SIN RLS → el guard de Supabase Studio lo flagueó ("Potential issue detected: query creates a table without RLS"). Se canceló (NO se ejecutó el SQL sin RLS) y se rehízo con `enable row level security` + política `service_role` (`using(true) with check(true)`), replicando cómo quedó `_backup_s45`. Cero datos expuestos.
**Hallazgo de datos**: el backup devolvió **20**, no 21. Cross-check `viva=20, backup=20` → backup FIEL; la tabla viva pasó de 21→20 entre cierre s47 y hoy = **CASCADE benigno** (se borró una `sim_session` o `auth.user` de testing → arrastró su fila). Mismo fenómeno documentado en s46. **Dato heredado actualizado: `session_drawings` = 20 filas.** No bloqueante.

### §3.A.2 — Verificación 0 colisiones

```sql
select session_id, pair, count(*) from session_drawings
group by session_id, pair having count(*) > 1;
```
Resultado: **0 filas** ("Success. No rows returned"). Vía libre confirmada en bytes (no por entailment). El `ALTER ADD CONSTRAINT` no chocará.

### §3.A.3 — ALTER + verificación `pg_constraint` (el único paso que tocó la tabla viva)

```sql
alter table session_drawings drop constraint session_drawings_session_id_key;
alter table session_drawings add constraint session_drawings_session_id_pair_key unique (session_id, pair);
select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid='session_drawings'::regclass;
```

`pg_constraint` post-ALTER al carácter (§38, no fiarse del editor):

| conname | tipo | def | OK |
|---|---|---|---|
| `session_drawings_pkey` | p | PRIMARY KEY (id) | ✓ intacto |
| `session_drawings_session_id_fkey` | f | FK session_id→sim_sessions(id) CASCADE | ✓ intacto |
| `session_drawings_session_id_pair_key` | u | **UNIQUE (session_id, pair)** | ✓ NUEVO presente |
| `session_drawings_user_id_fkey` | f | FK user_id→auth.users(id) CASCADE | ✓ intacto |
| `session_drawings_session_id_key` | — | — | ✓ AUSENTE (eliminado) |

**Corte A CERRADO al carácter.** BD en modelo per-par. Gate §3.1 satisfecho. Producción `41d7477` estable (código viejo opera bajo la regla nueva, §3.3).

---

## §4 — PASO 3: Corte B — código per-par (commit local SIN push)

Patrón canónico bicapa. Un Edit lógico a Claude Code (5 reemplazos), aprobado opción 1 manual. Cero archivos nuevos, cero imports, cero dependencias npm. Todo en `components/_SessionInner.js`.

### §4.1 — Edit lógico (5 reemplazos)

1. **Helper `normPair`** tras `ALL_PAIRS` (L36): `const normPair = (p) => (p || '').replace(/\//g, '')`.
2. **Guardado, fuente del par** (L324): `const pair = normPair(activePairRef.current || sessionRef.current?.pair)` (par activo + fallback no-null).
3. **Guardado, filtro UPDATE** (L353): `+ .eq('pair', pair)`.
4. **Carga, closure + filtro + stale-guard** (L374-380): `const loadPairKey = normPair(activePair)` + `.eq('pair', loadPairKey)` en el SELECT + `if (normPair(activePairRef.current) !== loadPairKey) return`.
5. **Carga, deps** (L407): `[pluginReady, id]` → `[pluginReady, id, activePair]`.

### §4.2 — Colisión `loadPair` cazada + renombrado (error §9.4 nº2, contenido)

**Error §9.4 nº2 (contenido)**: el Edit (reemplazo 4) introdujo una variable local `loadPair` sin grep previo de colisión. **Claude Code (segunda capa) lo avisó**: ya existe `const loadPair = useCallback(async(pair)=>...)` en L821 (carga de datos/velas, función distinta), con 5 usos más (L871/L1107/L1298/L1300/L1302, incluidos en deps de effects). Verificado en bytes con `grep -n` (§38, no fiarse del aviso a ciegas). Mi variable la sombreaba en scope cerrado → benigno en runtime PERO deuda de legibilidad en un archivo de 3077 líneas. **Renombrado a `loadPairKey`** (3 reemplazos, solo lo mío; el `loadPair` L821 y sus 6 usos intactos). Cero impacto runtime.

### §4.3 — Verificación bicapa final (12/12)

| Check | Esperado | Real | OK |
|---|---|---|---|
| `git status` | solo `_SessionInner.js` (M) | ` M components/_SessionInner.js` | ✓ |
| wc `_SessionInner.js` | 3077 | 3077 | ✓ |
| wc `chartViewport.js` | 201 | 201 | ✓ |
| wc `chartRender.js` | 141 | 141 | ✓ |
| md5 `chartViewport.js` §1.7 (29ª) | `06f531ca…` | exacto | ✓ |
| md5 `chartRender.js` | `5af39d60…` | exacto | ✓ |
| `setData\|update` | 0 | 0 | ✓ |
| `computePhantomsNeeded` | 3 | 3 | ✓ |
| header §1.7 | verbatim | verbatim | ✓ |
| `normPair` | 4 | 4 | ✓ |
| `loadPairKey` | 3 | 3 | ✓ |
| `loadPair` (substring grep) | 9 | 9 (3 loadPairKey + 6 viejo) | ✓ |
| `.eq('pair'` | 2 líneas (L353+L376) | L353+L376 | ✓ |
| deps `+activePair` | 1 línea (L407) | L407 | ✓ |

**§1.7 intacta 29ª consecutiva. 3 invariantes fase 4 intactas. Solo se tocó el archivo previsto.** Nota de método: `grep -c loadPair` matchea `loadPairKey` como substring → 9, no 6; el conteo limpio del viejo (6) viene del `grep -n` previo. Para aislar el viejo: `grep -cw loadPair`.

### §4.4 — Commit `4e5fc7e` (local, sin push)

```
[main 4e5fc7e] feat(fase-5A-3): persistencia per-par session_drawings consumer-side
 1 file changed, 20 insertions(+), 3 deletions(-)
```

| Check | Esperado | Real | OK |
|---|---|---|---|
| commit stat | 1 file, +20/−3 | íd. | ✓ |
| HEAD local | hash nuevo | `4e5fc7e` | ✓ |
| `git status` | vacío | vacío | ✓ |
| origin/main | `895bba8` (sin cambio) | `895bba8` | ✓ |

diff `+20/−3` cuadra exacto: R1 +5, R2 +4/−1, R3 +1, R4 +9/−1, R5 +1/−1 (renombrado absorbido in-place, net 0). Final 3060 + 17 = 3077. **NO pusheado → producción intacta en `41d7477`.** md5 nuevo `_SessionInner.js` = `41865af1791719cfb2287ce009f97374` (baseline para PASO 0 s49).

---

## §5 — Estado producción + BD al cierre

**Producción Vercel runtime = `41d7477`** (feat fase-5A-2). El Corte B (`4e5fc7e`) es LOCAL, no pusheado. Estado actual de producción: **BD per-par (Corte A desplegado) + código viejo (filtra solo `session_id`)**. Es seguro por §3.3 — el código viejo nunca crea 2ª fila/sesión → opera sin chocar bajo `UNIQUE (session_id, pair)`. **Ventana entre cortes segura.** El push del código nuevo (+ smoke acto seguido) es lo primero de s49.

**BD `session_drawings` al cierre s48**: 20 filas, `pair` text NOT NULL, 0 NULLs, todas `EURUSD`. Constraint `UNIQUE (session_id, pair)` (`session_drawings_session_id_pair_key`). `pkey(id)` + 2 FK CASCADE. Backups: `_backup_s45` (21 filas, RLS) + `_backup_s48` (20 filas, RLS + política `service_role`). Drop de ambos diferido a cierre Bloque 2.

---

## §10 — Errores §9.4 propios CTO

**2 ERRORES §9.4 PROPIOS CTO EN S48 — sin maquillaje, ambos CONTENIDOS antes de causar daño.** Streak: 7(s40)→3(s41)→0(s42)→0(s43)→0(s44)→0(s45)→2(s46)→0(s47)→**2(s48)**. Objetivo s48 era mantener 0; no cumplido. Mismo perfil que s46: 2 errores contenidos por las capas de verificación, cero impacto en runtime/datos.

- **Error nº1 — backup A.1 sin RLS**: redacté el bloque de backup (`create table as select`) sin `enable row level security`, pese a que el HANDOFF documenta que `_backup_s45` se creó CON RLS. Gap de seguridad potencial (anon/auth keys podrían leer datos de usuarios en la tabla de backup). **Cazado por el guard de Supabase Studio ANTES de ejecutar** → cancelado, rehecho con RLS + política. **Cero datos expuestos** (el SQL sin RLS nunca corrió). Raíz: no apliqué preventivamente un estándar de seguridad que ya tenía documentado.
- **Error nº2 — variable `loadPair` sin grep de colisión**: el Edit del Corte B introdujo `const loadPair` en `load()` sin haber grepeado el nombre antes de redactar. Colisión (shadowing) con la `useCallback loadPair` L821. **Cazado por Claude Code (segunda capa) ANTES del commit** → verificado en bytes, renombrado a `loadPairKey`. **Benigno en runtime** (scope cerrado), cero impacto. Raíz: omití enumerar identificadores existentes (§43) antes de introducir uno nuevo.

**Raíz común**: enumeración insuficiente ANTES de redactar/ejecutar. Genera la lección §56 (§11). **Mérito de la disciplina sin maquillaje**: la bicapa + los guards de tooling funcionaron exactamente para esto — los dos fallos se cazaron antes de tocar datos o commitear código roto. El sistema contuvo el daño; el objetivo es no necesitar la contención (que el grep/RLS salgan en la primera redacción).

**Decisiones delegadas Ramón §53**: múltiples instancias ("si es lo mejor avanza", "lo k sea lo correcto", "lo k sea o mejor", "no soy dev haz lo mejor", "ok dale"). Interpretadas §53 como confianza en el juicio CTO, NO orden de cambio de plan. En cada bifurcación (camino Corte B ahora vs checkpoint; commit local vs push) se ejecutó la recomendación CTO justificada con histórico, no atajos. El OK de migración (§3.1) sí fue explícito y específico ("ok dale" tras explicación del gate).

Disciplina bicapa REAL ratificada: §38 (caracterización empírica — aplicada, salvo los 2 huecos del §10), §43 (enumerar paths — aplicada en 13 call sites + 5 piezas; fallida en el nombre `loadPair`), §49 (output verbatim — aplicada), §52 (contar mecánicamente — aplicada, wc antes de declarar 3077), §53 (delegación ≠ cambio plan — aplicada), §54 (HANDOFF descargable — aplicada).

---

## §11 — Lecciones: 1 nueva formal (§56) + reforzadas

**§56 (s48) — Enumerar lo colisionable ANTES de redactar.** Antes de redactar un Edit que introduce un identificador nuevo en un archivo grande, grep el nombre candidato para descartar colisión/shadowing. Antes de crear una tabla/objeto BD, aplicar el estándar de seguridad establecido (RLS + política) en la primera redacción, no esperar al guard. Extiende §38 (verificar antes de afirmar) y §43 (enumerar todos los paths) a los dominios de **nombres** y **seguridad**. Origen: los 2 errores §9.4 de s48, ambos productos de no enumerar antes de actuar.

Reforzadas:
- §38 — reforzada (la lectura del batching React 18 §2.3 corrigió una hipótesis del plan; la verificación `pg_constraint` post-ALTER no se fió del editor). También su violación parcial generó §56.
- §43 — reforzada (13 call sites + las dos caras del blob como unidad) y su fallo en `loadPair` generó §56.
- §3.1 — aplicada al carácter (migración atómica, OK explícito, verificación post).
- §49/§52/§53/§54 — aplicadas.
- Nota de método (no formal): `grep -c` cuenta substrings → para conteo de nombre aislado usar `grep -cw`.

---

## §13 — Items diferidos + plan sesión 49

### §13.1 — Estado cluster A / Bloque 2 al cierre s48

Los 6 sub-items de la Opción A (`fase-5-plan.md` §10.2):
- **Columna `pair`** → ✅ (5.A-1 s45 + 5.A-2 s46).
- **Índice compuesto `(session_id, pair)`** → ✅ NUEVO s48 (Corte A, en BD).
- **Guardado por par** (`.eq('pair')` + fuente activePair) → ✅ ESCRITO s48 (Corte B) — **sin push/smoke**.
- **Carga por par** (`.eq('pair')` + closure + stale-guard + deps) → ✅ ESCRITO s48 (Corte B) — **sin push/smoke**.
- **Visibilidad por TF (`drawingTfMap` per-par)** → ✅ viaja dentro del blob `{v,c,tfMap}` → sigue al dato per-fila automáticamente (modelo per-par lo cubre).
- **Plugin lifecycle per-par** → ✅ ya implementada (hallazgo s47, `useDrawingTools.js` L179-184).

**6/6 ESCRITOS. PERO cluster A NO RATIFICADO**: el código (Corte B) está en commit local, no pusheado ni probado en runtime. **Bloque 2 NO cerrado, Fase 6 NO desbloqueada** hasta el smoke multi-par discriminante PASS en s49.

### §13.2 — Plan sesión 49

**PASO 0 s49**: baseline bicapa REAL (§49):
- `git status --short` → vacío (+ HANDOFF s48 commiteado local)
- `git rev-parse --short HEAD` → hash del HANDOFF s48 (sobre `4e5fc7e`)
- `git rev-parse --short origin/main` → `895bba8` (aún sin push)
- `git log --oneline -6 | cat` → HANDOFF-s48 + `4e5fc7e` + `895bba8` + `fc99339` + `f036f05` + `41d7477`
- `wc -l components/_SessionInner.js` → **3077**
- md5 `_SessionInner.js` → **`41865af1791719cfb2287ce009f97374`**
- md5 `chartViewport.js` → `06f531ca…` (**30ª sesión consecutiva** §1.7)
- md5 `chartRender.js` → `5af39d60…`
- 3 invariantes fase 4 (setData|update=0, computePhantomsNeeded=3, header §1.7)
- **BD**: `pair, NO` + `nulls=0` + `pg_constraint` = `UNIQUE (session_id, pair)` (NUEVO, ya migrado) + pkey + 2 FK + count filas = **20** + backups `_backup_s45` (21) + `_backup_s48` (20)

**PASO 1 s49 — PUSH + DEPLOY + SMOKE (prioridad absoluta)**:
1. `git push origin main` → arrastra `4e5fc7e` + HANDOFF s48 a origin. **Esto cambia el runtime de producción** (`_SessionInner.js` SÍ se sirve al navegador).
2. Esperar deploy Vercel (~1-2 min). Runtime pasa `41d7477` → HEAD nuevo.
3. **SMOKE multi-par discriminante (§50, árbitro de §2.3)**: en producción, abrir UNA sesión → dibujar en EUR/USD → cambiar a otro par → dibujar → volver a EUR/USD → **verificar aislamiento real** (cada par carga SOLO sus drawings, sin contaminación cruzada). Modela el runtime real del artifact. Discrimina si el batching/closure/stale-guard funcionan en runtime.
4. **Si el smoke falla**: `git revert 4e5fc7e` (o `git checkout` del estado previo) + push → producción vuelve a `41d7477` limpio. El Corte B es reversible.
5. **Si el smoke PASA**: cluster A RATIFICADO → **Bloque 2 CERRADO → Fase 6 DESBLOQUEADA**. HANDOFF s49 con el cierre del Bloque 2.

**Orden index-primero en producción preservado**: la BD ya está migrada (Corte A, s48); al pushear el código (s49) el código nuevo se encuentra el esquema ya per-par. Nunca hay código nuevo sobre esquema viejo.

### §13.3 — Items / hallazgos abiertos

- **Item 6 §10.1** (datos crudos Giancarlo/Luis) ⏳ bloqueado terceros, NO bloqueante alumnos, NO zona CTO. s48 NO lo abordó → no requiere re-verificación §51/§55. Confinado a `refactor/HANDOFF-cierre-sesion-27.md`.
- **Discrepancia `user_id` FK** (anotada s47 §2.5, re-confirmada en bytes s48 PASO 0): `pg_constraint` muestra `session_drawings_user_id_fkey → auth.users(id) CASCADE`; inventario s45 lo registró "NOT NULL sin FK". Aclarar en sesión futura. No afecta 5.A-3.
- **Delta filas 21→20** (CASCADE benigno desde s47): anotado, no bloqueante. Dato heredado = 20 filas.
- **Drop de backups** `_backup_s45` + `_backup_s48`: diferido a cierre Bloque 2 (decisión CTO, mantener red de seguridad hasta ratificar).
- **Deuda docs §3.4 PLAN MAESTRO** (no bloqueante): el orden de bloques s45 (cluster A → Fase 6 → features → Fase 7) aún no actualizado en el PLAN MAESTRO. Commit docs-only futuro.
- **`XAU/USD` en dashboard L264** ausente de `ALL_PAIRS` L36: anotado, ajeno al per-par.

### §13.4 — Roadmap PLAN MAESTRO POST-S40 al cierre s48

- Bloque 1 cleanup §10.1 → ✅ CERRADO RATIFICADO s44.
- Bloque 2 Fase 5.A cluster A → **6/6 sub-items escritos (Corte A en BD + Corte B en commit local); pendiente PUSH + SMOKE s49 para RATIFICAR**; Bloque 2 NO cerrado.
- Bloque 4 Fase 6 trading domain (`lib/trading/`) → ⏳ BLOQUEADO hasta ratificar cluster A (smoke s49).
- Bloque 3 Features bloqueantes → ⏳ DESPUÉS de Fase 6.
- Bloque 5 Fase 7 reducción `_SessionInner.js` (3077 → ~800-1200) → ⏳.
- Bloque 6 Apertura alumnos → ⏳ META FINAL.
- Secuencia: `cluster A → Fase 6 → features → Fase 7 → apertura`.

---

## §14 — Cierre sesión 48

Sesión 48 cerrada al carácter 1 junio 2026, hora local.

HEAD local main al cierre operativo s48 (pre-HANDOFF) = `4e5fc7e` (feat fase-5A-3 Corte B). `origin/main` = `895bba8` (HANDOFF s47). **Dos commits locales por delante de origin (`4e5fc7e` + HANDOFF s48), NINGUNO pusheado.** **Producción Vercel runtime = `41d7477`** (feat fase-5A-2, desde s46) — SIN CAMBIO en s48.

**Sesión de ejecución de Fase 5.A-3 al carácter**:
- PASO 0 baseline bicapa REAL 12/12 PASS — estado heredado s47 exacto, cero deriva.
- Las 5 preguntas de diseño de `fase-5A-3-plan.md` §2 CERRADAS (§2.1 activePair + §2.2 normPair sin barra + §2.3 deps+closure+stale-guard, lectura corrige hipótesis batch React 18 + §2.4 20 filas válidas + §3.3 índice-primero).
- Corte A — migración índice BD (gate §3.1, OK explícito): backup fresco `_backup_s48` (RLS + política) + 0 colisiones + `ALTER DROP/ADD CONSTRAINT` + verificación `pg_constraint` al carácter. BD en modelo per-par.
- Corte B — código per-par: 5 reemplazos + 1 renombrado en `_SessionInner.js`, verificado bicapa 12/12, commit `4e5fc7e` LOCAL sin push.

`components/_SessionInner.js` md5 `41865af1791719cfb2287ce009f97374` (3077 líneas — TOCADO s48).
Cluster A `lib/chartViewport.js` §1.7 INTACTO **vigesimonovena sesión consecutiva** md5 `06f531ca75abc1fc6e0919612f04ec9f`.
`lib/chartRender.js` md5 `5af39d6036c7852a86249b74188a024e` (141 líneas, intacto).
3 invariantes fase 4 intactas vigesimonovena sesión consecutiva al carácter.

Estado BD al cierre: `session_drawings` **20 filas**, `pair` NOT NULL, 0 NULLs, todas `EURUSD`. **Constraint `UNIQUE (session_id, pair)` NUEVO — migrado a per-par; `UNIQUE (session_id)` ELIMINADO.** `pkey(id)` + 2 FK CASCADE. Backups `_backup_s45` (21, RLS) + `_backup_s48` (20, RLS + política), conservados.

**2 ERRORES §9.4 propios CTO en s48 — sin maquillaje, ambos contenidos antes de causar daño** (backup sin RLS cazado por guard Supabase + variable `loadPair` cazada por Claude Code). Streak 7→3→0→0→0→0→2→0→2. Mismo perfil que s46: contenidos por las capas, cero impacto runtime/datos. Raíz común: enumeración insuficiente antes de redactar.

**1 lección nueva formal §56**: enumerar lo colisionable antes de redactar (grep de nombre + estándar RLS en primera redacción). Extiende §38/§43 a nombres y seguridad. Lecciones previas reforzadas.

Lección §14 trigésima segunda sesión consecutiva al carácter MULTI-INSTANCIA: múltiples instancias delegación juicio CTO s48 (§53), interpretadas como confianza en juicio CTO, NO orden cambio plan.

Próxima sesión = sesión 49. **Prioridad = PUSH (`4e5fc7e` + HANDOFF s48) → deploy Vercel → SMOKE multi-par discriminante en producción (§50, árbitro §2.3)**, con `git revert` listo si falla. Cluster A se ratifica (Bloque 2 cerrado, Fase 6 desbloqueada) SOLO tras smoke PASS.

**Fase 5.A-3 EJECUTADA al carácter (BD migrada + código escrito y verificado), pendiente de ratificación empírica (push + smoke s49).** Disciplina bicapa estricta + §3.1 + §38 + §43 + §49 + §52 + §53 + §54 aplicadas. 2 errores §9.4 s48 contenidos. Bloque 2 NO cerrado hasta smoke. Calidad TradingView no negociable. CLAUDE.md §1.

— CTO
