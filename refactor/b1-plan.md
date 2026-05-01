# Plan táctico — B1 (fix flotante heredado a fase nueva en transición de challenge)

> Documento operativo. Ramón debe leer §0 (decisión rápida) y §7 (resumen 30s) mínimo.
> Trabajamos en la rama `fix/b1-advance-close-trades-on-pass` (a crear desde `main` HEAD `db94e78` cuando el plan se apruebe).
> No mergeamos a `main` hasta que Ramón lo confirme explícitamente. Cada operación = aprobación opción 1 manual en Claude Code.

---

## 0. Decisión arquitectónica (corta, ya tomada)

**Doctrina pedagógica de Ramón (verbatim, sesión 1 may 2026):**

> "El flotante vivo en transición se esfuma. No se registra. No se contabiliza. La fase nueva nace virgen — balance nominal, cero posiciones, cero flotante. Cursor temporal y dibujos sí se heredan."

> "Cierres parciales son práctica normal. Se conservan tal cual. B1 NO los toca. B1 solo entra en el momento exacto de pulsar Continue to Phase X+1, y solo afecta a lo que esté vivo (parcial residual o posición entera) en ese momento."

> "Las métricas de la fase pasada son las que ya hay (la fila del cierre que disparó el modal). No añadimos. No corregimos."

> "El modal solo se dispara con profit cerrado, no con flotante. El target se calcula solo con cerrado."

**Implementación elegida:**

El backend, en `pages/api/challenge/advance.js` con `outcome='pass'` y NO última fase, **descarta** las posiciones vivas del cliente sin insertarlas en `sim_trades` y sin contabilizarlas en el balance. El cliente envía las posiciones vivas en el body solo a efectos informativos (auditoría/logs), pero el backend no las persiste como cierres. El balance que se persiste en la sesión madre es `evaluation.balanceNow` (ya correcto, calculado solo con cerrados). El `nextPayload` de la hija ya nace virgen (balance nominal, sin trades) — no se toca.

**Lado cliente**: añadir reset de `pairState.current` al cambiar de `id`. Sin esto, aunque el backend no haga nada, las posiciones vivas en memoria del cliente sobreviven al `router.push('/session/<hijaId>')` y aparecen en la fase nueva. Este es el bug visible que el alumno reportó en HANDOFF-verificacion-A1.md §7.

**Por qué esta decisión y no otra:**

1. Tu doctrina es "se esfuma, no cuenta". Insertar filas en `sim_trades` con `result='auto-close'` o similar contradice "no cuenta". Lo más fiel a tu doctrina es no insertar nada.
2. Como B1 no inserta filas en `sim_trades`, no necesita marcador (`session_type`, `notes`, ni nada). Cero deuda nueva en BD.
3. Como el backend no recalcula PnL, no necesitamos portar `calcPnl`/`pipMult` al servidor. Cero código nuevo de cálculo financiero en backend.
4. Como `evaluation.balanceNow` ya viene de `evaluateChallenge` con solo trades cerrados (validado en advance.js L121-L128), el balance persistido en la sesión madre es correcto desde antes de B1. No requiere recálculo.
5. El cliente envía las posiciones vivas en el body por **trazabilidad solo**: el servidor las loguea con `console.log` para auditoría futura ("estos son los flotantes que se descartaron al pasar fase"), pero no las persiste. Si en el futuro decides cambiar la doctrina y querer registrar esos cierres como filas, el dato ya está llegando al servidor y solo habría que añadir el INSERT.

---

## 1. Alcance

### 1.1 Qué SÍ toca B1

- `pages/api/challenge/advance.js` — solo el path `passed_phase` (no última fase). FAIL y `passed_all` quedan fuera.
- `components/_SessionInner.js` — dos puntos: el body de `callChallengeAdvance` (añadir posiciones vivas) y el reset de `pairState` al cambiar de `id` (effect nuevo).

### 1.2 Qué NO toca B1

- Path FAIL de `/advance` (`outcome='fail'`). El cliente ya cierra todas las posiciones por DD breach vía `checkChallengeBreach` antes de llamar a `/advance`. No hay flotante vivo a la hora del fail.
- Path `passed_all` (última fase del challenge). El alumno termina; no hay fase hija que deba nacer virgen. Si quedan flotantes vivos al completar el challenge, se esfuman lo mismo (al cerrar la sesión completa). Esto se comprueba en pruebas, no requiere op específica.
- `pages/api/challenge/status.js` — solo lee trades cerrados. No requiere cambios.
- Schema de `sim_trades` — sin cambios. Sin migración.
- Cierres parciales en sesiones normales (practice o challenges activos). Se conservan tal cual.
- Histórico de challenges pasados con flotantes heredados ya quemados — fuera de alcance, decisión separada §3.X.

