# HANDOFF — Verificación previa A1 (pre fase 2)

> Fecha: 29 abril 2026, sesión completa con Claude Opus 4.7
> De: Ramón + Claude (chat web), tras cierre fase 1 y previo arranque fase 2
> Para: el siguiente chat / próxima sesión / referencia histórica
> Estado al cierre: HEAD main = `125ad4b`, working tree limpio, fase 2 NO arrancada

---

## 0. TL;DR (para futuro Claude — leer primero)

- Fase 1 cerrada en producción anoche 28 abril, HEAD `125ad4b`. Hoy 29 abril dedicamos sesión a **verificación previa a fase 2** por bug reportado por alumno.
- Bug del alumno reproducido al carácter en producción. **Diagnóstico cerrado:** NO es regresión de fase 1c.
- Causa raíz: endpoint `/api/challenge/advance` no actualiza `last_timestamp` de la sesión que se cierra al avanzar de fase. Bug pre-existente clasificado como **B4**.
- **Decisión:** fix de B4 se pospone post fase 2 del refactor. Sesión dedicada futura.
- **Próxima acción:** plan táctico de fase 2 del refactor data-layer (lecturas globales).
- Cero código tocado hoy. Cero commits hoy. Working tree limpio en `main`.

---

## 1. Resumen ejecutivo

### 1.1 Contexto de partida

Ayer 28 abril cerramos fase 1 del refactor data-layer (sub-fases 1a + 1b + 1c, 12 commits, mergeados a `main`, pusheados, deploy Vercel verde, HEAD `125ad4b`). 10 pruebas pasadas, cero regresiones detectadas en >700.000 velas escaneadas.

Anoche un alumno de confianza reportó un bug:

> "Al darle a 'revisar trade' desde el modal del challenge (cuando pasas de fase), el chart aparece mucho más atrás en el tiempo de donde el alumno terminó la fase".

Probabilidad inicial estimada de regresión de 1c: ~30%. El alumno tuvo el bug **después** del deploy de fase 1, así que la base de código que el alumno vivía era idéntica a HEAD `125ad4b`.

### 1.2 Plan de la sesión de hoy

Antes de arrancar fase 2 del refactor, verificación rigurosa para descartar (o confirmar) regresión de 1c. Si A1 = regresión de 1c → paramos, hotfix o revert. Si A1 = bug pre-existente → documentamos, posponemos, fase 2 adelante con tranquilidad.

### 1.3 Resultado

**A1 reproducido al carácter en producción**, pero **NO es regresión de 1c**. Es bug pre-existente del flujo de transición de fases (B4). Diagnóstico cerrado con datos numéricos de BD + consola, no por hipótesis.

### 1.4 Decisión

Opción C — fix de B4 post fase 2. Razones (palabras de Ramón):

1. El bug NO está en la capa que refactorizamos (data-layer/render). Está en endpoint backend de transición. Arreglarlo ahora no facilita el refactor.
2. NO está bloqueando usuarios. Solo el alumno de confianza lo vio. Le explicaremos el diagnóstico y pedirá paciencia 1-2 sesiones.
3. La disciplina "una cosa cada vez" ha funcionado 24h. No la rompemos por bug que no es urgente.
4. El fix parece trivial pero toca integridad de histórico de challenges. Mejor sesión dedicada que hoy de pasada.

---

## 2. Datos de la verificación

### 2.1 Estado del repo al arranque
git log --oneline -5
125ad4b (HEAD -> main, origin/main, refactor/fase-1-data-layer) docs(fase-1): añadir 3 HANDOFFs históricos del refactor data-layer
7c47bdb refactor(fase-1c): centralizar escritura de __algSuiteCurrentTime
cc65fef docs(refactor): renombrar setCurrentTime → setMasterTime en plan §2.2/§3.3
c8f8765 docs(refactor): expandir §3.3 con plan detallado de sub-fase 1c
1ff95ea docs(refactor): actualizar inventario plan 1c post-1b (líneas verificadas)
git status → On branch main, up to date con origin/main
git branch --show-current → main

