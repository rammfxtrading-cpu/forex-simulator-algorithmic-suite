# Plan táctico — B4 (fix `/api/challenge/advance` no actualiza `last_timestamp`)

> Documento operativo. Ramón debe leer §0, §1 y §3 mínimo.
> Trabajamos en la rama `fix/b4-advance-last-timestamp` (a crear desde `main` HEAD `51e07c2` cuando el plan se apruebe).
> No mergeamos a `main` hasta que Ramón lo confirme explícitamente. Cada operación = un commit aprobado explícitamente.

---

## 0. Decisión arquitectónica: ¿cuál es la fuente de verdad de `endTime`?

> Esta sección no estaba en `fase-1-plan.md` porque fase 1 movía escrituras y la API era forzosa. `fase-2-plan.md §0` introdujo el patrón porque fase 2 tenía decisión arquitectónica real (3 opciones de API de lectura). B4 también la tiene: cuando el alumno cierra una fase, ¿de dónde sale el `endTime` que persistimos como `last_timestamp` de la sesión cerrada?

### 0.1 Las 3 opciones sobre la mesa

**Opción A — Cliente envía `endTime` en el body del POST.**

Implementación:
- Cliente: en `_SessionInner.js:callChallengeAdvance()`, antes del `fetch('/api/challenge/advance')`, leer `getMasterTime()` (la API nueva de fase 2c) y añadirlo al body como `end_timestamp`.
- Servidor: en `pages/api/challenge/advance.js`, aceptar `end_timestamp` del body, validarlo (entero, >0, <= now), persistirlo en el UPDATE de cierre.

Pros:
- Mínima complejidad. ~3 líneas servidor + ~1 línea cliente.
- Coste cero en BD (no hay query extra).
- El cliente ya tiene el dato exacto: `__algSuiteCurrentTime` se setea en cada `engine.onTick` por la API `setMasterTime` de fase 1c.

Contras:
- Cliente puede manipular el dato (DevTools → modificar body antes del fetch). En un simulador de trading donde el alumno tiene incentivo a alargar fases (no acortarlas), riesgo de manipulación malintencionada bajo. Pero "bajo" no es "cero".
- Si por bug del cliente `getMasterTime()` devuelve `null`, el fix falla silenciosamente.

**Opción B — Servidor deriva `endTime` de `sim_trades`.**

Implementación:
- Servidor: en el path `pass`, antes del UPDATE, ejecutar `SELECT closed_at FROM sim_trades WHERE session_id = $1 AND result IN ('TP','SL','MANUAL') ORDER BY closed_at DESC LIMIT 1`.
- Convertir `closed_at` (timestamptz) a UNIX seconds.
- Persistirlo como `last_timestamp` en el UPDATE.

Pros:
- Cliente no participa en la decisión. Trust boundary correcto: servidor es la única autoridad.
- Auditable: el `endTime` siempre cuadra con un trade real grabado en BD.
- Aplicable también al saneamiento futuro de histórico (mismo origen del dato).

Contras:
- Race condition real ya documentada en `_SessionInner.js`: el INSERT del trade que dispara `target_reached` puede no haber commiteado todavía cuando el cliente llama a `/advance`. El propio código tiene `await new Promise(r => setTimeout(r, 300))` por consistencia eventual antes de refrescar `challengeStatus`. Si el servidor lee `sim_trades` antes de que el INSERT esté visible, lee un `closed_at` anterior al que disparó target.
- Query extra por cada llamada a `/advance` (negligible en volumen, pero existe).
- Si el alumno cerró el trade vía DD-breach automático (path `fail`), el último trade puede no ser el que disparó la condición. Hay que filtrar por `pnl < 0` o por timestamp mínimo. Lógica adicional.

**Opción C — Híbrido: cliente envía `endTime`, servidor valida cruzando con `sim_trades`.**

Implementación:
- Cliente como Opción A.
- Servidor: lee `endTime` del body. Ejecuta query de Opción B. Compara: si `|endTime_cliente - endTime_servidor| <= N segundos` (sugerido N=600 = 10min), confía y persiste el del cliente. Si discrepa más, log warning + persiste el del servidor.

Pros:
- Robustez ante cliente manipulado (servidor tiene siempre la última palabra).
- Robustez ante race condition (si el cliente envía un `endTime` plausible y el servidor aún no ve el trade, el cliente acierta).
- Auditable: si hay discrepancia, queda log.

Contras:
- Complejidad significativamente mayor: 2 fuentes de verdad coordinadas, threshold N que decidir, lógica de log/decisión.
- Para un bug de fix trivial, sobreingeniería. YAGNI grita.

### 0.2 Análisis honesto contra los datos disponibles

**Datos del HANDOFF-verificacion-A1 §3.1 sobre el flujo real del bug:**

1. El cliente, en el momento de pulsar "Continue to Phase X+1", tiene `__algSuiteCurrentTime` = endTime exacto del cierre del trade que disparó `target_reached`. Esto está verificado al carácter en §2.3.1 del HANDOFF: `1761916020` (= 31 oct 2025 12:27:00 UTC) capturado en consola del navegador antes del modal.

2. El servidor, en `pages/api/challenge/advance.js`, NO recibe ese dato hoy. El body actual es solo `{session_id, outcome}`. Por eso el endpoint no tiene cómo saber el endTime real y cae al `last_timestamp` previo (el de algún pause/tick anterior).

3. La sesión hija hereda `last_timestamp: session.last_timestamp` del `nextPayload`. Si la sesión madre tiene el `last_timestamp` viejo, la hija también lo tendría. Pero los datos del HANDOFF §2.3.3 muestran que la hija (fase 3 active) tiene `last_timestamp = 1761916020` correcto, mientras que la madre (fase 2 passed_phase) tiene `1761841680` desalineado.

   **Esta discrepancia es importante.** Significa que la hija recibe un `last_timestamp` correcto desde algún sitio, pero NO desde el `session.last_timestamp` de la madre. Probablemente es del primer `engine.onTick` después de que el alumno entra a la nueva sesión (que sí actualiza `last_timestamp` en BD por el flujo normal de pause/persist). O bien hay otra escritura en advance que no aparece en el snippet del knowledge.

   **Implicación:** antes de elegir opción, **PASO 0 obligatorio leer al carácter el `advance.js` actual en HEAD `51e07c2`** y verificar si la hija recibe `last_timestamp` correcto del `nextPayload` o de otra fuente. Si es del nextPayload con valor stale, hay 2 bugs no 1. Si es de otra fuente, la opción puede ser distinta.

