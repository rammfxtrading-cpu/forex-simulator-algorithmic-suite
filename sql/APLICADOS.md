# SQL ejecutado en producción · simulador

Lo que se ha ejecutado de `sql/` en la base viva, con el informe del propio fichero. Una fila se apunta con las firmas **literales** del informe, no con un resumen; lo que llegó resumido se marca como tal.

| Fichero | Qué es | Ejecutado | Commit · sha256 del fichero ejecutado |
|---|---|---|---|
| `consultas/s04-esquema-simulador.sql` | **consulta de solo lectura** (catálogo, sin datos): el esquema real de las 9 tablas y de Storage | **sí** · **4/10/2026**, la ejecutó Ramón en el editor SQL de Supabase | `a639b0b` · `bb9aee948988519c39541be2a93817aa22d440964c5c4839ed67fb4ae783dee7` |
| `sim-001-permisos-e-integridad.sql` | anon fuera de las 7 tablas; sin TRUNCATE/REFERENCES/TRIGGER para authenticated; FK con CASCADE en session_chart_config; 3 índices; NOT NULL donde no hay nulos | **ejecutado, NO aplicado** · 4/10/2026, Ramón en el editor SQL de Supabase: **falló con su precondición** y no aplicó nada (ver abajo) | `92f7c08` · `73782606f6002c7f05e2208dd7827cdfb67700dc4b3b0d67339199681ccc720f` |
| `sim-001b-permisos-e-integridad.sql` | sim-001 + borrar antes, en el mismo DO, las filas huérfanas de session_chart_config (salvaguarda: más de 10, no hace nada) | **sí** · lo ejecutó Ramón; informe parcial literal (FK, huérfanas, FIN) pegado el 5-oct: ver abajo | `c95110b` · `a5cd4783dab3e0ed56628471410362f998cdd9e99ac27938b9d47155fab95fa0` (el fichero del commit; ver abajo) |
| `sim-002-lectura-estable.sql` | funciones `sim_trades_de_sesion` y `sim_trades_de_usuario`: los trades en UNA sentencia como jsonb; SECURITY INVOKER, search_path vacío, EXECUTE solo authenticated y service_role (bloque E, punto 3) | **NO ejecutado** · pendiente. Hay que aplicarlo **antes** de desplegar el código que lee por ahí (status, advance, admin, Analytics) | commit del bloque E, punto 3 · `56d0f947b784c3ccb966f83b06a2d76c980414178067bd35bd75c4743950952b` |

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