Working tree limpio. Punto de partida confirmado.

### 2.2 Verificaciones intermedias V1 + V2 (sesión "test code" + sesión challenge ad-hoc)

Antes de reproducir el flujo completo del alumno, se verificó posicionamiento del chart en flujos similares más simples sobre la sesión challenge `d68067ef-4e97-476a-8077-7f3101096d3f` (creada y quemada por DD diario en sesión):

- **V1 (modal "Revisar mis trades" tras fase quemada por DD):** chart cargó en `29 oct '25 16:55 UTC`, exactamente donde se cerró la fase. ✓
- **V2 (dashboard "Review Session" sobre la misma sesión):** chart cargó en posición correcta. ✓ Pero: **no aparecieron las position lines del trade cerrado** (anomalía menor, registrada como B2 en §7).

Conclusión parcial tras V1/V2: probabilidad de regresión 1c bajó del 30% al ~5%.

### 2.3 Reproducción completa del flujo del alumno

Sesión challenge fresca creada para la prueba, con flujo idéntico al del alumno:

| Sesión | id | name | rol |
|---|---|---|---|
| Fase 1 | `ab39d9d7-a9ec-4493-8ab9-8ac8365be7f9` | Challenge 3 Fases · $200K · EURUSD | Pasada por target +7.34% |
| Fase 2 | `e8285529-ecb1-4263-8a7d-b2e18c2b7b2b` | Challenge 3 Fases · $200K · EURUSD · Fase 2 | Pasada por target con cierre parcial 90% |
| Fase 3 | `26c17a6c-b3f4-437b-8070-e82c965099d8` | Challenge 3 Fases · $200K · EURUSD · Fase 3 | Activa, 10% flotante heredado luego cerrado |

#### 2.3.1 Captura crítica antes de pulsar "Continue to Phase 3"

```js
window.__algSuiteCurrentTime
// → 1761916020 (= 31 oct 2025 12:27:00 UTC)
```

Este es el `endTime` real de fase 2: el momento exacto donde se cerró el 90% del trade que disparó el modal "Has pasado la fase 2".

#### 2.3.2 Captura tras pulsar "Review Session" de fase 2 desde dashboard

Dataset cargado en consola, sin tocar nada del chart, justo al cargar:

```js
({
  currentTime: window.__algSuiteCurrentTime,
  seriesDataLen: window.__algSuiteSeriesData?.length,
  realDataLen: window.__algSuiteRealDataLen,
  firstTime: window.__algSuiteSeriesData?.[0]?.time,
  lastRealTime: window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time,
  lastRealDate: new Date(window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen - 1]?.time * 1000).toUTCString()
})

// Output:
// {
//   currentTime: null,
//   seriesDataLen: 12460,
//   realDataLen: 12450,
//   firstTime: 1746144000,                     // 02 mayo 2025 00:00 UTC
//   lastRealTime: 1761840900,                  // 30 oct 2025 16:15 UTC
//   lastRealDate: "Thu, 30 Oct 2025 16:15:00 GMT"
// }
```

**Hallazgos numéricos:**

- `currentTime: null` → el global `__algSuiteCurrentTime` NUNCA se restauró al `endTime` de fase 2.
- `lastRealTime: 1761840900` (30 oct 2025 16:15 UTC) → última vela del dataset cargado.
- `endTime` real de fase 2: `1761916020` (31 oct 2025 12:27 UTC).
- **Diferencia:** `1761916020 - 1761840900 = 75120 segundos = 20 horas 52 minutos atrás del cierre real.**

El reporte del alumno ("2 días aproximadamente atrás") es del mismo bug, con magnitud distinta probablemente por interacción con el filter weekend (su cierre podría haber caído cerca de un weekend, sumando ~28h de filter).

#### 2.3.3 Verificación de la causa raíz en BD (Supabase Studio)

Query ejecutada:

```sql
SELECT *
FROM sim_sessions
WHERE name ILIKE '%200K%' OR name ILIKE '%Fase%' OR challenge_type IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

