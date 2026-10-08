# Simulador · diseño de la persistencia del motor (v1)

**Fecha:** 7-oct-2026 · **Rama:** `auditoria-simulador` · **Solo diseño:** ni código ni SQL ejecutable. Nada de esto está aplicado ni se aplica sin orden expresa.

**Revisión 4 (8-oct-2026):** decisiones del CTO tras `2026-10-08-astra-simulador-diseno-4.md`: D-16 con la huella del testigo (§ 4.2), V4-01 reloj y orden común de bloqueos del arrendamiento (§ 4.2, § 4.3), V4-03 límite de avances por alumno en el servidor y presupuesto con los resets (§ 4.4, § 9). Sigue sin SQL: faltan D-01 y aplicar esto.

**Revisión 3 (8-oct-2026):** D-16 a D-18 y la FK de sesión a perfil (CTO). Cambian § 4.1, § 4.2, § 6.1, § 8, § 9.2, § 9.3 y § 10.

**Revisión 2 (8-oct-2026):** decisiones del CTO sobre la revisión de Astra `2026-10-08-astra-simulador-diseno-3.md` (V3-01, V3-04 a V3-07, V3-10). Cambian § 2.2, § 4, § 6, § 6.1, § 7, § 8, § 9 y § 10.

**Encargo (CTO, 7-oct, tras Astra cierres-8):** tablas y columnas; quién escribe; recibo por comando; CAS con testigo de arrendamiento; identidad versionada del mercado en el estado; respuesta perdida; sesiones antiguas en solo lectura; permisos y RLS; tamaño por sesión frente al plan gratuito; decisiones que hacen falta.

**Base:** la especificación v2.1 (`revisiones/2026-10-05-especificacion-motor-v2.md`, § 1, § 3.1, § 4, § 6, § 9, § 12.4–12.7) y el motor de `lib/motor/` (piezas 1–6). Donde este documento concreta algo que la especificación deja abierto, lo dice y lo lleva a la lista de decisiones (§ 10). **No se ha consultado la base viva:** el esquema actual se toma de `sql/APLICADOS.md` (resumen de s04, 4-oct) y del código que escribe hoy en las tablas; lo que no consta, se marca.

---

## 1. Lo que hay hoy (punto de partida)

- **El navegador escribe la economía directamente.** `components/useTradingActions.js:49–67` y `components/_SessionInner.js:1104, 1363, 1949–1950` insertan en `sim_trades` y actualizan `sim_sessions.balance` y `last_timestamp` desde el cliente. `pages/dashboard.js:183` crea la sesión con `capital` y `balance` desde el cliente.
- **RLS** (s04, resumen): activa en las 7 tablas del simulador, políticas ALL con `auth.uid() = user_id`. No consta el texto literal (si llevan `WITH CHECK`).
- **Grants:** sim-001b quitó a `anon` las 7 tablas y a `authenticated` TRUNCATE/REFERENCES/TRIGGER. `authenticated` conserva SELECT/INSERT/UPDATE/DELETE.
- **FK:** `sim_trades.session_id`, `session_drawings.session_id` y `session_chart_config.session_id` → `sim_sessions(id) ON DELETE CASCADE` (comunicado por el CTO; la de chart_config la puso sim-001b).
- **Retos:** `pages/api/challenge/*` (servidor) mantiene `challenge_type`, `challenge_phase`, `challenge_parent_id` y los estados de fase; reglas de `lib/challengeRules`.
- **No consta:** las columnas completas de `sim_sessions` y `sim_trades` fila a fila, los triggers (p. ej. el límite de sesiones por plan que sugiere `pages/dashboard.js:191`) ni los grants de `service_role`. Hace falta la salida completa de s04 antes de escribir el SQL (§ 10, D-01).

Consecuencia de diseño: **la v1 no puede convivir con un cliente que escriba balance o trades.** El corte (§ 7) retira esos permisos a `authenticated`.

---

## 2. Tablas y columnas

Convenciones: dinero en **µUSD enteros** (`bigint`); precios en **ticks** (`bigint`) con los dígitos del instrumento; tiempos de mercado en **segundos UTC** (`bigint`); tiempos de servidor en `timestamptz`. El estado completo del motor va en `jsonb` con el formato canónico de `lib/motor/motor.mjs` (`serializa`: claves ordenadas, BigInt como `{"$b": "…"}`).

### 2.1 `sim_sessions` (columnas nuevas; las actuales se conservan)

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `motor_version` | smallint | no, por defecto 0 | 0 = legado; 1 = motor v1 |
| `epoca` | integer | no, por defecto 0 | época del protocolo; el corte la pone a 1 (§ 7) |
| `version` | bigint | no, por defecto 0 | contador CAS; +1 en cada comando confirmado |
| `estado` | jsonb | sí (null en legado) | snapshot del motor (y del reto, si lo hay) tras la versión `version` |
| `escritor` | jsonb | sí | quién escribe y hasta cuándo, visible: `{ cliente_id, hasta }`. **El testigo no está aquí**: va en `sim_arrendamientos`, sin grants para el navegador (§ 4.2, V3-06) |
| `terminal` | text | sí | `borrada` · `revocada` · null |
| `legado` | boolean | no, por defecto false | sesión anterior al corte, solo lectura |
| `legado_snapshot` | jsonb | sí | foto inmutable del corte: `saldo` tal cual (0 ≠ null), `last_timestamp`, nº de trades (G02) |
| `mercado` | jsonb | sí | copia de `estado.versiones.mercado` para consultas e índices (§ 5) |
| `creada_por_rpc` | boolean | no, por defecto false | v1 solo nace por la RPC de creación |

Las columnas actuales (`capital`, `balance`, `last_timestamp`, `challenge_*`, `status`, `name`, `pair`, `timeframe`, `date_from`, `date_to`) se mantienen para las pantallas (el hub no las lee: solo borra filas, § 6.1). En v1, `balance` y `last_timestamp` son **proyecciones** que escribe la RPC a partir del estado (saldo cerrado y cursor), nunca el cliente.

### 2.2 `sim_recibos` (nueva)

