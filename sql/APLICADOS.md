# SQL ejecutado en producción · simulador

Lo que se ha ejecutado de `sql/` en la base viva, con el informe del propio fichero. Una fila se apunta con las firmas **literales** del informe, no con un resumen; lo que llegó resumido se marca como tal.

| Fichero | Qué es | Ejecutado | Commit · sha256 del fichero ejecutado |
|---|---|---|---|
| `consultas/s04-esquema-simulador.sql` | **consulta de solo lectura** (catálogo, sin datos): el esquema real de las 9 tablas y de Storage | **sí** · **4/10/2026**, la ejecutó Ramón en el editor SQL de Supabase | `a639b0b` · `bb9aee948988519c39541be2a93817aa22d440964c5c4839ed67fb4ae783dee7` |
| `sim-001-permisos-e-integridad.sql` | anon fuera de las 7 tablas; sin TRUNCATE/REFERENCES/TRIGGER para authenticated; FK con CASCADE en session_chart_config; 3 índices; NOT NULL donde no hay nulos | **ejecutado, NO aplicado** · 4/10/2026, Ramón en el editor SQL de Supabase: **falló con su precondición** y no aplicó nada (ver abajo) | `92f7c08` · `73782606f6002c7f05e2208dd7827cdfb67700dc4b3b0d67339199681ccc720f` |
| `sim-001b-permisos-e-integridad.sql` | sim-001 + borrar antes, en el mismo DO, las filas huérfanas de session_chart_config (salvaguarda: más de 10, no hace nada) | **sí** · lo ejecutó Ramón; informe parcial literal (FK, huérfanas, FIN) pegado el 5-oct: ver abajo | `c95110b` · `a5cd4783dab3e0ed56628471410362f998cdd9e99ac27938b9d47155fab95fa0` (el fichero del commit; ver abajo) |
| `sim-002-lectura-estable.sql` | funciones `sim_trades_de_sesion` y `sim_trades_de_usuario`: los trades en UNA sentencia como jsonb; SECURITY INVOKER, search_path vacío, EXECUTE solo authenticated y service_role (bloque E, punto 3) | **sí** · 5/10/2026, la ejecutó Ramón; informe **transcrito por el CTO** (no las filas tal cual): ver abajo | `66758a3` · `56d0f947b784c3ccb966f83b06a2d76c980414178067bd35bd75c4743950952b` |
| `consultas/s04-esquema-simulador.sql` (2.ª vez) | la misma consulta, pedida fila a fila para la persistencia (D-01) | **sí** · **10/10/2026**, Ramón en el editor; **resumen** transmitido por el CTO el 11-oct (no las filas): ver abajo | `a639b0b` · `bb9aee94…83dee7` (el mismo fichero) |
| `consultas/s05-nombres-libres.sql` | **consulta de solo lectura**: nombres de la persistencia libres o no | **sí** · **10/10/2026**, Ramón en el editor; **resumen** del CTO, 11-oct: ver abajo | `39b0b55` · `7caa602e44e77f533fed314bd0cf3831911c80037b28175b59769bbc989e80e0` |
| `consultas/s06-roles-y-ejecutor.sql` | **consulta de solo lectura**: versión, ejecutor, roles y membresías, default ACL, esquemas, `auth.uid()`, FK, inventario de sim-003 y huérfanos (Astra sim-003 ronda 2) | **sí** · **12/10/2026**, Ramón en el editor; salida **literal**: ver abajo | `94675c7` · `1ea61c6f86c6d672afb15a8f4401e1fe732e5e3ce6ed39e025f1791fe982e954` |
| `sim-003-persistencia-aditiva.sql` | persistencia aditiva: 4 tablas nuevas (`sim_alumnos`, `sim_arrendamientos`, `sim_recibos`, `sim_eventos`), columnas nuevas en `sim_sessions`/`sim_trades`, FK sesión → perfil, 7 RPC + 2 auxiliares SECURITY DEFINER solo para service_role; **RPC inactivas** (nadie las llama aún) | **sí** · **12/10/2026**, Ramón en el editor, una sola pegada, ejecutor `postgres` **no superusuario**; informe **literal**, 64 filas, acaba en `FIN \| sim-003 aplicada`: ver abajo | `1a951ca` (sin cambios hasta `ad7c738`) · `2a74bcb3ee62722fb8633a188445d30471b4653875f2ce1b00d206434bf3403f` |
| `consultas/s07-secuencias-y-permisos.sql` | **consulta de solo lectura**: permisos de las 2 secuencias y las 4 tablas nuevas de sim-003 (el REVOKE de las secuencias no lo comprueba ninguna guarda del DO) | **sí** · **12/10/2026**, Ramón en el editor, tras aplicar sim-003; salida **literal**: ver abajo | `aa4f51a` · `327cf6c10cb7c7f6dde931ca29740befc0facaaa9c1cae7435e268e1b2dbe768` |
| `consultas/s11-acl-columna.sql` | **consulta de solo lectura**: ACL de columna, privilegios efectivos por columna y RLS (paso 1 del runbook de la etapa 1) | **sí** · **13/10/2026** (noche), Ramón en el editor; **resumen** del CTO: ver abajo | `4da2df2` · `e22b801e60e4604f404bbcba35b5bb02276f3e59449c230492165420548cea67` |
| `consultas/s12-trades-sesion-ajena.sql` | **consulta de solo lectura**: filas en sesión ajena o inexistente (4 tablas) y RLS (paso 2) | **sí** · **13/10/2026** (noche), Ramón en el editor; **resumen** del CTO: ver abajo | `4da2df2` · `0ac4ce64c7796f11e38efaaf0b2e256d93e157f3d4c1745b79e63b6b69384c92` |
| `sim-004a-preparatoria.sql` | etapa 1: cierre atómico `sim_cierre_v0`, registro de escrituras y marcas, `sim_servicio`, `rev_saldo` y sus disparadores, disparador del padre, políticas RESTRICTIVE de `sim_trades`, `session_drawings` y `session_chart_config` (o.16) | **sí** · **13/10/2026, ~19:30**, Ramón en el editor; acaba en `FIN \| sim-004a-preparatoria aplicada`; informe **resumido** por el CTO: ver abajo | `4da2df2` · `060717995e723fdefc043b9cb6fb0f7658943034a3810474adea4a587eb2f6e2` |
| `consultas/s10-conciliacion.sql` | **consulta de solo lectura**: conciliación del registro y `statement_timeout` (paso 4) | **sí** · **13/10/2026** (noche), tras la preparatoria; **resumen** del CTO: ver abajo | `4da2df2` · `eaa23bc700a44c05ccacd66212195bb5dbbb3aee0ab8d992b7a7606af37c7576` |