Filas relevantes (3 sesiones challenge de la prueba de hoy):

| id (corto) | name | date_from | date_to | balance | status | last_timestamp | challenge_typ | challenge_pha | challenge_parent_id |
|---|---|---|---|---|---|---|---|---|---|
| `26c17a6c…` Fase 3 | "Challenge 3 Fases · $200K · EURUSD · Fase 3" | 2025-10-29 | 2026-04-29 | 201141.93 | active | **1761916020** | 3F | 3 | `e8285529…` |
| `e8285529…` Fase 2 | "Challenge 3 Fases · $200K · EURUSD · Fase 2" | 2025-10-29 | 2026-04-29 | 210289.99 | passed_phase | **1761841680** | 3F | 2 | `ab39d9d7…` |
| `ab39d9d7…` Fase 1 | "Challenge 3 Fases · $200K · EURUSD" | 2025-10-29 | 2026-04-29 | 214673.91 | passed_phase | **1761841680** | 3F | 1 | NULL |

#### 2.3.4 Tabla comparativa `last_timestamp` BD vs `endTime` real

| Sesión | `last_timestamp` en BD | UTC equivalente | `endTime` real esperado | Desajuste |
|---|---|---|---|---|
| Fase 3 (active) | 1761916020 | 31 oct 2025 12:27 UTC | (n/a, sesión activa) | — |
| Fase 2 (passed) | **1761841680** | 30 oct 2025 15:48 UTC | 1761916020 (31 oct 12:27 UTC) | **-74340 s = -20h 39m** |
| Fase 1 (passed) | **1761841680** | 30 oct 2025 15:48 UTC | (no medido al carácter, pero anterior al de fase 2) | desconocido pero probablemente también desajustado |

**Observación inequívoca:** el `last_timestamp` que SÍ refleja el cierre real de fase 2 lo tiene la **sesión hija** (fase 3, sesión activa). La sesión fase 2 misma quedó con un `last_timestamp` previo al cierre real, atrasado ~20 horas.

Fase 1 muestra el mismo `last_timestamp` que fase 2 (`1761841680`), lo cual es sospechoso pero no medible al carácter sin haber capturado el `endTime` exacto al cerrar fase 1 (no se hizo en esta sesión).

---

## 3. Diagnóstico técnico de B4

### 3.1 Causa raíz

El endpoint `/api/challenge/advance` (visto en logs de consola al pulsar "Continue to Phase 2/3"):
706.f2c35ff92e456eab.js:1 Fetch finished loading: POST "https://simulator.algorithmicsuite.com/api/challenge/advance".

Hace lo siguiente cuando se pulsa "Continue to Phase X+1":

1. Crea nueva sesión hija con `challenge_phase = N+1` y `challenge_parent_id = id_sesion_que_se_cierra`.
2. Hereda el `last_timestamp` actual a la nueva sesión hija (o lo setea al momento de la transición — en cualquier caso, la sesión hija sí tiene el timestamp correcto).
3. Marca la sesión que se cierra como `status = 'passed_phase'` (o `'failed'` si fue por DD).
4. **NO actualiza `last_timestamp` de la sesión que se cierra.** Queda con el último valor que se persistió **antes** de pulsar "Continue", que es típicamente el `last_timestamp` de algún pause o tick previo, NO el momento exacto del cierre del trade que disparó el modal.

### 3.2 Por qué el chart aparece "atrás" en Review Session

Cuando se pulsa "Review Session" desde el dashboard sobre una sesión `passed_phase`:

