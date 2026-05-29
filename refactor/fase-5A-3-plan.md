# PLAN Fase 5.A-3 — Persistencia per-par consumer-side (`session_drawings`)

> Redactado en s47 tras inventario read-only completo (PASO 1) sobre bytes-on-disk verificados.
> **Continuación del cluster A** (PLAN MAESTRO §2.2 / `fase-5-plan.md` §10.2 Opción A). NO es Fase 6.
> **Gate de ejecución**: este plan NO se ejecuta sin OK explícito Ramón. La migración de índice es regla absoluta CLAUDE.md §3.1.
> **Nombre del archivo**: sugerido `fase-5A-3-plan.md` (progresión 5.A-1 BD → 5.A-2 código/constraint → 5.A-3 per-par). Ramón decide nombre final al mover a `refactor/`.

---

## §0 — Objetivo y contexto

### §0.1 Qué resuelve

El cluster A (Opción A, `fase-5-plan.md` §10.2) busca **aislamiento real de drawings por par**: pasar de *"1 sesión = 1 conjunto unificado de drawings"* a *"1 sesión × N pares = N conjuntos separados"* (§10.1).

Las sub-fases previas dejaron el **cimiento de datos**:
- **5.A-1 (s45)**: columna `pair` nullable + backfill `EURUSD` (21/21) + backup `_backup_s45`.
- **5.A-2 (s46)**: `pair` suministrado en el upsert (`.update` L343 + `.insert` L351) desde `sessionRef.current?.pair` + `ALTER COLUMN pair SET NOT NULL`.

**5.A-3 (esta fase)** realiza la persistencia per-par: que la BD guarde y cargue **una fila por (sesión, par)** en vez de una por sesión.

### §0.2 Hallazgo de dimensionado (s47) — la pieza 5 YA está hecha

El `fase-5-plan.md` §10.2 (escrito s17-s19) listaba la Opción A como 5 piezas, incluida "plugin lifecycle: ciclo destrucción/recreación per-par". **Inventario s47 verifica que esa pieza ya está implementada** en `components/useDrawingTools.js`:

- **L179-182**: `useEffect` con deps `[activePair]` → `pluginRef.current = null` + `setPluginReady(false)`. Destruye el plugin al cambiar par.
- **L184 + L153-176**: recrea el plugin sobre `chartMap.current[activePair]` (chart del par activo). Deps `initPlugin` = `[activePair, dataReady]`.
- **L234 `exportTools`** → `pluginRef.current.exportLineTools()`; **L235 `importTools`** → `pluginRef.current.importLineTools(json)`. Operan sobre el plugin del par activo.

**Consecuencia**: el aislamiento *a nivel de plugin* ya existe — al cambiar par el plugin se reinicia vacío para ese par. El `exportTools()` ya devuelve solo lo del par activo; `importTools()` ya mete en el plugin del par activo. **El Problema 1 (drawings mezclados) NO está en el plugin — está en la capa de persistencia**, que sigue usando una fila por `session_id`.

**Por tanto el trabajo real de 5.A-3 es persistencia, no lifecycle**: migración de índice + filtro de carga + filtro de guardado (+ fuente correcta del `pair`). Tres-cuatro cambios de persistencia, no cinco refactores.

### §0.3 Cadena del bug, al carácter

1. Cambias a par B → plugin se reinicia vacío (✓ correcto, L179-182).
2. `pluginReady` pasa `false→true` al recrear → la carga (L359, deps `[pluginReady, id]`) se re-dispara, **pero lee por `session_id` solo** (L363) → carga el blob de **toda la sesión** (mezcla de pares) en el plugin vacío de B. **✗ contaminación entra aquí.**
3. Guardas → `exportTools()` devuelve el contenido (ya contaminado) → se escribe bajo el `pair` actual. **✗**

El nudo está en los pasos 2 y 3: persistencia que no discrimina par.

---

## §1 — Inventario al carácter (PASO 1 s47 — verificado en bytes)

Baseline s47: `_SessionInner.js` 3060 líneas, md5 `702aaca57314ac5458787ef93692d5bf`. `useDrawingTools.js` 243 líneas.

### §1.1 Modelo de datos BD `session_drawings` (verificado SQL Editor s47)

| Elemento | Estado real |
|---|---|
| Columnas | `id` uuid PK, `session_id` uuid, `user_id` uuid, `data` text, `updated_at` timestamptz, `pair` text **NOT NULL** (s46) |
| Constraint UNIQUE | **`session_drawings_session_id_key` = `UNIQUE (session_id)`** ← modelo 1:1 sesión↔fila |
| Índices | `session_drawings_pkey` btree(`id`); `session_drawings_session_id_key` btree(`session_id`). **NO existe índice sobre `pair` ni `(session_id, pair)`** |
| FK | `session_id → sim_sessions(id) ON DELETE CASCADE`; `user_id → auth.users(id) ON DELETE CASCADE` |
| Filas | 21 vivas, todas `EURUSD`; backup `_backup_s45` (21 filas, RLS activo) |

