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
| 9 | **Producto (Ramón).** Decidido el 10-oct: el legado **no** cuenta en el cupo y el alumno lo borra vía `sim_borrar_legacy`. **Confirmado por Ramón el 12-oct:** las sesiones legado se ven en **solo lectura, igual que hoy**, con la etiqueta **«Simulador anterior»** y **botón de borrar**; el texto del aviso queda **tal cual** (abajo). Día y hora: los elige Ramón más adelante | § d2 y d3 (D-14 y D-15 cerradas); § c.7 (D-13: texto cerrado). La etapa 5 ya no espera a producto; **sí** a que Ramón elija día y hora, además de lo demás (Pro, Astra, etapas 0–4) |
| 10 | **Vercel Hobby.** No depender de la duración máxima: cada petición ≤ 10 s en p99 y cuerpo ≤ 4 MB. Si avanzar 7 días con 9 pares no cabe, se parte en tramos con un recibo por tramo. Medirlo en el ensayo con tiempos reales del motor | § b.2 y e.4: el límite del `hasta` sale de la medida (p99 ≤ 10 s y cuerpo ≤ 4 MB), no de los 7 días. Los tramos son comandos `avanzar` sucesivos, cada uno con su recibo |
| 11 | **Se mantiene `challenge/status` para v1 y legado.** En v1 lee `sim_sessions.estado` en el servidor, con el acceso releído. **El cliente no lee el estado por RLS** | § b.2 y d7. **Pendiente de diseño:** hoy la política SELECT de § c.3 deja a `authenticated` leer todas las columnas de su fila, `estado` incluido. Si «no lo lee» tiene que ser una garantía de SQL y no una disciplina del cliente, sim-004 cambia el SELECT de tabla por un SELECT de columnas sin `estado` (y quizá sin `escritor`). Para Astra |

**Notas a la decisión 2:**
- **Continuación solo de añadir.** La sesión fija el manifiesto al crearse. Una versión nueva se acepta como continuación **solo si añade**: los trozos ya fijados son idénticos por hash y la cadena de hashes se puede verificar.
- **Fin de datos.** Al llegar al final, la sesión espera en `fin_de_datos` y continúa cuando se publican días nuevos.
- **Cambio de un día publicado.** Si cambia cualquier día ya publicado, no hay continuación: la sesión se queda con lo suyo y se trata como **incidente**.
- **Huecos aceptados (P7-01).** Se calculan al publicar cada trozo y van **dentro** de él, inmutables.

**Nota a la decisión 9 (texto del aviso, literal, confirmado por Ramón el 12-oct):**

> El simulador estará en mantenimiento el [día] de [hora] a [hora], unos 30 minutos. Tus sesiones están a salvo. Al volver verás el simulador nuevo, y tus sesiones anteriores seguirán ahí como "Simulador anterior".

Los corchetes los rellena Ramón cuando elija la ventana (decisión 5: ≤ 30 min).

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

---

## i) Decisiones CTO tras Astra (12-oct)

**Revisión:** `revisiones-suite/2026-10-12-astra-sim-004-diseno.md` (HEAD revisado `2365e28`). Resultado: **no**, hasta cerrar S4-01…S4-05. **Esta sección prevalece sobre todo lo anterior, sección h incluida.** El cuerpo a–h no se reescribe, para que se vea qué cambió. **Sin código todavía.**

**Corrección de una cifra mía (h, decisión 3):** el inventario no recorrió «15 repos». En el escritorio hay **13** directorios con Git: 12 repos y el worktree `forex-simulator-mercado-diario`. Mi búsqueda recorrió los 12 repos; el worktree es otro checkout del simulador, con los mismos escritores (Astra lo contrastó). El resultado no cambia.

### i.1 Altos (cierran el «no»)

#### S4-01 · Quiescencia sin operaciones partidas

- **a) Cierre atómico ya en la etapa 1, semanas antes del corte.**
  - El cierre total (`useTradingActions.js:49+67`) y el parcial (`_SessionInner.js:1949+1950`) pasan a ser **una sola llamada**.
  - Es una función plpgsql **SECURITY INVOKER** (no definer), con `search_path` vacío y EXECUTE **solo** para `authenticated`. Hace el INSERT del trade y el UPDATE del saldo en una transacción.
  - Los permisos y la RLS siguen siendo los de hoy, sin ningún privilegio nuevo: la llamada puede exactamente lo que podían las dos sentencias.
  - Va en una **migración nueva, sim-004a** (i.1, S4-04), no en sim-003.
  - Tras el corte, la revocación y la guarda la rechazan como a cualquier escritura de `authenticated`.
- **b) Cliente de la etapa 1.**
  - Consulta un **endpoint de estado del servicio** antes de cada escritura económica y cada 30 s. Con mantenimiento activo, bloquea las escrituras y muestra la pantalla de mantenimiento.
  - Lleva un **id de versión:** si el servidor anuncia otra, recarga.
  - La limpieza y el desmontaje (`_SessionInner.js:1363`, `usePairData.js:25`, pausa `:1104`) respetan el bloqueo.
- **c) Coherencia durante el corte.**
  - El export de entradas de S4-02 incluye una comprobación de coherencia por sesión v0. **Cualquier incoherencia ABORTA el corte** y se lista para Ramón; **nunca se recalcula**.
  - Esto sustituye a la nota G02 de § c.2 («pasa a legado igual, con la incoherencia anotada»).
  - **Invariantes que propongo** (por sesión v0, todos de solo lectura):
    1. `balance = capital + Σ pnl` exacto, en `numeric`;
    2. cada trade con el mismo `user_id` que su sesión;
    3. en una hija de reto, el padre existe, es del mismo alumno y es raíz;
    4. **ninguna columna nueva de sim-003 escrita en una v0:** `estado`, `mercado`, `escritor`, `legado_snapshot` y `terminal` nulos, `version = 0`, `epoca = 0`, `legado = false`, `creada_por_rpc = false` (cierra el primer caso de S4-10: antes del corte el alumno puede escribirlas).

    No propongo como invariante `last_timestamp ≥ closed_at` del último trade: el cierre parcial actualiza el saldo y no `last_timestamp`, así que puede no cumplirse sin incoherencia.
  - **Propuesta:** la misma comprobación como consulta de solo lectura (s09) **bastante antes** del corte. Si los datos de hoy ya no cuadran, Ramón decide sin la ventana encima.
  - ~~**Riesgo residual:** una pestaña cargada antes de la etapa 1 … la comprobación de c) lo detecta y aborta.~~ **RETIRADO (k, S4R2-01):** era falso. Dos cierres parciales compensados (+100/−100), o uno de P&L cero, dejan el saldo cuadrado sin sus trades. La igualdad del saldo es una comprobación de **datos**, no la prueba de que no queden peticiones pendientes. La retirada de clientes anteriores a la etapa 1 es ahora una **condición previa verificable** (k.1).
- **d) La guarda de sim-004 también rechaza DELETE** cuando `current_user` es `authenticated` o `anon`: los alumnos borran por RPC. `service_role` conserva DELETE (hub y wipe).
  - **Ensayo obligatorio:** INSERT→corte→UPDATE, UPDATE→corte→INSERT, limpieza tardía y DELETE viejo esperando el `LOCK`. Todos, rechazados o abortados.

#### S4-02 · Veredicto ligado a la foto

- **Evaluador:** el de hoy, en JavaScript, **fijado por hash** de fichero (`lib/challengeEngine.js`) y de reglas (`lib/challengeRules.js`), sha256 en el commit usado.
- **Export consistente:** una transacción **REPEATABLE READ** que lee todas sus entradas: la sesión, con capital, saldo, tipo, fase y estado, y sus trades.
- **Hash canónico por sesión,** con los trades **ordenados por id**, como `challenge/status`.
  - **Propuesta de construcción:** el texto canónico lo construye **la misma expresión SQL** en el export y dentro del DO. El JS solo recibe y hashea ese texto. Así no puede divergir el formato de los `numeric` entre JS y SQL.
- **`currentTimeIso`:** el último tiempo simulado de la sesión (`last_timestamp`). Si es null, el `closed_at` del último trade. **Sin trades: veredicto «sin operaciones».** Nunca el reloj real.
- **Dentro del DO, bajo el `LOCK`:** se recalcula el hash de entradas de cada sesión y se compara con el exportado. **Si difiere uno solo, se aborta antes de escribir nada.**
- **El `legado_snapshot` de un reto guarda:**
  - el veredicto;
  - el hash de entradas;
  - los hashes del evaluador y de las reglas;
  - el `currentTimeIso` usado.
- **Oráculo de la etapa 4:** la contraprueba de Astra (dos conjuntos con el mismo recuento, la misma suma y el mismo saldo, y veredictos distintos). Cambiar de uno a otro entre export y corte **tiene que abortar**.

#### S4-03 · Identidad de la continuación del mercado

- **El estado guarda, por par, la raíz** (el manifiesto fijado al crear) **y la versión efectiva** (hash).
- **La continuación se resuelve al empezar un comando.**
  - Va **dentro del sobre de intención**: entra en el digest, y los reintentos reutilizan el mismo sobre, así que piden la misma identidad.
  - Se registra **atómicamente** con el recibo y la versión.
- **El replay usa solo las identidades registradas,** nunca «el último».
- **Continuación válida solo con prefijo idéntico:** velas **y** metadatos de interpretación (cerrados, cobertura, fronteras, aceptados), **todo dentro del manifiesto**. Los días nuevos van **estrictamente después de la frontera**. **Las adiciones interiores son incidente.**
- **`sim_sessions.mercado` la actualiza la RPC** (cambio en sim-004a).
- **El inventario de retención conserva toda la cadena usada.**
- **Consecuencia para el motor (etapa 2):**
  - `creaFuente` deja de recibir `aceptados` como parámetro externo (`lib/motor/fuente.mjs:39`): los lee del manifiesto.
  - `fuenteDelEstado` acepta la versión efectiva registrada, no solo la raíz.
- **Pendiente de coherencia** (para Astra, ronda 2; ver i.4): h2 decía que los huecos aceptados «van dentro del trozo», y esta decisión dice «todo dentro del manifiesto».
  - **Mi lectura compatible:** el trozo los lleva y el manifiesto los fija por hash.
  - Si lo que se quiere es que vivan en el manifiesto, cambia el formato de h2.

#### S4-04 · `hueco_aceptado` y la migración sim-004a

- **sim-004a es versionada, aditiva** y se aplica **ANTES del corte**, con las RPC aún inactivas. Contiene:
  1. **`hueco_aceptado`:** se amplía el CHECK de `sim_eventos.tipo` (S:285–287) y la validación de tipos de `sim_comando` (S:537–544). Es un **evento técnico con la misma retención que los económicos**: no lo sobrescribe `ultimo_avance`.
  2. **La actualización de `sim_sessions.mercado` por la RPC** (S4-03).
  3. **La función atómica de cierre** (S4-01a).

  Con segunda ejecución y guardas de definición, como sim-003.
- **El adaptador motor→RPC se especifica completo** para cada evento: `tipo`, `resultado`, `motivo` coherente, `proyeccion`, `ordinal` y `t_mercado` (lo que exige S:537–611). No vale el objeto resumido de § b.2 / § e.1.
- **Prueba:** motor → adaptador → **RPC real** en el PostgreSQL de ensayo, en la etapa 3. Un doble que acepte cualquier `tipo` no vale.

#### S4-05 · Catálogo de retos v1

**PENDIENTE DEL SÍ DE RAMÓN.** Se diseña con esta opción:

- **Las altas v1 son solo práctica y `FTMO_2STEP`,** con un **id de reglas versionado** en el estado y en el recibo.
- **1F y 3F quedan como legado de solo lectura.** `/api/sim/crear` los rechaza con **400**.
- **No se mapean a 2-Step.** Si algún día vuelven como v1, necesitan reglas versionadas, transiciones y oráculos propios.

### i.2 Medios, en su etapa

| # | Decisión | Etapa |
|---|---|---|
| S4-06 | **RPC de presentación** para `name`/`timeframe`, sin excepción en la guarda. La guarda es una función **SECURITY INVOKER** que comprueba el dueño real (`current_user` = el dueño de las RPC; DEFINER la dejaría siempre satisfecha). **A concretar:** quién la ejecuta (`authenticated` con `auth.uid()` = dueño y acceso vigente, o un endpoint) | 4 (cliente en 1/5) |
| S4-07 | **`/api/sim/estado`** (lectura en servidor): snapshot confirmado + versión, época y `terminal`, para práctica y reto, coherente con h11 (el cliente no lee `estado` por RLS). Los `select('*')` (`dashboard.js:110`, `analytics.js:76`, `_SessionInner.js:706`) pasan a listas de columnas. ACK del comando y snapshot vigente, separados | 3, antes de la UI de 5 |
| S4-08 | **Tal cual Astra:** cada tramo con sobre e id estables antes de enviarse; una sola petición pendiente; un resultado incierto se resuelve antes de subdividir o seguir; fronteras entre minutos completos, sin partir una fase del camino; respetar terminal, detenciones y el horizonte frontera − 1 s. «Recibo por tramo» = **confirmación** por tramo, **no conservación** de todos (un avance técnico sobrescribe `ultimo_avance`). Los 10 s, desglosados en autenticación, lecturas, mercado, cálculo, SQL (con hasta tres intentos 40P01) y respuesta. Los 4 MB, separados en entrada HTTP, llamada RPC y salida, en UTF-8 serializado. Rechazo seguro si no cabe ni un minuto o un cierre. El p99 es un objetivo medido | 3; umbrales medidos antes de 5 |
| S4-09 | **Revocar también TRUNCATE, TRIGGER y REFERENCES de `service_role`** en `sim_sessions` y `sim_trades`. **Matriz explícita de roles de aplicación**: herencias, PUBLIC y grants de columna. Separar administradores confiables de vías invocables por clientes, sin revocar a ciegas permisos internos de Supabase. Verificar dueños y definiciones (cuerpos incluidos), y el inventario de tareas, disparadores, funciones invocables y Edge Functions. **s08 previa, obligatoria** | 4; evidencia real antes de 5 |
| S4-10 | **Tal cual Astra:** declarar qué columnas nuevas de las v0 se validan (i.1, S4-01c: si alguna está escrita, aborta); todos los snapshots iniciales los produce el corte; el corte se identifica por un **marcador de esquema verificable**, no por filas ni snapshots; guardas de primera ejecución separadas de los invariantes posteriores; **lápidas fuera** de las comprobaciones de snapshot (`sim_borrar_legacy` lo pone a NULL). Segunda ejecución probada con cero sesiones, con sesiones v1 y después de borrar legado | 4 |
| S4-11 | **Tal cual Astra:** día cerrado por calendario, cobertura y excepciones explícitas (disponibilidad ≠ completitud); publicación atómica del manifiesto después de verificar todos sus trozos, y si el publicador falla, el manifiesto anterior sigue válido; huecos que cruzan dos trozos con una ubicación canónica y su momento de definitivos; calcular huecos **no** los acepta: la lista y su motivo se revisan (E:763). Formato nuevo: versión subida, validación semántica además del hash (escala, reservado, orden, OHLC, volumen, longitud) y contenido de huecos acotado (C6-06) | 2 |
| S4-12 | **La etapa 6 es requisito para abrir la 5:** retirar `challenge/create` y `challenge/advance` y el wipe por RPC antes de quitar mantenimiento (manteniendo la revocación de acceso previa al wipe). El runbook lleva el **artefacto de mantenimiento ya ensayado** y un **punto de aborto** dentro de los 30 min. Tras COMMIT no se reponen grants v0. Ensayar fallo antes del COMMIT, COMMIT con respuesta perdida y fallo de despliegue después del COMMIT | 1/3 preparar · 4 probar · antes de 5 |