1. Sistema carga la sesión por su `id`.
2. `_SessionInner.js:L520-554` (effect de session load) ejecuta `clearCurrentTime()` (función nueva de fase 1c, comportamiento idéntico al pre-1c).
3. `fetchSessionCandles({pair, dateFrom, dateTo})` carga velas con el `date_from`/`date_to` de la sesión. Eso da un dataset amplio (mayo 2025 → abril 2026 en nuestro caso).
4. **Pero:** el flujo de `resumeReal` (lectura L753 de `__algSuiteCurrentTime` en `_SessionInner.js`) intenta posicionar el cursor en `last_timestamp` de la sesión.
5. `last_timestamp` de fase 2 = `1761841680` (30 oct 16:15 aprox).
6. El dataset cargado del fetch llega solo hasta `1761840900` (30 oct 16:15 UTC), porque parece que el fetch se trunca al `last_timestamp` de la sesión (no llega más allá del `last_timestamp` registrado en BD).
7. El cursor del replay queda al final del dataset disponible, pero `__algSuiteCurrentTime` no se setea (queda null) porque no hay un evento `onTick` ni un set explícito al finalizar la carga de Review.
8. Visualmente: chart muestra el último frame disponible (~30 oct 16:15) en lugar del `endTime` real (31 oct 12:27).

### 3.3 Por qué fase 1c queda exonerada

Fase 1c solo centralizó las **escrituras** de `window.__algSuiteCurrentTime` en 3 puntos del código:

- L528 → `clearCurrentTime()` (antes: `if(typeof window!=='undefined') window.__algSuiteCurrentTime = null`).
- L772 → `setMasterTime(engine.currentTime)` (antes: write directo en `engine.onTick`).
- L1225 → `setMasterTime(ps.engine.currentTime)` (antes: write directo en effect de cambio de activePair).

Las **lecturas** de `__algSuiteCurrentTime` (L568, L753, L1218) **no se tocaron** en fase 1c (alcance fase 2/3 según `fase-1-plan.md §2.3`).

El bug A1/B4 vive en el **endpoint backend** `/api/challenge/advance` y/o en el **flujo de UI del modal** que llama a ese endpoint sin antes hacer un pause natural que actualice `last_timestamp`. Ninguno de esos lugares fue tocado por fase 1c.

**Confirmado al carácter:** fase 1c es inocente.

---

## 4. Implicaciones

### 4.1 Para el refactor

- **Fase 1c queda exonerada**. Los 12 commits del refactor data-layer NO causan B4.
- A1 deja de ser blocker para arrancar fase 2 del refactor.
- Fase 2 (lecturas globales) sigue como estaba planeada en `core-analysis.md §6` y `fase-1-plan.md §2.3`.

### 4.2 Para B4 mismo

- B4 afecta a la **transición fase 1 → fase 2** también, no solo a fase 2 → fase 3. Evidencia: fase 1 en BD también tiene `last_timestamp = 1761841680`, idéntico a fase 2, lo cual es estadísticamente raro a menos que el endpoint `advance` tenga el mismo defecto en todas las transiciones.
- Probable que afecte a **cualquier transición de fase en cualquier tipo de challenge** (3F, 2F si lo hay, etc.). No es específico del 3F · $200K.
- Posible afectación: ¿`final_balance` de la sesión cerrada también incluye/excluye el cierre parcial 90%? En esta prueba el balance de fase 2 = 210289.99 SÍ refleja el cierre del 90%, así que ese campo está bien. Solo `last_timestamp` está mal. Esto sugiere que el cálculo del balance se hace correctamente en el frontend antes del advance, pero el `last_timestamp` no se actualiza en el mismo PATCH.

### 4.3 Para el alumno reportador

Le explicamos el diagnóstico:

- Bug confirmado, reproducido en mi propia cuenta.
- No es regresión del refactor reciente, es pre-existente del flujo de transición de fases.
- Fix planificado para sesión dedicada después de cerrar fase 2 del refactor (1-2 sesiones de espera).
- Mientras tanto: el `last_timestamp` real del cierre se puede consultar en la sesión **hija** (fase siguiente). El histórico de trades en `sim_trades` está intacto y correcto.

---

## 5. Decisión: fix post fase 2

**Acordado con Ramón:** B4 NO se ataca hoy. Razones literales (de Ramón):