| Columna | Tipo | Qué es |
|---|---|---|
| `id` | bigint identity | — |
| `session_id` | uuid → `sim_sessions(id)` ON DELETE CASCADE | — |
| `user_id` | uuid | derivado de la sesión bloqueada, nunca del payload (§ 9) |
| `command_id` | uuid | lo genera el cliente |
| `tipo` | text | `abrir` · `modificar` · `cancelar` · `cerrar` · `avanzar` · `checkpoint` · `crear` · `tomar_escritor` |
| `digest` | text | sha256 del **sobre canónico** (tipo + payload normalizado, § 12.4) |
| `epoca` | integer | — |
| `version_partida` | bigint | la que esperaba el cliente |
| `version_resultante` | bigint | null si no se aplicó |
| `resultado` | text | `aceptado` · `rechazado` · `conflicto` |
| `motivo` | text | el `rechazado` del motor (`margen_insuficiente`, `precio_cambiado`, `reset_posterior`, `sesion_en_breach`…) o del protocolo |
| `resumen` | jsonb | resumen económico: saldo antes/después, nº de eventos, cursor antes/después, detención si la hubo |
| `clase` | text | `economico` (se conserva siempre) · `ultimo_avance` (uno por sesión, se sobrescribe: V3-07) |
| `creado` | timestamptz | — |

Restricciones: `unique (session_id, command_id)`; **una sola** fila `ultimo_avance` por sesión (índice único parcial sobre `session_id` donde `clase = 'ultimo_avance'`). Índice por `(session_id, creado)`.

**Qué recibo guarda cada comando (V3-07, V3-10, CTO 8-oct):**
- **Comandos con eventos económicos** (`fill`, `cierre`, `orden_*`, `posicion_modificada`, `reset_diario`, `breach`, `fase_superada`) y **todos** los que no son `avanzar`/`checkpoint`: recibo `economico`, que **no se poda nunca** (§ 6).
- **`avanzar` / `checkpoint` sin eventos económicos:** no guardan un recibo cada uno. Hay **un único recibo `ultimo_avance` por sesión**, que cada avance así **sobrescribe** (su `command_id`, digest, versiones, cursor). `fin_de_datos` cuenta como evento técnico, no económico.
- **Esto refina § 1.3 de la especificación** («un comando sin eventos también tiene recibo»; «misma clave, mismo recibo aunque hayan entrado más comandos») dentro de lo que ya aprobó § 12.7 (retención de los recibos de avance): un avance sin eventos económicos solo conserva recibo mientras sea el último. Su reintento tardío recibe `comando_caducado` (§ 6). Lo señalo para Astra.

### 2.3 `sim_eventos` (nueva)

| Columna | Tipo | Qué es |
|---|---|---|
| `id` | bigint identity | — |
| `session_id` | uuid → `sim_sessions(id)` ON DELETE CASCADE | — |
| `user_id` | uuid | de la sesión |
| `seq` | bigint | consecutivo por sesión, lo asigna la RPC |
| `command_id` | uuid | el comando que lo produjo |
| `ordinal` | integer | posición dentro de ese comando |
| `tipo` | text | `orden_creada`, `orden_modificada`, `orden_cancelada`, `fill`, `cierre`, `reset_diario`, `breach`, `fase_superada`, `fin_de_datos`, `posicion_modificada` (y `no_valorable` como resultado de detención) |
| `t_mercado` | bigint | segundos UTC del evento (`en.t` o `en.vela`) |
| `datos` | jsonb | el evento del motor tal cual (canónico) |

Restricciones: `unique (session_id, seq)`, `unique (session_id, command_id, ordinal)`.

**La lista de eventos del motor manda (D-02, CTO 7-oct)** sobre la de § 1.3: no hay `proteccion_activada` ni `comision` separados (la protección es un `cierre` con `motivo` `SL`/`TP`/`breach`; la comisión va en `fill.comision_µ` y en `cierre.comision_µ`, asignada), y sí `fase_superada` y `posicion_modificada`.

### 2.4 `sim_trades` (columnas nuevas; § 4 de la especificación)

`evento_id` (bigint, unique, → `sim_eventos(id)`), `motor_version` (0/1), `bruto_µ`, `neto_µ`, `comision_µ`, `spread_µ`, `swap_µ` (0), `conversion` (jsonb: par, minuto, fase, valor), `ambigua` (boolean), `causa_ambiguedad` (text). Las actuales (`pnl` = neto en USD, `entry_price`, `exit_price`, `lots`…) se rellenan desde el evento para las pantallas. Un `sim_trades` v1 nace **solo** de un evento `cierre` (uno por cierre, parciales incluidos), dentro de la misma transacción.

### 2.5 Lo que no se crea

- **Ninguna tabla de snapshots históricos:** solo el estado vigente en `sim_sessions.estado`. El historial son los eventos.
- **Ninguna tabla de reto aparte:** el reto vive en el estado (`reto@1`, `lib/motor/reto.mjs`); `challenge_phase` y compañía se proyectan desde él. La transición de fase 1 → 2 (nueva sesión enlazada, D07) es su propio comando con su recibo (`sim_avanzar_fase`, § 9).

---

## 3. Quién escribe

**Solo el servidor, y solo por RPC.**

- `pages/api/sim/comando.js` (Node, Next): autentica (`lib/authApi.js`), comprueba el permiso de producto (`requireSimulador`), carga la sesión y el mercado fijado, **calcula fuera de bloqueo** con el motor puro y llama a **una** RPC final breve.
- `sim_comando(...)`: `SECURITY DEFINER`, `search_path` vacío y objetos calificados, `EXECUTE` **solo** para `service_role`. Bloquea la sesión, verifica, resuelve la idempotencia y escribe recibo, eventos, trades y estado en la misma transacción (§ 4).
- RPC aparte, también solo `service_role`: `sim_crear_sesion` (barrera por usuario y cupo), `sim_tomar_escritor`, `sim_avanzar_fase`, `sim_borrar_sesion`, `sim_borrar_alumno`.
- **El navegador** solo lee lo suyo (RLS) y escribe lo no económico (dibujos, configuración de gráfico, `name`).

`lib/motor/` sigue sin importarse desde la web (`pages/`, `components/`): lo importa **solo** el endpoint del servidor. El navegador proyecta con una copia empaquetada del mismo motor puro cuando se decida (D-11); hoy no.

---

## 4. Recibo por comando y CAS con testigo de arrendamiento

### 4.1 El comando