### 1.3 Outcome esperado

- Alumno alcanza target con profit cerrado (modal se abre).
- Alumno pulsa "Continue to Phase X+1".
- Posiciones vivas (sea parcial residual, sea posición entera) se descartan silenciosamente.
- Hija nace virgen: balance nominal, cero posiciones, cero flotante. Cursor en `end_timestamp`. Dibujos se heredan (igual que hoy).
- En la fase nueva, el alumno NO ve las posiciones de la fase anterior ni en el chart, ni en el HUD, ni en el panel de positions.

---

## 2. Inventario PASO 0 (verificado al carácter, sesión 1 may 2026)

### 2.0 Comandos ejecutados

`grep -rn "sim_trades" components/ pages/ lib/`
`sed -n '100,160p' pages/api/challenge/advance.js`
`sed -n '155,200p' pages/api/challenge/advance.js`
`sed -n '200,260p' pages/api/challenge/advance.js`
`sed -n '260,290p' pages/api/challenge/advance.js`
`sed -n '70,120p' pages/api/challenge/status.js`
`grep -n "callChallengeAdvance" components/_SessionInner.js`
`sed -n '675,725p' components/_SessionInner.js`
`grep -n "pairState" components/_SessionInner.js`
`grep -n "}, \[id\])" components/_SessionInner.js`
`sed -n '535,590p' components/_SessionInner.js`
`sed -n '595,635p' components/_SessionInner.js`
`sed -n '1280,1330p' components/_SessionInner.js`
`sed -n '1320,1345p' components/_SessionInner.js`
SELECT al `information_schema.columns` para `sim_trades` (Supabase Studio, solo lectura).

### 2.1 Backend `pages/api/challenge/advance.js`

- **L100-L160**: validación + idempotencia + re-evaluación. Carga `sim_trades` (id, pnl, result, closed_at) en L116-L119 para alimentar `evaluateChallenge`. `evaluation.balanceNow` ya cuenta solo cerrados. **Correcto para B1, no se toca.**
- **L155-L184**: path FAIL. UPDATE con B4 aplicado. **Fuera de alcance B1.**
- **L185-L210**: path PASS / passed_all. UPDATE con B4 aplicado. **Fuera de alcance B1.**
- **L213-L282**: path PASS / passed_phase. **DENTRO de alcance B1.**
  - L213-L226: UPDATE de la madre con `status: 'passed_phase'`, `balance: evaluation.balanceNow`, `last_timestamp: end_timestamp`. Correcto. No se toca.
  - L233-L257: construcción del `nextPayload` con `capital: Number(session.capital)`, `balance: Number(session.capital)`, `last_timestamp: end_timestamp`. **Hija ya nace virgen en BD. No se toca.**
  - L259-L263: INSERT de la hija.
  - L262-L274: rollback best-effort si INSERT falla.
- **L286-L290**: helper `stripPhaseSuffix`. Trivial, no se toca.

### 2.2 Cliente `components/_SessionInner.js`

- **L143**: `pairState = useRef({})`. Vacío al montar. Se mantiene.
- **L535-L557**: loader de sesión (effect con deps `[id]`). En L545 hace `if(!pairState.current[p]) pairState.current[p]={...}`. **Reutiliza slot si existe.** Solo refresca `.trades` desde `sim_trades`. **Mecanismo del bug B1 lado cliente.**
- **L562-L589**: `refreshChallengeStatus` callback. No toca `pairState`.
- **L628-L633**: useEffect reset de `challengeModalShownRef` y `setChallengeModal`. No toca `pairState`.
- **L677-L703**: `callChallengeAdvance`. Body actual: `{session_id, outcome, end_timestamp}`. **Punto de inyección B1 lado cliente: añadir `open_positions` al body.**
- **L706-L716**: `handleChallengePass`. Llama y hace `router.push`.
- **L1280-L1326**: `closePosition`. Inserta 14 columnas en `sim_trades`. Sin columna `reason` en BD.
- **L1338-L1341**: useEffect reset de `challengeBreachFiringRef`. No toca `pairState`.
- **CONFIRMADO: ningún effect resetea `pairState` al cambiar `id`.** Cinco effects/callbacks con deps `[id]`, ninguno limpia posiciones vivas.