1. El bug NO está en la capa que refactorizamos (data-layer/render). Está en endpoint backend de transición. Arreglarlo ahora no facilita el refactor.
2. NO está bloqueando usuarios. Solo el alumno de confianza lo vio. Le explicaré el diagnóstico y pedirá paciencia 1-2 sesiones.
3. La disciplina "una cosa cada vez" me ha funcionado 24h. No la rompo por bug que no es urgente.
4. El fix parece trivial pero toca integridad de histórico de challenges. Mejor sesión dedicada que hoy de pasada.

**Plan de fix futuro (no se ejecuta hoy, queda como borrador):**

- Sesión dedicada post fase 2 del refactor.
- Fix probable: en `pages/api/challenge/advance.js` (o equivalente), antes del `INSERT` de la sesión hija y del `UPDATE status='passed_phase'` de la sesión madre, añadir un `UPDATE sim_sessions SET last_timestamp = $endTime WHERE id = $idSesionMadre`, donde `$endTime` viene del cliente como el `__algSuiteCurrentTime` exacto del cierre del trade que disparó el modal.
- Validación post-fix: query SQL de control sobre todas las sesiones `status='passed_phase'` del histórico, para detectar las que tengan `last_timestamp` desalineado con el cierre real (la diferencia se puede inferir comparando con el `last_timestamp` de la sesión hija).
- Decisión separada: ¿se "arreglan" hacia atrás los `last_timestamp` mal grabados de sesiones pasadas? Probable que sí, con un script de migración one-shot. A decidir cuando se haga el fix.

---

## 6. Estado del repo antes de empezar fase 2

### 6.1 Git
Rama:                main
HEAD:                125ad4b (= origin/main)
Working tree:        limpio (sin modificaciones, sin untracked relevantes)
Último commit:       docs(fase-1): añadir 3 HANDOFFs históricos del refactor data-layer
Producción Vercel:   en sync con HEAD, deploy verde.

### 6.2 Modificaciones hoy

- Cero código tocado en producción.
- Cero commits hoy.
- Cero push hoy.
- Cero migraciones Supabase (solo SELECTs de lectura para diagnóstico).
- Cero deps npm nuevas.

### 6.3 Datos creados hoy en producción Supabase

3 sesiones challenge nuevas en `sim_sessions` (todas user `c58eb5d1-d708-4c5e-9bc0-433adf8d650b`, EUR/USD, $200K) y 1 sesión challenge previa de la verificación V1 (que quedó como `failed_daily_dd`):

| id | rol |
|---|---|
| `d68067ef-4e97-476a-8077-7f3101096d3f` | V1 — sesión challenge quemada por DD diario, usada para test inicial |
| `ab39d9d7-a9ec-4493-8ab9-8ac8365be7f9` | Fase 1 reproducción A1 (passed_phase) |
| `e8285529-ecb1-4263-8a7d-b2e18c2b7b2b` | Fase 2 reproducción A1 (passed_phase, A1 reproducido al hacer Review) |
| `26c17a6c-b3f4-437b-8070-e82c965099d8` | Fase 3 reproducción A1 (active, 10% flotante heredado luego cerrado) |

Trades en `sim_trades` correspondientes: ~3-4 trades en estas sesiones. Pueden borrarse cuando Ramón decida (o dejarse como histórico de testing).

### 6.4 Próximo paso

**Plan táctico de fase 2 del refactor data-layer:** eliminar/centralizar las 14 lecturas directas de `window.__algSuite*` en 4 archivos (alcance definido en `fase-1-plan.md §2.3` y `core-analysis.md §6 fase 2`). Estructura propuesta: sub-fases pequeñas, baselines pre/post, validación al carácter, commits atómicos, igual que fase 1. Pendiente de redactar y aprobar antes de tocar código.

---

## 7. Listado de bugs y observaciones encontrados hoy (clasificación A/B/C)

> Para que ningún hallazgo se pierda. Ordenados por gravedad descendente.

