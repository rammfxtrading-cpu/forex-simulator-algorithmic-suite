# Simulador · diseño de la persistencia del motor (v1)

**Fecha:** 7-oct-2026 · **Rama:** `auditoria-simulador` · **Solo diseño:** ni código ni SQL ejecutable. Nada de esto está aplicado ni se aplica sin orden expresa.

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
| `escritor` | jsonb | sí | arrendamiento: `{ cliente_id, token, hasta }` (§ 4) |
| `terminal` | text | sí | `borrada` · `revocada` · null |
| `legado` | boolean | no, por defecto false | sesión anterior al corte, solo lectura |
| `legado_snapshot` | jsonb | sí | foto inmutable del corte: `saldo` tal cual (0 ≠ null), `last_timestamp`, nº de trades (G02) |
| `mercado` | jsonb | sí | copia de `estado.versiones.mercado` para consultas e índices (§ 5) |
| `creada_por_rpc` | boolean | no, por defecto false | v1 solo nace por la RPC de creación |

Las columnas actuales (`capital`, `balance`, `last_timestamp`, `challenge_*`, `status`, `name`, `pair`, `timeframe`, `date_from`, `date_to`) se mantienen para las pantallas y el hub. En v1, `balance` y `last_timestamp` son **proyecciones** que escribe la RPC a partir del estado (saldo cerrado y cursor), nunca el cliente.

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
| `creado` | timestamptz | — |

Restricciones: `unique (session_id, command_id)`. Índice por `(session_id, creado)`.

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

**Diferencia con la especificación:** § 1.3 lista `proteccion_activada` y `comision`; el motor actual no los emite como eventos separados: la protección es un `cierre` con `motivo` `SL`/`TP`/`breach`, y la comisión va en `fill.comision_µ` y en `cierre.comision_µ` (asignada). `fase_superada` y `posicion_modificada` sí los emite y no estaban en la lista. → D-02.

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

Cada comando lleva: `session_id`, `command_id` (UUID del cliente), `tipo`, `epoca`, `version_esperada`, `token` de arrendamiento y el payload normalizado (números como texto, lotes en centésimas, precios en ticks). El servidor calcula el **digest** del sobre canónico `{tipo, payload}` (§ 12.4: `cancelar` y `cerrar` con la misma carga no colisionan).

### 4.2 El arrendamiento (un solo escritor por sesión)

- `sim_sessions.escritor = { cliente_id, token, hasta }`. `cliente_id` identifica la pestaña; `token` es un valor aleatorio que **solo** conoce esa pestaña (se lo devuelve `sim_tomar_escritor`); `hasta` = ahora + 60 s.
- **Tomar:** `sim_tomar_escritor(session_id, cliente_id, forzar)`. Sin escritor o con el arrendamiento caducado, lo da. Con uno vigente de otra pestaña, solo con `forzar` («Usar aquí»), y la otra pestaña pasa a solo lectura al recibir su siguiente `409 sin_arrendamiento`. Tomar es un comando con recibo.
- **Renovar:** cada comando aceptado renueva `hasta`.
- **Las demás pestañas** leen (RLS) y lo dicen en pantalla.

### 4.3 La RPC final (CAS)

Dentro de una transacción, en este orden:

1. `SELECT … FROM sim_sessions WHERE id = $1 FOR UPDATE` (orden de bloqueos: sesión y, si hay, reto padre).
2. **Idempotencia primero:** si existe `sim_recibos (session_id, command_id)`:
   - mismo digest → devolver ese recibo tal cual, **sin ejecutar** (aunque hayan entrado comandos después);
   - digest distinto → `409 clave_reutilizada`.
3. Verificaciones, cada una con su respuesta y **sin efectos**:
   - `terminal` no nulo → `410 sesion_borrada` / `403 acceso_revocado`;
   - acceso de producto vigente (`profiles.simulador_activo`), comprobado **dentro** de la RPC (§ 12.4);
   - `legado` → `409 solo_lectura`;
   - `epoca` del comando = la de la sesión → si no, `426 actualizar_cliente`;
   - `escritor.token` = el del comando y `escritor.hasta` > ahora → si no, `409 sin_arrendamiento`;
   - `version` = `version_esperada` → si no, `409 conflicto` con la versión confirmada.