### 0.3 Decisión recomendada

**Recomendación: Opción A (cliente envía `endTime`).**

Justificación:

1. **Coste/beneficio.** La opción A resuelve el bug con ~4 líneas de código total. Las opciones B y C lo resuelven con 15-30 líneas y complejidad arquitectónica. El bug en sí es trivial; la solución debería serlo también.

2. **Riesgo de manipulación bajo.** El alumno típico no manipula el cliente. El alumno que sí manipula puede ya hoy modificar `localStorage`, falsear trades, etc. — el simulador no es una plataforma adversarial, es un simulador con cuenta personal. Defender `last_timestamp` con validación servidor mientras el resto del estado es trust-the-client es asimetría injustificada.

3. **Race condition de Opción B es real.** Documentada en código existente (300ms setTimeout). Opción B puede leer un `closed_at` stale si la replicación BD tarda. Opción A no tiene esta carrera porque el cliente lee de su propio engine en memoria, sin tocar BD.

4. **Disciplina YAGNI.** Opción C es Opción A + harness de validación que defiende contra un atacante hipotético. Si en el futuro aparece un caso real de manipulación, se evoluciona Opción A → Opción C en una sesión dedicada. Hoy es prematuro.

5. **Compatibilidad con saneamiento futuro de histórico.** El saneamiento (§3.X, fuera de alcance) usará una variante de Opción B (servidor deriva endTime de sim_trades ya commiteado, sin race porque es lectura post-mortem). Opción A para el fix en vivo + Opción B para el saneamiento histórico es coherente: cada cual usa la fuente más adecuada a su contexto.

**Pendiente OK Ramón** antes del PASO 0 y antes de tocar código.

### 0.4 Por qué descartamos Opción B y Opción C

**Opción B descartada principalmente por race condition.** El propio código del cliente (`_SessionInner.js`, lógica DD-breach) reconoce la consistencia eventual de `sim_trades` con el setTimeout de 300ms. Apoyar el fix en una lectura síncrona de esa misma tabla justo después del INSERT es construir sobre arena. Reservada como base del saneamiento histórico futuro (post-mortem, sin race).

**Opción C descartada por sobreingeniería.** El threshold N=600s es arbitrario; cualquier valor que pongamos genera casos límite que defender. La validación añade superficie de bug nueva (¿qué pasa si el cliente envía válido pero el servidor lo rechaza? ¿re-intentamos? ¿logueamos? ¿alarmamos?). Para un fix de 4 líneas, no procede. Reservada para futura sesión si aparece evidencia real de manipulación.

---

## 1. Objetivo de B4 (afilado)

> **Hacer que `/api/challenge/advance` persista `last_timestamp` de la sesión cerrada al momento exacto del cierre del trade que disparó la transición.** Hoy el endpoint hace UPDATE a `{status, balance}` sin tocar `last_timestamp`, dejando ese campo con el valor del último pause/tick previo. Tras B4, la sesión cerrada quedará con `last_timestamp` = endTime real (`__algSuiteCurrentTime` del cliente en el momento de pulsar "Continue").

**Lo que NO es el objetivo:**

- No tocar el data layer del refactor (`lib/sessionData.js`, lecturas/escrituras de cluster `__algSuite*`). Eso quedó cerrado en fase 2.
- No tocar la lectura de `last_timestamp` en `_SessionInner.js` (flujo `resumeReal`). El bug es en escritura, no en lectura.
- No tocar `lib/challengeEngine.js`. Es función pura, sin estado, sin escrituras a BD.
- No atacar B1 (10% flotante de fase 2 heredado a fase 3) aunque viva en el mismo endpoint. Sesión separada (HANDOFF-verificacion-A1 §7 lo menciona).
- No atacar B2/B3/B5/B6 (drawings, TF reset, 409 session_drawings, plugin LWC). Distintas capas, distintas sesiones.
- No corregir retroactivamente el histórico de sesiones ya cerradas en producción con `last_timestamp` desalineado. Ver §3.X — decisión separada.
- No introducir validación servidor de `endTime` (Opción C descartada en §0.4).

---

## 2. Inventario exhaustivo de puntos a tocar

### 2.0 PASO 0 — Verificación al carácter ANTES del primer Edit

> Lección §8.5 del `fase-1-plan.md` (retrospectiva post-fase 2): inventarios siempre con grep recursivo, nunca acotado a archivos sospechados.

Antes de aprobar cualquier `str_replace`, Claude Code debe ejecutar y pegar literal:

```bash
# 1. Endpoint actual al carácter (todo el archivo, no solo fragmentos).
cat pages/api/challenge/advance.js | wc -l    # tamaño esperado: ~150-200 líneas
cat pages/api/challenge/advance.js            # contenido completo

# 2. Cliente — todas las llamadas a /api/challenge/advance en el repo.
grep -rn "challenge/advance" components/ pages/ lib/ hooks/

# 3. Lecturas/escrituras de last_timestamp en todo el repo (saber qué más toca este campo).
grep -rn "last_timestamp" components/ pages/ lib/ hooks/

# 4. Confirmar que getMasterTime está disponible en el cliente (debe estar tras fase 2a).
grep -n "getMasterTime" components/_SessionInner.js
grep -n "getMasterTime" lib/sessionData.js
```

**Output esperado mínimo:**

- Punto 1: `advance.js` muestra los 2 paths (`pass` y `fail`), el UPDATE actual del path `pass`, y el UPDATE actual del path `fail` (si lo hay con su propia escritura).
- Punto 2: una llamada `fetch('/api/challenge/advance', ...)` en `_SessionInner.js:callChallengeAdvance`. Cero llamadas en otros sitios. Si aparecen otras, ampliar alcance del plan.
- Punto 3: lista de archivos que leen/escriben `last_timestamp`. Esperados: `_SessionInner.js` (escritura en pause + lectura en resume), `pages/api/sessions/*` (CRUD de sesiones), `pages/api/challenge/advance.js`. Si aparece algún sitio inesperado, investigar antes de avanzar.
- Punto 4: `getMasterTime` debe estar importada en `_SessionInner.js` desde fase 2a (commit `705e561`) y exportada desde `lib/sessionData.js`. Si no, el plan asume API disponible que no existe — error.

**Si algo no cuadra con el inventario asumido en §2.1/§2.2 de este plan, PARAR, actualizar el plan, esperar OK Ramón antes de seguir.**

### 2.1 Archivos a modificar

