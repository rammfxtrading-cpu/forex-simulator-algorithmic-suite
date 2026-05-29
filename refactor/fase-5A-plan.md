# PLAN Fase 5.A — Cluster A: migración Supabase columna `pair` en `session_drawings`

> Redactado sesión 45, 29 mayo 2026, hora local.
> Bloque 2 del PLAN MAESTRO POST-S40 (§2.2). Primera migración BD del refactor.
> **Disciplina CLAUDE.md §3.1 (regla absoluta migración Supabase)**: NO migración sin backup pre-migración + script idempotente con rollback + asignación retrocompatible + validación quota Supabase Free Plan + OK explícito Ramón.
> **Estado al redactar**: inventario al carácter CERRADO ÍNTEGRO (PASO 1 s45). Diseño completo. CERO migración ejecutada. Pendiente OK explícito Ramón para ejecutar Fase 5.A-1.

---

## §0 — Objetivo y contexto

### §0.1 Qué resuelve

`session_drawings` no tiene columna `pair`. Cluster A Opción A (PLAN MAESTRO §2.2) añade la columna `pair` para que cada fila de drawings conozca el par de divisas al que pertenece, sin depender de un JOIN en runtime contra `sim_sessions`.

### §0.2 Por qué importa para el éxito del proyecto

Etiquetar los drawings por par es pre-requisito arquitectónico de features bloqueantes posteriores (filtrado/consulta de drawings por instrumento) y deja el modelo de datos coherente antes de la extracción de dominio (Fase 6). Terreno delicado: es la **primera migración BD del refactor** — cero improvisación.

### §0.3 Decisión arquitectónica orden de bloques (§3.4) — DECIDIDA s45

Orden elegido al carácter en s45 (delegación juicio CTO §53 NUEVA s40):

**`cluster A → Fase 6 → features → Fase 7`**

Razón técnica:
- Las features pesadas (killzones tagging trades, Montecarlo) son dominio de trading puro. Extraer `lib/trading/` ANTES (Fase 6) hace que nazcan ya dentro del módulo limpio → cero retrabajo.
- El orden inverso las escribiría dentro del monolito `_SessionInner.js` (3059 líneas) y Fase 6 tendría que mover código recién escrito → doble toque + extracción sobre superficie mayor.
- No hay release intermedio: la plataforma no abre a alumnos hasta cerrar TODO el refactor (Bloque 6). El argumento "features antes para que el alumno las vea" NO aplica — no las ve hasta el final igual.

Coste honesto del orden elegido: si al construir las features los límites de extracción de Fase 6 no encajan perfecto, se re-tocaría `lib/trading/`. Riesgo real pero menor que mover el código dos veces.

Esta decisión afecta solo el roadmap de bloques 3↔4 (s50→s73). NO bloquea s45: cluster A es el primer bloque en ambos órdenes.

---

## §1 — Inventario al carácter `session_drawings` (PASO 1 s45 — CERRADO ÍNTEGRO)

Ejecutado bytes-on-disk / SQL Editor Supabase Studio. Output verbatim transcrito (§49). Read-only puro — cero mutación.

### §1.1 Columnas

| # | Columna | Tipo | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `session_id` | uuid | NO | — |
| 3 | `user_id` | uuid | NO | — |
| 4 | `data` | text | NO | `'[]'::text` |
| 5 | `updated_at` | timestamptz | YES | `now()` |

**Sin columna `pair`** → migración justificada bytes-on-disk.
`data` es `text` (array JSON serializado a string), NO `jsonb`.

### §1.2 Índices

| Índice | Tipo | Columna |
|---|---|---|
| `session_drawings_pkey` | UNIQUE btree | `id` |
| `session_drawings_session_id_key` | UNIQUE btree | `session_id` |

**`session_id` es UNIQUE → modelo 1:1 sesión↔fila de drawings.** Una sesión tiene exactamente una fila; todos sus drawings serializados en el único campo `data`. NO es 1:N (una fila por drawing). Consecuencia: `pair` a nivel de fila = `pair` a nivel de sesión, semánticamente coherente (todos los drawings de una sesión pertenecen al mismo par).

### §1.3 Foreign keys

| Constraint | Columna | → Tabla | → Columna | ON DELETE |
|---|---|---|---|---|
| `session_drawings_session_id_fkey` | `session_id` | `sim_sessions` | `id` | CASCADE |

`user_id` NO tiene FK declarada (uuid NOT NULL sin constraint referencial — auth centralizado SSO `algorithmic-suite-hub`, `user_id` del JWT Supabase Auth).

### §1.4 Fuente del backfill — `sim_sessions`

Columnas relevantes de `sim_sessions` (15 totales):