### i.3 Orden de aplicación que resulta

1. **sim-004a** (aditiva, RPC inactivas) y el **cliente de la etapa 1**: cierre atómico, estado del servicio y versión.
2. Etapas **2–4** con sus oráculos.
3. **s08 y s09** (solo lectura).
4. **Etapa 6.**
5. Ventana: mantenimiento → **export REPEATABLE READ** (S4-02 y S4-01c) → **sim-004** → comprobaciones con mantenimiento activo → abrir v1. O el punto de aborto.

### i.4 Para la ronda 2 de Astra (coherencia)

1. **¿Dónde viven los huecos aceptados?** En el trozo (h2) o en el manifiesto (S4-03); ver la lectura compatible arriba.
2. **sim-004a junta piezas de etapas distintas:** el cierre atómico (etapa 1, semanas antes) y `hueco_aceptado` + la actualización de `mercado` (diseñados en 2–3). Si sim-004a se aplica en la etapa 1, las piezas de las etapas 2–3 tienen que estar cerradas antes. Si no, hay que partirla en dos migraciones versionadas (p. ej. sim-004a y sim-004b), ambas antes del corte.
3. **S4-01c frente a los datos de hoy:** si alguna sesión v0 ya no cuadra, el corte no puede hacerse hasta que Ramón decida. De ahí la propuesta de s09 temprana.
4. **S4-06:** quién ejecuta la RPC de presentación.

---

## j) S4-05 · catálogo completo (decisión final de Ramón, 12-oct)

**Sustituye a i.1 · S4-05** y a todo lo que limitaba el catálogo v1. **El motor v1 sale con todo el catálogo:** práctica, `FTMO_2STEP`, 1F y 3F. 1F y 3F llevan las **reglas de hoy**. **Nada a medias: la etapa 5 no se abre sin los cuatro.**

### j.1 Las reglas de hoy, literales

**Fuentes:**
- `lib/challengeRules.js`, sha256 `f1e3fbb48031d97909fb44c56f35f257a50919ab0aad7ff1b14eb031375fe806`;
- el evaluador que las aplica, `lib/challengeEngine.js`, sha256 `206754ebe08d78a9aeacdceb89aa1afdc1a4aae376f5a8d8e1e8a5aa351fe957`;
- la transición, `pages/api/challenge/advance.js`;
- todo en el commit `4bb328b`.

`challengeRules.js` solo fija las cifras. Cómo se aplican lo decide el evaluador, y por eso va también aquí.

| | 1F | 2F (hoy, legado) | 3F |
|---|---|---|---|
| `code` / `name` | `'1F'` · «1 Fase» | `'2F'` · «2 Fases» | `'3F'` · «3 Fases» |
| `description` | «Un solo paso. Profit target agresivo.» | «Formato FTMO clásico. Evaluación + Verificación.» | «Progresión gradual. Ideal para consistencia.» |
| `phases` | 1 | 2 | 3 |
| `targets_pct` (objetivo por fase) | `[15]` | `[10, 5]` | `[5, 5, 5]` |
| `dd_daily_pct` (`COMMON_RULES`) | 5 | 5 | 5 |
| `dd_total_pct` (`COMMON_RULES`) | 10 | 10 | 10 |
| `ACCOUNT_SIZES` (común) | 10.000 · 25.000 · 50.000 · 100.000 · 200.000 | ídem | ídem |
| Días mínimos | **no hay** (ni en las reglas ni en el evaluador) | no hay | no hay |

**Cómo los aplica hoy el evaluador** (`challengeEngine.js`, línea citada):

- **Solo trades cerrados** (`closed_at` y `result` ≠ `'OPEN'`), en orden de `closed_at` (:98–101). **El flotante no cuenta**, ni para el objetivo ni para los DD.
- **Objetivo:** `pnlTotal ≥ capital × objetivo%` de la fase (:109–110, :230). `capital` es el de la sesión de la fase, que es el mismo en todas las fases (`advance.js:258`). No exige estar sin posiciones abiertas.
- **DD total:** suelo fijo en `capital × (1 − 10 %)`. Se recorre el equity **de cierres** y se mira su mínimo. **Tocar el suelo es fallar** (`ddTotalWorstUSD ≥ ddTotalCapUSD`, :122–135, :223).
- **DD diario:**
  - por día **Europe/Madrid**, con reset a las 00:00 CET/CEST (:33–43, :150–156);
  - el límite es **5 % del balance de inicio del día** (capital + P&L de los días anteriores), no del capital inicial (:161–174);
  - la caída se mide desde ese balance hasta el mínimo intradía del equity de cierres (:178–184);
  - **tocar el límite es fallar**, con una **tolerancia de 1 céntimo** (`ddDay ≥ dayCapUSD − 0,01`, :192).
- **Prioridad:** DD total, después DD diario y después objetivo (:223–232).
- **`target_reached` no avanza solo:** el alumno pulsa «Submit Phase» (`advance.js:12–20`). En la última fase da `passed_all`, y si no, `passed_phase` más una sesión hija. La hija tiene la **misma `capital`**, `balance = capital`, el mismo par y las mismas fechas, y su cursor sigue **donde acabó la anterior** (`last_timestamp = end_timestamp`, `advance.js:249–272`).
- **Sin `currentTimeIso`,** el «hoy» del DD diario actual es el reloj real (:207). Solo afecta al indicador en vivo, no al estado; S4-02 lo fija para el legado.

**Diferencias con `FTMO_2STEP` del motor** (`lib/motor/reto.mjs:32–48`), que es lo que usa el 2F v1:

| | Motor `FTMO_2STEP` | Reglas de hoy |
|---|---|---|
| Equity | incluye el flotante, evaluada tick a tick | solo cierres |
| Base del DD diario | 5 % del **capital inicial**, restado al balance de las 00:00 | 5 % del **balance de inicio del día** |
| Zona | Europe/Prague | Europe/Madrid (mismas fronteras CET/CEST) |
| Días mínimos | 4 | ninguno |
| Objetivo | exige estar sin posiciones | no lo exige |
| Igualdad | exacta en µUSD | tolerancia de 1 céntimo en el diario |

### j.2 Lo que «reglas de hoy» no decide para el motor v1: NO DECIDIDO (preguntas al CTO)

El motor v1 evalúa **equity con flotante, en cada tick**. Copiar «hoy» literalmente choca con eso en cuatro puntos. No lo decido yo:

1. **Flotante:** ¿1F/3F v1 evalúan los DD y el objetivo solo con cierres, como hoy (el motor tendría que ignorar el flotante para estos productos), o con la equity del motor, como FTMO_2STEP (reglas de hoy en cifras, semántica del motor)?
2. **Base del DD diario:** ¿balance de inicio del día, como hoy, o capital inicial restado al balance de las 00:00, como FTMO_2STEP?
3. **Tolerancia de 1 céntimo:** en µUSD enteros no hace falta. ¿Igualdad exacta («tocar = fallar») o se conserva `≥ límite − 10.000 µUSD` por fidelidad a hoy?
4. **Objetivo con posiciones abiertas** (hoy se permite) y **paso de fase:**
   - ¿Superar es automático en el cierre que alcanza el objetivo (el motor se detiene ahí, como FTMO_2STEP) o espera al «Submit Phase» como hoy?
   - Para 1F, el CTO dice «de la fase única a superado o fallado», sin `avanzar_fase`: falta decir si es automático.

Los oráculos de j.4 se escriben con lo que se decida. Hasta entonces, **los ids de reglas 1F/3F no se congelan.**

### j.3 Diseño

1. **Reglas versionadas con id propio** en `lib/motor/reto.mjs`, junto a `FTMO_2STEP`, inmutables como ella.
   - Por ejemplo `SUITE_1F` (`version: 'suite-1f@…'`) y `SUITE_3F` (`'suite-3f@…'`). El nombre y la fecha se fijan al cerrar j.2.
   - Cada una con: fases, objetivo por fase, DD diario (porcentaje y base), DD total, días mínimos (0), zona, criterio de equity y regla de igualdad.
   - `creaReto` deja de aceptar solo `FTMO_2STEP` y fase 1|2 (`reto.mjs:82–84`): acepta cualquier reglas versionadas con su número de fases.
   - El estado y el recibo llevan el id de reglas. **Ninguna alta se mapea a 2-Step.**
2. **`/api/sim/crear` acepta los cuatro,** cada uno con su id de reglas. Un `challenge_type` desconocido da 400.
3. **Transiciones:**
   - **1F:** no hay `avanzar_fase`. De la fase única a superado o fallado (j.2, punto 4). `sim_avanzar_fase` sobre un 1F → 409.
   - **3F:** 1→2 y 2→3.
   - **2F:** 1→2, como hoy en sim-003.
   - **La generalización va en sim-004a:** aditiva, versionada y sin editar sim-003. `sim_avanzar_fase` acepta una transición k→k+1 si k < fases de las reglas fijadas en el padre y el padre tiene la fase k superada en su estado. Hoy solo hace 1→2 y `reto@1`. Con pruebas de segunda ejecución.
   - **Esto toca el esquema del estado del reto** (`reto@1` → `reto@2`, con el id de reglas y el número de fases): para Astra.
4. **Legado:** las sesiones 1F y 3F existentes son «Simulador anterior», con su snapshot y su veredicto (S4-02), igual que el resto. Las nuevas usan el motor.

### j.4 Oráculos por producto (como los de 2F), cada uno con su mutante

Las cifras van en µUSD, con capital 100.000.

| Producto | Oráculo | Mutante que lo pone en rojo |
|---|---|---|
| 1F | objetivo: 114.999,99 → no supera; **115.000,00 → supera** | **las reglas de 2F aplicadas a 1F: 110.000 supera** (el caso de Astra) |
| 1F, 3F | DD total: equity mínima 90.000,01 → sigue; **90.000,00 → falla** | DD total sobre el pico (trailing), o estricto (`>`) |
| 1F, 3F | DD diario al céntimo: inicio de día 100.000 → el límite según j.2 (balance de inicio: 5.000; caída 4.999,99 sigue, **5.000,00 falla**); un segundo día con otro balance de inicio, para distinguir la base | base cambiada (capital ↔ balance de inicio), zona UTC en vez de Madrid/Praga en un cierre a las 23:30 UTC |
| 1F, 3F | días mínimos 0: se supera el primer día | exigir 4 días |
| 3F | objetivo 5 % en cada fase, con capital igual en las tres | objetivos `[10, 5]`, o capital arrastrado de la fase anterior |
| 3F | transición 1→2 y 2→3; **3→4 rechazada**; superar la 3 = veredicto final | permitir 3→4, o declarar el final en la 2 |
| 1F | sin transición: `avanzar_fase` → 409; superar = veredicto final | permitir 1→2 |
| todos | prioridad DD total > DD diario > objetivo en el mismo cierre | orden cambiado |
| todos | flotante (según j.2, punto 1): una posición abierta que cruza el límite | evaluar al revés de lo decidido |

### j.5 Autorrevisión adversaria (1F y 3F)

No había una sección así en este diseño. La abro con 1F y 3F:

- **Tres familias de reglas en un mismo motor:** FTMO_2STEP, con flotante y días; y 1F/3F, que hoy van sin flotante ni días. Un alumno puede comparar 2F y 3F y ver que el mismo historial se juzga con criterios distintos. Es una decisión de producto, no un fallo, pero hay que decirla en la pantalla.
- **«Hoy» tiene errores conocidos de coma flotante,** de ahí la tolerancia de 1 céntimo. Portarlo tal cual a enteros cambia algún caso límite. Cada diferencia entre el veredicto legado (JS) y el v1 en el mismo historial tiene que estar **explicada** por j.2, no ser accidental. Propongo un contraste JS ↔ motor sobre historiales sintéticos de 1F y 3F en la etapa 3.
- **Transición 2→3 del 3F:** la hija de la hija. El orden de bloqueos «padre y después hija» y el borrado en cascada (S003-01, D-17) ya cubren cadenas, pero **no hay un oráculo con tres generaciones**: añadirlo (borrar la raíz deja tres lápidas; un comando en la nieta da 410).
- **El cupo cuenta raíces:** un 3F ocupa una plaza en sus tres fases, como hoy.
- **sim-004a crece otra vez,** ahora también con la transición generalizada y `reto@2`. Se suma al punto 2 de i.4.

### j.6 Corrección de j.1 y decisiones del CTO sobre j.2 (12-oct, tarde)

**Prevalece sobre j.1 y j.2 donde choquen.**

**j.1, corregida: hoy el flotante SÍ cuenta para 1F, 2F y 3F.** j.1 describía solo el evaluador del servidor (`lib/challengeEngine.js`), que mira cierres. Pero el **cliente** tiene un detector de quemado dentro de la vela:
- `components/usePairData.js:73–76` lo llama en cada vela;
- `components/useChallengeFlow.js:269–415` (`checkChallengeBreach`) lo ejecuta;
- `lib/trading/breach.js:18–77` (`resolveBreach`) hace el cálculo.