## s04 · resultado (4-oct-2026)

**Es un RESUMEN** transmitido por el CTO, no la salida pegada fila a fila. Sin datos de alumnos (la consulta no los devuelve).

> RLS activa en las 9 tablas; políticas ALL con auth.uid() = user_id en las 7 del simulador; profiles y messages solo SELECT. anon y authenticated tienen todos los grants en las 7, incluidos TRUNCATE, REFERENCES y TRIGGER. session_chart_config.session_id no tiene FK. user_id es nulable en sim_sessions, sim_trades y sim_drawing_templates; session_id nulable en sim_trades. No hay índices por user_id ni session_id en sim_sessions ni sim_trades. Bucket forex-data público, sin políticas en storage.objects.

**Lo que el resumen NO dice, y por tanto no se da por sabido:**

- **Las FK de `sim_trades.session_id` y `session_drawings.session_id`.** No consta ni que existan ni su `ON DELETE`. Lo afirman dos comentarios de código, que no son la base:
  - el hub, `pages/api/users/delete.js:102`;
  - el simulador, `pages/api/admin/wipe-simulador.js:62`.
- **El texto literal de las 7 políticas.** No consta si el ALL lleva `WITH CHECK` ni si incluye `is_admin()`.
- **Las columnas, los triggers y las funciones**, como `handle_new_user` o un límite de sesiones por plan, que sugiere `pages/api/challenge/create.js:109`.
- **Los grants de `service_role`.**
- **Si hay filas FALTA** (tablas pedidas que no existen).