Cada comando lleva: `session_id`, `command_id` (UUID del cliente), `tipo`, `epoca`, `version_esperada`, `cliente_id` de la pestaña, el **testigo** del arrendamiento de esa pestaña (§ 4.2, D-16) y el payload normalizado (números como texto, lotes en centésimas, precios en ticks). El servidor calcula el **digest** del sobre canónico `{tipo, payload}` (§ 12.4: `cancelar` y `cerrar` con la misma carga no colisionan).

**El servidor solo acepta intención** (V3-04, V3-06): tipo, instrumento, lado, lotes, precios pedidos, SL/TP, `cotizadoEn`, `hasta`. Nunca acepta del cuerpo estado, saldo, eventos, versión resultante ni dueño.

**Actor (V3-06, CTO 8-oct):** el endpoint obtiene el usuario autenticado del guard (`lib/authApi.js`, `requireSimulador`) y lo pasa a la RPC como `actor_id`. La RPC lo **compara con `sim_sessions.user_id`** de la fila bloqueada antes de hacer o devolver nada (también antes de devolver un recibo existente): si no coincide, `404 sesion_no_encontrada`, sin revelar que existe. El `user_id` de recibos, eventos y trades sale de la fila, nunca del payload.

### 4.2 El arrendamiento (un solo escritor por sesión)

- **El testigo no se puede leer de la base** (V3-06): tabla `sim_arrendamientos (session_id PK → sim_sessions ON DELETE CASCADE, user_id, cliente_id, testigo_hash, hasta)`, **sin ningún grant a `authenticated` ni a `anon`**, y solo con el **hash** del testigo. `sim_sessions` solo expone, si se quiere enseñar, quién escribe y hasta cuándo (`cliente_id`, `hasta`), nunca el testigo. Otra pestaña del mismo alumno no puede obtenerlo leyendo filas.
- **Dónde vive el testigo (D-16, CTO 8-oct):** en la **memoria de la pestaña**, en `sessionStorage` (no en una cookie: una cookie la comparten todas las pestañas). La pestaña lo envía en cada comando; la base guarda solo su hash y la RPC compara el hash.
- **Testigo nuevo en cada toma:** `sim_tomar_escritor(actor_id, session_id, cliente_id, forzar)` genera un testigo aleatorio en la base, guarda su hash y devuelve el testigo a esa pestaña (por el servidor). Una toma nueva invalida el testigo anterior.
- **Pestaña duplicada (D-16, CTO 8-oct):** los navegadores **copian el `sessionStorage` al duplicar una pestaña**, así que la duplicada nace con el mismo testigo. **Comodidad, no garantía:** al arrancar, cada pestaña difunde por `BroadcastChannel` una **huella del testigo** (sha256 truncado) con un identificador de instancia nuevo, **nunca el testigo**; si dos instancias tienen la misma huella, la más nueva borra el testigo de su `sessionStorage` y queda en solo lectura (puede pedir «Usar aquí», que genera otro). Una recarga de la misma pestaña conserva el testigo.
- **La seguridad no depende del canal** (Astra, diseño-4 § C): pestañas suspendidas, mensajes perdidos o un cliente modificado pueden saltárselo. La garantía económica sigue en la RPC: actor = dueño, versión CAS, testigo y estado vigente. Si dos copias envían comandos distintos desde N, como mucho uno que cambie el estado confirma y el otro recibe `409 conflicto`; si reenvían el mismo, reciben el mismo recibo.
- **Caducidad con el reloj de la base, tomado después de los bloqueos (V4-01, CTO 8-oct):** `now()` en PostgreSQL es la hora de **inicio** de la transacción; una RPC que esperó un bloqueo podría aceptar con él un testigo ya caducado (Astra: caduca en t = 60, la RPC empieza en t = 59 y obtiene el bloqueo en t = 62; con `now()` = 59, acepta y renueva). Por eso la RPC, **después de adquirir todos sus bloqueos**, captura **una** hora `t_decision = clock_timestamp()` y con ella comprueba `hasta > t_decision` y renueva `hasta = t_decision + 60 s`. Como la fila del arrendamiento queda bloqueada hasta el commit, nadie puede tomarlo ni transferirlo entre esa hora y el commit: es el **punto de aceptación atómico**. El fencing por hash del testigo se mantiene: cambiar el reloj no lo sustituye.
- **Orden común de bloqueos (V4-01, D-18):** toda RPC que compruebe, renueve o transfiera un arrendamiento bloquea en este orden: **(1) el perfil del actor** (barrera por usuario), **(2) las filas de `sim_arrendamientos` que toque, por `session_id` ascendente**, **(3) la sesión padre** y **(4) la sesión hija** (§ 4.3). `sim_comando`, `sim_tomar_escritor` (incluida la transferencia forzada de D-18, que toca el arrendamiento de **otra** sesión) y `sim_crear_sesion` siguen el mismo orden, así que entre ellas no hay interbloqueos; con el DELETE del hub, sí puede haberlos (§ 6.1, I3).
- **Fencing:** la RPC final comprueba el testigo y la caducidad **dentro** de la transacción que escribe. Un cálculo que terminó cuando el arrendamiento ya había caducado o cambiado de dueño se rechaza en el commit (`409 sin_arrendamiento`), aunque el cálculo se haya hecho.
- **Tomar:** sin escritor o con el arrendamiento caducado, lo da. Con uno vigente de otra pestaña, solo con `forzar` («Usar aquí», con confirmación en la pestaña que lo toma, D-04); la otra pasa a solo lectura en su siguiente `409 sin_arrendamiento`. Tomar es un comando con recibo `economico` (cambia quién puede escribir).
- **Renovar:** cada comando que llega a la RPC con el testigo vigente renueva `hasta`, también un rechazo puro (es actividad del escritor); renovar **no** sube la versión (§ 4.3).

### 4.3 La RPC final (CAS)

Dentro de una transacción, en este orden:

1. **Bloqueos en el orden común** (V4-01, § 4.2): perfil del actor → arrendamiento de esta sesión → reto padre → sesión (padre y después hija, V3-05). Ninguna RPC bloquea dos sesiones que no sean padre e hija; la transferencia de D-18 bloquea dos **arrendamientos**, en orden de `session_id`. Después de los bloqueos, `t_decision = clock_timestamp()`.
2. **Sesión inexistente** → `410 sesion_borrada`, sin efectos. **Actor distinto del dueño** → `404`, sin efectos.
3. **Idempotencia:** si existe `sim_recibos (session_id, command_id)`:
   - mismo digest → devolver ese recibo tal cual, **sin ejecutar**;
   - digest distinto → `409 clave_reutilizada`.
