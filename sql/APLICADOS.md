# SQL ejecutado en producción · simulador

Lo que se ha ejecutado de `sql/` en la base viva, con el informe del propio fichero. Una fila se apunta con las firmas **literales** del informe, no con un resumen; lo que llegó resumido se marca como tal.

| Fichero | Qué es | Ejecutado | Commit · sha256 del fichero ejecutado |
|---|---|---|---|
| `consultas/s04-esquema-simulador.sql` | **consulta de solo lectura** (catálogo, sin datos): el esquema real de las 9 tablas y de Storage | **sí** · **4/10/2026**, la ejecutó Ramón en el editor SQL de Supabase | `a639b0b` · `bb9aee948988519c39541be2a93817aa22d440964c5c4839ed67fb4ae783dee7` |
| `sim-001-permisos-e-integridad.sql` | anon fuera de las 7 tablas; sin TRUNCATE/REFERENCES/TRIGGER para authenticated; FK con CASCADE en session_chart_config; 3 índices; NOT NULL donde no hay nulos | **no** (pendiente) | — |

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

Para el `baseline` versionado hace falta la salida completa, fila a fila.