### 2.3 Schema `sim_trades` (21 columnas)

- 14 columnas que el cliente sí inserta: `user_id, session_id, pair, side, lots, entry_price, exit_price, sl_price, tp_price, rr, pnl, result, notes, opened_at, closed_at`.
- 7 columnas que el cliente nunca toca: `id` (PK auto), `created_at` (auto `now()`), `risk_percent` (numeric, nullable), `risk_amount` (numeric, nullable), `session_type` (text, nullable), `tags` (ARRAY, nullable).
- **NO existe columna `reason`.** El parámetro `reason='MANUAL'` de `closePosition` es solo memoria del cliente, nunca toca BD.
- B1 no inserta filas. Schema irrelevante para las ops, registrado por completitud.

### 2.4 Otros endpoints / archivos

- `pages/api/challenge/status.js:86`: SELECT trades cerrados. No toca posiciones vivas. **No requiere cambios.**
- `lib/challengeEngine.js`: pura, sin estado. No requiere cambios.
- `pages/dashboard.js:417, :484`: DELETE de `sim_trades` por `session_id` (flujo de borrar sesión). Irrelevante para B1.
- `pages/api/admin/*` y `pages/analytics.js`: read-only, dashboards externos. Irrelevante.

---

## 3. Operaciones (3 ops totales)

### Op 1 — Cliente: `callChallengeAdvance` envía posiciones vivas

**Archivo:** `components/_SessionInner.js`
**Líneas:** ~L683-L687 (dentro del body del fetch).

**Antes (post-B4):**
```js
body: JSON.stringify({
  session_id: id,
  outcome,
  end_timestamp: getMasterTime(),
}),
```

**Después (B1):**
```js
body: JSON.stringify({
  session_id: id,
  outcome,
  end_timestamp: getMasterTime(),
  // B1: posiciones vivas en el momento del cierre. Servidor las descarta
  // sin persistirlas ni contabilizarlas (doctrina "fase nueva = virgen").
  // Se envían solo para trazabilidad/logs servidor-side.
  open_positions: collectOpenPositions(),
}),
```

**Helper nuevo `collectOpenPositions`:** función dentro del componente (no export) que itera `pairState.current`, recoge todas las posiciones vivas de todos los pares y devuelve un array plano:

```js
const collectOpenPositions = () => {
  const out = []
  Object.entries(pairState.current).forEach(([pair, ps]) => {
    if (!ps?.positions?.length) return
    ps.positions.forEach(p => {
      out.push({
        position_id: p.id,
        pair,
        side: p.side,
        entry_price: p.entry,
        lots: p.lots,
        opened_at: p.openTime
          ? new Date(p.openTime * 1000).toISOString()
          : null,
      })
    })
  })
  return out
}
```

Ubicación: justo antes de `callChallengeAdvance` (declaración local, no useCallback porque solo se usa en una invocación al hacer click el alumno).

**Validación al carácter:** `git diff` mostrará +1 línea en el body, +12 líneas del helper.

### Op 2 — Cliente: reset de `pairState` al cambiar `id`

**Archivo:** `components/_SessionInner.js`
**Líneas:** insertar nuevo `useEffect` en la zona de resets de refs (cerca de L1338-L1341 donde está el reset de `challengeBreachFiringRef`).

**Código nuevo:**
```js
// B1: Reset de pairState al cambiar de sesión.
// useRef sobrevive al cambio de URL /session/[id] (Next.js reutiliza el componente),
// y el loader de L535-L557 reutiliza el slot del par si ya existe — heredando
// positions/orders/engine vivos de la sesión anterior. Esto era el mecanismo del
// bug B1 lado cliente: tras router.push a la fase hija, el chart de la hija
// mostraba el flotante de la madre. Reset explícito al cambiar id soluciona.
useEffect(() => {
  pairState.current = {}
}, [id])
```

**Validación al carácter:** `git diff` mostrará +9 líneas (incluyendo comentario).

**Riesgo evaluado:** ninguna sesión legítima depende de heredar `pairState` entre cambios de `id`. Cada sesión carga su propio engine y trades en el loader L535-L557. El reset al cambiar `id` es seguro. Verificación en prueba 7 (sesión practice independiente, abrir, navegar a otra y volver).