4. **Avance caducado** (V3-07): `avanzar`/`checkpoint` sin recibo y con `version_esperada` distinta de la vigente → `409 comando_caducado` (§ 6). Para los demás tipos, la misma situación es un `409 conflicto` normal.
5. Verificaciones, cada una con su respuesta y **sin efectos**: `terminal` (`410` / `403`); acceso de producto vigente (`profiles.simulador_activo`, dentro de la RPC, § 12.4); `legado` (`409 solo_lectura`); `epoca` (`426 actualizar_cliente`); testigo y caducidad con `now()` (`409 sin_arrendamiento`); `version = version_esperada` (`409 conflicto`).
6. Escribir: recibo, eventos con `seq` consecutivo (lo asigna la RPC bajo el bloqueo), trades de los `cierre`, `estado`, proyecciones (`balance`, `last_timestamp`, `challenge_*`), renovar `hasta` y, según § 4.3.1, `version`.

#### 4.3.1 Cuándo sube la versión (V3-01, CTO 8-oct)

**La versión sube con todo cambio del estado confirmado**, haya o no eventos económicos: cursor, cotización, horizonte del reto, `fin_de_datos_emitido`, flags del motor o del reto. Comparación: la proyección canónica del estado nuevo (`lib/motor/motor.mjs`, `serializa`) frente a la confirmada.

| Caso | ¿Cambia el estado? | Versión | Recibo |
|---|---|---|---|
| `avanzar` con velas nuevas, sin fills (solo cursor y cotización) | sí | **+1** | `ultimo_avance` |
| `avanzar` que solo confirma horizonte del reto (sin velas, sin reset) | sí (`horizonte`) | **+1** | `ultimo_avance` |
| `avanzar` con fills, cierres, resets | sí | +1 | `economico` |
| `avanzar` que no cambia nada (mismo cursor y horizonte) | no | igual | `ultimo_avance` |
| Rechazo puro (`margen_insuficiente`, `precio_cambiado`…) | no | **igual** (D-03) | `economico` (`rechazado`) |
| Rechazo **después** de cambiar el estado (reset con breach antes del comando, cierres-8) | sí | **+1** | `economico` (`rechazado`, con sus eventos) |
| Solo renovar el arrendamiento | no (el arrendamiento no es estado económico) | igual | — |

Así dos cálculos hechos desde N no pueden confirmar los dos: el primero que cambia el estado deja N+1 y el segundo recibe `409 conflicto` (oráculo de Astra, V3-01). Y dos avances sucesivos nunca quedan con la misma versión.

El servidor calculó **fuera de bloqueo** sobre la versión N. Si al bloquear ya no es N, su cálculo **se descarta**: nunca se recalcula ni se recotiza en silencio dentro de la RPC. Un conflicto en un comando económico exige una nueva decisión del alumno, con **otro** `command_id` (§ 12.4).

#### 4.3.2 Creación idempotente (V3-06, CTO 8-oct)

**El cliente genera el id de la sesión** (UUID) y lo envía con su `command_id`. `sim_crear_sesion(actor_id, session_id, command_id, payload)`:
- si la sesión ya existe **del mismo actor** y con el mismo digest de creación → devuelve la existente (la respuesta perdida se recupera reintentando con el mismo id);
- si existe con otro digest o de otro actor → `409 clave_reutilizada` (sin revelar de quién);
- si no existe → barrera por usuario (bloqueo del perfil del actor, § 6.1), cupo, `profiles.simulador_activo`, inserción con `creada_por_rpc = true`, `motor_version = 1`, `epoca` vigente, mercado fijado (§ 5) y recibo `economico`.

La transición de fase (`sim_avanzar_fase`) sigue la misma regla: el id de la hija lo genera quien la pide, y la unicidad de transición (`unique (challenge_parent_id)` en las hijas, D07 de la especificación) impide dos hijas.

### 4.4 Una petición en vuelo por sesión

El cliente no envía el comando N+1 hasta tener respuesta del N (§ 12.4). El avance se agrupa: un `avanzar` cada varios segundos de reproducción o antes de cualquier orden (§ 12.7), y nunca más de 7 días de mercado por comando (§ 1.7).

**Límite de avances por alumno, impuesto en el servidor (V4-03, CTO 8-oct):** como mucho **un `avanzar`/`checkpoint` cada 5 s por alumno, sumando todas sus sesiones** (la tasa de antes, ahora por alumno). Se guarda en el perfil bloqueado (paso 1 del orden común) un `siguiente_avance_desde`; si `t_decision` es anterior, `429 demasiados_avances`, sin efectos (rechazo puro: no sube la versión ni deja recibo). Así la alternancia entre sesiones con «Usar aquí» (Astra: A en 0, B en 1, A en 5, B en 6…) no duplica la tasa: es una cota real, no una disciplina del cliente. Los comandos económicos no cuentan en este límite.

---

## 5. Identidad versionada del mercado en el estado

- **En el estado:** `estado.versiones.mercado = { PAR: "PAR@version:huella", … }` para **todos** los pares de la sesión, operados y de conversión (§ 3.1, A26). Es exactamente lo que fija hoy `motor.crea({ mercado })` para un par (C6-03).
- **Se fija una vez,** al crear la sesión (`sim_crear_sesion`), con el manifiesto vigente de cada par. **No cambia nunca** en la vida de la sesión; publicar una versión nueva del mercado no la toca (A26).
- **En cada comando** el servidor carga los manifiestos de esas identidades exactas; la fuente (`lib/motor/fuente.mjs`) comprueba par y huella contra el estado (`fuenteDelEstado`): con otra, detención `fuente_de_otra_version` y comando rechazado sin efectos.
- **Copia en columna** (`sim_sessions.mercado`) para poder listar qué sesiones usan una versión antes de retirarla. No se lee para calcular: la verdad es el estado.
- **Almacenamiento:** manifiestos y trozos en `mercado/v1/<PAR>/<AAAA>/<MM>/<DD>.<hash>.bin.br` (§ 1.7), en el bucket **privado** (decisión del CTO). Un trozo no se borra mientras haya una sesión que lo fije.

---

## 6. Qué pasa con una respuesta perdida