### Categoría A — Posible regresión de fase 1c

**A1.** Chart aparece atrás en Review Session de fase pasada.
- **Estado: reclasificado a B4.** No es regresión de 1c. Diagnóstico cerrado en §3.

### Categoría B — Bugs pre-existentes confirmados (no son regresión de 1c)

**B1.** El 10% flotante de fase 2 se hereda a fase 3 en la transición.
- Reproducido al carácter en esta sesión. Posición SELL 4.54L (10% del 45.45 original) viajó a fase 3 con float +$1141.93.
- Diseño esperado de Ramón: "fase nueva = virgen" (capital inicial + 0 trades + 0 flotante). Solo el balance virgen funciona ($200K en fase 3 vs $210K final fase 2). El trade vivo NO se cierra automáticamente.
- Vive en el flujo de "Continue to Phase X+1" del modal, igual que B4.
- Probablemente fixeable junto con B4 en la misma sesión dedicada.

**B2.** Position lines del trade cerrado NO aparecen en Review Session V2.
- Tú lo viste en V2 (sesión challenge quemada por DD): el chart cargó en posición correcta pero faltaban las líneas SL/TP/entry del trade que cerró la fase.
- El alumno reportó lo opuesto en su flujo: SÍ vio el dibujo, pero desplazado 2 días a la derecha del cursor.
- Posiblemente intermitente o dependiente de algún factor (timing, navegador, estado del plugin LWC).
- Pre-existente. Apunta a alcance de fase 4 (drawings) según `core-analysis.md §6`.

**B3.** Cuando entras a Review Session, el TF cambia automáticamente.
- Tú estabas en H1 antes de entrar a Review. Al cargar Review, el chart aparece en M15.
- Coincide con observación previa documentada en `HANDOFF-pruebas-resultado.md §3.7` ("al añadir segundo par, vuelve a TF H1"). El patrón es similar: el TF de entrada a una sesión no respeta el TF previo.
- Pre-existente. UX bajo, no bloqueante.

**B4.** `/api/challenge/advance` no actualiza `last_timestamp` de la sesión que se cierra.
- Causa raíz de A1. Diagnóstico completo en §3.
- Afecta a transiciones de cualquier fase de challenge.
- Probablemente afecta también al histórico de challenges pasadas en BD (todas las `passed_phase`/`failed` previas pueden tener `last_timestamp` desalineado).
- **Fix planificado post fase 2 del refactor.**

**B5.** Error 409 en `session_drawings` al guardar drawings.
- Visto en logs de consola: `Failed to load resource: the server responded with a status of 409 () epxoxxadclhfnwfuwoyx.../session_drawings:1`
- Conflicto al hacer upsert. Probablemente race condition entre múltiples saves rápidos.
- Pre-existente. Apuntado en backlog.

**B6.** Plugin LWC se reinicializa varias veces en cada sesión.
- Visto en logs: `Initializing Line Tools Core Plugin...` aparece varias veces en la misma sesión.
- Coherente con bug #5 documentado en `CLAUDE.md §9` (plugin sin destroy al cambiar de par/sesión) y con `core-analysis.md §2.3` (el plugin NO se destruye al cambiar de par, solo se nullea el ref).
- Pre-existente. Alcance fase 4.

### Categoría C — Mejoras UX / inconsistencias menores

**C1.** Tarjeta de fase 1 en dashboard NO tiene sufijo "Fase 1" en el título.
- Las tarjetas de fase 2 y fase 3 sí tienen "· Fase 2" / "· Fase 3" en el `name`. La de fase 1 dice solo "Challenge 3 Fases · $200K · EURUSD" sin sufijo.
- Inconsistencia menor de naming. Backend al crear la primera sesión de un challenge no añade el sufijo, pero al hacer advance sí. Apuntado en backlog.