### Op 3 — Backend: aceptar `open_positions` en body, loggear, descartar

**Archivo:** `pages/api/challenge/advance.js`
**Líneas:** zona de parsing del body (alrededor de L70-L80 según patrón B4) y dentro del path `passed_phase` (entre L213 y L215).

**Op 3.1 — Aceptar y validar el campo:** en la zona donde B4 añadió validación de `end_timestamp`, añadir validación de `open_positions`:

```js
const open_positions = Array.isArray(req.body?.open_positions)
  ? req.body.open_positions
  : []
// B1: el cliente envía las posiciones vivas en el momento del cierre.
// Servidor las descarta sin persistirlas (doctrina "fase nueva = virgen").
// Se loguean para trazabilidad. No se valida estructura porque no se persiste.
```

**Op 3.2 — Log y descarte en path `passed_phase`:** justo antes del UPDATE de la madre (L213), añadir log si hay posiciones vivas:

```js
// B1: loggear flotantes descartados antes de cerrar la fase. No se persisten.
if (open_positions.length > 0) {
  console.log('[challenge/advance] descarte de flotantes en passed_phase', {
    session_id,
    user_id: user.id,
    discarded_positions: open_positions.length,
    positions: open_positions,
  })
}
```

**Validación al carácter:** `git diff` mostrará +5 líneas en parsing + +9 líneas en path passed_phase.

### Total código nuevo: ~36 líneas distribuidas en 2 archivos.

---

## 3.X — Decisión separada: saneamiento del histórico

**Fuera de alcance de B1.** Documentado aquí solo para no perder el hilo.

**Problema:** challenges pasados en producción que se cerraron antes de B1 pueden tener fases hijas que nacieron con flotante heredado. El bug visible (síntoma) ya está; el dato persistido en BD probablemente NO, porque el backend nunca insertó esos flotantes en `sim_trades` ni los contabilizó en `balance`. Lo que viajaba era el estado en memoria del cliente (`pairState`), que no toca BD. Por tanto, **el histórico de BD probablemente está limpio**. La pestañas reabierta de un alumno a una sesión hija pasada, hoy, no debería mostrar el flotante (el slot `pairState` se inicializa vacío al montar el componente desde cero). El bug solo aparecía en el flujo "pasar fase y continuar inmediatamente sin recargar".

**Verificación pendiente (post-deploy B1):** SELECT muestreado a `sim_sessions` con `challenge_phase >= 2`, ver `balance` inicial vs `capital`. Si todos cuadran, histórico limpio. Si alguno tiene `balance != capital` al estado `active`/`passed`, hay rastro de B1 antiguo en BD y se decide saneamiento.

**Por qué se separa:** disciplina "una cosa cada vez". B1 fix → deploy → verificación → decisión sobre histórico.

---

## 4. Validación al cierre

### 4.1 Build local

```
npm run build
```
Esperado: exit 0, sin warnings ESLint nuevos, sin errores TS.

### 4.2 Greps verificadores pre-commit

```
grep -n "open_positions" pages/api/challenge/advance.js
```
Esperado: 3-4 matches (parsing, validación, log).

```
grep -n "open_positions" components/_SessionInner.js
```
Esperado: 1-2 matches (helper + body).

```
grep -n "pairState.current = {}" components/_SessionInner.js
```
Esperado: 1 match (Op 2).

### 4.3 Pruebas manuales (8 pruebas, en local con BD producción)

Ramón crea las sesiones challenge necesarias en `localhost:3000`. Sesiones se borran en cleanup post-cierre.