| Columna | Tipo | Nullable | Relevancia |
|---|---|---|---|
| `id` | uuid | NO | PK — destino del JOIN |
| `pair` | text | **NO** | **FUENTE DEL BACKFILL** |
| `timeframe` | text | NO | — |
| `challenge_type` | text | YES | doctrina fases |
| `challenge_phase` | integer | YES | doctrina fases |
| `challenge_parent_id` | uuid | YES | doctrina fases (encadenado) |

`sim_sessions.pair` es `text NOT NULL` → backfill por JOIN sobre `session_id` **garantizado sin NULLs**. Coherencia de tipos: ambas columnas `text` → JOIN sin cast.

Doctrina de fases confirmada bytes-on-disk (`challenge_type` + `challenge_phase` + `challenge_parent_id`): cada fase de challenge es una sesión distinta con su propio `id`. NO toca cluster A — contexto.

### §1.5 Conteo de filas + huérfanas

| Tabla | Filas |
|---|---|
| `session_drawings` | 21 |
| `sim_sessions` | 24 |
| `orphan_drawings` | 0 |

`orphan_drawings = 0` verificado empíricamente (§38) — FK CASCADE cumplida en bytes. Las 21 filas tienen sesión padre con `pair NOT NULL` → backfill sin NULLs garantizado.

### §1.6 RLS

| Tabla | `rls_enabled` | `rls_forced` |
|---|---|---|
| `session_drawings` | true | false |

Policy `user owns session drawings`: cmd ALL, roles `{public}`, USING `auth.uid() = user_id`, WITH CHECK null (Postgres reutiliza el `qual` para INSERT/UPDATE). RLS activo (no dormido) → **no hay hallazgo §3.5** sobre esta tabla; el riesgo RLS 30 oct 2026 no aplica aquí. La columna nueva `pair` queda cubierta automáticamente por la policy (es ALL sobre fila completa, no por-columna). **Cero cambios RLS necesarios.**

### §1.7 Verificación quota Supabase Free Plan (§3.1)

21 filas × 1 columna `text` corta (~6-7 chars tipo `EURUSD`) ≈ **~150 bytes de delta total**. Free Plan = 500 MB DB. Margen abismal. **Quota PASS sin reservas.** Coherente con reclasificación a monitorización pasiva.

---

## §2 — Hallazgo crítico: el código de escritura NO suministra `pair`

### §2.1 Localización bytes-on-disk

`grep -rln "session_drawings" pages/ lib/ components/`:
- `pages/dashboard.js`
- `components/_SessionInner.js`

**NO hay `pages/api/.../drawings.js`** → acceso a `session_drawings` directo desde cliente vía supabase-js (no pasa por endpoint API propio). Coherente con RLS activo: la policy `auth.uid() = user_id` protege el acceso directo desde navegador.

### §2.2 Patrón de escritura en `_SessionInner.js` (L340-352)

Upsert manual UPDATE-first / INSERT-fallback (evita 409 del patrón delete+insert con saves solapados, comentario L331-339):

```
UPDATE .update({ user_id, data, updated_at }) .eq('session_id', sid)   ← L342 vía primaria
  └─ si 0 filas afectadas → INSERT { session_id, user_id, data, updated_at } ← L349 fallback
```

| Operación | Campos enviados | ¿`pair`? |
|---|---|---|
| `.update()` L342 | `user_id`, `data`, `updated_at` | NO |
| `.insert()` L349 | `session_id`, `user_id`, `data`, `updated_at` | NO |

**Consecuencia al carácter**: forzar `pair NOT NULL` HOY rompería producción — el `.insert()` L349 reventaría con violación de constraint la primera vez que se cree una fila de drawings en sesión sin drawings previos (0 filas en UPDATE → cae al INSERT sin `pair`). §38 + §15: diagnóstico empírico antes del fix. NOT NULL a ciegas era una trampa.

El par está disponible en el componente (`sim_sessions.pair` es propiedad de la sesión activa que `_SessionInner.js` ya carga). A confirmar al tocar el código en 5.A-2.

---

## §3 — Diseño de migración: corte 5.A-1 (s45) / 5.A-2 (s46)

Regla de oro: **la BD nunca exige algo que el código aún no suministra.** Migrar la BD de forma que el código viejo sobreviva → actualizar el código → endurecer la constraint. Cero ventana de rotura.

### §3.1 Fase 5.A-1 — BD: columna nullable + backfill (EJECUTABLE s45 con OK Ramón)

Todos los pasos idempotentes y reversibles. Destino: SQL Editor Supabase Studio.

**Paso 1 — backup pre-migración (obligatorio §3.1), tabla espejo:**
```sql
create table session_drawings_backup_s45 as select * from session_drawings;
```
Restauración en una query, sin round-trip CSV (preserva tipos uuid/timestamptz). Se borra en rollback o tras ratificar migración en producción.

