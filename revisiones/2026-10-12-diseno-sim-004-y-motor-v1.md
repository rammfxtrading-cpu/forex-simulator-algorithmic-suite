# Simulador · diseño de sim-004 (el corte) y del motor v1 en servidor

**Fecha:** 12-oct-2026 · **Rama:** `auditoria-simulador` · **Solo diseño:** ni código, ni SQL ejecutable, ni base. Nada de esto se aplica sin orden expresa (y lo que cambia el esquema, con el sí de Ramón: CLAUDE.md § 3).

**Base:**
- `revisiones/2026-10-07-diseno-persistencia.md`, en adelante «diseño-persistencia»: § 3, § 4, § 6, § 7, § 8 y los motivos de § 10.1;
- la especificación v2.1–v2.4, en adelante «spec»: § 6, § 7.3, § 12.6, § 12.7 y § 13;
- las decisiones del 10-oct (abajo);
- lo que hay hoy en producción. Consta literal desde el 12-oct (`sql/APLICADOS.md`):
  - s04 del 10-oct;
  - s06 y s07 del 12-oct;
  - sim-003 aplicada el 12-oct, con las RPC inactivas.

**Decisiones del 10-oct (Ramón y CTO), resumidas.** Constan en la memoria del proyecto; donde estaban escritas en el repo, se cita el sitio.
- `sim_alumnos` es la barrera por alumno. Guarda `siguiente_avance_desde`, el perfil solo se bloquea `FOR KEY SHARE` y `profiles` no se escribe.
- El cupo vive en `sim_crear_sesion` y no cuenta el legado. Usa las cifras del disparador real (6, o 12 con plan `extra`). **El disparador se ajusta en sim-004.**
- sim-003 es la parte aditiva y **sim-004 es el corte**.
- Los importes van en `*_micro`.
- **El motor va fuera de SQL:** `sim_comando` solo hace CAS, digest y clase.
- El borrado legacy va por `sim_borrar_legacy(user_id, session_id)`, solo para `service_role`, con lápida (CD07).
- La FK sesión → perfil: «sí ambas» (diseño-persistencia § 10).

Las líneas citadas son del árbol de `auditoria-simulador` (HEAD `d2463de`). **Esta rama no lleva los 39 commits de `main`** (mercado diario, `.json.gz`, workflow), y `main` no lleva los 65 de esta rama: ver § f, etapa 0.

---

## a) Lo que el cliente escribe hoy en la base con `authenticated`

Búsqueda literal en `pages/`, `components/` y `lib/`, sin `lib/motor/`, `vendor/` ni `pruebas/`: toda llamada `.from(...)` seguida de `insert`, `update`, `upsert` o `delete`, también partida en varias líneas, y toda `.rpc(`. El cliente del navegador es `lib/supabase.js`, con la clave anónima y la sesión del alumno, es decir `authenticated`.

### a.1 Escrituras del navegador

| # | Tabla | Operación | Columnas | Fichero:línea | Flujo |
|---|---|---|---|---|---|
| 1 | `sim_sessions` | INSERT | `user_id, name, pair, timeframe, date_from, date_to, capital, balance, status` | `pages/dashboard.js:183` | crear sesión (práctica) |
| 2 | `sim_sessions` | DELETE (`count: 'exact'`) | fila entera, y cascada a trades/dibujos/config | `pages/dashboard.js:135` | borrar sesión |
| 3 | `sim_sessions` | UPDATE | `balance, last_timestamp` | `components/useTradingActions.js:67` | cierre total de una posición |
| 4 | `sim_trades` | INSERT | trade completo (`pnl`, precios, lotes, `opened_at`, `closed_at`, `notes`…) | `components/useTradingActions.js:49` | cierre total |
| 5 | `sim_sessions` | UPDATE | `balance` | `components/_SessionInner.js:1949` | cierre parcial (modal) |
| 6 | `sim_trades` | INSERT | trade del parcial | `components/_SessionInner.js:1950` | cierre parcial |
| 7 | `sim_sessions` | UPDATE | `balance, last_timestamp` | `components/_SessionInner.js:1104` | pausa del replay |
| 8 | `sim_sessions` | UPDATE | `last_timestamp, balance, timeframe` | `components/_SessionInner.js:1363` | salir de la sesión (desmontaje) |
| 9 | `sim_sessions` | UPDATE | `last_timestamp, timeframe` | `components/usePairData.js:25` | guardado periódico del progreso |
| 10 | `sim_sessions` | UPDATE | `timeframe` | `components/_SessionInner.js:684`, `:1751` | cambio de TF (teclado y botón) |
| 11 | `session_drawings` | UPDATE, e INSERT si no había fila | `user_id, pair, data, updated_at` | `components/_SessionInner.js:407`, `:416` | guardar dibujos |
| 12 | `sim_drawing_templates` | INSERT | `user_id, name, data` | `components/_SessionInner.js:1527` | guardar plantilla de dibujo |
| 13 | `sim_drawing_templates` | INSERT y DELETE | `user_id, name, tool_key, config, data` | `components/_SessionInner.js:1645`, `:1649` | plantilla de herramienta |
| 14 | `session_chart_config` | UPSERT (`onConflict: session_id`) | `session_id, user_id, config, updated_at` | `components/ChartConfigPanel.js:53` | configuración del gráfico |
| 15 | `user_chart_config` | UPSERT (`onConflict: user_id`) | `user_id, config, updated_at` | `components/ChartConfigPanel.js:57` | configuración global |
| 16 | `user_tool_config` | UPSERT (`onConflict: user_id`) | `user_id, config, updated_at` | `components/useDrawingTools.js:252` | configuración de herramientas |

- **No hay ninguna `.rpc(` de escritura en el navegador.** La única `.rpc(` es la lectura `lib/tradesEstables.js:10` (sim-002).
- **`profiles` no se escribe** desde el navegador.
- **Ningún código lee hoy `motor_version`, `legado`, `terminal` ni `epoca`:** la búsqueda en `pages/`, `components/` y `lib/` da cero.