El cliente guarda dos cosas separadas (§ 1.5): el **estado confirmado** (versión N) y la **cola** de comandos pendientes con su `command_id`, en `localStorage` con clave `usuario/sesión/época`.

| Dónde se pierde | Qué hay en la base | Qué hace el cliente al reconectar | Resultado |
|---|---|---|---|
| Antes de llegar al servidor | nada | pide los recibos de la cola: no hay; reenvía **el mismo** `command_id` | se ejecuta una vez |
| El servidor calculó pero la RPC no llegó a confirmar (caída, timeout) | nada | igual: sin recibo, reenvía el mismo `command_id` | se ejecuta una vez |
| La RPC confirmó y el ACK se perdió | recibo + eventos + estado N+1 | pide los recibos: está; aplica su resultado y lo saca de la cola **sin reenviar** | una sola comisión, una sola fila económica (A18) |
| Reenvío con el mismo `command_id` tras confirmar | recibo | la RPC devuelve el recibo original sin ejecutar | idempotente |
| Respuesta vieja que llega tarde (versión < la conocida, u otra sesión/usuario/época) | — | se ignora; nunca se baja de versión (A20) | — |
| Reintento de un `avanzar` cuyo recibo `ultimo_avance` ya se sobrescribió (V3-07) | el estado ya avanzó (versión > la esperada) | la RPC responde `409 comando_caducado`; el cliente **carga el estado confirmado y descarta su cola** | nada se reejecuta; el alumno sigue desde lo confirmado |

- **«Guardado»** solo se enseña con recibo remoto.
- **Conflicto** (`409 conflicto`): el comando sale de la cola sin efectos; si era económico, se recotiza y se pide confirmación con **un `command_id` nuevo**.
- **`comando_caducado`:** solo para `avanzar`/`checkpoint` sin recibo y con versión distinta de la vigente. No hay ambigüedad económica: un avance no lleva intención de operar, y el estado confirmado ya incluye lo que hubiera hecho. Los comandos económicos conservan su recibo siempre, así que «sin recibo» en un comando económico solo puede significar «no se ejecutó».
- **ACK y snapshot, separados** (V3-07, § 12.4): la respuesta de un comando **confirma su entrada de la cola** (sale por su `command_id`) aunque traiga un snapshot más viejo que el que el cliente ya tiene; el snapshot solo se instala si su versión es **mayor** que la conocida. Una respuesta vieja confirma la cola y no rebaja el estado; nunca deja el comando colgado en la cola.
- **Identidad:** al cambiar de usuario se descarta la cola de esa clave sin enviarla (A22). Si `localStorage` falla, se avisa y cada comando espera su confirmación.
- **Borrado:** un reintento de una sesión borrada recibe `410` y no la recrea (A24).

---

### 6.1 Borrado del alumno, grafo de claves e intercalados (D-08, V3-05)

**Lo que hace el hub (leído en solo lectura, sin tocarlo):** `algorithmic-suite-hub/pages/api/users/delete.js:104` borra, con `service_role`, `sim_sessions` y otras 4 tablas del simulador con `.delete().eq('user_id', userId)`; **después** la cuenta de acceso y, al final, el perfil. No lee `sim_sessions` en ningún otro sitio. No toma ninguna barrera del simulador.

#### Grafo de claves (cada arista con su `ON DELETE`)

| Hija → padre | ON DELETE | Estado |
|---|---|---|
| `sim_sessions.user_id` → `profiles(id)` | **CASCADE** | **nueva** (V3-05). **Aprobada por el CTO (8-oct); pendiente del sí de Ramón** (cambio de esquema en `sim_sessions`, CLAUDE.md § 3, regla 1), que el CTO pide aparte. Hoy, según el resumen de s04, las tablas «caen con auth.users»; no consta la FK exacta (D-01) |
| `sim_sessions.challenge_parent_id` → `sim_sessions(id)` | **CASCADE** | nueva; hoy no consta (D-01). Borrar un reto padre borra sus fases (**D-17, aprobada por el CTO** el 8-oct) |
| `sim_recibos.session_id` → `sim_sessions(id)` | CASCADE | nueva |
| `sim_eventos.session_id` → `sim_sessions(id)` | CASCADE | nueva |
| `sim_arrendamientos.session_id` → `sim_sessions(id)` | CASCADE | nueva |
| `sim_trades.session_id` → `sim_sessions(id)` | CASCADE | existe (comunicado por el CTO, 4-oct) |
| `sim_trades.evento_id` → `sim_eventos(id)` | CASCADE | nueva; los dos caen con la sesión (corrige la versión anterior de este documento, que la ponía hacia `sim_sessions`) |
| `session_drawings.session_id`, `session_chart_config.session_id` → `sim_sessions(id)` | CASCADE | existen |
| `profiles.id` → `auth.users(id)` | no consta (D-01) | el hub borra la cuenta antes que el perfil |

`user_id` de recibos, eventos y trades es una copia para la RLS: no lleva FK propia; caen con su sesión.

#### Orden de bloqueos e interbloqueo

- **Simulador: siempre padre y después hija** (§ 4.3), y nunca dos sesiones que no sean padre e hija.
- **El DELETE del hub** bloquea las filas de `sim_sessions` del alumno en el orden en que las recorra; no se puede imponer sin tocar el hub. Con un reto padre P y su hija H, una RPC sobre H (bloquea P y luego H) y el DELETE (que puede tomar H y esperar a P) **pueden interbloquearse**.
- **Tratamiento (CTO 8-oct): el interbloqueo es un reintento controlado e idempotente.** PostgreSQL aborta una de las dos transacciones (`40P01`):
  - si aborta la **RPC**: el endpoint reintenta la RPC con el **mismo** `command_id` (como mucho 3 veces, con espera corta y aleatoria). Al reintentar, o el DELETE ya confirmó (→ `410`, sin efectos) o la RPC gana y confirma; el recibo hace idempotente el reintento;
  - si aborta el **DELETE del hub**: su código para y dice dónde (`intenta`, «el mensaje dice dónde paró», prueba `d02-borrar-alumno` del hub); el administrador repite el borrado, que es idempotente. No se toca el hub.

#### Los tres intercalados de Astra (V3-05), como pruebas en PostgreSQL de ensayo