**Verificación backup:**
```sql
select count(*) from session_drawings_backup_s45;  -- debe ser 21
```

**Paso 2 — DDL idempotente, columna NULLABLE:**
```sql
alter table session_drawings add column if not exists pair text;
```
`if not exists` = re-ejecutable sin error. Nullable → permite backfill antes de endurecer, y deja el código actual (inserts sin `pair`) funcionando intacto (entra NULL, la columna lo permite).

**Paso 3 — backfill retrocompatible por JOIN:**
```sql
update session_drawings sd
set pair = ss.pair
from sim_sessions ss
where sd.session_id = ss.id
  and sd.pair is null;
```
`and sd.pair is null` = idempotente (segunda ejecución no re-escribe). Deriva el par de la sesión padre — cero parseo de `data` text.

**Paso 4 — verificación post-backfill:**
```sql
select count(*) as nulls_restantes from session_drawings where pair is null;  -- debe ser 0
select pair, count(*) from session_drawings group by pair order by count(*) desc;  -- distribución sanity-check
```

**Estado al cerrar 5.A-1**: columna `pair` poblada (21/21, 0 NULLs), NULLABLE todavía, código intacto, cero riesgo, cero rotura. NOT NULL diferido a 5.A-2.

### §3.2 Fase 5.A-2 — código + constraint (SESIÓN SIGUIENTE s46)

1. PASO 0 baseline bicapa REAL (como toda sesión).
2. Edit quirúrgico `_SessionInner.js` L342 + L349: incluir `pair` en payload de `.update()` y `.insert()`. Verificar que el objeto de sesión activa expone `pair` (inventario bytes-on-disk previo al Edit). **Cluster A `lib/chartViewport.js` §1.7 NO afectado** — esto es `_SessionInner.js`, otra capa; aun así Edit con bicapa estricta (old_str/new_str exactos CTO web + Ramón pasa + verificación post).
3. Smoke producción: crear drawings en sesión nueva → verificar `pair` se guarda correcto (no NULL).
4. **Solo tras smoke PASS** → endurecer constraint:
```sql
select count(*) from session_drawings where pair is null;  -- re-verificar 0
alter table session_drawings alter column pair set not null;
```
5. Verificación bicapa + rollback disponible en cada paso.

### §3.3 Rollback completo (si cualquier fase falla)

```sql
-- revertir DDL:
alter table session_drawings drop column if exists pair;
-- restaurar datos desde backup si fuera necesario (escenario extremo):
-- (la tabla espejo conserva el estado pre-migración exacto)
-- limpiar backup:
drop table if exists session_drawings_backup_s45;
```

`git checkout -- components/_SessionInner.js` para revertir el Edit de código de 5.A-2 (disciplina revert: nunca autónomo, siempre desde shell Ramón).

---

## §4 — Checklist CLAUDE.md §3.1 (regla absoluta) — estado

| Requisito §3.1 | Estado en este plan |
|---|---|
| Backup pre-migración obligatorio | ✓ tabla espejo `session_drawings_backup_s45` (§3.1 Paso 1) |
| Script idempotente con rollback | ✓ `if not exists` + `pair is null` + rollback §3.3 |
| Asignación retrocompatible | ✓ backfill por JOIN desde `sim_sessions.pair`, 0 NULLs garantizado |
| Validación quota Supabase Free Plan | ✓ ~150 bytes delta, PASS (§1.7) |
| OK explícito Ramón ANTES de ejecutar | ⏳ PENDIENTE — gate de ejecución de 5.A-1 |

---

## §5 — Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Forzar NOT NULL antes de actualizar código → producción rota | Corte 5.A-1/5.A-2: NOT NULL solo tras Edit código + smoke PASS (§3.2) |
| Backfill produce NULLs | Imposible: `sim_sessions.pair` NOT NULL + 0 huérfanas verificadas (§1.5) |
| Migración consume quota | Delta ~150 bytes, margen abismal (§1.7) |
| Testing local no factible (SSO centralizado producción) | Smoke 5.A-2 directo en producción tras Edit + push (arquitectura SSO conocida) |
| Re-ejecución accidental del script | Idempotencia en cada paso (`if not exists`, `pair is null`) |
| §3.5 RLS 30 oct 2026 | No aplica a esta tabla — RLS ya activo (§1.6) |

---

## §6 — Entregable y siguiente paso

§47 entregable tangible s45: inventario al carácter CERRADO ÍNTEGRO + este plan + diseño 5.A-1/5.A-2 + quota PASS + decisión §3.4.

**Gate de ejecución**: 5.A-1 NO se ejecuta sin OK explícito Ramón (§3.1). Tras OK → ejecución paso a paso (un paso, verificación bicapa, siguiente paso), backup primero.

— CTO