| Archivo | Capa | Tamaño cambio estimado |
|---|---|---|
| `pages/api/challenge/advance.js` | Backend | ~6 líneas: +3 líneas (validación end_timestamp), +3 modificaciones a UPDATEs (passed_phase, passed_all, failed_dd_*), +1 modificación a nextPayload.last_timestamp |
| `components/_SessionInner.js` | Cliente | +1 línea (añadir `end_timestamp` al body del POST) |

**Total estimado:** 7-8 líneas funcionales + comentarios + JSDoc opcional.

**Hallazgo del PASO 0 (1 may 2026):** el inventario al carácter de `advance.js` (273 líneas) destapó que la línea L236 (`nextPayload.last_timestamp: session.last_timestamp`) hereda el `last_timestamp` stale de BD a la sesión hija. Si solo arreglamos los UPDATEs de cierre, la hija sigue dependiendo del flujo asíncrono de PATCH del cliente — comportamiento estructuralmente frágil. Op 6 (sustituir L236 por `last_timestamp: end_timestamp`) cierra esto. Coste: 1 línea. Beneficio: la sesión hija nace con el cursor exacto, sin depender del timing de PATCHes previos. Plan original tenía 5 ops; tras PASO 0 son 6.

**Sin archivos nuevos. Sin migraciones Supabase. Sin deps nuevas.**

### 2.2 Modificaciones por sub-fase

> Esta sección se completa al carácter tras PASO 0. Lo siguiente es el **inventario asumido** basado en el snippet de `advance.js` disponible en el project knowledge. Si PASO 0 destapa diferencias, se actualiza esta tabla antes de codear.

**Backend — `pages/api/challenge/advance.js`:**

| # | Acción | Hoy | Tras B4 |
|---|---|---|---|
| 1 | Body parsing | `const { session_id, outcome } = req.body \|\| {}` | `const { session_id, outcome, end_timestamp } = req.body \|\| {}` |
| 2 | Validación de body | (existe validación de session_id y outcome) | + validación de `end_timestamp`: número entero, > 0, <= `Math.floor(Date.now()/1000) + 86400` (margen de 1 día por si el simulador está en futuro relativo a "ahora del servidor"). Si falta o inválido → 400. |
| 3 | UPDATE path `pass` | `.update({ status: 'passed_phase', balance: evaluation.balanceNow })` | `.update({ status: 'passed_phase', balance: evaluation.balanceNow, last_timestamp: end_timestamp })` |
| 4 | UPDATE path `pass` última fase | (similar al anterior, cierra como `passed_all`) | + `last_timestamp: end_timestamp` |
| 5 | UPDATE path `fail` | (cierra como `failed_dd_daily` o `failed_dd_total`) | + `last_timestamp: end_timestamp` |
| 6 | `nextPayload.last_timestamp` (L236, herencia a sesión hija) | `last_timestamp: session.last_timestamp` | `last_timestamp: end_timestamp` |

**Cliente — `components/_SessionInner.js`:**

| # | Acción | Hoy | Tras B4 |
|---|---|---|---|
| 6 | Llamada al endpoint en `callChallengeAdvance` | `body: JSON.stringify({ session_id: id, outcome })` | `body: JSON.stringify({ session_id: id, outcome, end_timestamp: getMasterTime() })` |

### 2.3 Lecturas/escrituras de `last_timestamp` que NO se tocan

> Para que quede registrado qué se deja igual y por qué.

Pendiente confirmar al carácter en PASO 0. Lo asumido:

- `_SessionInner.js` — flujo de pause normal, escribe `last_timestamp` vía PATCH a Supabase REST. **No se toca**, funciona correctamente; B4 solo afecta al endpoint de transición de fase.
- `_SessionInner.js` — flujo `resumeReal`, lee `last_timestamp` para posicionar engine. **No se toca**, es lectura.
- `pages/api/sessions/*` — CRUD de sesiones, escribe `last_timestamp` en INSERT inicial. **No se toca**, fuera de alcance.
- `lib/challengeEngine.js` — función pura. No toca BD. No se toca.

---

## 3. Plan detallado por sub-fase

### 3.1 Sub-fase única — fix de los 3 paths en advance + cliente

> Decisión de partición tomada: **una sola sub-fase con un solo commit funcional**, condicionado a que PASO 0 confirme que los 3 paths (`pass` no última fase, `pass` última fase, `fail`) comparten el mismo patrón de fix (añadir `last_timestamp: end_timestamp` al UPDATE existente). Si PASO 0 destapa que algún path tiene lógica distinta que requiere fix distinto, se separa en sub-fases B4a/B4b en este momento, no antes.

**Tamaño estimado:** ~5 líneas tocadas en 2 archivos. **Sesiones:** 1 (1-2 horas con validación). **Riesgo:** medio.

**Por qué medio (no bajo):**

- Aunque el cambio textual es trivial, toca un endpoint que persiste estado de challenges reales en producción Supabase. Un bug aquí (ej: persistir `null` o `NaN` en `last_timestamp`, romper el constraint del campo si lo tiene) afecta sesiones de alumnos que no se pueden recuperar sin script de saneamiento.
- El `end_timestamp` del cliente puede ser `null` si `getMasterTime()` devuelve null en algún edge case (ej: alumno alcanza target inmediatamente al cargar sesión sin haber dado play — improbable pero existe). Hay que decidir comportamiento: ¿rechazar con 400? ¿fallback a `Math.floor(Date.now()/1000)`? ¿fallback a `session.last_timestamp` actual?

**Decisión sobre `end_timestamp` null:** rechazar con 400. Razón: si el cliente no tiene masterTime, algo va mal en su lado y persistir un fallback enmascararía el bug. Mejor que el alumno vea error explícito y reporte que persistir basura silenciosamente. Esta decisión queda registrada aquí explícita.

#### Operaciones de código (orden estricto)

**Op 1 — Backend, body parsing y validación.**

Antes (en `pages/api/challenge/advance.js`, sección de validación inicial):

```js
const { session_id, outcome } = req.body || {}
if (!session_id || typeof session_id !== 'string') {
  return res.status(400).json({ error: 'session_id requerido' })
}
if (outcome !== 'pass' && outcome !== 'fail') {
  return res.status(400).json({ error: "outcome debe ser 'pass' o 'fail'" })
}
```

Después:

```js
const { session_id, outcome, end_timestamp } = req.body || {}
if (!session_id || typeof session_id !== 'string') {
  return res.status(400).json({ error: 'session_id requerido' })
}
if (outcome !== 'pass' && outcome !== 'fail') {
  return res.status(400).json({ error: "outcome debe ser 'pass' o 'fail'" })
}
// B4: end_timestamp es el momento exacto del cierre del trade que disparó la
// transición de fase. Lo envía el cliente leyendo getMasterTime() de la API
// del data layer (lib/sessionData.js, fase 2a). Sin este campo no podemos
// persistir el last_timestamp correcto en la sesión que se cierra.
if (!Number.isInteger(end_timestamp) || end_timestamp <= 0) {
  return res.status(400).json({ error: 'end_timestamp requerido (integer > 0)' })
}
const maxAllowed = Math.floor(Date.now() / 1000) + 86400
if (end_timestamp > maxAllowed) {
  return res.status(400).json({ error: 'end_timestamp fuera de rango razonable' })
}
```

**Op 2 — Backend, UPDATE path `pass` no última fase.**

Antes:

```js
const { data: closed, error: uErr } = await supabaseAdmin
  .from('sim_sessions')
  .update({
    status: 'passed_phase',
    balance: evaluation.balanceNow,
  })
  .eq('id', session_id)
  .select('*')
  .single()
```

Después:

```js
const { data: closed, error: uErr } = await supabaseAdmin
  .from('sim_sessions')
  .update({
    status: 'passed_phase',
    balance: evaluation.balanceNow,
    last_timestamp: end_timestamp,   // B4: persistir endTime real del cierre
  })
  .eq('id', session_id)
  .select('*')
  .single()
```

**Op 3 — Backend, UPDATE path `pass` última fase.**

Pendiente leer al carácter el código actual en PASO 0. La operación es análoga: añadir `last_timestamp: end_timestamp` al UPDATE que cierra como `passed_all`.

**Op 4 — Backend, UPDATE path `fail`.**

Pendiente leer al carácter el código actual en PASO 0. La operación es análoga: añadir `last_timestamp: end_timestamp` al UPDATE que cierra como `failed_dd_daily` o `failed_dd_total`.

**Op 5 — Cliente, `_SessionInner.js:callChallengeAdvance`.**

Antes:

```js
const res = await fetch('/api/challenge/advance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: id, outcome }),
})
```

Después:

```js
const res = await fetch('/api/challenge/advance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: id,
    outcome,
    end_timestamp: getMasterTime(),   // B4: endTime real del cierre, fuente de verdad cliente
  }),
})
```

**Op 6 — Backend, `nextPayload.last_timestamp` en herencia a sesión hija (L236).**

Hallazgo del PASO 0: la línea L236 hereda `session.last_timestamp` (el valor stale leído en L69-73) a la sesión hija del path passed_phase. Esto significa que aunque arreglemos el UPDATE de cierre de la madre (Op 2), la hija sigue naciendo con un `last_timestamp` que depende del último PATCH asíncrono del cliente, no del endTime real del cierre. Estructuralmente frágil.

Antes (`pages/api/challenge/advance.js` L232-236, dentro del nextPayload):

```js
    // FTMO-real: el replay NO retrocede. Arranca donde el alumno cerró la fase anterior.
    // En FTMO real, las credenciales de Fase 2 te llegan el día siguiente al pass de Fase 1;
    // el mercado sigue donde lo dejaste. El capital sí se resetea (cuenta nueva), pero
    // el tiempo del mundo no retrocede al 1 de abril.
    last_timestamp: session.last_timestamp,
```

Después:

```js
    // FTMO-real: el replay NO retrocede. Arranca donde el alumno cerró la fase anterior.
    // En FTMO real, las credenciales de Fase 2 te llegan el día siguiente al pass de Fase 1;
    // el mercado sigue donde lo dejaste. El capital sí se resetea (cuenta nueva), pero
    // el tiempo del mundo no retrocede al 1 de abril.
    // B4: usar end_timestamp (cliente) en lugar de session.last_timestamp (stale en BD).
    // Garantiza que la hija nace con el cursor en el momento exacto del cierre, sin
    // depender del timing del último PATCH asíncrono del cliente.
    last_timestamp: end_timestamp,
```

#### Verificaciones automáticas pre-commit

Después de aplicar Op 1-5, antes del commit, ejecutar y pegar literal:

```bash
# 1. Build pasa.
npm run build         # con dev parado (regla §8.1)

# 2. Endpoint persiste el campo en los 3 paths (cero residuos del patrón viejo).
grep -nE "\.update\(\s*\{[^}]*status:\s*'(passed_phase|passed_all|failed_dd)" pages/api/challenge/advance.js
# → cada match debe estar acompañado de last_timestamp en el mismo objeto.

# 3. Cliente envía end_timestamp.
grep -n "end_timestamp" components/_SessionInner.js
# → debe aparecer al menos 1 match dentro del fetch a /api/challenge/advance.

# 4. Servidor valida end_timestamp.
grep -n "end_timestamp" pages/api/challenge/advance.js
# → al menos 1 match en validación + 3 en los UPDATEs.
```

Cualquier match esperado que no aparezca, o cualquier match inesperado en otro archivo, **PARAR** y diagnosticar.

#### Pruebas manuales de Ramón (post-edits, post-build, pre-commit)

Tras `npm run build` exit 0 y greps verdes, relanzar dev y validar EN LOCAL (NO en producción):

**Prueba 1 — Smoke check baseline.**
- Abrir cualquier sesión practice (no-challenge) en `localhost:3000`.
- Cargar, dar play 30s, pause, reload.
- Verificar: chart pinta, no errores rojos en consola, persistencia normal de `last_timestamp` en pause sigue funcionando (PATCH a Supabase visible en Network tab).

Si esto falla, B4 ha roto algo no relacionado y hay que diagnosticar antes de seguir.

**Prueba 2 — Reproducción del bug en local sin fix (control negativo).**
- `git stash` los cambios de Op 1-5.
- Crear sesión challenge fresca de prueba (1F o 2F, $200K, EUR/USD, fechas que permitan llegar a target rápido).
- Llegar a target (manipulando trade con TP cercano).
- Pulsar "Continue to Phase 2" (o "Submit Phase" si es 1F).
- Query Supabase: `SELECT id, status, last_timestamp FROM sim_sessions WHERE name LIKE '%test b4%' ORDER BY created_at DESC LIMIT 5`.
- **Resultado esperado (bug presente):** la sesión cerrada (status='passed_phase' o 'passed_all') tiene `last_timestamp` desalineado del momento real del cierre.
- **Validar el desalineamiento al carácter:** capturar `__algSuiteCurrentTime` en consola justo antes de pulsar Continue. Comparar con `last_timestamp` en BD post-Continue. Anotar diferencia en segundos.
- `git stash pop` para restaurar los cambios.