| # | Prueba | Validación clave |
|---|---|---|
| 1 | Smoke baseline: practice normal, abrir trade, cerrar parcial 50%, dejar 50% flotante. | Cierre parcial registra fila en `sim_trades`, posición restante sigue viva. **B1 NO interfiere.** |
| 2 | Challenge 2F · $200K · EURUSD. Llegar a target con profit cerrado, modal salta. Pulsar "Continue to Phase 2". | Hija nace con balance $200K, cero posiciones, cero flotante. Chart de hija sin position lines. HUD sin flotante. |
| 3 | Igual que prueba 2 pero con cierre parcial 90% en 2:1 (escenario doctrina Ramón). 10% restante vivo cuando el modal salta tras profit cerrado superar target. | Hija nace virgen. El 10% no aparece en hija ni en `sim_trades`. Console log servidor muestra `discarded_positions: 1`. |
| 4 | Igual que prueba 2 pero con 2 posiciones vivas en 2 pares distintos al pulsar "Continue". | Hija nace virgen. Console log servidor muestra `discarded_positions: 2`. |
| 5 | Challenge 1F · $200K · EURUSD. Llegar a target, modal `passed_all` salta. Posición viva al pulsar OK. | Sesión queda `passed_all`. No hay hija. **No se ejecuta path B1.** Posición viva sigue en `pairState` (irrelevante porque no hay redirect). |
| 6 | Challenge 2F con DD diario al 5%. Quemar fase con SL → modal failed. Posiciones todas cerradas por `checkChallengeBreach` antes del modal. | Path FAIL. `open_positions` llega vacío al servidor. **No se ejecuta path B1.** |
| 7 | Sesión practice X → abrir trade vivo → navegar a sesión practice Y (otra URL `/session/<otro_id>`) → volver a X. | Al navegar fuera de X, `pairState` se resetea (Op 2). Al volver, loader carga trades cerrados de X desde `sim_trades` (correcto), pero la posición viva NO se recupera (estaba solo en memoria). **Coherente con cómo funciona hoy un reload del navegador.** |
| 8 | Control negativo: hacer `git stash` del fix, repetir prueba 3, confirmar que el 10% SÍ viaja a hija. Hacer `git stash pop` para restaurar. | Confirma que B1 era reproducible y el fix lo cierra. |

**Criterio de paso del conjunto:** las 8 pasan sin regresión visible. Console del servidor (logs Vercel local) muestra `discarded_positions` correctamente. Chart de hija siempre limpio en pruebas 2-4.

**Criterio de fallo:** cualquier prueba falla → PARAR, NO comitear, diagnosticar.

### 4.4 Si todo OK

`git diff` completo a Ramón → OK explícito → commit con mensaje:

```
fix(b1): descartar flotante vivo en transición de fase de challenge

Antes: al pasar de fase N a N+1 con outcome='pass', las posiciones vivas
del cliente sobrevivían al router.push porque pairState (useRef) no se
reseteaba al cambiar el id de la URL. Resultado visible: el alumno veía
el flotante de la fase anterior en la fase nueva, contradiciendo la
doctrina pedagógica R.A.M.M.FX ("fase nueva = virgen").

Después:
- Cliente envía open_positions[] en el body del POST a /api/challenge/advance.
- Servidor descarta esas posiciones (sin insertar en sim_trades, sin
  contabilizar en balance) y las loguea para trazabilidad.
- Cliente resetea pairState al cambiar id, vía useEffect dedicado.

Doctrina: el flotante vivo en transición se esfuma. No se registra. No
se contabiliza. La fase nueva nace virgen — balance nominal, cero
posiciones, cero flotante. Cursor temporal y dibujos se heredan
(continuidad con FTMO real, no es B1).

Cierres parciales legítimos en sesiones normales se conservan tal cual
(B1 no los toca; B1 solo entra en passed_phase del endpoint advance).

Decisión arquitectónica: NO insertar filas auto-close en sim_trades.
El servidor descarta silenciosamente, fiel a "se esfuma, no cuenta".
Sin marcador en BD, sin migración, sin nueva columna.

Saneamiento de histórico (probable que esté limpio porque el bug vivía
en memoria del cliente, no en BD) NO incluido en este commit. Decisión
separada — ver b1-plan.md §3.X.

Sin migraciones Supabase. Sin deps nuevas.
```

---

## 5. Criterio de "B1 cerrado"

B1 está cerrado cuando se cumplen TODAS estas condiciones:

1. ✅ Op 1, Op 2, Op 3 comiteadas en `fix/b1-advance-close-trades-on-pass`.
2. ✅ Cliente envía `open_positions[]` en body del POST a `/advance` (Op 1).
3. ✅ Cliente resetea `pairState` al cambiar `id` (Op 2).
4. ✅ Backend acepta `open_positions`, valida estructura mínima, loguea descarte en path `passed_phase` (Op 3).
5. ✅ `npm run build` pasa exit 0.
6. ✅ Greps de §4.2 OK.
7. ✅ Las 8 pruebas manuales de §4.3 pasadas por Ramón sin regresión.
8. ✅ Bugs B2, B3, B5, B6 (HANDOFF-verificacion-A1.md §7) y los 6 bugs del CLAUDE.md §9 siguen exactamente como estaban (B1 NO los pretende arreglar).
9. ✅ B4 sigue funcionando: `last_timestamp` persiste correctamente en transiciones (no debería verse afectado, pero se valida en pruebas 2 y 3).
10. ✅ Tras merge a `main` y push, Vercel deploy verde.
11. ✅ Smoke check producción: crear sesión challenge fresca real (cuenta Ramón), llegar a target con cierre parcial 90% dejando 10% flotante, pulsar Continue, verificar en hija que NO aparece la posición.