### §1.2 Pieza 2 — guardado `saveSessionDrawings` (`_SessionInner.js` L321-356)

- L322-324: `uid` (userIdRef) / `sid` (router.query.id) / **`pair = sessionRef.current?.pair || null`** (capturado s46).
- L327-333: `combined = JSON.stringify({ v: exportTools(), c: customDrawingsToJSON(), tfMap: drawingTfMapRef.current })`.
- L335-340: comentario verbatim — *"Este patrón es atómico-por-fila y no requiere constraint UNIQUE en BD (que no queremos asumir que esté creado)."*
- L342-345: `.update({ user_id, pair, data: combined, updated_at }).eq('session_id', sid).select('session_id')`.
- L346-352: si `updated.length === 0` → `.insert({ session_id, user_id, pair, data: combined, updated_at })`.
- L355: deps `[exportTools, customDrawingsToJSON]`.
- L356: `useEffect` registra `saveDrawingsRef.current = saveSessionDrawings`.

**Filtro actual del upsert = `.eq('session_id', sid)` solo.**

### §1.3 Pieza 3 — carga inicial (`_SessionInner.js` L359-390)

- L360: guard `if(!pluginReady || !id || !userIdRef.current) return`.
- L363: `select('data').eq('session_id', id).order('updated_at', desc).limit(1).maybeSingle()`.
- L364: si `!data?.data || data.data==='[]'` → return.
- L368: `importTools(parsed.v)`; L369: `customDrawingsFromJSON(parsed.c)`.
- L372-373: `setDrawingTfMap(parsed.tfMap)` + `drawingTfMapRef.current = parsed.tfMap`.
- L376-382: `setTimeout(300ms)` re-aplica visibilidad usando `activePairRef.current` + `pairTfRef.current`.
- L383-384: rama **legacy** — si el blob no tiene forma `{v,c,tfMap}` → `importTools(data.data)` directo.
- L390: deps `[pluginReady, id]`.

**Filtro actual de carga = `.eq('session_id', id)` solo.** Espejo del guardado.

### §1.4 Pieza 4 — `drawingTfMap` (`_SessionInner.js`)

- L227 `useState({})` + L228 `drawingTfMapRef = useRef({})`.
- L459-467: `useEffect` deps `[drawingTfMap]` → sync ref + debounce 400ms → `saveDrawingsRef.current()`.
- L470-476: `useEffect` deps `[pairTf, activePair, drawingTfMap, setToolVisible]` → aplica visibilidad por TF al par activo.

El `tfMap` viaja **dentro del blob** (`combined.tfMap`). Si la fila pasa a ser per-par, el `tfMap` lo sigue automáticamente (es per-fila).

### §1.5 Pieza 5 — plugin lifecycle (`useDrawingTools.js`) — ✅ YA IMPLEMENTADA

Ver §0.2. Reinicio per-par vivo (L179-184). **NADA que hacer en 5.A-3.** Solo VIGILAR no romperla.

### §1.6 Call sites del guardado vía `saveDrawingsRef` (§43 — 13 enumerados)

L320 (decl), L356 (registro), **L410, L416** (dentro de `useEffect` deps `[pluginReady, activePair]`, L394-427), L465 (debounce tfMap), L961, L1846 (tras borrado), L1869, L1992, L2014, L2022, L2106 (UI crear/editar/borrar), L2463, L2471 (UI color/fontSize).

**Relevancia**: L410/L416 disparan guardado **al cambiar par** (deps incluyen `activePair`). Cualquier filtrado per-par a medias (solo carga o solo guardado) puede escribir los drawings de un par etiquetados con otro. Las 13 llamadas + las dos caras del blob + el cambio de par son **una unidad de coherencia**.

---

## §2 — Hallazgos críticos / preguntas de diseño ABIERTAS

> Estas NO están resueltas. Son decisiones que el diseño ejecutable de s48 debe cerrar — algunas por decisión Ramón, otras por validación empírica. Exponerlas aquí es el objeto del plan (§38: no diseñar sobre asunción).

### §2.1 ⚠️ Fuente del `pair`: `sessionRef.current?.pair` vs `activePairRef.current` (CAMBIO de diseño)

En s46 se eligió `sessionRef.current?.pair` (par **principal de la sesión**, de `sim_sessions`, formato `EURUSD`) por: formato consistente con backfill + ref estable + semántica 1:1.