### a.2 Qué lo permite: RLS y grants (s04 literal, 10-oct)

| Tabla | Política (nombre literal) | Grants de `authenticated` |
|---|---|---|
| `sim_sessions` | `Users see own sessions`: ALL · PERMISSIVE · `public` · `USING (auth.uid() = user_id)` · sin WITH CHECK | SELECT, INSERT, UPDATE, DELETE |
| `sim_trades` | `Users see own trades`: ídem | ídem |
| `session_drawings` | `user owns session drawings`: ídem | ídem |
| `session_chart_config` | `user owns session config`: ídem | ídem |
| `sim_drawing_templates` | `Users manage own templates`: ídem | ídem |
| `user_chart_config` | `user owns config`: ídem | ídem |
| `user_tool_config` | `user owns tool config`: ídem | ídem |

- Sin WITH CHECK, la `USING` de una política ALL vale también como comprobación de INSERT y UPDATE: el alumno solo escribe filas con su `user_id`.
- Nada comprueba **qué** columnas escribe ni con **qué** valores. Es el defecto de raíz: `balance`, `last_timestamp`, `pnl`… los fija el navegador.
- `anon` no tiene ningún grant en las 7 tablas.
- **Desde sim-003 (12-oct) la ventana es más ancha.** Las columnas nuevas de `sim_sessions` y `sim_trades` (`estado`, `version`, `escritor`, `terminal`, `legado`…) caen bajo el mismo UPDATE de tabla de `authenticated`. Era sabido (medido en el ensayo de sim-003) y queda abierto hasta sim-004.

### a.3 Escrituras de servidor que también tocan la economía (`service_role`)

No son del navegador, pero el corte tiene que tratarlas (diseño-persistencia § 7.0):

| Fichero:línea | Qué escribe |
|---|---|
| `pages/api/challenge/create.js:103` | INSERT `sim_sessions` (reto) |
| `pages/api/challenge/advance.js:167`, `:197`, `:234`, `:274`, `:283` | UPDATE de `balance`, estado de fase y `status`; INSERT de la hija |
| `pages/api/admin/wipe-simulador.js:94` | DELETE de las 7 tablas por `user_id` |
| hub, `algorithmic-suite-hub/pages/api/users/delete.js:104` | DELETE de `sim_sessions` y otras 4 tablas por `user_id` (no es de este repo; no se toca) |

**Medido (s04):** `service_role` tiene todos los privilegios en las 7 tablas. Por eso **revocar a `authenticated` no impide** que estos endpoints sigan escribiendo economía: hay que retirarlos en el código o revocar también a `service_role`. Es la pregunta 3.

---

## b) Flujos que pasan por el servidor y endpoints

### b.1 Reglas comunes de todos los endpoints

Siguen diseño-persistencia § 3–§ 4.

- **Autenticación.** `requireSimulador` (`lib/authApi.js:131`) da el actor. **El actor nunca sale del cuerpo.**
- **El cuerpo es solo intención.** Se valida cerrado (claves conocidas, tipos y rangos); lo que sobra es `422 carga_invalida`. Nunca se aceptan estado, saldo, eventos, versión resultante ni dueño.
- **Acceso y plan.**
  - El endpoint los lee para fallar pronto, y la RPC los **relee tras los bloqueos** (S003-04). **La decisión es la de la RPC.**
  - **Discrepancia hoy:** `requireSimulador` deja pasar a un admin sin `simulador_activo`, y las RPC le responden `403 sin_acceso`. Es la pregunta 4.
- **`command_id` lo genera el cliente** (UUID). El servidor calcula el digest del sobre canónico.
- **Respuesta: el jsonb de la RPC, tal cual,** con su `http` como código HTTP (`{ ok, http, motivo, recibo, version, … }`, § 10.1). El endpoint no reinterpreta motivos.
- **40P01 (interbloqueo):** como mucho 3 reintentos con el **mismo** `command_id` y espera corta aleatoria (diseño-persistencia § 6.1).
- **Error de SQL que no es del protocolo:** 500 con mensaje genérico. El detalle va a `registra` (`lib/mercado/errores.mjs`), sin `e.message` al cliente (H4).
- **Época:** el cliente manda la suya. La vigente es 1, y la RPC responde `426 actualizar_cliente` si no coincide.
- **Modo mantenimiento** (rollback, spec § 12.6): una variable de entorno hace que todos devuelvan `503 mantenimiento` sin llamar a la RPC.

### b.2 Un endpoint por RPC