**B1 NO incluye:**
- Saneamiento de histórico (§3.X, decisión separada).
- Cambio en lógica de cierre parcial en sesiones normales.
- Cambio en path FAIL ni `passed_all`.
- Inserción de filas auto-close en `sim_trades`.

---

## 6. Lista de NO HACER en B1

> Tentaciones que rompen alcance. Si me veo haciéndolas, paro y aviso.

1. **NO** insertar filas auto-close en `sim_trades` por los flotantes descartados. Doctrina Ramón: "se esfuma, no cuenta". Si lo hiciera, contradice doctrina y suma deuda en BD.
2. **NO** marcar nada en BD con `session_type`, `notes` ni columna nueva. Sin migración. Sin nueva semántica.
3. **NO** tocar la lógica de cierre parcial en `closePosition` (L1280-L1326). Cierres parciales son legítimos y B1 no los altera.
4. **NO** modificar `evaluateChallenge` ni el cálculo de `evaluation.balanceNow`. Ya cuenta solo con cerrados, ya está bien.
5. **NO** tocar el `nextPayload` (L233-L257). La hija ya nace virgen en BD desde antes de B1.
6. **NO** tocar el path FAIL ni `passed_all`. Fuera de alcance.
7. **NO** corregir retroactivamente sesiones ya cerradas. Decisión separada §3.X.
8. **NO** hacer migraciones Supabase. Regla absoluta CLAUDE.md §3.1.
9. **NO** instalar dependencias npm nuevas. Regla absoluta CLAUDE.md §3.4.
10. **NO** tocar otros endpoints (`pages/api/sessions/*`, `pages/api/candles/*`, `/status.js`).
11. **NO** push a GitHub sin OK explícito. Regla absoluta.
12. **NO** mergear nada a `main` durante B1. Solo commits en rama feature.
13. **NO** tocar otros repos (`algorithmic-suite-hub`, `journal-algorithmic-suite`).
14. **NO** introducir TypeScript ni cambiar de pages router a app router.
15. **NO** añadir tests automáticos. Decisión Ramón en CLAUDE.md §5.4.
16. **NO** documentar/comentar código que ya funciona "porque ya estoy aquí". Solo cambios funcionales necesarios + comentario explicativo en cada op B1.
17. **NO** atacar bugs B2/B3/B5/B6 ni los 6 del CLAUDE.md §9 aunque B1 toque la zona. Sesión separada cada uno.
18. **NO** "aprovechar" para portar `calcPnl`/`pipMult` al backend. No se necesita en B1 (no hay recálculo de PnL). Decisión arquitectónica futura si algún B siguiente lo justifica.

---

## 7. Resumen ejecutivo (lenguaje llano para Ramón — 30 segundos)

**Qué hace B1 en una frase:** cuando pasas de fase de un challenge, el flotante que tenías abierto se esfuma silenciosamente y la fase nueva nace virgen, exactamente como FTMO real.

**Cómo lo hace:**

1. **El cliente, al pulsar "Continue to Phase X+1", manda al servidor las posiciones vivas que tenías abiertas.** Solo las manda. No las cierra antes. No las contabiliza.
2. **El servidor las recibe, las loguea (para que en el futuro podamos auditar qué se descartó), y no las inserta en BD.** No quedan en `sim_trades`, no quedan en métricas, no afectan al balance final de la fase pasada.
3. **El cliente, al cambiar de URL a la fase nueva, resetea su memoria local de posiciones vivas.** Sin esto, aunque el servidor haga todo bien, el chart de la fase nueva mostraría el flotante de la anterior. Esto es el bug que el alumno reportó.

**Lo que NO cambia:**