**Contestado después por el CTO (4-oct), de la salida real, resumido:**

> sim_trades_session_id_fkey y session_drawings_session_id_fkey son ON DELETE CASCADE hacia sim_sessions; session_chart_config no tiene FK de sesión (la pone sim-001). Todas las tablas caen con auth.users.

El borrado de usuario del hub queda cubierto.

Para el `baseline` versionado hace falta la salida completa, fila a fila.

## sim-001 · ejecución fallida (4-oct-2026)

Lo que pasó el CTO, tal cual:

> «session_chart_config tiene 2 fila(s) huerfana(s)»

Es la precondición del propio fichero: hay filas de session_chart_config cuyo `session_id` no existe en sim_sessions. El bloque DO revienta antes de tocar nada, así que **no se aplicó nada**: ni los revoke, ni la FK, ni los índices, ni los NOT NULL.

**Decisión del CTO (4-oct):** esas 2 filas son restos de sesiones borradas (D06: el dashboard borraba sin comprobar errores) y se eliminan. **No se edita sim-001**, que es lo que se ejecutó. Lo sustituye `sim-001b-permisos-e-integridad.sql`, que hace lo mismo y, dentro del mismo DO y antes de la FK, borra esas huérfanas. Si fueran más de 10, revienta sin hacer nada.

## sim-001b · ejecución (comunicada el 5-oct-2026)

El CTO comunica que está **aplicado en producción**. Primero llegó sin informe; lo que faltaba entonces:

- cuántas huérfanas borró (el sim-001 había encontrado 2);
- los grants resultantes;
- la FK;
- los índices;
- qué NOT NULL se aplicaron y cuántos nulos quedaron.

**Qué texto se ejecutó.** El fichero abierto en TextEdit tenía una línea en blanco añadida al principio (por TextEdit, 4-oct 15:18:23; sha256 `1c843fc6…`). El SQL es el mismo; solo cambia esa línea. El 5-oct se restauró el fichero del repositorio al del commit `c95110b` (sha256 `a5cd4783…`).

**Informe real (pegado por Ramón, transmitido por el CTO el 5-oct-2026), literal:**

> session_chart_config_session_id_fkey · FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE · validada=true
>
> huérfanas borradas 2, restantes 0
>
> FIN | sim-001b aplicada

Con esto constan la FK (con `ON DELETE CASCADE`, validada), las 2 huérfanas borradas (las que había encontrado sim-001) y el FIN. El texto ejecutado coincide con el commit `c95110b` (sha256 `a5cd4783dab3e0ed56628471410362f998cdd9e99ac27938b9d47155fab95fa0`, comprobado el 5-oct).

**No venía en lo pegado** (no se da por sabido): los grants resultantes, los índices y qué NOT NULL se aplicaron. Si el informe completo los trae, se añaden aquí tal cual.

## sim-002 · ejecución (5-oct-2026)

Aplicada por Ramón en el editor SQL de Supabase. El CTO transmite el informe así (cita **textual de su mensaje**, que resume las filas; las filas tal cual no han llegado):

> las dos funciones con security_definer=false, search_path vacío, EXECUTE true para authenticated y service_role, false para anon y PUBLIC, «FIN | sim-002 aplicada».

Coincide con lo que el bloque DO exige antes de terminar (si cualquiera de esas condiciones fallase, revienta con «sim-002: …» y no crea nada). **No consta en lo transmitido:** `volatil=s` (STABLE) ni el tipo devuelto (`jsonb`); los comprueba el propio bloque. Fichero ejecutado: el del commit `66758a3` (sha256 arriba); el abierto en TextEdit el 5-oct tenía ese mismo sha256 antes y después de abrirlo.