4. Escribir: recibo (`aceptado` o `rechazado`), eventos con `seq` consecutivo, trades de los `cierre`, `estado`, proyecciones (`balance`, `last_timestamp`, `challenge_*`), `version = version + 1`, renovar `escritor.hasta`.

Un `rechazado` del motor (p. ej. `margen_insuficiente`) **también** tiene recibo y sube la versión: es un hecho confirmado (§ 1.3, «un comando sin eventos también tiene recibo»). → D-03 (si el rechazo debe subir o no la versión).

El servidor calculó **fuera de bloqueo** sobre la versión N. Si al bloquear la versión ya no es N, su cálculo **se descarta**: nunca se recalcula ni se recotiza en silencio dentro de la RPC. Un conflicto en un comando económico exige una nueva decisión del alumno, con **otro** `command_id` (§ 12.4).

### 4.4 Una petición en vuelo por sesión

El cliente no envía el comando N+1 hasta tener respuesta del N (§ 12.4). El avance se agrupa: un `avanzar` cada varios segundos de reproducción o antes de cualquier orden (§ 12.7), y nunca más de 7 días de mercado por comando (§ 1.7).

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

- **«Guardado»** solo se enseña con recibo remoto.
- **Conflicto** (`409 conflicto`): el comando sale de la cola sin efectos; si era económico, se recotiza y se pide confirmación con **un `command_id` nuevo**.
- **Identidad:** al cambiar de usuario se descarta la cola de esa clave sin enviarla (A22). Si `localStorage` falla, se avisa y cada comando espera su confirmación.
- **Borrado:** un reintento de una sesión borrada recibe `410` y no la recrea (A24).

---

## 7. Sesiones antiguas en solo lectura (corte)

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
- `sim_sessions`, `sim_recibos`, `sim_eventos`, `sim_trades`: política **SELECT** `auth.uid() = user_id` para `authenticated`; **ninguna** política de INSERT/UPDATE/DELETE para `authenticated` en las tres nuevas y en `sim_trades`; en `sim_sessions`, política UPDATE `auth.uid() = user_id` **con** `WITH CHECK` igual, y el grant de columna limitado a `name` (la RLS filtra filas; el grant de columna filtra columnas).
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

### 9.2 Estimado (hipótesis explícitas, no medidas en Postgres)

- Fila de `sim_eventos` ≈ 152 B de `datos` + ≈ 100 B de columnas y cabecera + índices ≈ **0,35 KB**.
- Fila de `sim_recibos` ≈ **0,35 KB** con su índice.
- Una operación completa (abrir + cerrar, con fill y cierre) ≈ 2 comandos y 3–4 eventos ≈ **2 KB** con su `sim_trades`.
- Avance: con un comando cada 5 s de reproducción, **una hora** de reproducción ≈ 720 recibos ≈ **250 KB**. Por eso los recibos de avance **sin eventos** tienen retención (§ 12.7): se conservan, por ejemplo, los de las últimas 24 h y uno por día después (D-06).
- Snapshot: el vigente pesa ≤ 15 KB (14,6 KB con el reto). Cada UPDATE deja una versión muerta que limpia autovacuum; no crece con el tiempo.

Las cifras de recibos «con retención» son las de una sesión cuya reproducción tiene más de 24 h: mientras tanto se conservan enteros (≈ 250 KB por hora reproducida en las últimas 24 h).

| Escenario por sesión | Eventos + trades | Recibos | Total aprox. |
|---|---|---|---|
| Ligera: 50 operaciones, 5 h de reproducción, con retención y pasadas 24 h | ≈ 0,1 MB | ≈ 0,05 MB | **≈ 0,15 MB** |
| La misma, el día en que se reprodujo (sin aplicar aún la retención) | ≈ 0,1 MB | ≈ 1,3 MB | **≈ 1,4 MB** |
| Intensa: 500 operaciones, 50 h de reproducción, con retención y pasadas 24 h | ≈ 1 MB | ≈ 0,5 MB | **≈ 1,5 MB** |
| Intensa **sin** retención de avances | ≈ 1 MB | ≈ 12,5 MB | **≈ 14 MB** |

Con 5 alumnos y su cupo (6 sesiones Basic, 12 Extra: `pages/dashboard.js:191–193`), el peor caso con retención es 5 × 12 × 1,5 MB ≈ **90 MB**.