**Pero per-par real rompe esa semántica**: la fila ya no representa "la sesión", sino "(sesión, par)". El `pair` de la fila debe ser el **par activo en el momento del guardado** (`activePairRef.current`), NO el par principal de la sesión — porque una sesión multi-par tendrá N filas, una por par.

**Implicación**: 5.A-3 probablemente debe **cambiar la fuente del `pair`** de `sessionRef.current?.pair` a `activePairRef.current` (normalizado). Esto refina —no contradice— s46: s46 puso el cimiento desde la fuente disponible y consistente; 5.A-3 ajusta la fuente al modelo per-par. **Decisión a confirmar en s48 con el comportamiento multi-par a la vista.**

### §2.2 ⚠️ Formato del par: `EUR/USD` (con barra) vs `EURUSD` (sin barra)

- `activePairRef.current` → formato `EUR/USD` (con barra) — verificado s46 §2.6.
- `session_drawings.pair` poblado → `EURUSD` (sin barra) — 21 filas del backfill.

Si 5.A-3 cambia la fuente a `activePair`, **hay que normalizar** `EUR/USD → EURUSD` para no fragmentar el espacio de claves (una fila `EURUSD` del backfill + una nueva `EUR/USD` del código = dos pares distintos para la BD, bug silencioso). Decidir: normalizar en el código al guardar, o migrar las 21 filas. **Pendiente decisión s48.**

### §2.3 ⚠️ Deps de carga `[pluginReady, id]` — ¿basta filtrar, o hace falta `activePair`?

Como el plugin se recrea al cambiar par y `pluginReady` hace `false→true` en cada cambio (§0.2), **la carga PUEDE ya re-dispararse al cambiar par sin tocar deps**. Hipótesis a validar empíricamente: ¿basta añadir `.eq('pair', <par activo normalizado>)` al query L363, o hace falta también `activePair` en las deps L390?

**Esto NO se cierra con lectura** — depende del orden de ejecución de los `useEffect` (reset plugin L179 → carga L359) en runtime. Validación empírica en s48 (o smoke). Riesgo: race entre reset del plugin y re-disparo de carga.

### §2.4 Filas existentes (21 `EURUSD`)

Tras migrar el índice a `(session_id, pair)`, las 21 filas `EURUSD` siguen válidas (son el par EURUSD de sus sesiones). No requieren backfill adicional **si** la normalización (§2.2) mantiene `EURUSD`. Verificar 0 colisiones antes del ALTER del índice.

### §2.5 Discrepancia documental `user_id` FK (anotada, NO bloqueante)

Inventario s45 registró `user_id` como *"NOT NULL sin FK (SSO JWT)"*. El constraint real (s47) muestra `session_drawings_user_id_fkey → auth.users(id) ON DELETE CASCADE`. Discrepancia a aclarar en algún momento (¿FK añadida después? ¿inventario s45 impreciso?). **No afecta 5.A-3** — anotada para el HANDOFF.

---

## §3 — Diseño de migración (cortes propuestos, NO ejecutable aún)

### §3.1 Corte A — índice (BD) — gate CLAUDE.md §3.1

Migrar el constraint UNIQUE de `(session_id)` → `(session_id, pair)`:
- Pre: backup vivo (`_backup_s45`, ya existe) + verificar quota + verificar 0 colisiones `(session_id, pair)` actuales.
- `ALTER TABLE session_drawings DROP CONSTRAINT session_drawings_session_id_key;`
- `ALTER TABLE session_drawings ADD CONSTRAINT session_drawings_session_pair_key UNIQUE (session_id, pair);`
- Verificar `pg_constraint` post-ALTER (no fiarse del mensaje del editor, §38).

**REQUIERE OK EXPLÍCITO RAMÓN.** Sin OK, no se toca BD.

### §3.2 Corte B — código (filtros + fuente del `pair`)

Tres cambios en `_SessionInner.js`, dependientes de §2.1/§2.2/§2.3:
1. **Fuente del `pair`**: `sessionRef.current?.pair` → `activePairRef.current` normalizado (§2.1+§2.2). Captura en L324 + uso en `.update`/`.insert`.
2. **Filtro guardado** L344: `.eq('session_id', sid)` → `.eq('session_id', sid).eq('pair', pair)`.
3. **Filtro carga** L363: `.eq('session_id', id)` → `.eq('session_id', id).eq('pair', <par activo normalizado>)` + revisar deps L390 (§2.3).

Cada cambio: patrón canónico bicapa (CTO redacta `old_str`/`new_str` + Ramón pasa a Claude Code + verificación post).

### §3.3 Orden de ejecución (regla de oro)