**Qué hace:**
- **Equity en el peor caso de la vela:** capital + realizado + flotante de los otros pares (a su cierre actual) + el peor flotante del par entre el máximo y el mínimo.
- **Se compara con dos límites,** cada uno con un margen de 1 céntimo:
  - el DD total (capital × 10 %);
  - el DD diario (el límite de la última evaluación del servidor, más lo ya perdido en el día).
- **Al quemar:**
  - calcula el precio exacto de quema, lo empuja **medio pip hacia el lado peor** y lo recorta al rango de la vela;
  - **cierra todas las posiciones** de todos los pares (las del par al precio de quema, las de los otros a su cierre actual);
  - pausa el replay y abre el modal de fallo.
- **Después,** el servidor ve el trade cerrado y confirma `failed_dd_*`.

**Reproducido** con las funciones reales (`revisiones-suite/2026-10-12-reglas-de-hoy-1F-3F/`):
- capital 100.000, 10 lotes de EURUSD comprados a 1,10000, una vela con mínimo 1,0940 (−6.000);
- resultado: quema en esa vela a **1,09495**, con un trade de **−5.050,00**, y `failed_dd_daily`;
- igual en 1F, 2F y 3F.

**Defectos de v0 que v1 elimina, porque decide el servidor:**
1. **El modal de fallo se abre sin confirmación del servidor:** tras tres consultas del estado, abre `failed` diga lo que diga. Si el trade del cierre forzado no llega a guardarse, el alumno ve «quemado» y el servidor dice `active` (y rechazaría el `fail` con 400).
2. **El límite diario del detector sale del último día con trades** (`ddDailyCapUSD` = balance de inicio del último día registrado × 5 %, `useChallengeFlow.js:304–310`), no necesariamente del día en curso.
3. Además, el fallo solo queda guardado en la sesión cuando el alumno pulsa el botón del modal (`advance` con `outcome='fail'`).

**j.2, cerrada: las reglas de 1F y 3F son las de hoy, ejecutadas en el servidor por el motor**

1. **El flotante cuenta.**
   - **Equity en el peor caso dentro de la vela** (máximo y mínimo), con el flotante de **todos** los pares, como `resolveBreach`.
   - **Al quemar:** se cierran **todas** las posiciones al precio de quema de `breach.js` (con medio pip hacia el lado peor = **5 ticks** en los 9 pares, recortado al rango de la vela).
   - **El fallo se guarda en el mismo comando**, no al pulsar el modal.
2. **Base del DD diario:** la de hoy, **5 % del saldo al empezar el día, día de Madrid**.
   - **2F sigue con las reglas FTMO del motor ya aprobadas** (`FTMO_2STEP`).
   - **Cada producto lleva su id de reglas.**
3. **Sin margen:** enteros en µUSD, y **tocar el límite (≤) es fallar**. Fuera el céntimo.
4. **Paso de fase como hoy:** el alumno lo pide. En 1F, al pedirlo queda completado, sin `avanzar_fase`.

**Condición de hoy para pasar de fase, literal.** No hay un botón «Submit Phase» fijo. El paso se pide desde el modal de fase superada:

| Paso | Dónde | Qué exige |
|---|---|---|
| El modal aparece | `components/useChallengeFlow.js:165` | `evalStatus === 'target_reached'` |
| Qué es `target_reached` | `lib/challengeEngine.js:230` | `pnlTotal >= targetUSD`, **solo con trades cerrados**, y ni DD total ni DD diario quemados (:223–229, que tienen prioridad) |
| El servidor lo confirma | `pages/api/challenge/advance.js:147` | `outcome === 'pass'` exige `evaluation.status === 'target_reached'`, recalculado sobre los cierres |
| Bloqueo mientras tanto | `components/useChallengeFlow.js:39–50` | con `target_reached`, `challengeLocked`: ni operaciones nuevas, ni dibujos, ni avanzar el replay. «Posiciones abiertas pueden seguir cerrándose normalmente (SL/TP o manual)» (:39) |
| **Posiciones abiertas al pasar** | `pages/api/challenge/advance.js:224–232` (fase intermedia) | **se permiten**. El cliente las manda (`open_positions`) y el servidor **las descarta**: ni trade ni saldo («la hija nace virgen»), solo deja un registro en el log |
| … en la última fase | `pages/api/challenge/advance.js:195–215` | `passed_all` con `balance = balanceNow` (cierres). Las posiciones abiertas **ni se mencionan**: quedan fuera del resultado |

**Por tanto, hoy:**
- se puede alcanzar el objetivo con cierres y pasar de fase con posiciones abiertas;
- su flotante, ganador o perdedor, **se pierde** sin entrar en el saldo de la fase;
- mientras el modal está abierto, el replay está parado, así que esas posiciones no se mueven, salvo que el alumno las cierre a mano al precio del momento.

**Ids de reglas de 1F y 3F: NO congelados.** Sigo la orden del CTO («si hoy las permite, dímelo antes de congelar»). Falta decidir si en v1 el paso de fase:
- (a) se permite con posiciones abiertas y las descarta, como hoy;
- (b) se rechaza con posiciones abiertas, como `FTMO_2STEP`;
- (c) las cierra al precio del momento antes de comprobar el objetivo.

**j.4, ampliada** (oráculos que no dependen de esa respuesta):

| Producto | Oráculo | Mutante que lo pone en rojo |
|---|---|---|
| 1F, 2F (v0) y 3F | **Equivalencia v0/v1, el caso del CTO:** capital 100.000; el día empieza en 100.000; 10 lotes de EURUSD comprados a 1,10000 (110000 ticks); velas con mínimo 1,0990 → 1,0940 → 1,0880 → cierre 1,1005. En la vela de mínimo 1,0940: quema DD diario a **1,09495 (109495 ticks)**, trade **−5.050.000.000 µUSD**, `failed_dd_daily` **en el mismo comando**; la vela de −12.000 y el +500 no llegan a ocurrir. v0 = las funciones reales de hoy (`resolveBreach` + `evaluateChallenge`); v1 = el motor con las reglas de 1F/3F. Para 2F, la equivalencia es con v0 (legado); el 2F v1 tiene FTMO_2STEP y su propio oráculo | **evaluar solo cierres:** sin quema; la posición llega a −12.000 y cierra en +500; `active` → rojo |
| 1F, 3F | quema en el límite exacto: una caída que deja la equity **justo** en el límite (≤) falla; 1 µUSD por encima, sigue | margen de 1 céntimo (10.000 µUSD) |
| 1F, 3F | medio pip: precio de quema = el exacto ± 5 ticks hacia el lado peor, recortado al rango de la vela | sin empuje, o empuje hacia el lado bueno |
| 1F, 3F | flotante de **otro** par en la equity del peor caso (dos pares abiertos) | contar solo el par de la vela |
| 1F, 3F | base del DD diario = saldo al empezar el día de Madrid, con dos días de saldos distintos; un cierre a las 23:30 UTC (ya es el día siguiente en Madrid) | base = capital inicial; día UTC |

**j.5, ampliada (autorrevisión adversaria):**
- **«Igual que `resolveBreach`» frente a la cartera v1.** `resolveBreach` valora los **otros** pares a su cierre actual, y solo el par de la vela entre su máximo y su mínimo. La cartera v1 (`lib/motor/cartera.mjs`, § 13 de la spec) recorre todos los pares a la vez por el camino sincronizado. Con un solo par dan lo mismo (el oráculo de equivalencia lo comprueba). **Con varios pares pueden quemar en momentos o precios distintos.** No lo decido: o «igual que `resolveBreach`» significa la regla de un solo par generalizada por la cartera, o se replica literalmente su aproximación multipar. Para el CTO y Astra.
- **El medio pip de empuje** es un artefacto de v0 contra el redondeo IEEE-754 (`breach.js:68–69`). En enteros no hace falta, pero el CTO lo mantiene por equivalencia: el alumno pierde 50 USD más (10 lotes) de lo que marca el límite. Es deliberado y tiene que decirse en pantalla.
- **Pasar con posiciones abiertas** (pregunta pendiente): con la opción (a), un alumno puede alcanzar el objetivo con cierres teniendo una posición muy perdedora abierta, y pasar descartándola. Hoy, además, el replay se bloquea mientras tanto, así que esa posición ya no puede quemar el DD.

### j.7 Reglas congeladas: paso de fase, varios pares e ids (CTO, 12-oct)

**Prevalece sobre j.1–j.6 donde choquen.**

**1. Pasar de fase con posiciones abiertas: se rechaza, en los cuatro productos** (opción b, como el FTMO del motor).

- **Condición para superar la fase** (la misma en 1F, 2F y 3F; corregido en k: **la práctica no es un reto**, no tiene objetivo ni fase que superar):
  - objetivo alcanzado sobre **cerrados** (saldo cerrado ≥ objetivo);
  - **cero posiciones abiertas;**
  - ningún límite quemado (el breach prevalece, C7-01);
  - en 2F, además, los 4 días de FTMO_2STEP.
- **Órdenes pendientes: se CANCELAN, no bloquean.** Es lo que ya hace el FTMO del motor:
  - el objetivo se mira **en el evento de cierre**, dentro de la vela (C6-02, `lib/motor/reto.mjs:112–117`);
  - si se cumple, el motor se detiene y **anula todas las pendientes** con su evento `orden_cancelada`, motivo `objetivo`, en orden de `seq` (`lib/motor/motor.mjs:186–191`).

  Justificación: con el motor detenido, una pendiente ya no puede ejecutarse, así que no hay «órdenes que puedan ejecutarse». Rechazar exigiría que el alumno las cancelara a mano después de que el motor ya hubiera parado, y daría el mismo resultado con un paso más. Cancelarlas deja evento y recibo, así que nada se pierde en silencio.
- **Cuándo se rechaza.** Si el alumno pide pasar de fase (2F/3F: `/api/sim/avanzar-fase`; 1F: completar) y su estado no está `superada`:
  - con saldo cerrado ≥ objetivo y posiciones abiertas: **`409 posiciones_abiertas`**;
  - en cualquier otro caso: `409 fase_no_superada`.

  Ninguno de los dos toca el estado: rechazo puro, sin recibo económico ni versión nueva. El cliente muestra **«Cierra tus posiciones abiertas para pasar de fase»**.
- **Dónde va.** El endpoint lo detecta leyendo el estado confirmado antes de llamar a ninguna RPC. `sim_avanzar_fase` ya exige `superada` (S:725–733), y con posiciones abiertas el motor no la concede (`!e.posiciones.length` en `altoDe`). Es una mejora del mensaje, no de la garantía.
- **Para la etapa 3:** `altoDe` usa hoy `FTMO_2STEP.dias_minimos` fijo (`reto.mjs:117`). Con 1F/3F tiene que leer los días mínimos de **sus** reglas (0).
- **Cambio frente a hoy (v0):** hoy se pasa con posiciones abiertas y `advance.js:224–232` las descarta. **v1 lo rechaza.**
- **Detalle para la etapa 3 (Astra):** en 1F, la superación queda en el estado en el mismo cierre, porque el motor se detiene. Falta fijar cómo se registra el «completado» de la proyección cuando el alumno lo pide: escrito por la RPC del cierre que supera, o por un comando explícito de confirmación.

**Oráculos de j.4, ampliados:**

| Productos | Oráculo | Mutante → rojo |
|---|---|---|
| 1F, 2F, 3F | pedir el paso con objetivo alcanzado sobre cerrados y **una posición abierta GANADORA**: `409 posiciones_abiertas`; estado, versión, recibos y eventos **idénticos** antes y después | descartar las posiciones como hoy (`advance.js:224–232`) y pasar |
| 1F, 2F, 3F | ídem con **una posición abierta PERDEDORA**: `409 posiciones_abiertas`, sin tocar nada | ídem; y uno que solo rechace las perdedoras |
| 1F, 2F, 3F | objetivo alcanzado en un cierre sin posiciones y con **2 órdenes pendientes**: `superada`; las dos `orden_cancelada` (motivo `objetivo`) en orden de `seq`, en el mismo comando | no cancelar (las pendientes siguen vivas) o rechazar por pendientes |
| 1F, 3F | días mínimos 0: superar el primer día | leer `FTMO_2STEP.dias_minimos` (4) |

**2. Varios pares: la semántica de la cartera del motor v1, en los cuatro productos.**

- **«Igual que `resolveBreach`» se define como la semántica de cartera ya aprobada para 2F** (spec § 13):
  - la equity se evalúa **en cada minuto con todos los pares a la vez**;
  - el peor caso dentro de la vela de cada par sigue la regla del motor: dos caminos, el peor para la cartera, sincronizados por fracción (§ 13.1–13.4).
- **La equivalencia v0/v1 se exige SOLO con un par** (el caso −6.000 de j.6).
- **Con varios pares, v1 es la referencia,** y se documenta como **corrección de una aproximación de v0**: v0 valoraba los otros pares a su cierre actual (`useChallengeFlow.js:316–326`) y solo el par de la vela entre su máximo y su mínimo, ese par por separado.

**3. Ids de reglas, congelados.** Constantes inmutables en `lib/motor/reto.mjs`, junto a `FTMO_2STEP`:

| Constante | `version` (id) | Fases | Objetivo por fase (% del capital inicial, sobre cerrados) | DD diario | DD total | Días mínimos | Zona | Equity y quema | Igualdad | Paso de fase |
|---|---|---|---|---|---|---|---|---|---|---|
| `SUITE_1F` | **`suite-1f@2026-10-12`** | 1 | 15 | 5 % del **saldo al empezar el día** | 10 % del capital inicial, suelo fijo | 0 | Europe/Madrid | con flotante, peor caso de la vela por la cartera; al quemar, cierre de todo al precio de quema ± 5 ticks hacia el lado peor (recortado a la vela); fallo en el mismo comando | ≤ límite = fallar; µUSD enteros | a petición; con posiciones abiertas, rechazo; pendientes canceladas al superar; 1F: completar, sin `avanzar_fase` |
| `SUITE_3F` | **`suite-3f@2026-10-12`** | 3 | 5 · 5 · 5 (capital igual en las tres) | ídem | ídem | 0 | Europe/Madrid | ídem | ídem | a petición: 1→2 y 2→3; 3→4 rechazada; superar la 3 = final |
| `FTMO_2STEP` (ya aprobada) | `ftmo-2step@2026-10-05` | 2 | 10 · 5 | 5 % del capital inicial, restado al balance de las 00:00 | 10 % del capital inicial | 4 | Europe/Prague | la del motor | la del motor | 1→2, a petición, con las mismas reglas de posiciones y pendientes (punto 1) |