**Prueba 3 — Reproducción del flujo con fix aplicado (validación principal).**
- Crear OTRA sesión challenge fresca (no reutilizar la de prueba 2).
- Llegar a target.
- Capturar `__algSuiteCurrentTime` en consola justo antes de pulsar Continue. Llamémoslo `endTime_capturado`.
- Pulsar Continue.
- Verificar Network tab: el body del POST a `/api/challenge/advance` debe incluir `end_timestamp: <valor>` y el valor debe coincidir al carácter con `endTime_capturado`.
- Verificar response: 200 OK, `action: 'phase_passed'`, sesión hija creada.
- Query Supabase: la sesión cerrada ahora tiene `last_timestamp = endTime_capturado` al carácter.
- La sesión hija sigue teniendo `last_timestamp` correcto (verificar contra el de la madre — deberían coincidir si todo fluye normal).

**Prueba 4 — Path `fail` (DD breach).**
- Crear sesión challenge fresca con DD diario bajo (5%) para forzar quema.
- Abrir trade grande, dejar correr hasta DD-breach automático.
- Verificar: el cliente envía `end_timestamp` en el POST a advance con outcome='fail'.
- Query Supabase: sesión cerrada tiene `last_timestamp = endTime` del cierre forzado.

**Prueba 5 — Path `passed_all` (última fase).**
- Crear sesión challenge 1F (1 fase) o usar fase 3 de un 3F existente, llegar a target.
- Pulsar "Comenzar Challenge Real" (o equivalente que dispare advance con outcome='pass' en última fase).
- Query Supabase: sesión tiene `status='passed_all'` y `last_timestamp = endTime` correcto.

**Prueba 6 — Validación del rechazo 400.**
- En DevTools, modificar manualmente el fetch para enviar `end_timestamp: null`.
- Verificar: response 400 con error claro.
- Modificar para enviar `end_timestamp: -1`.
- Verificar: response 400.
- Modificar para enviar `end_timestamp: 99999999999999` (muy futuro).
- Verificar: response 400.

**Prueba 7 — Idempotencia.**
- Pulsar Continue 2 veces seguidas (rápido) o re-llamar al endpoint vía DevTools en una sesión ya cerrada.
- Verificar: segunda llamada devuelve 409 (sesión ya cerrada, no reabrir, no re-avanzar).
- `last_timestamp` no se sobrescribe con un segundo valor.

**Prueba 8 — Review Session post-fix (validación del bug original A1).**
- Tras prueba 3 (sesión cerrada con fix), volver al dashboard.
- Pulsar "Review Session" sobre la sesión cerrada.
- Verificar: chart carga en el momento exacto donde se cerró la fase (no atrás, no adelante).
- Capturar `__algSuiteCurrentTime` en consola tras Review — debería ser igual al `endTime_capturado` de prueba 3 (o muy cercano si el flujo de Review no setea masterTime explícitamente, en cuyo caso valdría la inspección visual del chart).

**Criterio de paso del conjunto de pruebas:** las 8 pasan sin regresión y las queries SQL muestran `last_timestamp` correcto en BD para todos los paths.

**Criterio de fallo:** cualquier prueba falla → PARAR, NO comitear, diagnosticar.

**Si todo OK → enseñar `git diff` completo a Ramón → esperar OK explícito → commit.**

#### Commit message sugerido

```
fix(b4): persistir last_timestamp real al cerrar fase y al heredar a fase hija

Antes: el endpoint /api/challenge/advance hacía UPDATE a {status, balance}
sin tocar last_timestamp, dejando la sesión cerrada con el último valor de
pause/tick previo. Adicionalmente, el nextPayload de la sesión hija heredaba
session.last_timestamp (valor stale leído de BD), no el endTime real del
cierre. Resultado: sesiones passed_phase/passed_all/failed_dd_* tenían
last_timestamp desalineado del momento real, y la sesión hija dependía del
timing del último PATCH asíncrono del cliente para nacer en el cursor
correcto. Bug A1 reportado por alumno, diagnosticado en
HANDOFF-verificacion-A1.md §3.

Después: el cliente envía end_timestamp = getMasterTime() en el body del POST.
El servidor valida (entero > 0, <= now+1d) y lo usa en 4 sitios:
- UPDATE passed_phase: + last_timestamp: end_timestamp
- UPDATE passed_all:   + last_timestamp: end_timestamp
- UPDATE failed_dd_*:  + last_timestamp: end_timestamp
- nextPayload de hija: last_timestamp: end_timestamp (antes era
  session.last_timestamp stale)

Decisión arquitectónica: Opción A (cliente envía endTime). Opciones B y C
descartadas en b4-plan.md §0.4 por race condition / sobreingeniería.

Cambios:
- pages/api/challenge/advance.js: aceptar end_timestamp en body, validar,
  persistirlo en los 3 UPDATEs y en el nextPayload (Op 6 añadida tras
  inventario PASO 0).
- components/_SessionInner.js: callChallengeAdvance envía end_timestamp.

Saneamiento de histórico (sesiones ya cerradas con last_timestamp desalineado)
NO incluido en este commit. Decisión separada — ver b4-plan.md §3.X.

Sin migraciones Supabase. Sin deps nuevas. Sin cambios funcionales fuera del
flujo de transición de fase.
```

### 3.X — Decisión separada: saneamiento del histórico

**Fuera de alcance de este plan.** Documentado aquí solo para que no se pierda el hilo.

**Problema:** todas las sesiones challenge cerradas en producción ANTES del fix de B4 tienen `last_timestamp` potencialmente desalineado. El HANDOFF-verificacion-A1 §4.2 estima que probablemente afecta a TODAS las sesiones `passed_phase` y `failed_dd_*` del histórico, no solo a las verificadas.

**Por qué se separa:**

1. Disciplina "una cosa cada vez" (HANDOFF-verificacion-A1 §1.4 punto 3). El fix del endpoint y la corrección retroactiva son 2 problemas distintos.
2. Riesgo asimétrico. El fix es código revertible con `git revert`. El saneamiento es UPDATE masivo en producción, no revertible sin backup. Tratarlos juntos diluye el rigor que el segundo necesita.
3. Espíritu de regla CLAUDE.md §3.1 ("NO migraciones Supabase"). Un script `UPDATE sim_sessions SET ...` masivo viola el espíritu de la regla aunque no sea un schema migration.
4. Dato a reconstruir no trivial. Para una sesión cerrada hace 2 meses, ¿de dónde sacamos el `endTime` real? Probablemente del `closed_at` del último trade en `sim_trades` con `result IN ('TP','SL','MANUAL')`. Pero hay que validar caso a caso que esa heurística cuadra.