**C2.** Inconsistencia inglés/español en botones del dashboard.
- Tarjeta de challenge cerrado: botón dice **"Review Session →"** (inglés).
- Modal de pase de fase: opción dice **"Revisar mis trades"** (español).
- Tip del modal en español, mensaje principal en español, pero botones mezclan idiomas.
- UX, no funcional. Apuntado en backlog.

**C3.** Inconsistencia de naming del par: `EURUSD` (sin barra) en tarjetas challenge vs `EUR/USD` (con barra) en tarjeta practice.
- Probablemente dos paths de creación de sesión que normalizan distinto el par.
- UX, no funcional. Apuntado en backlog.

---

## 8. Métricas de la sesión de hoy

- **Duración aproximada:** 4-5 horas (mañana + tarde).
- **Bugs reproducidos:** 1 al carácter (A1 → B4) + 5 confirmados como pre-existentes (B1, B2, B3, B5, B6).
- **Mejoras UX detectadas:** 3 (C1, C2, C3).
- **Sesiones challenge creadas en producción:** 4.
- **Trades reales abiertos/cerrados:** ~5-6.
- **Queries SQL ejecutadas en BD:** 2 (ambas SELECT, sin mutación).
- **Snippets ejecutados en consola:** ~5 (lectura, sin mutación).
- **Líneas de código tocadas:** 0.
- **Commits creados:** 0.
- **Push a producción:** 0.
- **Hipótesis iniciales descartadas:** "30% probabilidad regresión 1c" → 0% confirmado.
- **Cuestiones de método cumplidas:** baselines pre/post (sí), validación al carácter (sí), pausas para cuestionar hipótesis (sí), no atajar (sí), no parchear (sí), un commit explícito por aprobación (n/a, no commits hoy).

---

## 9. Cómo arrancar el siguiente chat (fase 2 del refactor)

### Mensaje sugerido para Ramón al copiar/pegar

Hola. Hoy arrancamos fase 2 del refactor data-layer.

Estado: HEAD main = 125ad4b, working tree limpio. Fase 1 cerrada y deployada en producción desde anoche. Sesión de hoy 29 abril dedicada a verificación previa de un bug reportado por alumno; diagnóstico cerrado, NO era regresión de fase 1c, era bug pre-existente del flujo de transición de fases (B4) que se atacará post fase 2.

Te paso adjuntos:
1. HANDOFF-verificacion-A1.md (el de hoy — léelo entero, sobre todo §3 §4 §5 §7).
2. HANDOFF.md (v3 del refactor).
3. HANDOFF-pruebas.md (protocolo 12 pruebas finales fase 1).
4. HANDOFF-pruebas-resultado.md (resultado cierre fase 1).
5. refactor/fase-1-plan.md (plan táctico fase 1, referencia para estructurar fase 2).
6. refactor/core-analysis.md (auditoría general, ver §6 propuesta fase 2).

Soy Ramón, trader/mentor, no dev. Reglas absolutas en HANDOFF.md §7.

Cuando hayas leído todo, dime:
1. Qué entendiste del estado actual en una frase.
2. Propón plan táctico inicial para fase 2 (eliminar/centralizar las 14 lecturas directas de window.__algSuite* en 4 archivos), siguiendo estructura de fase 1: sub-fases pequeñas, baselines pre/post, validación al carácter, commits atómicos.
3. Espera mi OK explícito antes de empezar a tocar código.

NO empezar a tocar nada hasta que yo apruebe.

### Verificaciones que el chat nuevo debe hacer al arrancar

1. Confirmar HEAD = 125ad4b con git log --oneline -5.
2. Confirmar working tree limpio con git status.
3. Confirmar rama = main con git branch --show-current.
4. Si los 3 cuadran, proponer plan táctico fase 2.
5. Si algo no cuadra, PARAR, no proponer nada, diagnosticar primero.

---

Fin del HANDOFF de verificación A1.

Cuando se retome para arrancar fase 2, este documento queda como referencia de:
- Que A1 (reportado por alumno) fue verificado y reclasificado como B4 (pre-existente).
- Que fase 1c quedó exonerada con diagnóstico al carácter.
- Que B4 está pendiente de fix en sesión dedicada futura.
- Que el resto de bugs y observaciones del día están listados en §7 para no perderse.