Pregunta abierta a cerrar en s48: ¿índice primero o código primero?
- **Argumento código-primero** (como s46): el código demuestra escribir/leer per-par en producción antes de que el constraint lo exija. Pero el constraint `(session_id, pair)` no "exige" nada nuevo del código — solo permite N filas. Con `UNIQUE(session_id)` aún activo, el código per-par chocaría al insertar la 2ª fila de una sesión.
- **Argumento índice-primero**: el código per-par NECESITA que el índice permita N filas/sesión para funcionar; sin migrar el índice, filtrar por `(session_id, pair)` no aporta (solo hay 1 fila posible). 
- **Tendencia CTO preliminar**: índice-primero (el índice habilita el modelo; el código lo explota). Pero validar que el código ACTUAL (sin filtro pair) no rompe con el índice nuevo durante la ventana entre ambos cortes. **Decisión s48.**

### §3.4 Rollback

- Código: `git checkout -- components/_SessionInner.js` (shell Ramón, nunca revert autónomo).
- Índice: `ALTER TABLE … DROP CONSTRAINT session_drawings_session_pair_key; ADD CONSTRAINT session_drawings_session_id_key UNIQUE (session_id);` (requiere 0 filas duplicadas por sesión — si ya se escribieron filas per-par, el rollback del índice exige limpiarlas primero). Backup `_backup_s45` como red.

---

## §4 — Checklist CLAUDE.md §3.1 (regla absoluta migración BD)

- [ ] OK explícito Ramón ANTES de cualquier ALTER.
- [ ] Backup vivo (`_backup_s45` existe; valorar backup fresco pre-5.A-3).
- [ ] Quota Supabase verificada (passive monitoring, Free Plan — sin cambio de volumen esperado).
- [ ] Verificación 0 colisiones `(session_id, pair)` pre-ALTER.
- [ ] ALTER + verificación empírica `pg_constraint` post (§38).
- [ ] Ejecución paso a paso (un paso, verificación bicapa, siguiente).

---

## §5 — Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Filtrado per-par a medias (solo carga o solo guardado) → drawings de par A etiquetados par B | Diseñar las 2 caras del blob + las 13 llamadas como unidad; smoke discriminante ambos caminos (§43+§50) |
| 2 | Fuente `pair` (sessionRef vs activePair) mal resuelta → todas las filas con par principal | Cerrar §2.1 antes de tocar; smoke multi-par real (2+ pares en una sesión) |
| 3 | Formato `EUR/USD` vs `EURUSD` → fragmentación de claves, bug silencioso | Cerrar §2.2 (normalizar); verificar 0 colisiones |
| 4 | Race reset-plugin (L179) ↔ re-disparo carga (L359) al cambiar par | Validar empíricamente §2.3; el `setTimeout(300ms)` L376 puede necesitar revisión |
| 5 | Rama legacy L383-384 (blobs sin `{v,c,tfMap}`) | No romper; las 21 filas actuales son formato nuevo, pero verificar |
| 6 | Romper las 3 invariantes fase 4 o `chartViewport.js` §1.7 | Verificar md5/grep tras CADA Edit (§6) |
| 7 | Fabricar urgencia / saltar a Fase 6 sin cerrar cluster A | Disciplina §3.4 PLAN MAESTRO + CLAUDE.md §1; Fase 6 bloqueada hasta 5.A-3 cerrada |

---

## §6 — Invariantes a vigilar (toda la fase 5.A-3)

- `grep -c "cr\.series\.setData\|cr\.series\.update" components/_SessionInner.js` → **0**
- `grep -c "computePhantomsNeeded" components/_SessionInner.js` → **3**
- `head -5 lib/chartViewport.js` → header §1.7 intacto; md5 `06f531ca75abc1fc6e0919612f04ec9f`
- `lib/chartRender.js` md5 `5af39d6036c7852a86249b74188a024e`

---

## §7 — Entregable y siguiente paso

**Entregable s47**: este plan + inventario al carácter de las 5 piezas (verificado en bytes) + dimensionado correcto (pieza 5 ya hecha) + 5 preguntas de diseño abiertas explicitadas.

**Siguiente paso (s48), pendiente OK Ramón**:
1. Cerrar §2.1 (fuente del `pair`) + §2.2 (formato) — decisión de diseño.
2. Validar §2.3 (deps de carga) — empírico.
3. Decidir §3.3 (orden índice/código).
4. Ejecutar corte A (índice, gate §3.1) o corte B (código) según orden decidido.
5. Smoke producción multi-par discriminante (§43+§50) — 2+ pares en una sesión, verificar aislamiento real.

**NADA se ejecuta sin OK explícito Ramón. La migración de índice es gate CLAUDE.md §3.1.**

— CTO