**Cuándo se aborda:** sesión dedicada futura, después de:
- B4 cerrado en producción y validado durante 1-2 semanas (las sesiones nuevas creadas post-fix sirven de baseline limpio).
- Análisis previo: query SQL de discovery sobre `sim_sessions` cruzada con `sim_trades` para entender magnitud del problema (cuántas sesiones afectadas, cuántas tienen sim_trades reconstruibles, cuántas no).
- Plan dedicado con backup explícito de `sim_sessions` antes del UPDATE, dry-run en transacción con rollback, validación post-UPDATE muestreada.

**Por ahora:** el HANDOFF-verificacion-A1 §4.3 ya da al alumno reportador la salida temporal: "el `last_timestamp` real del cierre se puede consultar en la sesión hija (fase siguiente). El histórico de trades en sim_trades está intacto y correcto". Esto vale como workaround hasta que se haga el saneamiento.

---

## 4. Riesgos identificados y mitigaciones

> Ordenados por gravedad descendente.

### Riesgo 1 — Persistir `null` o `NaN` en `last_timestamp` por edge case en cliente (CRÍTICO)

**Síntoma:** `getMasterTime()` devuelve `null` (alumno llega a target sin haber dado play, o tras Cmd+R sin play). El cliente envía `end_timestamp: null`. Servidor responde 400. Alumno ve error en UI al pulsar Continue.

**Mitigación:**
1. La validación servidor (Op 1) rechaza explícitamente con 400. No persistimos basura.
2. La UX del 400: el handler `callChallengeAdvance` ya logguea `console.error('[challenge/advance] error:', data?.error)` y devuelve null. El padre maneja null sin redirigir. **Revisar en PASO 0** qué ve el usuario en pantalla — si es solo el modal sin acción, hay que mejorar el feedback. Posible mejora: mostrar toast con mensaje de error.
3. Investigar en PASO 0 si `getMasterTime()` puede devolver null en el momento real del modal "target_reached". Si el modal se abre solo cuando hay un trade que disparó target, debería haber al menos un `engine.onTick` previo que setea masterTime. Si la auditoría confirma que es imposible, la validación servidor es defensa en profundidad. Si hay algún path que sí lo permite, hay que decidir fallback o bloquear el modal.

**Señal a Ramón:** durante prueba 3, el body del POST debe llevar siempre un `end_timestamp` numérico válido. Si alguna vez es null, hay edge case no cubierto.

### Riesgo 2 — Romper el path `fail` por asumir mismo patrón que `pass`

**Síntoma:** path `fail` tiene lógica distinta al path `pass`. Aplicar Op 4 sin verificar al carácter en PASO 0 introduce regresión en el flujo de DD-breach (challenge quemado).

**Mitigación:** PASO 0 obligatorio. Op 4 se redacta al carácter SOLO después de leer `advance.js` completo. Si el path `fail` tiene firma distinta del UPDATE, se actualiza el plan.

**Señal a Ramón:** prueba 4 (DD breach) falla → revisar Op 4.

### Riesgo 3 — Cliente envía `end_timestamp` correcto pero servidor rechaza por validación de rango

**Síntoma:** el simulador puede operar en "futuro relativo" (sesión challenge con `date_to` 6 meses adelante del "ahora real"). El alumno cierra fase con `endTime` que es 5 meses futuro respecto a `Date.now()/1000` del servidor. La validación `end_timestamp <= now + 86400` lo rechaza.

**Mitigación:** la validación tiene margen de 1 día (`+ 86400`). Pero el simulador no opera en futuro relativo al servidor en producción real — el servidor SIEMPRE está en "ahora", y los datos de mercado del simulador son históricos. El `endTime` del cliente siempre es ≤ ahora real.

**Confirmar en PASO 0** mirando `date_from`/`date_to` de sesiones challenge reales en BD: si todas tienen rangos en pasado, la validación con `now + 86400` está holgada. Si alguna tiene `date_to` futuro, hay que ampliar margen o quitar el cap superior.

**Señal a Ramón:** prueba 3 → response 400 con "end_timestamp fuera de rango". Si pasa, recalibrar el cap.

### Riesgo 4 — Cliente manipulado envía `end_timestamp` falseado

**Síntoma:** alumno alarga artificialmente sus fases manipulando el body del POST en DevTools.

**Mitigación:** asumida en §0.3 punto 2. El simulador no es plataforma adversarial. El cliente ya tiene autoridad sobre todo el state del simulador (localStorage, trades, etc.). Defender solo `last_timestamp` con validación servidor mientras el resto es trust-the-client es asimetría injustificada. **Si en el futuro emerge caso real de manipulación, Opción C de §0.1.** Hoy aceptado.

**Señal a Ramón:** N/A (riesgo aceptado por diseño).

### Riesgo 5 — Idempotencia rota por el cambio

**Síntoma:** segunda llamada a advance sobre sesión ya cerrada actualiza `last_timestamp` en lugar de devolver 409.

**Mitigación:** el UPDATE no se ejecuta si la sesión ya está cerrada — el endpoint tiene check de `status != 'active'` ANTES del UPDATE (verificable en PASO 0). El cambio de B4 no toca ese check. La idempotencia se preserva.

**Señal a Ramón:** prueba 7 falla → idempotencia rota.

### Riesgo 6 — Romper Vercel build

**Síntoma:** `npm run build` falla.

**Mitigación:** `npm run build` local antes del commit (regla `fase-1-plan.md §8.1`). Si falla, no commit.

### Riesgo 7 — Tocar inadvertidamente bugs B1/B2/B3/B5/B6

**Síntoma:** un bug pre-existente (10% flotante heredado, drawings descolocadas, TF reset, 409 session_drawings, plugin LWC reinicializa) cambia de comportamiento.

**Mitigación:** alcance B4 es ESTRICTAMENTE persistir `last_timestamp`. Las 5 operaciones de código no tocan ningún path relacionado con flotante, drawings, TF, ni plugin. Si Ramón observa cambio en B1-B6 durante pruebas, **anotarlo** sin intentar arreglar.

**Señal a Ramón:** comportamiento distinto en B1-B6 → registrar, no fixear en B4.