- **Ninguna alta se mapea a otra.** El estado y el recibo llevan el id.
- **Una corrección futura es otra constante con otro id;** estas no se editan.
- **Fuentes:** `lib/challengeRules.js` (sha256 `f1e3fbb4…`) y `lib/challengeEngine.js` (`206754eb…`) en `4bb328b`, más el detector `lib/trading/breach.js` y `components/useChallengeFlow.js:269–415` (j.6).

**j.5, ampliada: dos pares donde v0 y v1 queman en momentos distintos.**

Es un ejemplo construido a mano: no lo ha calculado todavía el motor. Será un oráculo de la etapa 3.

- **Montaje:** capital 100.000; el día empieza en 100.000; límite diario 5.000.
  - EURUSD: 10 lotes comprados.
  - GBPUSD: 10 lotes comprados.
  - En el mismo minuto, EURUSD toca su mínimo pronto (−3.000) y cierra en −500; GBPUSD toca su mínimo tarde (−3.000) y cierra en −2.900.
- **v0** procesa cada par por separado:
  - Al evaluar la vela de EURUSD, suma su peor caso (−3.000) con GBPUSD valorado **a su cierre actual** (−2.900, si su motor ya pasó ese minuto). Total: **−5.900 → QUEMA**, con EURUSD cerrado al precio que deja −5.000 en total.
  - Si GBPUSD aún no había avanzado ese minuto, lo valora a su cierre anterior y puede **no** quemar.
  - **El resultado de v0 depende del orden en que avanzan los pares.**
- **v1** recorre los dos pares a la vez por el camino sincronizado:
  - cuando EURUSD está en −3.000 (pronto), GBPUSD está, por ejemplo, en −1.000: **−4.000**;
  - cuando GBPUSD está en −3.000 (tarde), EURUSD ya ha vuelto a −500: **−3.500**;
  - **no quema.**
- **Explicación:** v0 combina el peor momento de un par con el cierre del otro, **dos instantes distintos**, y además depende del orden de proceso. v1 mira el mismo instante para todos.

**Puede ir en los dos sentidos.** v1 también puede quemar donde v0 no: si los dos mínimos coinciden en el mismo instante, y v0 valoró el otro par a un cierre ya recuperado. El oráculo de la etapa 3 lleva los dos sentidos.

### j.8 Días mínimos por producto y «completado» por la RPC de transición (CTO, 12-oct)

**Prevalece sobre j.7, en el «detalle para la etapa 3», y sobre el punto 1 de j.7 en lo que choque.**

**1. Días mínimos de las reglas del producto.**
- La comprobación de objetivo (`altoDe`) lee **`dias_minimos` de las reglas del reto:** `FTMO_2STEP` 4, `SUITE_1F` 0, `SUITE_3F` 0. Ya no usa el 4 fijo de `lib/motor/reto.mjs:117` (`FTMO_2STEP.dias_minimos`).
- **Oráculo:** 1F alcanza el objetivo con un cierre sin posiciones el **primer día** de trading → `target_reached` (`superada` en el estado del reto).
- **Mutante:** el 4 fijo → no supera → rojo.
- **Control:** 2F con 3 días no supera, y con 4 sí.

**2. «Completado» de 1F y de la última fase de 2F/3F: la misma RPC de transición, generalizada en sim-004a.**

Es `sim_avanzar_fase`, aditiva, versionada y sin editar sim-003 (j.3, punto 3).
- **Si la fase superada NO es la última:** crea la hija, como hoy en 1→2 (2F) y como en 1→2 y 2→3 (3F).
- **Si ES la última** (la fase 1 de 1F, la 2 de 2F, la 3 de 3F): **no crea hija**. Deja la sesión en estado terminal **`superado`**, igual que una transición normal:
  - **recibo** económico del tipo `avanzar_fase`, en la propia sesión;
  - **CAS** con `version_esperada`;
  - **versión** + 1;
  - **época;**
  - **acceso releído tras los bloqueos** (S003-04);
  - mismo orden de bloqueos.
- **Mismo `409 posiciones_abiertas`** (j.7): con objetivo alcanzado sobre cerrados y posiciones abiertas, sin tocar el estado.
- **Idempotente:**
  - el reintento con el **mismo `command_id`** devuelve **el mismo recibo** (`repetido`, como hoy en las transiciones);
  - con **otro `command_id`** sobre una sesión ya `superado` → **`409 solo_lectura`**.
- **Lo que esto exige en sim-004a** (para Astra):
  - **Ampliar `sim_sessions_terminal_valida`** (hoy `terminal IS NULL OR terminal IN ('borrada','revocada')`, S:213) con `'superado'`. Se cambia la restricción por otra con la nueva definición, que sim-004a comprueba al pie de la letra.
  - **Consecuencia:** la sección 8 de sim-003 compara esa definición literal (S:983). **Después de sim-004a, sim-003 ya no se puede volver a ejecutar:** abortaría por definición distinta. Pasa lo mismo con el CHECK de `sim_eventos.tipo` ampliado para `hueco_aceptado` (S4-04). Desde sim-004a, la comprobación vigente es la de sim-004a. Hay que escribirlo en `sql/APLICADOS.md` y en la cabecera de sim-004a.
  - **`sim_sessions_v1_coherente`** no cambia: una v1 `superado` conserva `estado` y `mercado` (no es lápida).
  - **`sim_comando` y `sim_tomar_escritor`** tratan `terminal = 'superado'` como `409 solo_lectura`, igual que el legado (hoy S:453 y S:599 solo lo hacen para `legado`). **`sim_borrar_sesion`** puede borrar una sesión `superado`: pasa a lápida `borrada`. En una cadena 3F, con S003-01, borrar la raíz arrastra las fases, también la `superado`.
  - **La proyección** (`status`, `challenge_phase`) la escribe la misma RPC: `passed_all` en la sesión de la última fase, `passed_phase` en la que crea hija.

**Oráculos y mutantes** (como en las demás transiciones; sobre la RPC real en el ensayo PostgreSQL, etapas 3–4):

| Productos | Oráculo | Mutante → rojo |
|---|---|---|
| 1F | superar (primer día) y pedir: **`superado`**, sin hija, recibo `avanzar_fase` en la sesión, versión + 1 | crear una hija «fase 2» en 1F |
| 2F (fase 2), 3F (fase 3) | ídem en la última fase: `superado`, sin hija | crear hija 3 (2F) o 4 (3F) |
| 3F | fases 1 y 2: crean hija (1→2, 2→3) con recibo en la hija, como hoy | cerrar como `superado` en la fase 2 |
| todos | con una posición abierta (ganadora y perdedora): `409 posiciones_abiertas`, todo idéntico antes y después | completar descartando la posición |
| todos | reintento con el **mismo** `command_id` tras una respuesta perdida: **el mismo recibo**, sin versión nueva | crear otro recibo, o subir la versión otra vez |
| todos | **otro** `command_id` sobre `superado`: `409 solo_lectura`, sin efectos; también `sim_comando` y `sim_tomar_escritor` | permitir un comando o una segunda transición sobre `superado` |
| todos | CAS: con una `version_esperada` vieja, `409 conflicto` | quitar el CAS |
| todos | acceso revocado entre la lectura y el bloqueo: `403 sin_acceso`, sin efectos (S003-04) | leer el acceso antes de los bloqueos |
| todos | `sim_borrar_sesion` sobre `superado` → lápida; en una cadena 3F, desde la raíz, las tres lápidas | borrado rechazado sobre `superado`, o una fase que no se arrastra |
| — | segunda ejecución de sim-004a: comprueba y no cambia nada; sim-003 sobre una base con sim-004a **aborta** con el mensaje de definición distinta (documentado, no un fallo) | sim-004a que no compara la definición nueva |

### j.9 sim-003 queda superada por sim-004a (CTO, 12-oct)

- **sim-003 no se toca:** su sha256 aplicado (`2a74bcb3…`) sigue siendo el de `sql/APLICADOS.md`. La nota está en `sql/APLICADOS.md` desde ahora.
- **La cabecera de sim-004a lleva, literal:** «a partir de sim-004a, sim-003 queda superada y NO se vuelve a ejecutar; la referencia del esquema pasa a ser la comprobación final de sim-004a, que verifica también los objetos de sim-003 que no cambia».
- **La comprobación final de sim-004a cubre:** las definiciones nuevas (`sim_sessions_terminal_valida` con `'superado'`, `sim_eventos.tipo` con `hueco_aceptado`, las RPC generalizadas) **y** todas las de la sección 8 de sim-003 que sim-004a no cambia (restricciones, índices únicos, políticas, funciones con su ACL), comparadas al pie de la letra.
- **Prueba obligatoria en el ensayo de sim-004a:** ejecutar sim-003 **después** de sim-004a.
  - **Resultado exigido:** aborta con su error prefijado (`sim-003: …`, la definición distinta) **y el catálogo es idéntico antes y después**. La foto de catálogo es la de s04/s06 más las definiciones de sim-003/sim-004a, comparada como multiconjunto.
  - Así, una ejecución por error no hace daño.
  - **Control:** un mutante de sim-003 sin esa comprobación de definición cambiaría el catálogo → rojo.

---

## k · tras Astra ronda 2

**Revisión:** `revisiones-suite/2026-10-12-astra-sim-004-diseno-2.md`, sobre `8daea32`.
- **Resultado:** S4-02, S4-03, S4-04 y S4-05 cerrados (S4-03 y S4-05, con condiciones de etapa). **NO solo por S4R2-01.**
- **Esta sección prevalece sobre todo lo anterior.** Correcciones en el sitio:
  - D:477 retirada (tachada, con la nota);
  - D:750, la práctica no es un reto.

### k.1 S4R2-01 · Retirada verificable de los clientes anteriores a la etapa 1 (alto)

**a) Retirada la afirmación de D:477.** Dos parciales compensados (+100/−100), o uno de P&L cero, con el UPDATE confirmado y el INSERT pendiente, dejan `balance = capital + Σ pnl` sin los trades. La contraprueba de Astra da `coherente: true` y el mismo hash en el export y en el corte. **La igualdad del saldo es una comprobación de datos** (S4-01c y s09 la siguen haciendo), **no una prueba de que no queden peticiones pendientes.**

**b) Cabecera del cliente de la etapa 1.**
- **Todas** sus peticiones a Supabase llevan `x-sim-cliente: etapa1-<versión>`, con la misma versión que S4-01b.
- Va como cabecera global del cliente: `global: { headers: { 'x-sim-cliente': … } }` en el `createClient` de `lib/supabase.js:35`. Así cubre REST, RPC y Storage sin tocar cada llamada.

**c) sim-004a se divide en dos migraciones versionadas, las dos antes del corte:**

| Migración | Contiene | Cuándo | Notas |
|---|---|---|---|
| **sim-004a-preparatoria** | el cierre atómico (S4-01a: plpgsql INVOKER, EXECUTE solo `authenticated`, permisos de hoy) + el **registro de escrituras** (d) | con la etapa 1, **antes** de desplegar el cliente de la etapa 1 | **no es «RPC inactiva»** (Astra, i.4.2): el cliente de la etapa 1 llama al cierre atómico; deja los demás objetos de sim-003 como están |
| **sim-004b** | el contrato v1: `superado` (CHECK de terminal), `hueco_aceptado` (CHECK, validación y **clasificación de retención**, S:560–566), `mercado` por la RPC, reglas versionadas y transiciones (`reto@2`, k→k+1 y final), retención | cerrado con las etapas 2–3 y ensayado en la 4, **antes** del corte | aquí sí, RPC inactivas |
| **sim-004** | el corte (§ c, i, j, k.1 f) | en la ventana | — |

**Matriz de sucesión** (sustituye a j.9 donde choque):

| Tras aplicar… | ¿Se puede volver a ejecutar sim-003? | ¿sim-004a-preparatoria? | Referencia de esquema vigente |
|---|---|---|---|
| sim-003 (12-oct) | sí, idempotente | — | comprobación final de sim-003 |
| sim-004a-preparatoria | **sí, inofensiva:** no cambia ninguna definición que sim-003 compare. **A comprobar en el ensayo**, no supuesto | sí, idempotente | sim-003 **+** comprobación de sim-004a-preparatoria (sus objetos propios) |
| sim-004b | **no:** aborta con su error prefijado y el catálogo idéntico (prueba de j.9, que pasa de «sim-004a» a «sim-004b») | sí, idempotente | **comprobación final de sim-004b,** que verifica también los objetos de sim-003 y de sim-004a-preparatoria que no cambia |
| sim-004 (corte) | no | no se vuelve a ejecutar (el corte borra su registro, d) | comprobación final de sim-004 |

- **La cabecera literal de j.9** («a partir de sim-004a, sim-003 queda superada…») **pasa a sim-004b.**
- **La nota de `sql/APLICADOS.md` se corrige igual** cuando se escriba la primera de las dos.
- **El mutante de j.9, ajustado** (Astra, sección C): la prueba tiene que ponerse en rojo también si la ejecución indebida **termina con éxito** sin alterar nada. Se exige el error prefijado, no solo el catálogo intacto.

**d) Registro de escrituras `sim_escrituras_v0`** (en sim-004a-preparatoria).
- **Columnas:** `session_id`, `user_id`, `tabla`, `operación`, `cliente`, `en`. **→ Ampliadas en k.4 c** con `rol_jwt` y `rol_guc`; sin `current_user`.
- **Permisos:** RLS activada **sin ninguna política** y **sin grants** a `anon`, `authenticated` ni `service_role`. Solo la escribe la función del disparador y solo la lee el dueño (s10).
- **Disparadores** `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` en `sim_sessions` y `sim_trades`.
  - La función es **SECURITY DEFINER** del dueño, con `search_path` vacío: el disparador corre con el rol de quien escribe, que no tiene grants sobre el registro.
  - Una función `RETURNS trigger` no se puede llamar fuera de un disparador.
- **`cliente`:** `current_setting('request.headers', true)::json->>'x-sim-cliente'`. PostgREST pasa los nombres de cabecera en minúsculas. Si falta, `'sin-firma'`.
- **No es seguridad:** la cabecera se puede falsificar. **Es un detector de clientes antiguos**, y así se documenta en la cabecera de la migración.
- **Retención:** se borra tras el corte (k.1 f).