| Flujo | Endpoint | RPC | Qué valida además | Qué calcula fuera de bloqueo | Respuesta |
|---|---|---|---|---|---|
| Crear sesión (práctica o reto) | `POST /api/sim/crear` | `sim_crear_sesion(actor, session_id, command_id, sobre, epoca, sesion, estado, mercado, resumen)` | `session_id` UUID del cliente; `name` 1–100; `pair` de los 9; `timeframe` válido; fechas: las reglas de hoy (`pages/dashboard.js:165–181`: ≥ 1-jul-2024, ≤ ayer, ≥ 180 días), ahora en el servidor; `capital` en su rejilla; `challenge_type` nulo o de `lib/challengeRules` | estado inicial (`cartera.crea` o `creaReto`) y **mercado fijado** de todos los pares (manifiestos vigentes, § e) | 201 con recibo, 200 `repetido`, o el rechazo (403, 409 `limite_sesiones`, 410…) |
| Tomar el escritor («Usar aquí») | `POST /api/sim/tomar` | `sim_tomar_escritor(actor, session_id, command_id, sobre, epoca, cliente_id, forzar)` | `cliente_id` 1–100 (el de la pestaña); `forzar` booleano | nada | 200 con `testigo` (solo esta vez: la base guarda el hash) y `hasta`; 409 `escritor_ocupado` / `otra_sesion_activa` |
| Abrir, modificar, cancelar, cerrar, avanzar, checkpoint | `POST /api/sim/comando` | `sim_comando(actor, session_id, command_id, tipo, sobre, epoca, version_esperada, cliente_id, testigo, resultado)` | `tipo` de los 6; payload por tipo: lado, lotes en centésimas, precios en ticks, SL/TP, `cotizadoEn`, `hasta` (≤ 7 días de mercado, spec § 1.7); `version_esperada` | lee la sesión (versión N y estado), carga las velas del tramo desde el mercado **fijado**, aplica el motor (`cartera`/`reto`) y construye `resultado` = `{ clase, estado, eventos, trades, resumen }` | 200 con recibo, versión y eventos; 409 `conflicto` (con la vigente) / `comando_caducado` / `sin_arrendamiento`; 429 `demasiados_avances`; 410 |
| Pasar de fase (reto) | `POST /api/sim/avanzar-fase` | `sim_avanzar_fase(actor, padre_id, hija_id, command_id, sobre, epoca, version_esperada, sesion, estado, mercado, resumen)` | `hija_id` UUID del cliente | estado inicial de la fase 2 (`creaReto` con `fase: 2`) y su mercado | 201 con recibo en la hija; 409 `fase_no_superada` / `transicion_hecha` / `conflicto` |
| Borrar sesión v1 | `POST /api/sim/borrar` | `sim_borrar_sesion(actor, session_id)` | `session_id` | nada | 200 `borrada` (lápida, con sus fases); 410 si ya lo estaba |
| Borrar sesión legado | `POST /api/sim/borrar` (la misma; elige por `motor_version`) | `sim_borrar_legacy(actor, session_id)` | ídem | nada | ídem; 409 `no_es_legado` si es v1 |
| Wipe del admin | `pages/api/admin/wipe-simulador.js` (existe) | `sim_borrar_alumno(user_id)` | `requireAdmin` | nada | sustituye el bucle de DELETE por tabla (pregunta 3) |

- **Lecturas: sin endpoint nuevo.** El alumno lee lo suyo por RLS:
  - `sim_sessions`, `sim_trades`, `sim_recibos` y `sim_eventos` (estas dos con SELECT de `authenticated`, s07);
  - sim-002 para los trades.
- **Los recibos de la cola tras reconectar** (diseño-persistencia § 6) se leen por `sim_recibos` con `session_id` y `command_id`.
- **`challenge/status`** pasa a leer el reto de `sim_sessions.estado` en v1; en legado, solo lo guardado.
- **`challenge/create` y `challenge/advance`** se retiran a favor de `crear` y `avanzar-fase`. No se deja ningún camino que inserte o actualice fuera del protocolo (diseño-persistencia § 7.0).

### b.3 Lo que se queda en el cliente, y por qué