### Riesgo 8 — Race condition entre el INSERT del trade que dispara target y la llamada a advance

**Síntoma:** advance se ejecuta antes de que el INSERT del trade esté visible en BD para `sim_trades`. (No es problema directo de B4 porque B4 usa el cliente, no `sim_trades`. Pero conviene tenerlo en cuenta porque si en el futuro se quiere migrar a Opción B, este riesgo aplica.)

**Mitigación:** no aplica a Opción A. Registrado por completitud.

---

## 5. Criterio de "B4 cerrado"

B4 está cerrado cuando se cumplen TODAS estas condiciones:

1. ✅ Op 1-5 comiteadas en `fix/b4-advance-last-timestamp`.
2. ✅ `pages/api/challenge/advance.js` valida `end_timestamp` y lo persiste en los 3 paths (passed_phase, passed_all, failed_dd_*).
3. ✅ `components/_SessionInner.js:callChallengeAdvance` envía `end_timestamp: getMasterTime()` en el body.
4. ✅ `npm run build` pasa exit 0.
5. ✅ Greps automáticos de §3.1 ("Verificaciones automáticas pre-commit") OK.
6. ✅ Las 8 pruebas manuales de §3.1 pasadas por Ramón sin regresión.
7. ✅ Bugs B1, B2, B3, B5, B6 (HANDOFF-verificacion-A1.md §7) y los 6 bugs del CLAUDE.md §9 siguen exactamente como estaban (B4 NO los pretende arreglar).
8. ✅ Tras merge a `main` y push, Vercel deploy verde.
9. ✅ Smoke check producción: crear sesión challenge fresca real (cuenta Ramón), llegar a target, verificar en Supabase Studio que `last_timestamp` cuadra al carácter con el `endTime` capturado en consola pre-Continue.

**B4 NO incluye:**
- Saneamiento de histórico (§3.X, decisión separada).
- Fix de B1 (10% flotante, mismo endpoint, alcance distinto).

---

## 6. Lista de NO HACER en B4

> Cosas que es tentador tocar pero rompen el alcance. Si me veo haciéndolas, paro y aviso.

1. **NO** atacar B1 (10% flotante de fase 2 heredado a fase 3) aunque viva en el mismo endpoint. Sesión separada.
2. **NO** corregir retroactivamente sesiones ya cerradas con `last_timestamp` desalineado. Decisión separada §3.X.
3. **NO** hacer migraciones Supabase. Regla absoluta CLAUDE.md §3.1. (No procede en B4 — el campo `last_timestamp` ya existe en `sim_sessions`).
4. **NO** tocar `lib/challengeEngine.js`. Es función pura, sin estado, sin BD. El bug no vive aquí.
5. **NO** tocar las lecturas de `last_timestamp` en `_SessionInner.js` (flujo `resumeReal`). El bug es en escritura, no en lectura.
6. **NO** introducir validación servidor de `endTime` cruzando con `sim_trades` (Opción C descartada).
7. **NO** tocar otros endpoints (`pages/api/sessions/*`, `pages/api/candles/*`). B4 vive solo en `advance.js`.
8. **NO** push a GitHub sin OK explícito. Vercel auto-deploya en push a `main`, producción se mantiene intacta hasta validar B4.
9. **NO** mergear nada a `main` durante B4. Solo commits en `fix/b4-advance-last-timestamp`.
10. **NO** instalar dependencias npm nuevas. Regla absoluta CLAUDE.md §3.4.
11. **NO** tocar otros repos (`algorithmic-suite-hub`, `journal-algorithmic-suite`).
12. **NO** introducir TypeScript ni cambiar de pages router a app router.
13. **NO** añadir tests automáticos. Decisión Ramón en CLAUDE.md §5.4 — depende del momento, no es ahora.
14. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios + 1 comentario explicativo del fix B4 en cada UPDATE tocado.

---

## 7. Resumen ejecutivo (para que Ramón decida en 30 s)

- **1 sub-fase** (condicionada a PASO 0). 1 sesión de trabajo estimada (1-2 horas con validación). 1 commit funcional + posibles commits previos de docs.
- **0 archivos nuevos**: se modifican `pages/api/challenge/advance.js` (~5 líneas) y `components/_SessionInner.js` (~1 línea).
- **0 deps nuevas. 0 migraciones Supabase. 0 cambios funcionales fuera del flujo de transición de fase.**
- **Decisión arquitectónica §0**: Opción A (cliente envía endTime). Opciones B y C descartadas. **Pendiente OK Ramón** antes del PASO 0.
- **Validación**: 8 pruebas manuales en local (incluyendo control negativo con `git stash`). Antes del commit, `git diff` completo a Ramón + OK explícito.
- **Rama**: `fix/b4-advance-last-timestamp`, a crear desde `main` HEAD `51e07c2` cuando el plan se apruebe. Sin push.
- **Cierre**: tras commit + merge + push, B4 cerrado en producción. Sesiones nuevas creadas post-fix tendrán `last_timestamp` correcto. Sesiones históricas siguen desalineadas hasta sesión dedicada de saneamiento (§3.X).

---

## 8. Lecciones operativas (heredadas)

Las lecciones §8.1-§8.5 del `fase-1-plan.md` (algunas reforzadas en `fase-2-plan.md §8`) aplican igual a B4:

- **§8.1**: NUNCA `npm run build` con `npm run dev` corriendo sobre el mismo `.next/`. Protocolo en 6 pasos para validación pre-commit.
- **§8.2**: Inventario de variables huérfanas ANTES de mover bloques. Aplicabilidad reducida en B4 (no se mueven bloques, solo se añaden campos).
- **§8.3**: macOS no tiene `timeout` por defecto. `gtimeout` o workaround bash.
- **§8.4**: Comandos git como operaciones SEPARADAS, no encadenadas con `&&`. Granularidad de control. `git add` aparte, `git commit` aparte, `git log` aparte.
- **§8.5**: Inventarios siempre con grep -rn recursivo, nunca acotado a archivos sospechados. Materializado en §2.0 PASO 0 obligatorio.

Adicionalmente, lecciones de la sesión 30 abr (HANDOFF-cierre-fase-2 §8 "Norma de discriminación"):

- **Cuando algo no cuadra durante una prueba, parar a verificar antes de declarar regresión o pre-existente.** Aplicar prueba de discriminación: ¿se reproduce a menor velocidad / sin play / commit anterior? En B4: si una prueba falla, hacer `git stash` para verificar que el fallo no estaba pre-fix; si pre-fix también falla, no es regresión de B4.