## s04 (2.ª) y s05 · resultado (10-oct-2026)

**Es un RESUMEN** del CTO (11-oct), no las filas tal cual. Lo que dice, en corto (el texto entero es la base de `pruebas/estado-s04.mjs`, `PRODUCCION`):

- **s05:** todos los nombres LIBRES (12 objetos, las columnas nuevas de `sim_sessions` y `sim_trades` con `*_micro`). pgcrypto 1.3 en el esquema `extensions`. Existen `sim_sessions`, `sim_trades`, `sim_drawing_templates` y las funciones `sim_trades_de_sesion(uuid)` y `sim_trades_de_usuario(uuid)` (dueño postgres). **`sim_borrar_legacy` no estaba en la lista de s05**: lo comprueba sim-003 al empezar (en cualquier esquema).
- **s04, PostgreSQL 17.6.** `sim_sessions.user_id` → `auth.users` ON DELETE CASCADE, **sin FK a profiles**; `challenge_parent_id` → `sim_sessions` ON DELETE SET NULL. Disparador `trg_enforce_sim_session_limit` (BEFORE INSERT, definer): las hijas de reto no cuentan; raíces por `user_id`; 12 con `plan = 'extra'`, si no 6; P0001. `profiles`: `plan` NOT NULL default 'basic' CHECK (basic|extra); `simulador_activo` boolean nulable default false (columna 09). RLS de `sim_sessions` y `sim_trades`: una política ALL PERMISSIVE para public, `auth.uid() = user_id`, sin WITH CHECK. authenticated: SELECT/INSERT/UPDATE/DELETE en `sim_sessions`, `sim_trades`, `session_drawings`, `session_chart_config`, `sim_drawing_templates`. Bucket `forex-data` público; `storage.objects` con RLS.

**Literal de s04, añadido por el CTO el 11-oct (para sim-004):** las FK se llaman `sim_sessions_user_id_fkey` (→ `auth.users`, CASCADE) y `sim_sessions_challenge_parent_id_fkey` (→ `sim_sessions`, SET NULL); el error del cupo es «Limite de sesiones alcanzado para el plan % (max %).» con errcode P0001 (el dashboard lo reconoce: busca «limite de sesiones» en minúsculas); `sim_trades.opened_at` es `timestamptz NOT NULL`. Sigue sin constar: el tipo de `closed_at`/`created_at` (sim-003 no lo necesita: convierte con `jsonb_populate_record`).

**Salidas LITERALES (Ramón, 11-oct, 21:40):** `consultas/salidas/s04-esquema-simulador-2026-10-10.csv` (sha256 `7420492f…f81cc786`, 199 filas + cabecera) y `consultas/salidas/s05-nombres-libres-2026-10-10.csv` (sha256 `dcfb4e1f…c51e7e88`, 62 filas), copiadas tal cual de revisiones-suite. `pruebas/estado-s04.mjs` (`PRODUCCION`) se ha reconstruido desde ellas y `pruebas/estado-s04-literal.mjs` corre las dos consultas sobre el montaje y exige las mismas filas, una a una (con un control que planta una diferencia y la ve). Lo que el resumen no decía y ahora consta: `closed_at`/`created_at` son `timestamptz` nulables; `sim_trades.session_id` y `user_id` son NOT NULL (`user_id` → `auth.users` CASCADE); `profiles.id` → `auth.users` ON DELETE CASCADE (`profiles_id_fkey`); 15 FK entrantes a `profiles` de otros productos (`ia_*`, `macro_*`, `notas`, `trades`), todas CASCADE; el cuerpo real de `sync_plataformas_activas` (BEFORE INSERT OR UPDATE: reescribe `plataformas_activas` con `journal_activo`/`simulador_activo`; no toma otros bloqueos); `anon` sin ningún grant en las 7 tablas del simulador; las funciones de `public` con EXECUTE para PUBLIC, anon, authenticated y service_role. **No consta en s04/s05** (marcado en `estado-s04.mjs`): columnas y triggers de `auth.users`, roles y membresías, `pg_default_acl` de tablas y secuencias, la versión de PostgreSQL (17.6 la dio el resumen del CTO, no el CSV).