| Se queda | Por qué |
|---|---|
| `session_drawings`, `sim_drawing_templates` (# 11–13) | no son economía: no cambian saldo, trades ni reto; ya tienen su RLS por dueño; pasarlas por RPC no protege nada que importe y añade latencia a cada trazo |
| `session_chart_config`, `user_chart_config`, `user_tool_config` (# 14–16) | ídem: preferencias de visualización |
| `sim_sessions.timeframe` (# 10) y `name` | presentación; con **grant de columna** y política UPDATE que exige acceso vigente (diseño-persistencia § 8). `timeframe` sigue escribiéndose como hoy; la parte de # 8 y # 9 que escribe `timeframe` puede quedarse, y lo demás no |
| Cálculo para **pintar** (proyección local del estado confirmado) | D-11: el motor empaquetado para el navegador es posterior; mientras, el cliente pinta lo que confirma el servidor |

**Lo que deja de escribir el cliente:** todo lo económico de a.1, es decir las # 1–9 salvo `timeframe`.
- **Crear** pasa a `/api/sim/crear`; **borrar**, a `/api/sim/borrar`.
- **Cierres y parciales** pasan a `comando cerrar`.
- **Pausa y salida** pasan a `comando checkpoint`, sujeto al límite de 5 s por alumno: el cliente agrupa (spec § 12.7).
- **El progreso periódico** pasa a `avanzar`.

---

## c) sim-004: el SQL del corte

**Un fichero, un DO, con informe aparte.** Es el patrón de sim-003, que funcionó en el editor el 12-oct: guardas de entrada, cambios, guardas de salida y una SELECT de informe; la segunda ejecución solo comprueba. Todo lo que sigue va **en una transacción**.

### c.1 Guardas de entrada (aborta sin tocar nada)

- **sim-003 instalada tal cual:** las mismas comprobaciones de definición de su sección 8 (27 restricciones, 10 índices, 2 políticas, 9 funciones con su ACL).
- **No hay ninguna sesión v1** (`motor_version = 1`) **ni ninguna lápida.** Las RPC están inactivas: si aparece alguna, alguien las activó antes del corte, así que se para.
- **Los objetos que se van a cambiar tienen la definición literal de s04/s06:**
  - las dos políticas;
  - los grants de `authenticated`;
  - el disparador `trg_enforce_sim_session_limit` y el cuerpo de `enforce_sim_session_limit`;
  - `sim_sessions_challenge_parent_id_fkey … ON DELETE SET NULL`.

  Si alguna ha cambiado, se para y se contrasta.

### c.2 Marcar legado

Bajo `LOCK TABLE public.sim_sessions, public.sim_trades IN SHARE ROW EXCLUSIVE MODE`, que deja leer y corta escrituras concurrentes durante el corte:

- **En todas las sesiones con `motor_version = 0`:** `legado = true` y `epoca = 1`.
- **`legado_snapshot`, una sola vez:**
  - `saldo`: `balance` tal cual, como texto exacto del numeric (0 sigue siendo 0);
  - `last_timestamp` tal cual (null sigue siendo null);
  - `n_trades`: el recuento de `sim_trades` de la sesión en ese instante;
  - `suma_pnl`: Σ `pnl`;
  - `coherente`: `balance = capital + Σ pnl`. Si no cuadra, pasa a legado igual y queda anotado (G02);
  - `origen`: `'sim-004'`.
- **Sus trades no se tocan:** ni se recalculan ni se marcan. Siguen con `motor_version = 0` y `evento_id` nulo, y cumplen `sim_trades_v1_coherente`. El alumno los sigue leyendo por RLS. La separación legado/v1 en métricas va por `sim_sessions.legado` y `sim_trades.motor_version` (spec § 6, punto 6; `lib/metricas.js`: cliente, § d).

### c.3 Quitar la escritura económica a `authenticated` (nombres literales de s04)

```
REVOKE INSERT, UPDATE, DELETE ON public.sim_sessions, public.sim_trades FROM authenticated;
GRANT  UPDATE (name, timeframe) ON public.sim_sessions TO authenticated;
DROP POLICY "Users see own sessions" ON public.sim_sessions;
DROP POLICY "Users see own trades"   ON public.sim_trades;
CREATE POLICY sim_sessions_select_propias ON public.sim_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY sim_sessions_update_presentacion ON public.sim_sessions FOR UPDATE TO authenticated
  USING      (auth.uid() = user_id AND <perfil con simulador_activo IS TRUE> AND terminal IS NULL)
  WITH CHECK (auth.uid() = user_id AND <ídem>);
CREATE POLICY sim_trades_select_propios ON public.sim_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
```

Es **ilustrativo**: el texto definitivo se escribe y ensaya en `sql/sim-004`.

- **«Perfil con acceso»** necesita leer `profiles` desde la política. `authenticated` solo ve su perfil (`profiles_select`), así que basta un `EXISTS` sobre el propio perfil. Se mide en el ensayo, no se supone.
- **`service_role`:** pregunta 3. Mi propuesta es revocarle también INSERT y UPDATE en `sim_sessions` y `sim_trades`, y conservar DELETE y SELECT:
  - las RPC son `SECURITY DEFINER` de `postgres` y no necesitan esos grants;
  - el hub y el wipe solo borran.

  Así **ningún** código de servidor puede saltarse el protocolo, ni siquiera por error.
- **Guarda de salida:**
  - `has_table_privilege` de `authenticated`: false para INSERT, DELETE y UPDATE de tabla;
  - `has_column_privilege`: UPDATE solo en `name` y `timeframe`;
  - políticas exactas, con el mismo mecanismo de definición literal que S003-05;
  - una s08 de solo lectura para Ramón después, como s07.

### c.4 El disparador del cupo

**Hoy** (literal de s04) cuenta todas las raíces del alumno (`challenge_parent_id IS NULL`), legado y lápidas incluidas: 6, o 12 con `plan = 'extra'`.

- **sim-004:** `CREATE OR REPLACE FUNCTION public.enforce_sim_session_limit()` con **la misma cuenta que `sim_crear_sesion`** (`sql/sim-003-persistencia-aditiva.sql:389`):
  - raíces;
  - `NOT legado`;
  - `terminal IS DISTINCT FROM 'borrada'`;
  - con el plan de `profiles.plan`: `extra` da 12 y otro cualquiera da 6.

  Se conserva el mismo mensaje y el mismo `P0001`.
- **Las hijas siguen sin contar**, como hoy.
- **Con D-15 pendiente** (si el legado cuenta en el cupo), la cuenta se ajusta a lo que decida Ramón. **Las dos cuentas, la de la RPC y la del disparador, tienen que ser idénticas:** hay una prueba que las compara.
- **Alternativa: quitar el disparador** (pregunta 6). Tras c.3 solo la RPC inserta, y lo hace bajo la barrera del alumno; el disparador no está bajo esa barrera, así que su cuenta es carrera de todos modos.

### c.5 `challenge_parent_id` en cascada (D-17)

```
ALTER TABLE public.sim_sessions DROP CONSTRAINT sim_sessions_challenge_parent_id_fkey,
  ADD CONSTRAINT sim_sessions_challenge_parent_id_fkey FOREIGN KEY (challenge_parent_id)
      REFERENCES public.sim_sessions(id) ON DELETE CASCADE;
```

- **Se crea validada.** Los datos actuales ya la cumplen: s04 dice que hoy es SET NULL, así que no hay padres colgando.
- **La lápida no depende de esta FK** (S003-01 ya arrastra las fases por UPDATE). Sirve para los DELETE físicos: el hub, `sim_borrar_alumno` y el wipe.

### c.6 Guardas finales e informe

- **Recuentos:**
  - `legado` = sesiones v0 existentes;
  - ninguna v0 sin `legado`;
  - `legado_snapshot` no nulo en todas las legado;
  - `n_trades` del snapshot = recuento actual.
- **Definiciones:** la política, los grants, el disparador y la FK, exactos.
- **El informe** lista también las sesiones `coherente = false` por id y dueño, sin datos económicos. Ramón decide (G02).
- **Segunda ejecución:** detecta que el corte está hecho, no toca nada y repite el informe. Si está a medias, se para.

### c.7 Ventana de corte: el orden respecto al cliente

**El problema.** Mientras un alumno tenga abierta una pestaña con el cliente de hoy, ese cliente escribe `balance`, `last_timestamp` y `sim_trades`. Si el corte llega a mitad de una operación:
- el UPDATE de saldo y el INSERT del trade pueden quedar separados (el de hoy ya lo hace sin transacción);
- o un trade en vuelo puede caer **después** de la foto `legado_snapshot`.

**Propuesta (pregunta 5): una ventana de mantenimiento corta y anunciada** (D-13, con fecha y hora; son 5 alumnos).

1. **Antes, sin prisa:** desplegar el cliente con época (§ d). Lee `legado`, `terminal` y `epoca`, y entiende 403/409/410/426 y `503 mantenimiento`. **Para las sesiones v0 sigue escribiendo como hoy**, así que es compatible antes y después del corte. Los endpoints `/api/sim/*` se despliegan apagados, con `503 mantenimiento` por variable de entorno.
2. **Hora H:** se activa el modo mantenimiento del simulador, en el cliente y por variable de entorno. Las pestañas abiertas dejan de mandar escrituras y piden recargar. Se espera un minuto.
3. **Ramón pega sim-004:** una sola pegada, como sim-003. El `LOCK TABLE` del DO deja que termine cualquier escritura que ya estuviera dentro y corta las que lleguen.
   - **A medir en el ensayo, antes de afirmarlo:** una escritura del cliente viejo que espera ese bloqueo, ¿falla al entrar, por grants y RLS ya cambiados, o pasa? Si pasara, hace falta un disparador de guarda `BEFORE INSERT OR UPDATE` en las dos tablas, que rechace filas `legado` cuando no las escribe una RPC.
4. **Comprobaciones:** el informe de sim-004 y s08 (solo lectura), contrastados como s06/s07.
5. **Se quita el modo mantenimiento y se encienden los endpoints v1:** variable de entorno y redespliegue. Las sesiones nuevas nacen v1 y las viejas se ven en solo lectura.

**Rollback:** el modo mantenimiento de nuevo (spec § 12.6). **No hay vuelta atrás económica:** el código anterior no lee el estado v1. Si el corte falla dentro del DO, no queda nada aplicado y se sale de mantenimiento con el cliente de época, que sigue funcionando en v0.

---

## d) Cliente: cambios mínimos

| # | Cambio | Dónde (hoy) |
|---|---|---|
| d1 | **Excluir lápidas** (`terminal = 'borrada'`) de listados, contadores y métricas del alumno; y del panel de admin | `pages/dashboard.js:110`; `pages/analytics.js:76`; `pages/api/admin/list-alumnos-sim.js:46`; `pages/api/admin/alumno-sim/[id].js:42` |
| d2 | **Legado en solo lectura:** abrir una sesión `legado` no arranca escrituras económicas (ni # 3–9 de a.1, ni `checkpoint`); se ve lo guardado y el snapshot. Qué se enseña exactamente: D-14 (Ramón) | `components/_SessionInner.js:706` (carga), `useTradingActions`, `usePairData`, `_SessionInner` (# 7–9) |
| d3 | **Borrar** por `POST /api/sim/borrar`, que elige `sim_borrar_legacy` o `sim_borrar_sesion` según la sesión. La pantalla reconcilia como hoy (`dashboard.js:135–150`), con 410 = «ya estaba borrada». Si el legado se puede borrar: D-14 | `pages/dashboard.js:131` |
| d4 | **Crear** por `POST /api/sim/crear`, con el `session_id` y el `command_id` generados en el cliente; el aviso de cupo, con `409 limite_sesiones` en vez de buscar «limite de sesiones» en el texto del error | `pages/dashboard.js:161–200` |
| d5 | **Cola de comandos y estado confirmado** (diseño-persistencia § 6): `command_id`, versión, testigo en `sessionStorage`, `localStorage` por usuario/sesión/época; «Guardado» solo con recibo; ACK y snapshot separados | nuevo (`lib/` del cliente), usado por `_SessionInner` |
| d6 | **Respuestas:** 403 (`sin_acceso`, `acceso_revocado`) → aviso y solo lectura; 409 `conflicto` → recotizar y pedir confirmación con `command_id` nuevo; 409 `comando_caducado` → cargar el estado confirmado y vaciar la cola; 409 `sin_arrendamiento` / `escritor_ocupado` / `otra_sesion_activa` → «Usar aquí» (con `forzar`); 410 → la sesión desaparece de la pantalla y la cola se descarta; 426 → «actualiza la página»; 429 → reintento al vencer; 503 → mantenimiento | `_SessionInner`, `dashboard` |
| d7 | **Retos:** el HUD lee el reto del estado v1 (`challenge/status` v1); la transición, por `avanzar-fase` | `components/useChallengeFlow.js` |
| d8 | **Métricas:** separar legado y v1 (spec § 6, punto 6) | `lib/metricas.js` |
| d9 | **Lo no económico, sin cambios:** dibujos, plantillas y configuraciones (# 11–16); `timeframe` sigue por UPDATE de columna | — |

d1 vale ya antes del corte, porque no hay lápidas hasta que se usen las RPC. d2, d3 y d6 para legado van en el cliente de época (§ c.7, paso 1). d4–d7 son del cliente v1 y se encienden en el paso 5.

---

## e) Motor v1 fuera de SQL

### e.1 Dónde vive

- **`lib/motor/`** queda como está: puro, sin base, sin red y sin reloj. Lo importa solo el servidor; la web no lo importa (diseño-persistencia § 3).
- **`lib/servidor/`** (nuevo) es la orquestación, sin React, en módulos `.mjs` puros con «puertos» inyectados:
  - `comando.mjs`: valida la intención, deserializa el estado, decide el tramo y aplica el motor. Devuelve `resultado` = `{ clase, estado, eventos, trades, resumen }`, con las proyecciones (`balance` = saldo cerrado, `last_timestamp` = cursor) y los trades `*_micro` desde los eventos `cierre`.
  - `crear.mjs`, `fase.mjs`: los estados iniciales.
  - `mercado.mjs`: el lector de mercado (e.2).
  - `rpc.mjs`: la llamada a la RPC y el reintento 40P01.
- **`pages/api/sim/*.js`:** endpoints finos. Autentican, construyen los puertos reales (Supabase `service_role` y Storage) y llaman a `lib/servidor/`.
- **Sin dependencias nuevas:** `zlib`, gzip y brotli vienen con Node (CLAUDE.md § 3.4).

### e.2 Cómo se alimenta del mercado `.json.gz`

**Lo que hay** (main `23e3612`, 11-oct):
- un objeto por par y año, `forex-data/{PAR}/M1/{AÑO}.json.gz`, en el bucket **público**;
- el año en curso lo **reescribe cada día** el cron del mercado diario;
- **su sha256 cambia cada día.**

**Lo que el motor espera:**
- un **manifiesto inmutable por par y versión** (`lib/motor/manifiesto.mjs`), con días, sha256 de cada trozo, cerrados y huecos aceptados;
- **trozos diarios binarios** (`lib/motor/binario.mjs`);
- la sesión fija `PAR@version:huella` (A26) y `fuente.mjs` rechaza cualquier otro.

**Por eso no se puede fijar el `.json.gz` anual:** al día siguiente su huella ya no es la fijada.

**Propuesta: un publicador de mercado v1** (spec § 7.3, D-10).
- Es un paso nuevo **después** del diario, en el mismo workflow o en otro.
- Lee el `.json.gz` del año con el lector común (`lib/mercado/ficheros.mjs`).
- **Corta los días completos** (UTC, solo los días cuya última vela ya está disponible: `availableAt`) y los codifica con `binario.codifica`.
- Los sube a `mercado/v1/<PAR>/<AAAA>/<MM>/<DD>.<sha>.bin.br` en un bucket **privado**. Un trozo con sha en el nombre nunca se reescribe.
- Publica un manifiesto nuevo con los días añadidos: es otra versión, con otra huella.
- **Las sesiones ya creadas siguen con su versión** (A26). Ven datos nuevos solo si se decide que una versión extienda a la anterior: es la pregunta 2.

**El endpoint** lee solo el manifiesto fijado y los trozos del tramo (≈ 9 KB por día y par, spec § 7.3), con caché por sha. **Nunca** lee el `.json.gz` anual (≈ 4 MB por par y año) en un comando.

**Alternativa descartada salvo que el CTO diga otra cosa:** un adaptador que corte el `.json.gz` en cada comando y calcule la huella del día al vuelo.
- No hace falta publicador.
- Pero descarga y descomprime megas por comando.
- Y la «versión fijada» dependería de que nadie corrija un día pasado del anual (el diario no lo hace, pero nada lo impide).

**Lista de huecos aceptados (P7-01):** se calcula con la descarga del arranque y entra en la huella del manifiesto. **Sigue pendiente** (pregunta 2).

### e.3 Determinismo y `*_micro`

- **El motor es una función pura** de (estado, comando, velas): ni reloj ni azar. Usa enteros (ticks, centésimas, µUSD BigInt) y racionales exactos (`racional.mjs`). Redondea al µ con mitades al par y residuo por posición (`dinero.mjs`).
- **El servidor no añade fuentes de no determinismo:**
  - `t_decision` es de la RPC (`clock_timestamp()` tras los bloqueos, V4-01);
  - el «ahora» del mercado es el `hasta` del comando, acotado por `availableAt` del manifiesto.
- **`*_micro` en `sim_trades`:** salen del evento `cierre`, en `bruto_micro`, `neto_micro`, `comision_micro`, `spread_micro` y `swap_micro` (0). `pnl` en USD es la proyección para las pantallas.
- **La RPC exige trades y cierres uno a uno** (`422 resultado_invalido`, `en: trades`).
- **Reproducibilidad:** con el estado de la versión N, el comando y el manifiesto fijado, cualquiera recalcula la versión N+1 byte a byte (`serializa` canónico). Esto es la base de una auditoría posterior.

### e.4 Cómo se prueba sin tocar producción

- **Motor:** como hoy, `pruebas/motor/*` (A01–A45, cartera y reto), puro.
- **`lib/servidor/`:** pruebas con puertos falsos:
  - un lector de mercado en memoria, con manifiestos y trozos construidos desde las velas reales que ya hay en el repo (`data/<PAR>/…`) o desde fixtures;
  - un `rpc` que registra la llamada.

  Oráculos: las mismas cifras de la spec a través del endpoint, y que el `resultado` pase las validaciones de la RPC.
- **Contra SQL real:** el montaje literal (`pruebas/estado-s04.mjs` + sim-002 + sim-003, y sim-004 cuando exista) en el PostgreSQL de ensayo, con el endpoint completo llamando a la RPC por `psql`. Incluye respuesta perdida, reintento, conflicto, caducado, 410, 40P01 y dos pestañas.
- **Corte:** sim-004 sobre el montaje con las cinco identidades ficticias de spec § 6, punto 1 (A25) y un cliente viejo escribiendo durante el `LOCK` (§ c.7). Y las URL de `challenge/*` llamadas directamente (diseño-persistencia § 7.0).
- **Garantías del arnés:**
  - **cero red**, con `sin-red.mjs` y el aislamiento del sistema de `tanda.sh`;
  - **cero escrituras en producción:** ninguna prueba recibe claves (`.env*` no se lee);
  - la tanda entera en verde antes de cada commit.
- **Producción solo con consultas de solo lectura** (s08…) y con las pegadas de Ramón.

---

## f) Etapas

Cada etapa se puede desplegar sola y la puede verificar Astra por separado.

| # | Etapa | Qué entra | Cómo se verifica | ¿Supabase Pro? |
|---|---|---|---|---|
| 0 | Integrar `main` en `auditoria-simulador` | los 39 commits de `main` (mercado diario `.json.gz`, workflow). Conflictos no medidos | tanda entera; diff de `lib/mercado` y `pages/api/candles.js` contra `main` | no |
| 1 | Cliente: lápidas y legado entendidos (d1, d2 y d3 para legado, d6 parcial) + endpoints `/api/sim/*` desplegados **apagados** (503) | sin cambio de esquema; no hay lápidas ni legado todavía, así que es inocuo | pruebas de cliente con el doble; URL de `/api/sim/*` → 503; un alumno no ve diferencia | no |
| 2 | Publicador de mercado v1 (e.2) y lista de huecos aceptados | bucket privado `mercado/v1`, manifiestos y trozos; el diario no cambia | relectura y sha de cada trozo publicado; manifiesto contra el `.json.gz` día a día; tamaño frente a Storage (≈ 60 MB, spec § 7.3; el bucket está en ≈ 745 MB, mercado diario 11-oct) | **a confirmar**: cabe hoy en 1 GB, pero con poco margen |
| 3 | `lib/servidor/` + endpoints completos, probados en el ensayo (e.4) | código sin desplegar o desplegado apagado | tanda: endpoint → RPC real en el montaje literal; A18–A26 por la URL | no |
| 4 | **sim-004 ensayado** (c) | `sql/sim-004` escrito, sin aplicar | montaje literal + sim-003 + sim-004, dos veces; A25; cliente viejo durante el `LOCK`; s08 sobre el montaje | no |
| 5 | **Corte en producción** (c.7: mantenimiento → sim-004 → s08 → encender v1) | sim-004 aplicado, cliente v1 (d4–d8), endpoints encendidos | informe de sim-004 y s08 literales; una sesión v1 de prueba (alumno de pruebas) de punta a punta; ningún alumno con escrituras rechazadas inesperadas | **sí: spec § 12.7, «la v1 no se habilita sin Supabase Pro»** |
| 6 | Retirada de `challenge/create` y `challenge/advance`; wipe por `sim_borrar_alumno` | código | URL llamadas directamente (§ 7.0): ninguna escribe | sí (va con v1) |

**Pro, según lo que consta en el repo:**
- base de 500 MB en el plan gratuito frente a 8 GB en Pro (diseño-persistencia § 9.3, consultado el 7-oct);
- Storage: 1 GB frente a 100 GB (spec § 7.3);
- la condición expresa de spec § 12.7.

No he consultado ahora la página de precios: si hace falta otra cifra, se mide entonces. **Las etapas 0–4 no necesitan Pro. La 5 sí.** Hasta tener Pro, el corte no se hace: dejaría a los alumnos sin poder crear sesiones.

---

## g) Preguntas abiertas para el CTO

1. **Integrar `main`:** ¿fusiono `main` en `auditoria-simulador` (etapa 0) antes de escribir código de servidor, o el trabajo de sim-004 y del motor sigue en la rama tal cual y se integra al final?
2. **Mercado v1:**
   - ¿Publicador de trozos diarios inmutables y manifiesto en bucket privado (mi propuesta, e.2) o adaptador sobre el `.json.gz` anual?
   - Con el publicador, ¿una sesión ya creada ve los días que se publican después? Es decir, ¿una versión nueva del manifiesto que solo **añade** días se acepta como continuación de la fijada, o la sesión queda con los datos que había al crearla?
   - ¿Cuándo se calcula la lista de huecos aceptados (P7-01)?
3. **`service_role` en el corte:** ¿revoco también a `service_role` INSERT y UPDATE en `sim_sessions` y `sim_trades` (conserva DELETE y SELECT para el hub y el wipe), para que ni el servidor pueda escribir economía fuera de las RPC? ¿O se confía en retirar `challenge/create` y `challenge/advance` y el bucle del wipe en el código?
4. **Admin sin `simulador_activo`:** `requireSimulador` lo deja pasar y las RPC le dan `403 sin_acceso` (`simulador_activo` exactamente `true`). ¿Un admin opera en el simulador v1 solo si tiene `simulador_activo`, o las RPC aceptan también `rol_global = 'admin'`? Esto último es un cambio de sim-003 y pediría sim-003b.
5. **Ventana de corte:** ¿ventana de mantenimiento anunciada (c.7) o dos clientes desplegados en secuencia, sin mantenimiento? Si es ventana: ¿cuánto dura, quién activa el modo y cómo (variable de entorno de Vercel con redespliegue)?
6. **Disparador del cupo:** ¿se reescribe con la misma cuenta que `sim_crear_sesion` (c.4) o se elimina, ya que tras el corte solo inserta la RPC y lo hace bajo la barrera?
7. **Guarda de legado:** si el ensayo muestra que una escritura del cliente viejo que esperaba el `LOCK` pasa después del corte, ¿se añade a sim-004 un disparador que rechace escrituras en filas `legado` que no vengan de una RPC?
8. **Retos legado activos:** spec § 6, punto 5, dice que quedan en solo lectura con sus reglas antiguas. ¿`challenge/status` sigue mostrando su veredicto calculado desde los trades (lo de hoy) o solo lo guardado (`status`, `challenge_phase`)?
9. **Ramón (D-13, D-14, D-15), que bloquean la etapa 5:**
   - el texto y la hora del aviso;
   - qué se enseña de una sesión legado y si el alumno puede borrarla;
   - si el legado cuenta en el cupo (cambia c.4).
10. **Plataforma:** ¿qué plan de Vercel hay (duración máxima de función, tamaño)? Un `avanzar` de 7 días de mercado con 9 pares tiene que caber holgado. No consta; lo mediría en el ensayo con tiempos reales del motor.
11. **Endpoint `challenge/status` para v1:** ¿se mantiene la URL leyendo el estado v1, o el cliente lee `sim_sessions.estado` por RLS y la URL queda solo para legado?

---

## h) Decisiones CTO 12-oct

Responden a las preguntas de § g, por número. **Donde chocan con el cuerpo de arriba (a–f), manda esta sección**; el cuerpo no se ha reescrito para que se vea qué cambió.

| # | Decisión | Qué cambia en el diseño |
|---|---|---|
| 1 | **Etapa 0 ya:** fusionar `main` en `auditoria-simulador` con un merge commit, sin rebase. Si hay conflictos, parar y listarlos. Después, la tanda completa en verde. Nada a `main` | § f, etapa 0 |
| 2 | **Publicador de trozos diarios inmutables y manifiesto en bucket PRIVADO** (e.2). Lo que cambia en el diseño: ver las tres notas debajo de la tabla | § e.2. **Cambia el formato:** hoy los huecos aceptados viven en el manifiesto (`lib/motor/manifiesto.mjs`, `huecos_aceptados`); pasan al trozo (`lib/motor/binario.mjs`, versión nueva de la cabecera). Y `fuente.mjs` necesita la regla de continuación |
| 3 | **Revocar a `service_role` INSERT y UPDATE en `sim_sessions` y `sim_trades`;** conserva SELECT y DELETE. Antes, inventario literal de todo lo que hoy escribe con `service_role` | § c.3: la revocación entra en sim-004. Inventario (12-oct), abajo |
| 4 | **El admin opera en v1 solo con `simulador_activo = true`,** que se da él mismo desde el hub. Las RPC no cambian; no hay sim-003b | § b.1: el endpoint deja de dar paso a un admin sin `simulador_activo` (la RPC respondería 403 igual); el aviso al admin lo dice |
| 5 | **Ventana de mantenimiento anunciada, ≤ 30 min,** con variable de entorno y redespliegue. La activo yo, con el sí explícito de Ramón y a la hora que él elija. Nada de dos clientes en secuencia | § c.7 queda tal cual, con duración ≤ 30 min y quién la activa |
| 6 | **Se elimina el disparador del cupo:** la RPC es la única puerta. La guarda final de sim-004 comprueba que **nadie más que el dueño** tiene INSERT en `sim_sessions` | § c.4: `DROP TRIGGER trg_enforce_sim_session_limit` y `DROP FUNCTION enforce_sim_session_limit()` en sim-004. Guarda: ningún rol salvo el dueño tiene INSERT (`has_table_privilege` sobre todos los roles de `pg_roles`, no solo los tres) |
| 7 | **Disparador de guarda, salga lo que salga del ensayo:** rechaza cualquier INSERT/UPDATE en `sim_sessions` y `sim_trades` cuando `current_user` no sea el dueño de las RPC. El DELETE queda fuera (hub y wipe). Se prueba con `authenticated`, con `service_role` y con un cliente viejo que esperaba el `LOCK` | § c.3 y c.6: un disparador `BEFORE INSERT OR UPDATE` en las dos tablas. **Ojo:** dentro de una RPC `SECURITY DEFINER`, `current_user` es su dueño (`postgres`) |
| 8 | **Retos legado:** en el corte, sim-004 calcula **una vez** el veredicto con el código de hoy y lo guarda en `legado_snapshot`. Desde ahí, `challenge/status` de legado solo enseña ese snapshot; no se recalcula nunca | § c.2: el snapshot de un reto lleva `veredicto`. El código de hoy es JavaScript (`lib/challengeEngine.js`) y sim-004 es SQL: ver la nota debajo de la tabla |
| 9 | **Producto (Ramón).** Ya decidido el 10-oct: el legado **no** cuenta en el cupo y el alumno lo borra vía `sim_borrar_legacy`. **Pendiente de confirmar** (su sí): la vista de solo lectura igual que hoy, con la etiqueta «Simulador anterior», y el texto del aviso | § d2 y d3. La etapa 5 sigue **bloqueada** hasta su sí |
| 10 | **Vercel Hobby.** No depender de la duración máxima: cada petición ≤ 10 s en p99 y cuerpo ≤ 4 MB. Si avanzar 7 días con 9 pares no cabe, se parte en tramos con un recibo por tramo. Medirlo en el ensayo con tiempos reales del motor | § b.2 y e.4: el límite del `hasta` sale de la medida (p99 ≤ 10 s y cuerpo ≤ 4 MB), no de los 7 días. Los tramos son comandos `avanzar` sucesivos, cada uno con su recibo |
| 11 | **Se mantiene `challenge/status` para v1 y legado.** En v1 lee `sim_sessions.estado` en el servidor, con el acceso releído. **El cliente no lee el estado por RLS** | § b.2 y d7. **Pendiente de diseño:** hoy la política SELECT de § c.3 deja a `authenticated` leer todas las columnas de su fila, `estado` incluido. Si «no lo lee» tiene que ser una garantía de SQL y no una disciplina del cliente, sim-004 cambia el SELECT de tabla por un SELECT de columnas sin `estado` (y quizá sin `escritor`). Para Astra |

**Notas a la decisión 2:**
- **Continuación solo de añadir.** La sesión fija el manifiesto al crearse. Una versión nueva se acepta como continuación **solo si añade**: los trozos ya fijados son idénticos por hash y la cadena de hashes se puede verificar.
- **Fin de datos.** Al llegar al final, la sesión espera en `fin_de_datos` y continúa cuando se publican días nuevos.
- **Cambio de un día publicado.** Si cambia cualquier día ya publicado, no hay continuación: la sesión se queda con lo suyo y se trata como **incidente**.
- **Huecos aceptados (P7-01).** Se calculan al publicar cada trozo y van **dentro** de él, inmutables.

**Nota a la decisión 8:** el veredicto se calcula fuera, con `lib/challengeEngine.js` sobre los trades de cada reto legado, y entra en sim-004 como datos literales, revisables antes de pegar. También cabe una reimplementación en SQL contrastada contra el JS. Lo decido en el ensayo y se lo enseño a Astra.

**Inventario de escritores con `service_role` en `sim_sessions` y `sim_trades` (decisión 3, 12-oct)**

Búsqueda literal en los 15 repos del escritorio, el hub incluido, en solo lectura y sin tocar ninguno:

| Repo · fichero:línea | Tabla | Operación | Tras la revocación |
|---|---|---|---|
| simulador · `pages/api/challenge/create.js:103` | `sim_sessions` | INSERT | falla: se sustituye por `/api/sim/crear` (etapa 5–6) |
| simulador · `pages/api/challenge/advance.js:167`, `:197`, `:234`, `:283` | `sim_sessions` | UPDATE | falla: v1 por `/api/sim/avanzar-fase`; legado, `409 solo_lectura` |
| simulador · `pages/api/challenge/advance.js:274` | `sim_sessions` | INSERT (la hija) | ídem |
| simulador · `pages/api/admin/wipe-simulador.js:94` | las 7, `sim_sessions` y `sim_trades` incluidas | DELETE | sigue (DELETE conservado); o por `sim_borrar_alumno` |
| hub · `pages/api/users/delete.js:104–106` | `sim_sessions` (+ 4 de configuración) | DELETE | sigue |

**Nada más escribe** con `service_role` en esas dos tablas en el código de los repos: journal, macro, Eirene, calculadora y landings no las nombran.

**No consta (no es código de un repo):**
- tareas de la base (pg_cron);
- Edge Functions;
- disparadores o funciones de otros esquemas que escriban en ellas.

s04 solo lista las funciones de `public` que tocan las 9 tablas: el único disparador de `sim_sessions` es el del cupo. **Propuesta:** que la s08 previa a sim-004 los consulte (`cron.job` si existe, funciones con `sim_sessions`/`sim_trades` en su cuerpo en cualquier esquema), en solo lectura.