---

## 9. Stack y entorno

Sin cambios respecto a HANDOFF.md v3 §11 y HANDOFF-cierre-fase-2.md §6:

- Next.js 14.2.35 (pages router).
- React 18.
- Supabase (auth + Postgres). Tabla relevante: `sim_sessions`, columna `last_timestamp` (bigint UNIX seconds).
- Vercel deploy.
- Mac iMac, macOS, terminal zsh.
- Email cuenta Claude: `rammglobalinvestment@gmail.com`.

### Sesiones de prueba previstas

Para las 8 pruebas manuales del §3.1, hay que crear sesiones challenge nuevas en local (NO reutilizar las de producción usadas en HANDOFF-verificacion-A1 §6.3):

- 1 sesión challenge 2F · $200K · EURUSD para pruebas 2-3 (control negativo + fix path pass).
- 1 sesión challenge 2F · DD diario 5% · EURUSD para prueba 4 (path fail).
- 1 sesión challenge 1F · $200K · EURUSD para prueba 5 (path passed_all).
- 1 sesión practice (no-challenge) cualquiera para prueba 1 (smoke baseline).

Total: 4 sesiones nuevas en BD local. Pueden borrarse al cerrar B4 o dejarse como histórico de testing.

---

## 10. Documentos relacionados

| Archivo | Ubicación | Estado | Relación con B4 |
|---|---|---|---|
| `HANDOFF-verificacion-A1.md` | raíz, comiteado en `51e07c2` | Histórico | Diagnóstico cerrado de B4 (§3) |
| `HANDOFF-cierre-fase-2.md` | raíz, comiteado en `51e07c2` | Histórico | Estado del repo al arrancar B4 |
| `HANDOFF.md` v3 | raíz, comiteado en `125ad4b` | Referencia | Reglas absolutas §7 |
| `refactor/fase-1-plan.md` | comiteado | Referencia | Lecciones §8 |
| `refactor/fase-2-plan.md` | comiteado | Referencia | Plantilla estructural de este plan |
| `refactor/core-analysis.md` | comiteado | Referencia | §6 vigente: B4 fuera de capas refactor |
| `CLAUDE.md` | comiteado | Referencia | Reglas absolutas §3 |
| `pages/api/challenge/advance.js` | comiteado | A modificar | Archivo principal del fix |
| `components/_SessionInner.js` | comiteado | A modificar | `callChallengeAdvance` |
| `lib/sessionData.js` | comiteado tras fase 2 | Solo lectura desde B4 | Provee `getMasterTime()` |

---

## 11. Reglas absolutas (sin cambios respecto a HANDOFF.md v3 §7 y HANDOFF-verificacion-A1)

1. **NO push** sin OK explícito de Ramón. Vercel auto-deploya en push a `main`.
2. **NO migraciones Supabase**.
3. **NO tocar otros repos**.
4. **NO dependencias npm nuevas**.
5. **Aprobación opción 1 manual SIEMPRE** en Claude Code. NUNCA opción 2 "allow all".
6. **Comandos git separados, no encadenados con `&&`.** Excepción: leer-y-volcar (`git diff > /tmp/file.txt && cat /tmp/file.txt`).
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK. (B4 es <10 líneas; aun así, este plan se aprueba antes de tocar código.)
8. **Producción** intacta hasta merge a `main` con B4 validado en local.

---

## 12. Cómo arrancar B4 (paso a paso para el chat que ejecute)

> Este plan se aprueba en chat web. La ejecución la hace Claude Code en terminal de Ramón con aprobación opción 1 manual de cada operación.

### 12.1 Pre-arranque (en chat web)

1. Ramón aprueba este plan, o pide modificaciones. Si pide, se actualiza y re-aprueba.
2. Ramón confirma decisión §0 (Opción A recomendada o cambiar).
3. Ramón confirma smoke check producción `simulator.algorithmicsuite.com` verde en `51e07c2`.

### 12.2 Arranque (en Claude Code)

1. `git status` → debe estar limpio en `main` HEAD `51e07c2`.
2. `git checkout -b fix/b4-advance-last-timestamp` → rama nueva creada.
3. PASO 0 — los 4 greps de §2.0. Pegar outputs literal a Ramón.
4. Si PASO 0 cuadra con el inventario asumido → seguir. Si no → actualizar plan + re-aprobar.

### 12.3 Ejecución (en Claude Code, una operación a la vez)

5. Op 1 — backend, body parsing y validación. Edit con `str_replace`. Aprobación manual.
6. Op 2 — backend, UPDATE path `pass` no última fase. Aprobación manual.
7. Op 3 — backend, UPDATE path `pass` última fase. Aprobación manual.
8. Op 4 — backend, UPDATE path `fail`. Aprobación manual.
9. Op 5 — cliente, `callChallengeAdvance`. Aprobación manual.

### 12.4 Validación pre-commit (en Claude Code + navegador)

10. Verificaciones automáticas de §3.1 (greps + npm run build). Pegar outputs literal.
11. Pruebas manuales 1-8 de §3.1 en local. Ramón ejecuta, Claude observa logs.
12. Si todo OK → `git diff` completo a Ramón.
13. Ramón da OK explícito.

### 12.5 Commit (en Claude Code)

14. `git add pages/api/challenge/advance.js components/_SessionInner.js`. Aprobación.
15. `git commit` con heredoc del mensaje de §3.1. Aprobación.
16. `git log --oneline -5` para verificar.

### 12.6 Merge + push + deploy (decidir en chat web)

17. Decidir con Ramón si se mergea + pushea hoy o se duerme una noche (lección recurrente: push importante en frío).
18. Si push aprobado: `git checkout main`, `git merge fix/b4-advance-last-timestamp`, `git push origin main`. Cada uno con su aprobación.
19. Watch Vercel deploy. Si rojo, `git revert` + push. Si verde, smoke check producción de §5 punto 9.

### 12.7 Cierre (en chat web)

20. Redactar `HANDOFF-cierre-b4.md` con resultados, sesiones de prueba creadas, decisiones tomadas, próximo paso (probable: B1 o fase 3 viewport).
21. Comitear el HANDOFF en una sesión posterior (no en el commit del fix, mantener atomicidad).

---

**Fin del plan táctico B4.**

Pendiente OK Ramón en §0.3 (decisión arquitectónica) + smoke check producción en §12.1 punto 3 + aprobación general de este plan antes de pasar a Claude Code para PASO 0.