## s06 y sim-003 · resultado (12-oct-2026)

**s06, salida LITERAL** (Ramón, 12-oct): `consultas/salidas/s06-roles-y-ejecutor-2026-10-12.csv` (sha256 `9d3e7933…9c664bbbb`, 116 filas + cabecera, acaba en `FIN | s06 | consulta`). PostgreSQL 17.6 (`170006`). Ejecutor del editor: `postgres` (current_user y session_user), **no superusuario**, bypassrls, createrole. anon y authenticated: ni superusuario ni bypassrls, y no pueden asumir postgres ni service_role (la única membresía entre esos roles es postgres → anon/authenticated/service_role, con admin). Default ACL de postgres solo en `public`: tablas `arwdDxtm`, secuencias `rwU`, funciones `X` a anon, authenticated y service_role; ninguna global. USAGE sí y CREATE no en `public`, `auth` y `extensions` para los tres. `auth.uid()` de Supabase (dueño `supabase_auth_admin`). 21 FK de/hacia `sim_sessions` y `profiles`, idénticas a s04 y validadas. Los 65 nombres del inventario de sim-003, LIBRES. 0 sesiones sin perfil, con visibilidad completa. Contrastado con la lista de Astra (`revisiones-suite/2026-10-12-sim-003-notas-para-astra.md`). Antes de aplicar se midió que un ejecutor con esos atributos (no superusuario, dueño de public, ese default ACL) aplica sim-003 entero.

**sim-003, informe LITERAL** (Ramón, 12-oct): `consultas/salidas/sim-003-informe-2026-10-12.csv` (sha256 `cb413afc…c9476b94282`), 64 filas: tabla 4, columna 20, restriccion 27, indice 1, politica 2, funcion 9 y `FIN | sim-003 aplicada`. **Idéntico, fila a fila y en el mismo orden**, al informe del ensayo sobre el montaje literal de s04, tanto con el `postgres` superusuario de `pruebas/sim-003.mjs` como con un ejecutor no superusuario como el de producción.

**s07, salida LITERAL** (Ramón, 12-oct): `consultas/salidas/s07-secuencias-y-permisos-2026-10-12.csv` (sha256 `065630d4…62bcd7330`), 22 filas + `FIN | s07 | consulta`. `sim_recibos_id_seq` y `sim_eventos_id_seq`: USAGE, SELECT y UPDATE `false` para anon, authenticated, service_role y PUBLIC; `relacl={postgres=rwU/postgres}` en las dos (solo el dueño). Tablas nuevas: ninguna escritura para los tres roles; SELECT solo de authenticated y service_role en `sim_recibos` y `sim_eventos`. Idéntica a lo que exige `pruebas/s07-secuencias.mjs` sobre el montaje. Hueco de las secuencias cerrado.


**sim-003 y sim-004a / sim-004b (decisión del CTO, 12-oct; corregida por k.1 c y o.1, 13-oct).** sim-003 no se toca: su sha256 aplicado (`2a74bcb3…`) es el de la fila de arriba. sim-004a se partió en dos (diseño k.1 c):
- **`sim-004a-preparatoria.sql`** (escrita el 13-oct, **NO aplicada**): el cierre atómico, el registro de escrituras, las marcas, `sim_servicio`, la canónica y las parejas. **No cambia nada que sim-003 compare: después de ella, sim-003 se puede volver a ejecutar y termina SIN error, con el mismo informe y el catálogo idéntico** (ensayado en `pruebas/sim-004a.mjs`, E2 y E10). Su puerta va aparte, en **`sim-004a-puerta.sql`** (escrita, **NO aplicada**).
- **sim-004b** (sin escribir): amplía `sim_sessions_terminal_valida` y el CHECK de `sim_eventos.tipo`. **A partir de sim-004b, sim-003 queda superada y NO se vuelve a ejecutar**: su comprobación literal abortaría ante esas definiciones nuevas, y se ensayará que, si se ejecuta por error, aborta con su error prefijado y sin cambiar nada. La referencia del esquema pasará a ser la comprobación final de sim-004b.