---

## 10. Workflow operativo — chat web + Claude Code

Ramón trabaja con Claude Opus 4.7 en dos entornos complementarios. Esta nota se añade el 29 abril 2026 tras detectarse que el HANDOFF original no lo dejaba explícito.

### 10.1 Chat web (claude.ai, dentro del Project "Forex Simulator by Algorithmic Suite")

Para:
- Planificar (planes tácticos, sub-fases, alcance, riesgos).
- Debatir arquitectura y decisiones de producto.
- Redactar y revisar HANDOFFs.
- Diagnosticar bugs con datos numéricos (snippets en consola del navegador, queries SQL en Supabase Studio).
- Decidir prioridades cuando aparecen bugs nuevos durante el trabajo.

Capacidades: el chat web tiene acceso al repo entero vía sincronización GitHub al Project (rammfxtrading-cpu/forex-simulator-algorithmic-suite, rama main). Puede leer cualquier archivo del repo con búsqueda semántica del knowledge.

Limitaciones: el chat web NO ejecuta comandos en la máquina de Ramón. Solo da comandos para que Ramón los ejecute en Claude Code o terminal.

### 10.2 Claude Code en terminal (zsh, iMac macOS)

Carpeta: `/Users/principal/Desktop/forex-simulator-algorithmic-suite`

Para:
- Ejecutar comandos del filesystem (git, ls, cat, etc.).
- Aplicar cambios al código (edits, creación de archivos).
- Hacer commits y push (cuando Ramón apruebe explícitamente).
- Lanzar `npm run dev`, `npm run build`, `next dev`, etc.

Reglas operativas Claude Code (NO negociables):
- Aprobación SIEMPRE en opción 1 manual (comando por comando).
- NUNCA opción 2 "allow all" ni equivalentes.
- Comandos git SEPARADOS, no encadenados con `&&`.
- NO push sin OK explícito de Ramón en cada caso.

### 10.3 Flujo habitual web ↔ terminal

1. Ramón abre chat nuevo en claude.ai → Project → New chat.
2. Pega el prompt de arranque + adjunta el HANDOFF más reciente.
3. Claude (chat web) lee HANDOFF, confirma comprensión, pide verificación de arranque (3 comandos `git log/status/branch`).
4. Ramón abre Claude Code en terminal, ejecuta los 3 comandos uno a uno, pega outputs en el chat web.
5. Si cuadra, Claude (chat web) propone plan táctico.
6. Ramón aprueba/ajusta el plan en chat web.
7. Cuando hay plan aprobado y toca tocar código: Ramón pasa a Claude Code en terminal con el plan claro.
8. Claude Code ejecuta paso a paso, comando a comando, con aprobación opción 1 manual de Ramón en cada uno.
9. Resultados, dudas, decisiones intermedias se llevan de vuelta al chat web si requieren debate.
10. Al cierre de cada sesión: redactar HANDOFF nuevo (en chat web) que recoja lo hecho, decisiones tomadas, estado del repo, próximo paso.

### 10.4 Implicación para el siguiente chat

Quien retome este proyecto debe asumir que:
- Cuando dé "instrucciones de comando", se las da a Ramón para que las ejecute en Claude Code o terminal, NO las ejecuta él.
- El estado del repo en la máquina de Ramón se verifica con los 3 comandos `git log/status/branch`, ejecutados por Ramón en Claude Code, no asumido.
- Los HANDOFFs viven untracked en `/Users/principal/Desktop/forex-simulator-algorithmic-suite/` hasta que Ramón decida comitearlos (típicamente al cierre de cada fase del refactor, no al cierre de cada sesión de chat).

### 10.5 Email de la cuenta Claude

`rammglobalinvestment@gmail.com` (plan Claude Max). Documentado también en HANDOFF.md v3 §11 y §14.