**e) Certificado de retirada: s10** (solo lectura; la ejecuta Ramón).
- **Por alumno:**
  - las escrituras `'sin-firma'` de las **últimas 72 h** (sesión, tabla, operación, hora);
  - la **última versión vista** (`cliente` más reciente).
- **Condición para cortar:** **cero** escrituras sin firma en 72 h **y** ninguna versión anterior a la vigente.
- **Si aparece alguna, no se corta.** Ramón pide a ese alumno que recargue, y **la ventana de 72 h vuelve a empezar**.
- **La salida se guarda en `revisiones-suite`.** **Certifica el CTO** con esa salida: su hora es la «hora del certificado».

**f) En el DO del corte, bajo el `LOCK`:** si hay alguna escritura `'sin-firma'` en `sim_escrituras_v0` posterior a la hora del certificado, **ABORT** antes de escribir nada. La hora entra como parámetro literal en el texto del corte. Después de esa comprobación, el mismo DO quita los disparadores y la tabla de registro (retención d).

**g) Ensayo de la etapa 4:**
- los dos parciales compensados (+100/−100), con los UPDATE confirmados y los INSERT pendientes;
- un parcial con P&L cero;
- en los dos casos, **desde un cliente sin firma.**

Resultado exigido: **s10 los detecta**, y si el corte se lanza igual, **aborta** en f). **Mutante:** una s10 que solo mire la igualdad del saldo → no detecta nada → **rojo**.

### k.2 Medios, a su etapa (como propone Astra)

| # | Decisión | Etapa |
|---|---|---|
| S4R2-02 | S4-01c y s09: **ascendencia existente, del mismo alumno, acíclica y con fases coherentes** (fase del hijo = fase del padre + 1, mismo producto), terminada en una raíz. Sustituye a «el padre es raíz», que rechazaba una tercera fase legítima P→H→N (`advance.js:249–263` enlaza con la fase anterior). Controles negativos: ciclo, salto de fase y padre ajeno. Ni se normalizan padres ni se borran fases | 4 y s09 |
| S4R2-03 | El oráculo multipar de j.7 se sustituye por **OHLC completos, posiciones, órdenes, costes y caminos calculados** (§ 13.4). La narración «pronto/tarde» no viene en una vela OHLC. **Se conserva el caso de dos BUY que SÍ quema** (contraprueba de Astra con la cartera: breach en 251/300 a 1,09749 y 1,29749, equity 94.980; con la igualdad SUITE, 250/300 y 95.000 antes del empuje), **repetido cambiando el orden y los nombres** de los pares. Un caso de divergencia sin breach solo vale si produce de verdad caminos distintos o exposiciones compensadas | 3 |
| S4R2-04 | La equivalencia v0/v1 de j.6 se marca como **fixture aislado sin costes** (1,09495, −5.050). Otro **fixture con costes@1**: bid, ask, entrada ejecutada, comisión (3 USD/lote al abrir), bruto, neto y saldo. Por ejemplo, la cuenta de Astra: saldo 99.970, toque en 1,09503, empuje a 1,09498, bruto −5.020 y neto −5.050. No se cambia costes@1 para cuadrar la cifra antigua | 3 |
| S4R2-05 | **Quema sin vela en ese instante** (reset diario o mandato). Precio de cierre: **la última cotización conocida de cada par**, con el empuje de **±5 ticks hacia el lado peor POR POSICIÓN** (BUY hacia abajo, SELL hacia arriba), **recortado al rango de la última vela conocida**. **Nunca una vela futura.** Es una política **versionada dentro de las reglas** (SUITE_1F/SUITE_3F). Oráculos: reset sin vela (el caso de Astra: saldo 120.000 con flotante −22.000, suelo diario nuevo 114.000), exposición neta cero (BUY y SELL del mismo par), JPY, y paso/salto/reanudación con el mismo precio y saldo | 3 |
| i.4.4 | **Presentación:** endpoint autenticado + una RPC **solo para `service_role`** que valida actor, propiedad y acceso y **únicamente** toca `name`/`timeframe`. Guarda INVOKER con el dueño esperado | 4 |
| — | **La práctica no es un reto:** corregido en D:750 | — |

**Además, lo que Astra deja como criterio de aceptación** (sin decisión nueva):
- S4-02: el hash cubre el conjunto completo exportado y el presente, incluidas altas y bajas.
- S4-03: los huecos en el trozo, vinculados por el hash del manifiesto, sin una segunda lista mutable.
- S4-04: la clasificación de retención cambia en sim-004b, no solo el CHECK.
- j.8: el reintento busca el recibo en la sesión final antes de rechazar `superado`; mismo id con digest distinto = `clave_reutilizada`; dos peticiones concurrentes en la fase final.

### k.3 Autorrevisión adversaria del registro de escrituras

1. **Escrituras de servidor sin cabecera.** El hub (`users/delete.js:104–106`, DELETE), el wipe (`admin/wipe-simulador.js:94`) y `challenge/create`/`advance` escriben con `service_role` desde Node, sin `x-sim-cliente`. Quedarían como `'sin-firma'` y **bloquearían el certificado sin ser clientes antiguos**.
   - **→ Decidido en k.4 d.**
   - **Propuesta, para el CTO:** añadir al registro el **rol** (`current_setting('request.jwt.claims', true)::json->>'role'`, o `current_user`), y que s10/f solo cuenten `'sin-firma'` con rol `authenticated`.
   - Alternativa: que esos servidores manden su propia cabecera.
   - Sin una de las dos, cualquier borrado del hub en las 72 h reinicia la ventana.
2. **¿Llega la cabecera?** **→ Medido en k.4 a–b:** llega en las dos versiones, y el CORS la admite. Lo que sigue era el riesgo antes de medir:
   - que la puerta de entrada de Supabase deje pasar una cabecera propia desde el navegador (CORS: el preflight tiene que admitir `x-sim-cliente`);
   - que PostgREST la ponga en `request.headers`.

   Si el CORS la rechazara, **fallarían todas las peticiones del cliente de la etapa 1**, no solo el registro. Hay que medirlo **antes** de desplegar la etapa 1, con una petición de solo lectura desde el navegador, y comprobar la cabecera con una lectura del registro tras una escritura de prueba en una cuenta de prueba. Esa escritura es autorizable solo con el sí de Ramón.
3. **Falsificación.** Un alumno podría mandar a mano `etapa1-<versión>` desde un cliente viejo modificado. Es un riesgo aceptado: el registro no es seguridad. Lo que protege la economía tras el corte son la revocación y la guarda. El registro solo evita **perder historial** por clientes viejos honestos.
4. **Carreras con el registro.** El disparador es `AFTER … FOR EACH ROW` en la **misma transacción** que la escritura: o se confirman las dos, o ninguna. No hay escritura sin registro ni registro sin escritura.
   - **Una escritura de un cliente viejo que espera el `LOCK` del corte** no llega a confirmarse antes de f). Después del corte, la revocación y la guarda la rechazan, y el disparador ni se ejecuta.
   - **Un UPDATE confirmado antes del certificado con su INSERT todavía en vuelo:** el UPDATE quedó registrado `'sin-firma'`, así que s10 lo ve (ventana de 72 h).
   - **Ese mismo UPDATE, confirmado después del certificado:** f) lo ve.
5. **Pestaña vieja inactiva más de 72 h.** Cero escrituras en 72 h **no prueba** que no exista una pestaña vieja abierta y quieta. Si escribe **antes** del corte, queda registrada y f) aborta. Si su petición está **en vuelo** en el instante del `LOCK`, el registro no la ve hasta que se confirma, y ya no se confirma, porque la rechazan la revocación y la guarda.
   - El caso S4R2-01 necesita una **primera** escritura confirmada (el UPDATE), y esa sí queda registrada.
   - **No veo un caso que pase,** pero esto es lectura: es para Astra y para el ensayo de la etapa 4 (g).
6. **Cascadas.** Un DELETE de sesión que arrastra sus trades dispara el registro también en `sim_trades`, con la misma cabecera y el mismo rol. Es correcto: cuenta como escritura de ese cliente.
7. **Volumen.** El cliente de hoy guarda el progreso periódicamente (`usePairData.js:25`) y al pausar (`_SessionInner.js:1104`). Cada guardado es una fila del registro. Con 5 alumnos es poco, pero hay que medirlo en la etapa 1 (filas/día) frente a la base gratuita, antes de Pro. Se borra con el corte.
8. **Permisos de la tabla de registro.** RLS sin políticas y sin grants:
   - un alumno no puede leer quién escribió ni borrar su rastro;
   - `service_role` tampoco (bypassrls no basta sin grant);
   - **el dueño sí.**

   Se comprueba con la matriz de S4-09 y con una s08 que la incluya. El disparador, al ser DEFINER del dueño, es el único que inserta.
9. **sim-003 y la sucesión.** Que sim-003 sea inofensiva tras sim-004a-preparatoria es una afirmación de la matriz. Se comprueba en el ensayo (catálogo y error, como j.9), no se da por buena.

### k.4 Decisiones CTO tras la medida de la cabecera (12-oct) · prevalece sobre k.1 d–f y k.3 (1, 2)

Pruebas: `revisiones-suite/2026-10-12-cabecera-sim-cliente/` (LEEME, SHA256SUMS, scripts y salidas literales).

**a) CORS, medido en producción sin clave y sin efectos.** Preflight `OPTIONS /rest/v1/sim_sessions` desde el origen `https://simulator.algorithmicsuite.com`, con el método pedido `POST`:
- respuesta HTTP 200;
- `access-control-allow-headers` repite `x-sim-cliente`, y también `x-client-info`;
- `allow-origin: *`.

**La cabecera propia no rompe el cliente.** La cabecera `Server` es `cloudflare` y no deja ver la versión de PostgREST. Por eso b) se mide con dos versiones mayores.

**b) `request.headers` y el rol, medidos en local** con PostgreSQL 17 desechable y PostgREST **13.0.8 y 16.4**. Son binarios oficiales de macOS, con el sha256 verificado contra el digest publicado en la release: `c97a913d…886a` y `5720fbde…0776`.
- **Mismo disparador que d):** AFTER, fila a fila, en una función DEFINER con `search_path` vacío.
- **La 12.x no se usó:** sus binarios de macOS no tienen sha256 publicado.
- **Resultado idéntico en las dos versiones**, fila por fila:

| Petición | HTTP | `x-sim-cliente` | `x-client-info` | Rol del JWT | `current_setting('role')` | `current_user` |
|---|---|---|---|---|---|---|
| INSERT, authenticated, `x-sim-cliente: etapa1-7` | 201 | `etapa1-7` | — | authenticated | authenticated | postgres |
| UPDATE, authenticated, `x-client-info: sim-etapa1/7` | 204 | `sin-firma` | `sim-etapa1/7` | authenticated | authenticated | postgres |
| DELETE, authenticated, sin cabecera | 204 | `sin-firma` | — | authenticated | authenticated | postgres |
| INSERT, anon, sin cabecera | 201 | `sin-firma` | — | anon | anon | postgres |
| INSERT, service_role, sin cabecera | 201 | `sin-firma` | — | service_role | service_role | postgres |
| INSERT, `X-Sim-Cliente` en mayúsculas | 201 | `etapa1-8` | — | authenticated | authenticated | postgres |

- **Seis filas en el registro para seis peticiones.**
- **Controles de permisos:**
  - un alumno no puede leer el registro (`GET` → 403);
  - no puede llamar a la función del disparador (`/rpc` → 404).
- **El primer intento con la 13.0.8 dio 503 en todo.** Fallaba el instrumento, no PostgREST:
  - la 13.x empieza a escuchar antes de cargar la caché del esquema, y la espera daba por bueno un 503;
  - el contador contaba como una fila una salida vacía.

  Se corrigió el script. Las dos versiones se repitieron con él, y la 16.4 dio una salida idéntica a la de antes. Las tres salidas se conservan.
- **Conclusión: b) cerrado.** El **plan B (`x-client-info`) no hace falta**. Queda medido como respaldo.

**c) Qué guarda `sim_escrituras_v0`** (sustituye a las columnas de d).
- **Columnas:** `session_id`, `user_id`, `tabla`, `operación`, `cliente`, `en`, **`rol_jwt`** y **`rol_guc`**:
  - `rol_jwt` = `current_setting('request.jwt.claims', true)::json->>'role'`;
  - `rol_guc` = `current_setting('role', true)`.
- **No se guarda `current_user`.** Dentro de la función DEFINER vale siempre el dueño (`postgres` en las 6 filas), escriba quien escriba.

**d) Recuento de s10 y de la guarda del corte (k.1 e–f).**
- **Una escritura «sin firma de alumno»** es una fila con `rol_jwt` ∈ {`authenticated`, `anon`} **y** `cliente = 'sin-firma'`. Solo estas filas reinician la ventana de 72 h (s10) y hacen abortar el corte (f).
- **Las filas de `service_role`** (el hub, el wipe, `challenge/create` y `challenge/advance`) se registran y **s10 las lista aparte**. **No reinician la ventana.**
- **Anomalía:** una fila con `rol_jwt IS DISTINCT FROM rol_guc`, típicamente una escritura por SQL directo, como desde el editor de Supabase.
  - **Dentro de la ventana de 72 h bloquea el certificado** (decisión CTO, 12-oct). s10 lista cada anomalía con su **hora, tabla y operación**.
  - **Para certificar, cada anomalía tiene que estar justificada por escrito por el CTO**, con un enlace a un SQL aplicado y anotado en `sql/APLICADOS.md` **con esa hora**.
  - **Si alguna no se puede justificar, la ventana de 72 h vuelve a empezar desde esa anomalía.**
  - **Después de la hora del certificado, cualquier anomalía hace abortar el corte** (f), esté justificada o no.
  - La comparación es **`IS DISTINCT FROM`, no `<>`**, porque con `<>` una fila con un `null` no se marca (ver k.3.10).

**e) 2d, al runbook de la etapa 1.** La comprobación de punta a punta se hace **con el sí de Ramón**, en una cuenta de prueba:
1. una escritura desde el cliente de la etapa 1 desplegado;
2. leer el registro como dueño y ver `etapa1-<versión>` y `authenticated` en las dos columnas de rol.

No se hace antes ni sin ese sí.

### k.3 (continuación) · casos añadidos tras k.4