**Las escrituras del dueño en `sim_servicio`** (mantenimiento, `version_minima`) se hacen solo por SQL y se apuntan aquí con su hora (o.5).

## Etapa 1: s11, s12, sim-004a-preparatoria y s10 · resultado (13-oct-2026, noche)

**Todo es RESUMEN del CTO, no las filas tal cual.** Si Ramón pega las salidas literales, van a `consultas/salidas/` con su sha256 y se citan aquí. El runbook es `revisiones-suite/2026-10-14-sim-etapa1-runbook-aplicacion.md`. Los cuatro ficheros son los del commit `4da2df2`, revisado por Astra en la 3b; los sha256 se comprobaron al copiarlos al portapapeles.

- **s11 (paso 1):** limpio. 0 ACL de columna, ningún «DIFIERE», RLS activa en las cuatro tablas.
- **s12 (paso 2):** limpio. Los 8 totales a 0 y RLS activa en las cuatro tablas.
- **sim-004a-preparatoria (paso 3), APLICADA hacia las 19:30.** Lo resumido por el CTO:
  - `FIN | sim-004a-preparatoria aplicada`; registro instalado;
  - `rev_saldo` bigint not null default 0, sin ACL de columna;
  - los tres disparadores nuevos y las seis políticas RESTRICTIVE, presentes;
  - RLS activa en las cuatro tablas;
  - funciones con `search_path` vacío; EXECUTE solo de `sim_cierre_v0`, para `authenticated`;
  - `sim_servicio`: `mantenimiento=false`, `version_minima=1`.

  **El registro está instalado desde esa hora:** cuenta para la regla de la puerta (m.3: 7 días como mucho).
- **s10 (paso 4):**
  - 0 filas en el registro; «registro instalado», puerta NO activa;
  - `statement_timeout`: `authenticated` 8 s, `anon` 3 s. La regla de o.11.2 es ≤ 10 s, para que la espera de 20 s cubra 2 × timeout: 2 × 8 s = 16 s < 20 s, se cumple.

## s10 diaria hasta la puerta (procedimiento: `revisiones-suite/2026-10-14-sim-etapa1-registro-retencion-y-diario.md`, § 4)

Solo las cifras: ni ids ni importes. s10 de `3fa2b3f`, con sha256 `eaa23bc7…7576` comprobado al copiarla al portapapeles. Ramón la ejecuta en el SQL Editor y pega la salida en la sesión; la salida no se guarda.

| Día (Madrid) | Hora de s10 (UTC) | estado | A · sin firma 72 h | B · última sin firma | C · incidencias | D · dudosos | E · anomalías | F · volumen del último día | timeout (authenticated / anon) |
|---|---|---|---:|---|---:|---:|---:|---|---|
| 14-oct | 08:29:45 | registro instalado (puerta NO activa) | 0 | ninguna | 0 | 0 | 0 | 13-oct: 49 filas (aún ninguna del 14-oct) | 8 s / 3 s |

- **14-oct:**
  - 49 filas en total, todas firmadas: 0 sin firma de alumno, 0 de `service_role`, 0 «otras». La primera es del 13-oct 18:13:14 UTC.
  - Una sola fila `alumno`, con versión firmada `etapa1-1`.
  - s10 lista también `authenticator`, con 8 s.
  - Sin ninguna escritura sin firma, las 72 h se cuentan desde la instalación (13-oct, hacia las 19:30): **lo antes posible para la puerta, el 16-oct hacia las 19:30**. Hace falta una s10 de esa hora o posterior con A = 0, y el sí del CTO.