### 9.3 Frente al plan

Según la página de precios de Supabase (consultada el 7-oct-2026, <https://supabase.com/pricing>): el plan **gratuito** incluye «500 MB database size per project», y los proyectos gratuitos se pausan tras una semana de inactividad; **Pro** incluye 8 GB de disco por proyecto (después, 0,125 USD/GB).

- **Los 500 MB son del proyecto entero**, compartido con el hub y el journal (CLAUDE.md, § 2). Hoy no sé cuánto ocupa la base: **falta leerlo en el panel** (D-07).
- Con retención de avances, el simulador v1 ocuparía del orden de **decenas de MB** para los alumnos actuales: cabe en el gratuito si el resto del proyecto deja margen. **Sin** retención, el peor caso (≈ 14 MB por sesión intensa, ≈ 840 MB con 60 sesiones) **no cabe**.
- La especificación ya decide que **la v1 no se habilita sin Supabase Pro** (§ 12.7), por el mercado versionado en Storage (§ 7.3), no por la base. Este cálculo no cambia esa decisión.

---

## 10. Decisiones que hacen falta

**Del CTO:**

| # | Decisión | Propuesta |
|---|---|---|
| D-01 | Salida completa de s04 fila a fila (columnas, triggers, políticas literales, grants de `service_role`) antes de escribir el SQL | pedirla a Ramón: es la consulta ya versionada, de solo lectura |
| D-02 | Lista de tipos de evento: la de § 1.3 o la que emite el motor (`fase_superada`, `posicion_modificada`; sin `proteccion_activada` ni `comision` separados) | la del motor, y corregir § 1.3 |
| D-03 | ¿Un comando rechazado por el motor sube la versión? | sí: tiene recibo y es un hecho confirmado; así el cliente no reintenta en bucle |
| D-04 | Duración del arrendamiento (60 s, § 1.4) y si «Usar aquí» exige confirmación | 60 s; confirmación en la pestaña que lo toma |
| D-05 | Las proyecciones `balance`/`last_timestamp`/`challenge_*` en `sim_sessions` las escribe la RPC: ¿se mantienen como columnas o las pantallas leen el estado? | mantenerlas (hub y pantallas actuales) |
| D-06 | Retención de los recibos de avance sin eventos | últimas 24 h enteras + uno por día de mercado después |
| D-08 | Si el hub lee `sim_sessions` (CLAUDE.md, § 2, dice que sí, para métricas; la especificación § 4 dice que no, `c25f28d`) | comprobarlo en el repositorio del hub antes del corte (sin tocarlo) |
| D-09 | Orden del despliegue: cliente que entiende la época → corte → retirada de permisos | el de § 7, con ensayo previo en PostgreSQL de ensayo |
| D-10 | Bucket privado para `mercado/v1` y cómo lo lee el servidor (firmado o `service_role`) | `service_role` desde el endpoint; nunca URL pública |
| D-11 | Proyección en el navegador con el mismo motor: cuándo y cómo se empaqueta `lib/motor/` para el cliente | después de la persistencia; hasta entonces, el cliente espera al recibo |
| D-12 | Pieza 7 (multipar): forma final del estado con varios pares (cotizaciones, conversión) | depende de las tres preguntas abiertas de la pieza 7 |

**De Ramón:**

| # | Decisión |
|---|---|
| D-07 | Leer en el panel de Supabase el tamaño actual de la base (Database → uso) y la unidad del GB que cuenta (pendiente 2 de la especificación) |
| D-13 | Aviso a los 5 alumnos con fecha y hora del corte (texto de § 6, punto 2): «a las HH:MM las sesiones actuales pasan a solo lectura; cierra tus posiciones abiertas antes si quieres que cuenten» |
| D-14 | Qué se enseña en una sesión legado (balance tal cual, trades, sin poder operar) y si el alumno puede borrarla |
| D-15 | Si las sesiones legado siguen sin contar en el cupo (§ 6 lo propone) |

---

## 11. Lo que este documento no hace

- No escribe SQL ni código; no toca la base, Storage ni la web.
- No decide la forma multipar del estado (pieza 7, pendiente de tres decisiones).
- No mide Postgres real: los tamaños de § 9.2 son estimaciones con sus hipótesis; los de § 9.1 están medidos con el motor.