| # | Intercalado | Resultado exigido |
|---|---|---|
| **I1** | **Creación en vuelo:** el hub ya borró `sim_sessions` del alumno; antes de que borre la cuenta y el perfil, una `sim_crear_sesion` autorizada inserta una sesión nueva | La sesión nueva **desaparece** cuando el hub borra el perfil (FK `sim_sessions.user_id → profiles ON DELETE CASCADE`), con todo lo que cuelga de ella. Además, `sim_crear_sesion` toma un bloqueo del **perfil** del actor (barrera por usuario): si el perfil ya no existe, `410`. Al acabar el borrado no queda ninguna fila del alumno en ninguna tabla del simulador |
| **I2** | **Transición en vuelo:** `sim_avanzar_fase` crea la hija H de P mientras el hub borra | O el DELETE confirma antes (la RPC no encuentra P → `410`, sin hija) o la RPC confirma antes (H existe y el DELETE la borra: por `user_id`, por la cascada desde P y, en último caso, por la del perfil). Ninguna hija sobrevive |
| **I3** | **Interbloqueo padre/hija:** RPC sobre H (bloquea P, luego H) frente al DELETE del hub (bloquea H, espera P) | Una de las dos aborta con `40P01`; si es la RPC, su reintento con el mismo `command_id` da `410` o el recibo; si es el DELETE, el borrado repetido termina. Ningún estado intermedio: ni medio comando ni medio borrado |

Además, los dos órdenes simples de un comando ordinario: DELETE antes de la RPC (`410`, sin efectos) y RPC antes del DELETE (`200`, y después la cascada se lo lleva).

**Lo que no hace:** la lápida de CD07 (`terminal`) solo existe en los borrados que pasan por `sim_borrar_sesion` / `sim_borrar_alumno`. El borrado del hub no la deja; no hace falta para impedir resurrecciones (los ids son UUID y ninguna RPC inserta una sesión sin el perfil vivo, I1), pero la respuesta es `410` por fila inexistente.

## 7. Sesiones antiguas en solo lectura (corte)

### 7.0 Inventario de los escritores económicos actuales (V3-04, CTO 8-oct)

Buscado en `pages/`, `components/` y `lib/` (sin `lib/motor/`) el 8-oct: todas las escrituras en `sim_sessions` y `sim_trades`.

| Escritor | Qué escribe | Quién | Qué pasa en el corte |
|---|---|---|---|
| `components/useTradingActions.js:49`, `:67` | INSERT `sim_trades`; UPDATE `balance`, `last_timestamp` | navegador | el SQL lo impide (§ 8); el cliente nuevo no lo llama en v1 |
| `components/_SessionInner.js:1104`, `:1363`, `:1949`, `:1950` | UPDATE `balance`, `last_timestamp`, `timeframe`; INSERT `sim_trades` | navegador | igual; `timeframe` pasa a ser no económico (grant de columna, § 8) |
| `components/usePairData.js:25` | UPDATE `last_timestamp`, `timeframe` | navegador | `last_timestamp` lo escribe solo la RPC; `timeframe` sigue |
| `pages/dashboard.js:183` | INSERT `sim_sessions` con `capital` y `balance` | navegador | sustituido por `sim_crear_sesion` (§ 4.3.2) |
| `pages/dashboard.js:135` | DELETE `sim_sessions` | navegador | por `sim_borrar_sesion` (lápida, CD07) |
| `pages/api/challenge/create.js:104` | INSERT `sim_sessions` (reto) | servidor, `service_role` | **delega por entero** en `sim_crear_sesion` (con el reto como reglas del estado) o se retira; nunca inserta una fila fuera del protocolo (evita la «tercera categoría» de Astra: `motor_version = 0`, `legado = false`, sin estado) |
| `pages/api/challenge/advance.js:89`, `:168`, `:198`, `:235`, `:275`, `:284` | lee y UPDATE de `balance`, `last_timestamp`, estado de fase; INSERT de la hija | servidor, `service_role` | **rechaza** sesiones `legado` (`409 solo_lectura`) y v1 (`409 usar_comando`); la transición v1 es `sim_avanzar_fase` |
| `pages/api/challenge/status.js:54` | lee la sesión y reconstruye el estado del reto desde los trades | servidor, `service_role` | **rechaza** v1 (el estado del reto está en `sim_sessions.estado`) y deja de ser autoridad para legado (solo lectura de lo guardado) |
| `pages/api/admin/wipe-simulador.js:96` | DELETE de las tablas del simulador por `user_id` | servidor, admin | pasa por `sim_borrar_alumno`, o queda cubierto por § 6.1 (cascada e intercalados) |
| `pages/api/admin/alumno-sim/[id].js:42` | lectura | servidor, admin | sin cambio |

**Pruebas (A23, A25 ampliadas, V3-04):** llamar **directamente a las URL** `challenge/create`, `challenge/advance` y `challenge/status` con un alumno autenticado, sobre una sesión legado (reto `active` con trades que su evaluador anterior aprobaría, y un `end_timestamp` dentro del rango admitido) y sobre una v1: ninguna escribe `balance`, `last_timestamp`, estado de fase ni crea hija. No basta con quitar los botones.

Según § 6 y § 12.6 de la especificación, en este orden:

1. **Antes del corte:** desplegar una versión del cliente que entienda la época (lee `epoca`/`legado` y, con legado, muestra la sesión en solo lectura) y que deje de escribir `balance`/`last_timestamp`/`sim_trades` para las sesiones v1.
2. **Corte** (una transacción, bajo bloqueo de cada sesión, ensayado antes en PostgreSQL de ensayo con cinco identidades ficticias, A25):
   - `epoca = 1`, `legado = true`, `motor_version = 0` en todas las existentes;
   - `legado_snapshot` creado **una sola vez**: saldo tal cual (0 sigue siendo 0; null se registra como null), `last_timestamp`, nº de `sim_trades` en ese instante;
   - ningún trade se recalcula ni se toca; una sesión incoherente (`balance ≠ capital + Σ pnl`) pasa a legado igual, con la incoherencia anotada (G02).
3. **Permisos en el mismo corte:** `authenticated` pierde INSERT/UPDATE/DELETE en `sim_trades` y UPDATE en las columnas económicas de `sim_sessions` (§ 8). Desde ahí **ningún cliente**, viejo o nuevo, puede escribir economía: el SQL lo impide, no la buena fe del cliente (§ 12.6).
4. **Después:** las legado no admiten comandos (`409 solo_lectura`); las nuevas nacen v1 por `sim_crear_sesion`; las legado **no cuentan** en el cupo de sesiones; los retos legado quedan en solo lectura con sus reglas antiguas y no se recalifican (G03).
5. **Rollback:** a modo mantenimiento / solo lectura (§ 12.6). Volver al código anterior no lee el estado v1 y no es un rollback económico; no borra eventos v1.

