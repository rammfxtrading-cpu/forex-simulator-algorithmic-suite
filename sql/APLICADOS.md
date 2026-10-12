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

**sim-003, informe LITERAL** (Ramón, 12-oct): `consultas/salidas/sim-003-informe-2026-10-12.csv` (sha256 `cb413afc…c9476b94282`), 64 filas: tabla 4, columna 20, restriccion 27, indice 1, politica 2, funcion 9 y `FIN | sim-003 aplicada`. **Idéntico, fila a fila y en el mismo orden**, al informe del ensayo sobre el montaje literal de s04, tanto con el `postgres` superusuario de `pruebas/sim-003.mjs` como con un ejecutor no superusuario como el de producción. Pendiente: s07 (permisos de las secuencias nuevas, que ninguna guarda de sim-003 comprueba).