- Cierres parciales en sesiones normales: igual que hoy, se registran como filas WIN/LOSS, la posición restante sigue viva.
- Las métricas de la fase que pasó (la fila del cierre que disparó el modal): tal cual están, no se tocan.
- El cursor temporal y los dibujos: se heredan a la fase nueva igual que hoy (eso ya lo dejó B4).
- El balance inicial de la fase nueva: $200K nominal (o lo que sea según el challenge). Ya estaba bien antes de B1.
- El path FAIL del endpoint y el path passed_all (challenge completo): no se tocan.

**Tamaño del cambio:**

- 2 archivos modificados: `advance.js` (~14 líneas nuevas) + `_SessionInner.js` (~22 líneas nuevas, repartidas en helper + body + useEffect).
- 0 archivos nuevos. 0 deps nuevas. 0 migraciones BD.

**Validación:**

- 8 pruebas manuales en local. La más importante: tu escenario doctrina (cierre parcial 90% en 2:1, modal salta, Continue, verificar que el 10% no aparece en la hija).
- Smoke check producción: crear challenge fresco real, replicar tu escenario, ver hija limpia.

**Criterio de éxito:** la fase nueva del challenge nace virgen como FTMO real. Sin flotantes heredados. Cierres parciales en sesiones normales siguen funcionando igual. Tu doctrina pedagógica respetada al carácter.

**Pendiente OK Ramón** del §0 (decisión arquitectónica) + aprobación general del plan antes de pasar a Claude Code para PASO 1 (crear rama y arrancar Op 1).

---

## 8. Lecciones operativas (heredadas de B4 y fases 1-2)

Aplican igual a B1 sin cambios:

- **§8.1**: NUNCA `npm run build` con `npm run dev` corriendo sobre el mismo `.next/`.
- **§8.2**: Inventario de variables huérfanas ANTES de mover bloques. Aplicabilidad reducida en B1 (solo se añaden líneas, no se mueven bloques).
- **§8.3**: macOS no tiene `timeout`. `gtimeout` o workaround bash.
- **§8.4**: Comandos git como operaciones SEPARADAS, no encadenadas con `&&`. `git add` aparte, `git commit` aparte, `git log` aparte.
- **§8.5**: Inventarios siempre con `grep -rn` recursivo. Materializado en §2.0 PASO 0 ya hecho.

Adicionales de B4:

- **Norma de discriminación**: cuando algo no cuadra durante una prueba, parar a verificar antes de declarar regresión o pre-existente. En B1: si una prueba falla, hacer `git stash` para verificar que el fallo no estaba pre-fix.
- **Distinguir verificado de inferido**: confirmar al carácter, no por descripción. Lección §8.3 HANDOFF-cierre-fase-2.md.

---

## 9. Stack y entorno

Sin cambios respecto a HANDOFF.md v3 §11:

- Next.js 14.2.35 (pages router).
- React 18.
- Supabase (auth + Postgres). Tablas relevantes: `sim_sessions`, `sim_trades`. Sin cambio de schema.
- Vercel deploy.
- Mac iMac, macOS, terminal zsh.
- Email cuenta Claude: `rammglobalinvestment@gmail.com`.

### Sesiones de prueba previstas

Ramón crea en `localhost:3000`:
- 1 sesión practice EURUSD (prueba 1, 7).
- 1 sesión challenge 2F · $200K · EURUSD (pruebas 2, 3, 8).
- 1 sesión challenge 2F · $200K · EURUSD multi-par (prueba 4).
- 1 sesión challenge 1F · $200K · EURUSD (prueba 5).
- 1 sesión challenge 2F · DD diario 5% · EURUSD (prueba 6).

Total: 5 sesiones nuevas en BD producción durante testing en local. Borradas en cleanup post-cierre B1, igual que se hizo con las 3 de B4.

---

## 10. Documentos relacionados

| Archivo | Estado | Relación con B1 |
|---|---|---|
| `HANDOFF-cierre-b4.md` | comiteado en `db94e78` | Estado del repo al arrancar B1, contexto inmediato |
| `HANDOFF-cierre-fase-2.md` | comiteado en `51e07c2` | Disciplina §8 heredada |
| `HANDOFF-verificacion-A1.md` | comiteado en `51e07c2` | Diagnóstico inicial B1 §7 |
| `HANDOFF.md` v3 | comiteado | Reglas absolutas §7 |
| `refactor/b4-plan.md` | comiteado | Plantilla estructural de este plan |
| `refactor/fase-2-plan.md` | comiteado | Plantilla estructural alternativa |
| `refactor/core-analysis.md` | comiteado | §6 vigente: B1 fuera de capas refactor |
| `CLAUDE.md` | comiteado | Reglas absolutas §3 |
| `pages/api/challenge/advance.js` | comiteado | Archivo principal del fix backend |
| `components/_SessionInner.js` | comiteado | Archivo del fix cliente |