10. **Rol del JWT ≠ `current_setting('role')`.** Por PostgREST no puede pasar: PostgREST fija el rol a partir del JWT firmado, y las 6 filas medidas coinciden. **Una fila así viene de otro camino.** Medido en local (`sin-postgrest.sh` / `.txt`):
    - **SQL directo del dueño** (el editor de Supabase): `rol_jwt` null y `rol_guc` `none`;
    - **`SET ROLE authenticated` sin JWT:** null / `authenticated`;
    - **un JWT puesto a mano sin `SET ROLE`:** `authenticated` / `none`.

    Las tres filas salen con `cliente = 'sin-firma'`. ~~Ninguna cuenta como «sin firma de alumno»…~~ **Corregido en l.4 (S4R3-04):** la primera y la segunda no cuentan como «sin firma de alumno» (rol `none` y `rol_jwt` null). **La tercera sí** (`rol_jwt = authenticated`, sin cabecera): **cuenta en los dos predicados**, que son independientes, y justificar la anomalía no la exime.

    **Consecuencias, por la regla del CTO tal como está escrita:**
    - **Una escritura a mano en `sim_sessions` o `sim_trades` desde el editor después del certificado hace abortar el corte.**
      - Es lo buscado: una escritura fuera del flujo conocido.
      - Implica que en la ventana de 72 h no se escribe a mano en esas tablas.
      - Las migraciones sim-004a-preparatoria y sim-004b no escriben filas. **Si una llegara a escribirlas,** chocaría con esta regla, y habría que decidir antes de escribirla.
    - **Una fila así antes del certificado:** bloquea el certificado hasta que el CTO la justifica por escrito, con un enlace a un SQL anotado en APLICADOS con esa hora. Si no se puede justificar, la ventana de 72 h vuelve a empezar desde esa anomalía (k.4 d).

    **Oráculos del ensayo (etapa 4):**
    - los tres casos medidos dan anomalía y aborto;
    - **mutante `<>` en lugar de `IS DISTINCT FROM`:** el primer caso y el segundo dejan de detectarse → rojo;
    - **mutante «solo cuenta `authenticated`»:** el `anon` sin firma pasa → rojo;
    - **tres anomalías por SQL directo**, comparando siempre con `IS DISTINCT FROM`:
      - una **justificada**, con su SQL en APLICADOS a esa hora → **no reinicia la ventana**;
      - una **sin justificar** → **la ventana vuelve a empezar desde ella**;
      - una **posterior al certificado** → **el corte aborta**;
    - **mutante «la justificación también vale después del certificado»:** la tercera no aborta → rojo;
    - **mutante «la ventana se reinicia desde el certificado, no desde la anomalía»:** la segunda no da la hora correcta → rojo.
11. **Una pestaña sin sesión iniciada** escribe como `anon`. Hoy `anon` **no tiene ningún grant** sobre `sim_sessions` ni `sim_trades`: solo `authenticated` y `service_role` (s04 del 10-oct, filas 186–189). Además, la política exige `auth.uid() = user_id`. Así que no debería aparecer ninguna fila. Si aparece, cuenta como «sin firma de alumno», como decidió el CTO.

## l · tras Astra ronda 3

**Revisión:** `revisiones-suite/2026-10-12-astra-sim-004-diseno-3.md`, sobre `de0eba4`.
- **Resultado:** NO, por S4R3-01 y S4R3-02. S4R3-01: un COMMIT tardío lleva una hora anterior al certificado. S4R3-02: que pasen 72 h no concilia un cierre partido.
- **Decisión del CTO (12-oct): se deja de DETECTAR y se pasa a CERRAR**, como con el PDF.
- **Esta sección prevalece sobre k.1 e–f y sobre k.4.** Sigue vigente de k.4 lo que no choca con ella: las medidas a–b, las columnas de rol (c) y el predicado de anomalía (d). **Cómo se tratan ahora las anomalías: l.2.**

### l.1 Puerta cerrada a los clientes sin firma (sim-004a-preparatoria, en dos pasos)

**a) Paso «registro»:** el mismo de k.1 d y k.4 c. Son disparadores AFTER, fila a fila, en `sim_sessions` y `sim_trades`, sobre una función DEFINER con `search_path` vacío.
- **Cada fila guarda:**
  - `session_id`, `user_id`, `tabla`, `operación` y `en` (`clock_timestamp()`);
  - `cliente`, `rol_jwt` y `rol_guc`;
  - **el id de transacción** (`pg_current_xact_id()::text`);
  - **la lista de columnas cambiadas, por nombre** (en un UPDATE, las de `NEW IS DISTINCT FROM OLD`; en un INSERT o un DELETE, la fila entera) **→ m.4: «la fila entera» = solo la lista de nombres de columnas, nunca el JSON del trade**;
  - **solo dos valores:**
    - el **delta de saldo** (`NEW.balance − OLD.balance`) en un UPDATE de `sim_sessions`;
    - el **id del trade y su `pnl`** en un INSERT o DELETE de `sim_trades`.
  - En un DELETE, los identificadores salen de `OLD`.
- **No se guardan** cabeceras completas, el JWT ni texto libre.

**b) Paso «puerta»:** un disparador **BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW** en `sim_sessions` y `sim_trades`.
- **Qué rechaza:** con una excepción de prefijo fijo, toda escritura cuyo rol del JWT sea `authenticated` o `anon` y que **no traiga `x-sim-cliente`**:
  - las dos lecturas se normalizan como dice l.4: ausente y cadena vacía son lo mismo;
  - la puerta comprueba que la cabecera exista, no qué versión trae. La vigencia de la versión sigue en S4-01b.
- **Quién pasa:** `service_role` y el dueño. Sus caminos se tratan en i y j.
- **Efecto:** con la puerta activa, un cliente antiguo **no puede escribir ninguna de las dos mitades** de un cierre, así que no se pueden crear cierres partidos nuevos.

**c) Activación de la puerta.** Con la puerta activa **no hay ventana de 72 h ni certificado por hora**. Los pasos:
1. **s10 sin escrituras «sin firma de alumno» en las últimas 72 h.** Es un margen operativo, no una prueba.
2. Se activa la puerta **en cuanto se cumple el margen de 72 h tras instalar el registro, sin esperar al corte** (decisión CTO, 12-oct). Desde ese momento un cliente antiguo no puede escribir, y el residual de l.3 y l.6.1 deja de ser posible.
3. **s10 se repite** cuando hayan pasado **al menos 2 × el `statement_timeout` efectivo** de `authenticated` y de `anon`:
   - ese valor se lee del catálogo con una consulta de solo lectura en la etapa 1 (`pg_roles.rolconfig` / `pg_db_role_setting`, con el de la base y el del servidor de respaldo). No se supone;
   - **si sale 0 (sin límite), la regla no se puede aplicar: se para y decide el CTO.**

   Esa segunda lectura **ve cualquier COMMIT tardío** de antes de la puerta (S4R3-01). Lo que aparezca en ella se clasifica por l.2: no reinicia nada, pero tampoco se ignora.

### l.2 Conciliación por parejas, sin caducidad (S4R3-02)

s10 empareja **todas** las escrituras «sin firma de alumno» (k.4 d) registradas **desde la instalación del registro**, sin límite de tiempo, en la misma sesión.

**Cómo se empareja:**
- Un UPDATE de `sim_sessions` con delta *d* casa con un INSERT de trade de `pnl` *p* cuando:
  - **|d − p| ≤ 0,01**, comparado en **céntimos enteros** (`numeric`, nunca float);
  - y las dos filas están a **10 s o menos** una de otra (`en`, en cualquier orden).

  El cierre total escribe primero el trade y luego el saldo (`useTradingActions.js:49`, `:67`). El parcial escribe los dos a la vez (`_SessionInner.js:1949–1950`).
- **Es uno a uno:** cada fila se usa una sola vez, por orden de tiempo dentro de la sesión, sin reutilizar.
- **Cualquier UPDATE sin firma de alumno de la sesión puede emparejarse con un trade, sea cual sea su delta**, dentro de la tolerancia y de los 10 s (decisión CTO, 12-oct). Por ejemplo, el cierre total a break-even: un trade de pnl 0 y un UPDATE con delta 0 que cambia `last_timestamp`. **La clasificación de abajo solo se aplica a lo que quede sin pareja.**
- **La tolerancia solo decide qué casa con qué.** Si falta un trade, siempre queda una mitad sin pareja.
- **Solo se emparejan filas «sin firma de alumno» entre sí.** Las de `service_role`, las firmadas y las del dueño no sirven de pareja.

**Clasificación** (decisión CTO, 12-oct):

| | Escritura sin firma de alumno |
|---|---|
| **Incidencia** | cambio de saldo (delta ≠ 0) sin pareja |
| **Incidencia** | UPDATE que no cambia nada económico, ni `last_timestamp` ni `timeframe` (no se distingue de un parcial de pnl 0), y que no tiene un INSERT de trade con `pnl` dentro de la tolerancia en la misma sesión en 10 s |
| **Incidencia** | INSERT de trade sin pareja |
| **Incidencia** | DELETE de trade sin el DELETE de su sesión **en la misma transacción** (mismo id de transacción) |
| **Incidencia** | INSERT de sesión con `balance` distinto de `capital` |
| No es incidencia | delta 0 que cambia `last_timestamp` o `timeframe` (guardado, pausa `:1104`, salida `:1363`) |
| No es incidencia | escritura sin columnas económicas (guardado periódico `usePairData.js:25`, cambio de TF `:684`/`:1751`) |
| No es incidencia | INSERT de sesión con `balance = capital` (`dashboard.js:183`) |
| No es incidencia | DELETE de sesión con sus trades en la misma transacción (`dashboard.js:135`; FK `ON DELETE CASCADE`, s04 fila 134) |

**Las incidencias no caducan.** Solo se cierran con una **resolución escrita del CTO**:
- enlazada a la fila concreta del registro;
- acordada con Ramón y con el alumno.

**El corte exige cero incidencias abiertas.** El DO del corte lo vuelve a comprobar **bajo el `LOCK`**, leyendo **el registro entero**, no por hora.

**Anomalías** (predicado de k.4 d; decisión CTO, 12-oct; sustituye a la ventana y al certificado de k.4 d). Se tratan como las incidencias:
- **no caducan;**
- se cierran solo con una **justificación escrita del CTO**, enlazada a la fila concreta del registro y a un SQL aplicado y anotado en `sql/APLICADOS.md` **a esa hora**;
- **el corte exige cero anomalías sin justificar**, comprobado bajo el `LOCK` leyendo el registro entero.

**Una escritura desde el editor sin justificar aborta el corte**, aunque sea justo antes de él. Anomalía y «sin firma de alumno» siguen siendo predicados independientes (l.4): justificar uno no cierra el otro.

**Base medida de la tolerancia:** el cliente redondea por separado `saldo + pnl` y `pnl`. Con el `realizePnl` real, 1.512–1.551 de cada 200.000 cierres (≈ 0,8 %) difieren en exactamente 1 céntimo. Medida en `revisiones-suite/2026-10-12-sim-004-l-emparejamiento/`.

### l.3 Lo anterior al registro

**Residual:** un cierre cuyas dos mitades se escribieron **antes** de instalar el registro.
- Es un defecto de v0 que **ya existe hoy**: también lo produce un fallo de red, porque las dos escrituras del parcial no se esperan ni se reintentan.
- El cambio no lo crea. Se documenta como **riesgo residual** y el registro no lo ve.

**Residual aceptado por el CTO (12-oct): dos parciales del mismo pnl (±0,01) en menos de 10 s que pierden cada uno una mitad distinta** (l.6.1).
- Exige dos fallos simultáneos de un cliente antiguo, y el saldo queda correcto.
- **Se acota en el tiempo:** la puerta se activa en cuanto se cumple el margen de 72 h tras instalar el registro, sin esperar al corte (l.1 c). Desde entonces no es posible.

**Los cierres a caballo de la instalación sí se detectan**, porque la mitad posterior queda sin pareja:

| Caso | Mitad registrada | Resultado |
|---|---|---|
| UPDATE antes, INSERT después | INSERT de trade sin UPDATE | incidencia |
| INSERT antes, UPDATE después | delta ≠ 0 sin trade | incidencia |
| ±100: los dos UPDATE antes, las dos inserciones después | dos INSERT sin UPDATE | dos incidencias |

### l.4 Medios y bajos de Astra

- **S4R3-03, el contexto vacío:**
  - `request.headers` y `request.jwt.claims` se normalizan **antes** del cast (`nullif(current_setting(…, true), '')::json`), en el registro y en la puerta;
  - **el contexto ausente es anomalía**;
  - **nunca se tragan excepciones**: ni un `EXCEPTION WHEN others` que silencie el registro, ni uno que abra la puerta.

  **Controles:** en la misma conexión, después de `SET LOCAL` + COMMIT y después de ROLLBACK, una escritura del dueño sin contexto se registra (como anomalía) y no falla.
- **S4R3-04:** se corrige la narración de k.3.10. **«Anomalía» y «sin firma de alumno» son dos predicados independientes**, y justificar uno no exime del otro.
- **Permisos:** se revocan **explícitamente** los grants por defecto de `PUBLIC`, `anon`, `authenticated` y `service_role`:
  - en la tabla de registro, su secuencia y las funciones del registro y de la puerta;
  - porque «no conceder» no basta con los privilegios por defecto de producción (s06, `sql/APLICADOS.md:96`).

  El ensayo comprueba con la ACL efectiva SELECT, INSERT, UPDATE, DELETE, TRUNCATE, la secuencia y el EXECUTE. Un 404 de la RPC no basta.

### l.5 Ensayo de las etapas 1 y 4 (ampliado)

**Casos:**
- **C1 de Astra, el COMMIT tardío:** el escritor se detiene después del AFTER y antes del COMMIT; s10; COMMIT. **La segunda s10 lo ve** y lo clasifica.
- **C2, más de 72 h** con el cliente nuevo en otro dispositivo → **la incidencia sigue abierta y bloquea el corte**.
- **±100 y delta 0 sin trade** → incidencias.
- **Puerta activa:**
  - las dos mitades de un cliente antiguo, rechazadas con la excepción prefijada;
  - el cliente con firma pasa;
  - `service_role` y el dueño pasan.
- **La tolerancia:**
  - los 200.000 cierres con el `realizePnl` real → **0 incidencias falsas**;
  - con la tolerancia **siguen saliendo** los ±100, el delta 0 sin trade, y un trade que falta junto a otro de la misma sesión cuyo pnl difiere 1 céntimo de su delta.