---

## 8. Permisos y RLS

Roles: `anon`, alumno (`authenticated`, dueño), alumno ajeno, revocado (`simulador_activo = false`), admin (`authenticated` con `rol_global = admin`), `service_role`.

| Objeto | anon | Alumno dueño | Ajeno | Revocado | Admin (navegador) | service_role |
|---|---|---|---|---|---|---|
| `sim_sessions` filas | — | SELECT las suyas | — | SELECT las suyas | — (por API admin) | todo |
| `sim_sessions.name` | — | UPDATE (grant de columna) | — | — | — | todo |
| `sim_sessions` resto de columnas | — | — | — | — | — | solo por RPC |
| `sim_sessions` INSERT / DELETE | — | — (por RPC) | — | — | — | por RPC |
| `sim_recibos`, `sim_eventos`, `sim_trades` | — | SELECT las suyas | — | SELECT las suyas | — | INSERT por RPC; DELETE por borrado en cascada |
| Dibujos y configuración (5 tablas) | — | CRUD lo suyo | — | SELECT | — | todo |
| RPC `sim_comando`, `sim_crear_sesion`, `sim_tomar_escritor`, `sim_avanzar_fase`, `sim_borrar_*` | — | — | — | — | — | EXECUTE |
| Storage `forex-data` y `mercado/v1` | — | — | — | — | — | lectura/escritura (bucket privado) |

**RLS:**
- `sim_sessions`, `sim_recibos`, `sim_eventos`, `sim_trades`: política **SELECT** `auth.uid() = user_id` para `authenticated`; **ninguna** política de INSERT/UPDATE/DELETE para `authenticated` en las tres nuevas y en `sim_trades`.
- **`name` (y `timeframe`) exigen acceso vigente** (V3-06, CTO 8-oct): política UPDATE de `sim_sessions` con `USING` y `WITH CHECK` = `auth.uid() = user_id` **y** el perfil del usuario con `simulador_activo = true`; grant de columna limitado a `name` y `timeframe`. Un revocado no puede escribir ni eso.
- **`sim_arrendamientos`:** sin grants para `authenticated` ni `anon`; solo las RPC. Guarda el **hash** del testigo, nunca el testigo (D-16).
- **Se retiran** los grants y políticas heredados que hoy permiten ALL al dueño, y `EXECUTE` de las RPC a `PUBLIC` (solo `service_role`). La RLS por dueño, sola, no basta (Astra, diseño-3 § B).
- Las RPC son `SECURITY DEFINER` con `search_path` vacío; derivan `user_id` de la sesión bloqueada, nunca del payload (una RPC de A no puede apuntar a la sesión de B, A23).
- Se prueba en PostgreSQL de ensayo real (A28), no con el doble: anon, A, B, revocado y admin contra esta matriz; la migración dos veces; un fallo a mitad.

**Para el admin no cambia nada:** las rutas `pages/api/admin/*` ya usan `service_role` en el servidor y no dependen de la RLS.

---

## 9. Tamaño por sesión frente al plan gratuito

### 9.1 Medido (7-oct, con el motor de la rama, `costes@1`, estado serializado canónico)

| Contenido del estado | Bytes del snapshot |
|---|---|
| sin posiciones ni órdenes | 641 |
| 1 posición + 1 orden | 1.179 |
| 10 + 10 | 6.071 |
| 25 + 25 (el tope de 50, § 12.7) | 14.246 |
| envoltura del reto (sin el motor) | +336 |

Eventos: **≈ 152 B** de `datos` por evento (media medida sobre `fill` y `orden_creada`).

### 9.2 Estimado (hipótesis explícitas, no medidas en Postgres; V4-03: uso normal y cota, separados)

**Hipótesis:** fila de `sim_recibos` o `sim_eventos` ≈ **0,35 KB** con índices; fila de `sim_trades` ≈ 0,5 KB; snapshot ≤ **15 KB** medido con un par (§ 9.1); multipar, medido en la pieza 7 (D-12).

**Filas permanentes (crecen con el uso):**
- **Comandos económicos:** cada `abrir`, `cerrar`, `modificar`, `cancelar`, `tomar_escritor` y cada rechazo de un comando económico deja su recibo (≈ 0,35 KB) y sus eventos.
- **Resets diarios del reto (V4-03):** cada medianoche de Praga que un reto cruza deja un `reset_diario` (evento, ≈ 0,35 KB) y su avance pasa a ser económico (recibo, ≈ 0,35 KB): **≈ 0,7 KB por día de mercado recorrido**, aunque no se opere. 1.000 días recorridos ≈ **0,7 MB** por reto.
- **Avances sin eventos económicos:** no dejan filas (un único `ultimo_avance`, sobrescrito).

**Uso normal (estimación, no cota):**

| Sesión | Recibos económicos | Eventos | Trades | Resets (reto, 250 días) | Snapshot | Total |
|---|---|---|---|---|---|---|
| Ligera: 50 operaciones | ≈ 35 KB | ≈ 70 KB | ≈ 25 KB | ≈ 175 KB | ≈ 20 KB | **≈ 0,33 MB** |
| Intensa: 500 operaciones | ≈ 350 KB | ≈ 700 KB | ≈ 250 KB | ≈ 175 KB | ≈ 20 KB | **≈ 1,5 MB** |

Con 5 alumnos y su cupo máximo (12 sesiones Extra): 60 sesiones intensas ≈ **90 MB**.

**Cotas (lo que el servidor impone):**
- **Reescrituras por reproducción:** como mucho **720 avances por hora y alumno** (V4-03, § 4.4), con cualquier número de sesiones. Cada avance reescribe el snapshot (≤ 20 KB, en TOAST) y el `ultimo_avance` (0,35 KB): ≈ **14,65 MB/h por alumno**; con 5 alumnos, **≈ 73,3 MB/h** escritos como máximo. Son versiones muertas que recicla autovacuum, no ocupación viva.
- **Filas permanentes:** no tienen cota por tiempo; crecen con las operaciones y los días recorridos, al ritmo de arriba. Lo que las acota es la tasa de avances (como mucho 7 días de mercado por comando, § 1.7) y el tope de 50 posiciones + órdenes.