---

## 11. Reglas absolutas (sin cambios respecto a HANDOFF.md v3 §7)

1. **NO push** sin OK explícito de Ramón. Vercel auto-deploya en push a `main`.
2. **NO migraciones Supabase**.
3. **NO tocar otros repos**.
4. **NO dependencias npm nuevas**.
5. **Aprobación opción 1 manual SIEMPRE** en Claude Code. NUNCA opción 2 "allow all".
6. **Comandos git separados, no encadenados con `&&`.** Excepción: leer-y-volcar (`git diff > /tmp/file.txt && cat /tmp/file.txt`).
7. **Antes de tareas grandes (>100 líneas o >2 archivos):** plan primero, espera OK. (B1 es ~36 líneas; aun así, este plan se aprueba antes de tocar código.)
8. **Producción** intacta hasta merge a `main` con B1 validado en local.

---

## 12. Cómo arrancar B1 (paso a paso para el chat que ejecute)

> Este plan se aprueba en chat web. La ejecución la hace Claude Code en terminal de Ramón con aprobación opción 1 manual de cada operación.

### 12.1 Pre-arranque (en chat web)

1. Ramón aprueba este plan, o pide modificaciones. Si pide, se actualiza y re-aprueba.
2. Ramón confirma decisión §0 (descarte sin persistir, ya recomendada).
3. Ramón confirma smoke check producción `simulator.algorithmicsuite.com` verde en `db94e78`.

### 12.2 Arranque (en Claude Code)

1. `git status` → debe estar limpio en `main` HEAD `db94e78`.
2. `git checkout -b fix/b1-advance-close-trades-on-pass` → rama nueva creada.
3. PASO 0 ya hecho en chat web (§2). No requiere repetición — pero ejecutar greps verificadores de §4.2 PRE-Op para confirmar que el inventario sigue cuadrando con el repo a tiempo de empezar.

### 12.3 Ejecución (en Claude Code, una operación a la vez)

4. Op 1 — cliente, helper `collectOpenPositions` + body de `callChallengeAdvance`. Edit con `str_replace`. Aprobación manual.
5. Op 2 — cliente, useEffect reset `pairState`. Aprobación manual.
6. Op 3.1 — backend, parsing de `open_positions` en body. Aprobación manual.
7. Op 3.2 — backend, log + descarte en path `passed_phase`. Aprobación manual.

### 12.4 Validación pre-commit (en Claude Code + navegador)

8. Verificaciones automáticas de §4.1 y §4.2 (npm run build + greps). Pegar outputs literal.
9. Pruebas manuales 1-8 de §4.3 en local. Ramón ejecuta, Claude observa logs.
10. Si todo OK → `git diff` completo a Ramón.
11. Ramón da OK explícito.

### 12.5 Commit (en Claude Code)

12. `git add pages/api/challenge/advance.js components/_SessionInner.js`. Aprobación.
13. `git commit` con heredoc del mensaje de §4.4. Aprobación.
14. `git log --oneline -5` para verificar.

### 12.6 Merge + push + deploy (decidir en chat web)

15. Decidir con Ramón si se mergea + pushea hoy o se duerme una noche (lección recurrente: push importante en frío).
16. Si push aprobado: `git checkout main`, `git merge fix/b1-advance-close-trades-on-pass`, `git push origin main`. Cada uno con su aprobación.
17. Watch Vercel deploy. Si rojo, `git revert` + push. Si verde, smoke check producción de §5 punto 11.

### 12.7 Cierre (en chat web)

18. Redactar `HANDOFF-cierre-b1.md` con resultados, sesiones de prueba creadas, decisiones tomadas, próximo paso (probable: B2/B3/B5/B6, fase 3 viewport, o saneamiento histórico §3.X).
19. Comitear el HANDOFF en una sesión posterior (no en el commit del fix, mantener atomicidad).

---

**Fin del plan táctico B1.**

Pendiente OK Ramón en §0 (decisión arquitectónica) + aprobación general de este plan antes de pasar a Claude Code para arrancar Op 1.