- **La clasificación de l.2, fila por fila:**
  - pausa, salida, guardado y TF → nada **(→ m.1: la pausa y la salida mencionan `balance`; sin pareja son dudosos. El guardado y el TF siguen dando nada)**;
  - borrado de sesión en cascada → nada;
  - DELETE de trade suelto → incidencia;
  - sesión creada con saldo distinto del capital → incidencia;
  - UPDATE sin cambios sin trade de pnl 0 → incidencia; con él → nada.
- **S4R3-03:** misma conexión tras `SET LOCAL` + COMMIT y tras ROLLBACK.
- **El cierre total a break-even de un cliente antiguo:**
  - completo (trade de pnl 0 y UPDATE de delta 0 que cambia `last_timestamp`) → **0 incidencias**;
  - ~~**sin su trade** → **0 incidencias**…~~ **Corregido en m.1 (S4R4-01):** sin su trade → **dudoso, que es una incidencia**. Su UPDATE menciona `balance`, tiene delta 0 y no tiene pareja;
  - **el trade de pnl 0 sin ningún UPDATE en 10 s** → **incidencia**.
- **Anomalías:**
  - una escritura desde el editor **justificada** (fila + SQL en APLICADOS a esa hora) → el corte sigue;
  - una **sin justificar**, justo antes del corte → **el corte aborta** bajo el `LOCK`;
  - una fila que es a la vez anomalía y «sin firma de alumno» (tercer caso de k.3.10): justificar la anomalía **no** cierra la incidencia.

**Mutantes → rojo:**
- «las incidencias caducan a 72 h»;
- «comparar solo `en > hora`»;
- «la puerta solo registra»;
- **igualdad exacta en lugar de la tolerancia:** unas 1.500 incidencias falsas en los 200.000;
- «emparejar con reutilización»;
- «solo emparejan los UPDATE con delta ≠ 0»: el cierre a break-even da una incidencia falsa;
- «las anomalías caducan» o «solo cuentan las de después de una hora»;
- «el DELETE de trade sin mirar la transacción»;
- comparación en float.

### l.6 Autorrevisión adversaria de l

1. **Dos parciales iguales en la misma sesión en menos de 10 s.**
   - **Si se pierde uno de los INSERT:** quedan dos UPDATE y un INSERT, y el emparejamiento uno a uno deja un UPDATE sin pareja → incidencia. Da igual cuál se empareje: **el recuento se conserva** (sin pareja ≥ |UPDATE − INSERT| por sesión).
   - **Hueco que el diseño no cierra:** si se pierden **el INSERT de uno y el UPDATE del otro**, con pnl dentro de 0,01, las dos mitades supervivientes casan entre sí.
     - En dinero, el saldo y los trades cuadran.
     - **Falta un trade en el historial**, y por los datos no se distingue.
     - **Riesgo residual aceptado por el CTO (12-oct)** (l.3). Exige dos fallos simultáneos de un cliente antiguo, y el saldo queda correcto.
     - **Acotado:** solo es posible entre la instalación del registro y la activación de la puerta, que se hace en cuanto se cumple el margen de 72 h, sin esperar al corte (l.1 c).
2. **Reloj.**
   - `en` sale del reloj del servidor de la base, el mismo para las dos mitades, así que no influye el reloj del alumno.
   - **Es la hora del disparador, no la del COMMIT.** Para emparejar sirve, porque las dos mitades están en el registro, confirmen cuando confirmen. **Para la puerta, la hora no se usa** (l.1 c).
   - **Si la latencia entre las dos mitades pasa de 10 s:** sobre todo en el cierre total, que espera el INSERT antes del UPDATE. Da una incidencia **falsa**, que resuelve el CTO. Nunca una oculta.
3. **El DELETE.**
   - El borrado de sesión del cliente arrastra sus trades por la FK en cascada **en la misma transacción**, así que comparten el id. El DELETE de trade suelto no existe en v0 y por eso es incidencia.
   - El hub y el wipe borran con `service_role` y no cuentan.
   - Las filas de DELETE se identifican por `OLD`.
4. **`service_role` mezclado.**
   - `advance.js` cambia el saldo y el estado de la sesión madre con `service_role`. Esas filas no emparejan ni cuentan.
   - Si después **una pestaña antigua de la madre** pausa, escribe `balanceRef.current`, el saldo de antes, con un delta ≠ 0 sin pareja → **incidencia, y es real**: es una pestaña vieja que pisa el saldo.
   - **Un INSERT de trade de `service_role` nunca tapa la mitad que le falta a un cliente antiguo**, porque solo se emparejan filas sin firma de alumno entre sí.
5. **La puerta y el SQL directo.**
   - Un `SET ROLE authenticated` sin JWT (k.3.10, segundo caso) tiene `rol_jwt` null, así que **pasa la puerta**. Hace falta acceso de dueño, no es un cliente, y el registro lo marca como anomalía.
   - Un JWT puesto a mano con rol `none` (tercer caso) **no pasa** si no trae la cabecera.
6. **Lo que ve el alumno con la puerta activa.**
   - El cliente antiguo trata los errores con `.catch(()=>{})`. **La pantalla muestra el cierre, pero no se guarda nada**, y al recargar desaparece.
   - Ya pasa hoy con cualquier fallo; la puerta lo hace sistemático para las pestañas viejas.
   - **El aviso a los alumnos** (recargar antes de la puerta) es una tarea de Ramón del runbook de la etapa 1.
7. **La activación drena.**
   - Crear el disparador de la puerta toma un bloqueo `SHARE ROW EXCLUSIVE`, que espera a las escrituras en vuelo sobre la tabla.
   - Así, al confirmarse la puerta, las escrituras empezadas antes ya se han confirmado o abortado.
   - **No sustituye** a la segunda s10 tras 2 × `statement_timeout` (l.1 c): la refuerza, y **se comprueba en el ensayo con C1**. No se da por hecho.
8. **El volumen de la conciliación.** s10 empareja el registro entero desde la instalación. Con 5 alumnos y el volumen de k.3.7 es poco, pero se mide en la etapa 1 (filas por día) junto con el tiempo de s10.

## m · tras Astra ronda 4

**Revisión:** `revisiones-suite/2026-10-12-astra-sim-004-diseno-4.md`, sobre `513143b`.
- **Resultado:** S4R3-01 cerrado (la puerta drena, medido por Astra). **NO solo por S4R4-01:** un cierre de pnl 0 perdido, con **un solo fallo**, se clasificaba como guardado.
- **Esta sección prevalece sobre l.2, l.1 c y l.3 donde choquen.** Correcciones hechas en su sitio:
  - el oráculo del cierre a break-even «sin su trade» (antes D:1211);
  - «pausa y salida → nada» en l.5;
  - «la fila entera» de l.1 a (antes D:1089).

### m.1 S4R4-01 · Los UPDATE que mencionan `balance` (decisión CTO, 12-oct)

**Regla:** todo UPDATE de `sim_sessions` sin firma de alumno que cumpla las tres condiciones es **«dudoso»**:
- tiene **delta 0**;
- **menciona `balance`**: la columna es destino del `SET`, cambie o no su valor;
- se queda **sin pareja** tras el emparejamiento de l.2.

**Da igual que cambie `last_timestamp`.**

**Un dudoso es una incidencia:**
- **no caduca** y **bloquea el corte** hasta que se resuelve por escrito;
- **la resolución de los dudosos de delta 0** puede ser «sin efecto económico; posible cierre de pnl 0 perdido, aceptado», **con el visto bueno de Ramón, por sesión** (alcance en m.5.4).

**El emparejamiento ya no da un conjunto por conciliado solo porque le sobre una fila «inocua».** Si sobra una fila que menciona `balance`, es dudosa.

**Siguen sin ser incidencia los UPDATE que NO mencionan `balance`:**
- guardado periódico `usePairData.js:25`: `{last_timestamp, timeframe}`;
- cambio de TF `:684`/`:1751`: `{timeframe}`.

El resto de la tabla de l.2 no cambia.

**Cómo sabe el disparador que la sentencia mencionó `balance`: medido** en `revisiones-suite/2026-10-12-sim-004-m-menciona-balance/` (script, salidas, LEEME y SHA256SUMS).
- **Entorno:** PostgreSQL 17.11 local, PostgREST 16.4 y 13.0.8 (los binarios verificados de k.4) y postgrest-js 2.102.1. Este cliente manda `.update()` como un PATCH con el cuerpo tal cual, sin `?columns=`. Nada de producción.
- **El mecanismo son dos disparadores en `sim_sessions`:**
  - **A, `AFTER UPDATE … FOR EACH ROW`:** el registro de l.1 a, con `menciona_balance = false`;
  - **B, `AFTER UPDATE OF balance … FOR EACH ROW`:** su nombre ordena **después** de A, porque los disparadores del mismo evento se disparan por orden alfabético. Marca `menciona_balance = true` en la última fila de A con la **misma transacción** (`pg_current_xact_id()`) y la **misma sesión**. Si no encuentra exactamente una fila, lanza una **excepción** (sin tragarla, l.4).
- **`UPDATE OF col` se dispara cuando la columna es destino del `SET`, cambie o no su valor.** OLD/NEW no lo pueden saber: con el mismo valor no hay diferencia.
- **Resultado, idéntico en las dos versiones:**

| Escritura | Delta | Columnas cambiadas | `menciona_balance` |
|---|---|---|---|
| PATCH `{balance}` mismo valor: parcial pnl 0, `_SessionInner.js:1949` | 0 | {} | **true** |
| PATCH `{balance, last_timestamp}`: pausa, `:1104` | 0 | {last_timestamp} | **true** |
| PATCH `{last_timestamp, balance, timeframe}`: salida, `:1363` | 0 | {last_timestamp} | **true** |
| PATCH `{balance, last_timestamp}`: cierre total pnl 0, `useTradingActions.js:67` | 0 | {last_timestamp} | **true** |
| PATCH `{last_timestamp, timeframe}`: guardado, `usePairData.js:25` | 0 | {last_timestamp} | false |
| PATCH `{timeframe}`: TF, `:684` | 0 | {timeframe} | false |
| PATCH `{balance}` con pnl 12,34 | 12,34 | {balance} | true |
| psql: una sentencia sobre 3 filas `SET balance = balance` | 0 ×3 | {} | true ×3 |
| psql: una sentencia sobre 2 filas `SET timeframe` | 0 ×2 | {timeframe} | false ×2 |
| psql: una transacción, 1.ª sin `balance` y 2.ª con `balance`, misma sesión | 0, 0 | {timeframe}, {} | false, true |

- **18 filas para 18 escrituras.**
- **Control:** sin el disparador A, B no encuentra la fila → la escritura falla (código 1, `sim_registro: marca_balance sin fila de registro`).
- **Confirma lo que avisó Astra:** la lista de columnas cambiadas **no distingue** la pausa del guardado (`{last_timestamp}` en los dos). `menciona_balance` sí los distingue.

**Columna nueva en el registro:** `menciona_balance` (solo en los UPDATE de `sim_sessions`).

**Oráculos:**
- **los dos casos de Astra:**
  - el cierre total con el INSERT fallido resuelto con `{error}` → **dudoso**;
  - el parcial perdido junto a un cierre total correcto (el UPDATE del parcial consume el trade del total, y sobra el UPDATE del total, que menciona `balance`) → **dudoso**;
- un cierre de pnl 0 completo y aislado → ninguna;
- un guardado sin `balance` → ninguna;
- **la pausa o la salida sin pareja → dudoso.**

**Mutantes → rojo:**
- «ignorar el delta 0 con cambio de tiempo»;
- «dar por conciliado lo que solo deja filas inocuas»;
- «`menciona_balance` sacado de la lista de columnas cambiadas»: la pausa sale como guardado y el caso 1 de Astra pasa;
- «B ordenado antes que A»: excepción en cada UPDATE con `balance`, o una marca en la fila equivocada.

### m.2 Causa raíz, documentada: el cliente v0 ignora `{error}`

- **Cierre total, `useTradingActions.js:49–68`:** hace `await` del INSERT, pero no mira `error`. Una respuesta `{error}` de Supabase no rechaza la promesa, así que el código sigue hasta el UPDATE de la línea 67.
- **Parcial `_SessionInner.js:1949–1965`, pausa `:1104` y salida `:1363`:** usan `.then(()=>{}).catch(()=>{})` o un `try` sin mirar el resultado.

Es un **defecto de v0 que ya existe hoy**.

**El cierre atómico de la etapa 1 lo elimina para el cliente nuevo:**
- la etapa 1 **comprueba `error` en cada escritura**;
- si falla, **revierte la pantalla y avisa**.

**Oráculo:** una respuesta `{error}` → no queda ni trade ni saldo cambiado, en pantalla ni en la base. **→ n.5:** un resultado **incierto** (respuesta perdida, error de transporte) **no** prueba que no se guardara: el cliente vuelve a leer el estado antes de afirmarlo.
- **Mutante:** «comprobar solo excepciones (`catch`)» → `{error}` deja el trade en pantalla → rojo.

### m.3 S4R4-02 · Un único criterio para la puerta (sustituye a l.1 c, pasos 1–2)

**Cuándo se activa:** en **lo primero que ocurra** de:
- **(a)** 72 h seguidas sin escrituras «sin firma de alumno»;
- **(b)** 7 días desde la instalación del registro.

**Es seguro activarla con pestañas antiguas vivas:**
- la mitad anterior de un cierre queda registrada y sale como incidencia o dudoso;
- la posterior se rechaza.

**Se registran:**
- la **hora del COMMIT de activación**, no la de lanzar la orden;
- el **`statement_timeout` usado** en la segunda s10 (l.1 c, paso 3, que sigue vigente).

**La activación crea los disparadores de la puerta dentro de una transacción.** Esa es la barrera de drenaje que midió Astra: `CREATE TRIGGER` espera al escritor en vuelo. **Nada de indicadores de configuración leídos sin bloqueo.**

**Exposición máxima de los residuales de l.3 y l.6.1: 7 días desde la instalación del registro.**

### m.4 Lo demás de Astra

- **l.1 a, «la fila entera»** = solo la **lista de nombres de columnas**, nunca el JSON del trade (con `notes`). Se comprueba al escribir la migración.
- **Las revocaciones** (l.4) van **dentro de la misma migración atómica**, antes de cualquier actividad. El registro ya guarda delta y pnl, que son datos económicos.
- **Volver a ejecutar sim-004a-preparatoria no puede volver a abrir la puerta.**
  - Su comprobación de idempotencia conoce los dos estados: **registro instalado**, y **registro + puerta activa**.
  - En el segundo estado, la reejecución deja la puerta como está y lo verifica.
  - **Ensayo:** reejecutar con la puerta activa → la escritura de un cliente antiguo sigue rechazada.