### 9.3 Frente al plan

Según la página de precios de Supabase (consultada el 7-oct-2026, <https://supabase.com/pricing>): el plan **gratuito** incluye «500 MB database size per project»; **Pro**, 8 GB de disco por proyecto (después, 0,125 USD/GB).

- **La base ocupa hoy unos 170 MB** (captura de Ramón, D-07): quedan **≈ 330 MB** para todo el proyecto (hub y journal incluidos, que también crecen).
- **Estado estable:** ≈ 78 MB en el peor caso del cupo actual: cabe.
- **Pico de escritura (cota, V4-03):** ≈ 73,3 MB/h como máximo con los 5 alumnos, impuesto por el límite de avances por alumno (no por D-18 sola, que no impedía alternar sesiones). Con una hora de retraso de autovacuum, ≈ 73 MB de espacio muerto: junto al uso normal de 60 sesiones intensas (≈ 90 MB), ≈ 163 MB de los ≈ 330 MB de margen. **Es una suma de escenario, no una garantía de ocupación**: autovacuum, WAL y compresión TOAST no están medidos.
- **Límites que lo acotan:** un avance cada ≥ 5 s **por alumno** (§ 4.4, en el servidor); una petición en vuelo por sesión; un escritor por sesión (§ 4.2); una sola sesión v1 en reproducción a la vez por alumno (D-18).
- **Pro sigue siendo condición para encender la v1** (§ 12.7, CTO 8-oct).

---

## 10. Decisiones

**Del CTO (7-oct-2026):**

| # | Decisión | Estado |
|---|---|---|
| D-01 | Salida completa de s04 fila a fila antes de escribir el SQL | **Sí**; el CTO la pedirá a Ramón cuando toque |
| D-02 | Lista de tipos de evento | **La del motor manda** (§ 2.3) |
| D-03 | ¿Un comando rechazado sube la versión? | **Rechazo puro: no.** Sustituida por V3-01 (8-oct): la versión sube con **todo** cambio del estado confirmado, haya o no eventos; un rechazo después de un reset con breach sí la sube (§ 4.3.1) |
| D-04 | Arrendamiento de 60 s y confirmación en «Usar aquí» | **Aprobado** |
| D-05 | `balance`, `last_timestamp`, `challenge_*` como proyecciones que escribe la RPC | **Aprobado** |
| D-06 | Retención de recibos de avance | **Sustituida por V3-07/V3-10 (8-oct):** un único recibo `ultimo_avance` por sesión, sobrescrito; reintento sin recibo → `comando_caducado` (§ 2.2, § 6) |
| D-08 | ¿El hub lee `sim_sessions`? | **Cerrada:** no lee; solo borra con `service_role` (`algorithmic-suite-hub/pages/api/users/delete.js:104`). Comando en vuelo: § 6.1 |
| D-09 | Orden del despliegue (cliente con época → corte → permisos) | **Aprobado, con ensayo previo** |
| D-10 | Bucket privado leído con `service_role` desde el endpoint | **Aprobado** |
| D-11 | Empaquetar el motor para el navegador | **Después de la persistencia** |
| D-12 | Forma multipar del estado | **A la espera** de la v2.3 de la especificación (§ 13) |
| V3-04 | Escritores económicos antiguos en el corte | **Rechazan legado y v1 o delegan en las RPC**; pruebas llamando a las URL (§ 7.0) |
| V3-05 | Grafo de claves, bloqueos e interbloqueo | **FK sesión → perfil en cascada; padre y después hija; interbloqueo = reintento idempotente; I1–I3 como pruebas** (§ 6.1) |
| V3-06 | Testigo, actor y creación | **Testigo no legible desde la base (solo su hash; vive en la pestaña, D-16), nuevo en cada toma, caducidad con `now()`; `actor_id` comparado con el dueño; id de sesión del cliente; `name` con acceso vigente** (§ 4, § 8) |

**Nuevas (CTO, 8-oct):**

| # | Decisión | Estado |
|---|---|---|
| D-16 | Dónde vive el testigo de cada pestaña | **En la memoria de la pestaña (`sessionStorage`), enviado en cada comando; la base guarda solo su hash** en `sim_arrendamientos` (no en cookie: la comparten todas las pestañas). Riesgo de pestaña duplicada y propuesta, para Astra (§ 4.2) |
| D-17 | `ON DELETE` de `challenge_parent_id` | **Aprobada:** borrar un reto padre borra sus fases (CASCADE) |
| D-18 | Una sola sesión v1 en reproducción a la vez por alumno | **Aprobada:** se hace cumplir con el arrendamiento (`otra_sesion_activa`), con el orden común de bloqueos (V4-01) |
| V4-01 | Reloj y bloqueos del arrendamiento | **`clock_timestamp()` tras los bloqueos, una hora de decisión; orden común perfil → arrendamientos → padre → hija** (§ 4.2, § 4.3) |
| V4-03 | Tasa de avances y presupuesto | **Un avance cada 5 s por alumno, sumando sus sesiones, en el servidor; resets como filas permanentes; uso normal y cota separados** (§ 4.4, § 9) |
| FK | `sim_sessions.user_id` → `profiles(id)` ON DELETE CASCADE | **Aprobada por el CTO; pendiente del sí de Ramón** (cambio de esquema en `sim_sessions`) |

**De Ramón:**

| # | Decisión | Estado |
|---|---|---|
| D-07 | Tamaño actual de la base | **≈ 170 MB de 500** (captura); margen recalculado en § 9.3 |
| D-13 | Aviso a los 5 alumnos con fecha y hora del corte (texto de § 6, punto 2 de la especificación) | Pendiente; no bloquea |
| D-14 | Qué se enseña en una sesión legado y si el alumno puede borrarla | Pendiente; no bloquea |
| D-15 | Si las sesiones legado siguen sin contar en el cupo | Pendiente; no bloquea |

---

## 11. Lo que este documento no hace

- No escribe SQL ni código; no toca la base, Storage ni la web.
- No decide la forma multipar del estado (D-12: a la espera de la v2.3).
- No mide Postgres real: los tamaños de § 9.2 son estimaciones con sus hipótesis; los de § 9.1 están medidos con el motor.