### m.5 Autorrevisión adversaria de m

1. **Cómo detecta el disparador que la sentencia mencionó `balance`.**
   - **Depende de dos cosas de PostgreSQL, las dos medidas:**
     - `UPDATE OF` se dispara si la columna es destino del `SET`, aunque no cambie;
     - el orden alfabético de los disparadores del mismo evento.
   - **Lo que lo rompería, y cómo se caza:**
     - **otro disparador** que cambie `balance` en un BEFORE: no activa `UPDATE OF`. Hoy el único disparador de `sim_sessions` es `trg_enforce_sim_session_limit`, BEFORE **INSERT** (s04 del 10-oct, fila 164), y sim-003 no crea ninguno. El ensayo de la etapa 1 lo vuelve a comprobar en el catálogo;
     - **un cambio de nombre** que invierta el orden de A y B: lo caza el mutante de m.1. ~~…y la excepción de B no deja pasar el fallo en silencio~~ **Corregido en n.5 (S4R5-02):** la excepción de B **no** es un detector universal. Si en la misma transacción y sesión ya hay una fila anterior de A, B la marca y no falla. **Lo que impide ese catálogo es la guarda final (m.5.5)**, no B;
     - **un INSERT … ON CONFLICT DO UPDATE** que mencione `balance`: también dispara `UPDATE OF`. El v0 no lo usa con `sim_sessions`;
     - **que PostgREST pase a mandar todas las columnas** en el SET (por ejemplo, con `?columns=`): **todas las pausas y guardados mencionarían `balance`**. Da más dudosos, nunca menos, y el ensayo con PostgREST lo comprobaría.
   - **Por qué B busca por transacción y sesión, y no por `currval`:** medido con una sentencia que toca 3 filas y con dos sentencias sobre la misma sesión en una transacción. La búsqueda funciona tanto si los disparadores se disparan A1-B1-A2-B2 como A1-A2-B1-B2.
2. **La pausa frente al cierre.**
   - La pausa y la salida mencionan `balance` (`balance: balanceRef.current`). **Cada pausa o salida de un cliente antiguo sin pareja es un dudoso.**
   - **Es lo decidido:** con los datos que hay no se distinguen de un cierre total de pnl 0 cuyo INSERT falló. La pausa (`:1104`) y el cierre total (`:67`) mandan exactamente el mismo cuerpo: `{balance, last_timestamp}`.
   - **Ruido esperado:** una fila por pausa o salida de pestaña antigua, solo hasta la puerta (≤ 7 días, m.3). Con 5 alumnos y la resolución por sesión es manejable. Se mide en la etapa 1, con s10.
   - **Si la pausa consume el trade de pnl 0 de un cierre** (están a menos de 10 s), sobra el UPDATE del cierre, que menciona `balance` → dudoso. **Sea cual sea la pareja que se elija, sobra un dudoso.**
3. **Dos dudosos en la misma sesión.**
   - **El recuento:** las filas que mencionan `balance` y quedan sin pareja son al menos (UPDATE que mencionan `balance`) − (trades). Si se pierde un trade, sobra uno más.
   - **Con la regla de m.1 ya no hay ninguna «fila inocua» donde esconderlo:** solo se libran los UPDATE que no mencionan `balance`, y esos no los escribe ningún cierre del v0. Si uno de esos consume un trade, el UPDATE del cierre queda sin pareja → dudoso.
   - **Sigue residual solo el cruce de l.6.1:** el INSERT de uno y el UPDATE del otro, con pnl iguales. Acotado a 7 días por m.3.
4. **La resolución por sesión.**
   - **Confirmado por el CTO (12-oct):** cada resolución **enumera los ids de registro concretos** que cubre, y **nunca cubre los que aparezcan después**, por ejemplo uno visto en la segunda s10 (l.1 c) o una pausa posterior. **Un dudoso nuevo en la misma sesión necesita su propia resolución.** Si no, una resolución dada a mitad de la ventana taparía un cierre perdido después.
   - **Ensayo:** una resolución a mitad de la ventana y, después, un cierre perdido en la misma sesión → **el posterior sigue abierto y bloquea el corte**.
   - **Mutante «resolución por sesión sin lista de ids»** → rojo.
   - **Solo cubre dudosos de delta 0.** Un delta ≠ 0 sin pareja sigue necesitando su resolución fila por fila (l.2).
   - **Una resolución de dudoso no cierra una anomalía** (l.4, dos predicados).
5. **El orden de A y B queda fijado por su nombre.**
   - Los nombres exactos de los dos disparadores se fijan en la migración. **La guarda final de sim-004a-preparatoria comprueba que existen los dos, con esos nombres exactos**, y que B ordena después de A (`UPDATE OF balance` en B y `AFTER UPDATE` en A, los dos `FOR EACH ROW` y con su función).
   - **Volver a ejecutar la migración nunca deja solo uno de los dos.** Los crea o los reemplaza juntos, dentro de la misma transacción, y la guarda final aborta si falta cualquiera de ellos.
   - **Ensayo:**
     - reejecutar la migración → siguen los dos;
     - quitar B o renombrarlo para que ordene antes de A → la guarda final aborta, **también con una fila anterior de A en la misma transacción y sesión, donde B no falla (n.5)**;
     - **mutante «guarda que solo mira que exista uno»** → rojo.
6. **Lo que m no cambia:**
   - la tolerancia de 0,01 y los 10 s;
   - el emparejamiento uno a uno, en el que cualquier UPDATE puede ser pareja (l.2);
   - las anomalías (l.2);
   - la lectura del registro entero bajo el `LOCK`.

   **La lectura bajo el `LOCK` cuenta ahora también los dudosos sin resolver.**

## n · tras Astra ronda 5

**Revisión:** `revisiones-suite/2026-10-12-astra-sim-004-diseno-5.md`, sobre `dace79f`.
- **Resultado:** los dos casos de S4R4-01, la marca de `balance`, los permisos y los controles con varias filas pasan. **NO solo por S4R5-01:** una resolución antigua puede tapar un cierre posterior a través de una pareja nueva.
- **El caso de Astra:**
  - `u_A` se resuelve;
  - después llegan `u_B` (cuyo INSERT falla) e `i_A`, retrasado;
  - `u_B` casa con `i_A` y solo sobra `u_A`, ya resuelto → **cero abiertas, y falta el trade de B**.
- **Decisión del CTO (12-oct): sección n, que prevalece sobre m.5.3 y m.5.4.**
- **Correcciones hechas en su sitio (n.5):**
  - m.5.1: la excepción de B ya no se presenta como detector universal;
  - m.5.5: el mutante, ampliado;
  - m.2: el resultado incierto.

### n.1 Las resoluciones solo se dan sobre la FOTO FINAL

- **Antes de la foto final no se ratifica ningún dudoso ni ninguna incidencia.** La foto final es la puerta activa (m.3) más la segunda lectura (l.1 c, paso 3).
  - Antes, s10 los muestra, pero son **provisionales** y **no cuentan como resueltos**.
  - Ramón puede empezar a hablar con los alumnos, pero nada de lo que se acuerde vale hasta la foto final.
- **Por qué la foto es definitiva:**
  - con la puerta activa, un cliente antiguo ya no puede añadir filas: su mitad tardía se rechaza;
  - la creación de la puerta drena las escrituras en vuelo (medido por Astra en la ronda 4).

  **Así, el conjunto de filas «sin firma de alumno» de cada sesión queda cerrado.**
- **Las anomalías siguen su régimen (l.2).** Son otro predicado (l.4): una escritura del editor puede pasar en cualquier momento, y se justifica fila a fila con su SQL en APLICADOS. **Una fila que es las dos cosas** (el tercer caso de k.3.10) sigue n por su parte de «sin firma de alumno».

### n.2 Cada resolución se liga a la foto completa de su sesión

**Con cada resolución se guarda:**
- la lista de **TODOS** los ids de registro «sin firma de alumno» de la sesión, no solo los dudosos;
- **un hash canónico de esa lista y de sus parejas calculadas.**

**El texto canónico** lo construye **una sola función SQL de solo lectura**, la misma en s10 y en el DO del corte, como el texto canónico de S4-02:
- los ids ordenados de menor a mayor;
- las parejas `u:i` en el orden del emparejamiento de l.2 (por `en` y, si empatan, por id);
- la versión de esa función.

**El hash** es `sha256(convert_to(texto, 'UTF8'))`, nativo de PostgreSQL desde la versión 11. No hace falta ninguna extensión.

**La resolución, con su lista y su hash, entra como literal en el texto del corte**, igual que entraba antes la hora del certificado.

### n.3 El corte recalcula bajo el `LOCK`

Para cada sesión con resolución, el DO del corte recalcula **bajo el `LOCK`**:
- la lista completa;
- las parejas;
- el hash.

**Si no coincide EXACTAMENTE con el de la resolución, la resolución deja de valer y el corte aborta.** No se usa `MAX(id)` ni ninguna hora.

**Las sesiones sin resolución** se reclasifican bajo el mismo `LOCK` (l.2, m.1): cualquier incidencia o dudoso abierto aborta, como antes.

### n.4 Ensayo (etapa 4)

- **La secuencia de Astra** (resolución de A → B abierto → llega `i_A` tarde):
  - **antes de la puerta, bloquea**, porque no hay resoluciones que valgan (n.1);
  - **si se fuerza una resolución** sobre la foto con `u_A` y `u_B` y después llega `i_A`: **el hash cambia → la resolución deja de valer → el corte aborta**.
- **Un id reservado antes y confirmado después** de calcular el hash de la resolución → la lista cambia → la resolución deja de valer. El ensayo detiene una transacción con su fila de registro ya reservada.
- **Control:** la foto final sin cambios, con su resolución → el corte sigue.

**Mutantes → rojo:**
- «solo revisar si el id nuevo queda sin pareja»;
- «resolución válida antes de la puerta»;
- «hash solo de los dudosos»: en el caso de Astra, `u_A` es el único dudoso antes y después, así que el hash no cambia y la llegada de `i_A` pasa;
- «comparar por `MAX(id)` o por hora».

### n.5 Medios, a la etapa 1 (tal como dice Astra)

- **S4R5-02, el mutante con una fila anterior de la misma transacción:**
  - Dos montajes: (1) una fila anterior de A en la misma transacción y sesión, y después A retirado; (2) B renombrado para ordenar antes de A. **En los dos, B no falla.**
  - **Los tiene que parar la guarda final del catálogo (m.5.5), no la excepción de B.**
  - Corregida la frase de m.5.1. **El control de catálogo y el control funcional son dos pruebas separadas.**
- **m.2, resultado incierto:**
  - **Una respuesta `{error}` con rollback garantizado** se trata como hasta ahora (oráculo de m.2).
  - **Una respuesta perdida o un error de transporte es un resultado incierto:** la etapa 1 **vuelve a leer el estado** (la sesión y sus trades) antes de afirmar que no se guardó.
  - **Oráculo:** la respuesta se pierde, pero el servidor sí confirmó → la pantalla muestra lo guardado, no lo revierte.

### n.6 Autorrevisión adversaria de n

1. **¿Es de verdad final la foto?**
   - **Los caminos por los que podría aparecer una fila «sin firma de alumno» después de la puerta:**
     - **PostgREST sin cabecera:** lo rechaza la puerta;
     - **el tercer caso de k.3.10** (JWT `authenticated` a mano, sin cabecera): también lo rechaza la puerta;
     - **`SET ROLE` sin JWT:** `rol_jwt` null, así que no es «sin firma de alumno» (es una anomalía);
     - **una reejecución de la preparatoria:** no reabre la puerta (m.4).
   - **Si aun así se retira la puerta** (a mano o por error) y entra una fila, la lista cambia y **el hash la caza** (n.3). El hash es la red de seguridad, no la puerta.
2. **El hash tiene que ser estable** entre s10 y el corte:
   - la misma función en las dos lecturas;
   - un orden total: `en` y, si empatan, el id;
   - comparación en céntimos enteros.

   **Si la función cambia entre la resolución y el corte,** la versión dentro del texto hace que el hash no coincida → **el corte aborta.** Es conservador: obliga a resolver de nuevo con la función nueva.
3. **Qué cubre el hash y qué no.**
   - **Cubre** los ids y las parejas, como se ha decidido.
   - **No cubre los valores de las filas** (delta, pnl, `menciona_balance`, `en`, tabla, operación).
     - Los roles de la aplicación no pueden cambiarlos: no tienen grants (l.4, m.4).
     - **El dueño, sí.** Podría cambiar un delta sin cambiar ids ni parejas, y el hash no lo vería.
   - **Propuesta para el CTO, no adoptada:** incluir en el texto canónico los campos que usa la clasificación de cada id. Así una edición del registro por el dueño también invalidaría la resolución.
4. **La secuencia de Astra, con otros tiempos.**
   - Da igual en qué momento llegue `i_A`:
     - **antes de la foto final**, no hay resoluciones que tapar;
     - **después**, no puede llegar, porque la puerta lo rechaza;
     - **y si llegara**, cambia la lista.
   - **Si `i_A` llega antes de la foto final,** se clasifica sobre la foto final:
     - `u_B ↔ i_A` (o `u_A ↔ i_A`, según los tiempos) y **sobra un dudoso**;
     - la resolución se da **viendo la foto completa**, con las dos mitades y la pareja calculada. Ramón decide sabiendo que hubo dos cierres de pnl 0 y un solo trade.
5. **Una sesión sin resolución que cambia entre s10 y el corte.** Solo es posible si la puerta falla. La clasificación bajo el `LOCK` (n.3) la recalcula: si sale algo abierto, el corte aborta; si todo casa, pasa, por la misma regla de l.2.
6. **Plazos.**
   - Las resoluciones solo se dan después de la puerta (≤ 7 días desde el registro, m.3) y de la segunda lectura.
   - Entre la foto final y el corte, cualquier cambio invalida la resolución, sin plazo.
   - **El tiempo no cierra nada.**
7. **Coste.** Recalcular la lista, las parejas y el hash por sesión bajo el `LOCK` es poco con 5 alumnos. Se mide en el ensayo de la etapa 4, dentro de la ventana de mantenimiento de 30 min (h, decisión 5).
