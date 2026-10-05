-- ============================================================================
-- sim-002 — lectura estable de los trades: UNA sentencia, UN conjunto
--
-- POR QUE EXISTE. Astra (verificacion del bloque D, 5-oct-2026, BD-04): leer
-- los trades por paginas, aunque sea por clave y dos veces, puede reunir filas
-- de estados distintos. Con cuatro trades que alternan entre dos estados que
-- suman −400 cada uno, la evaluacion del reto daba +800. Decision del CTO
-- (bloque E, punto 3): funciones que devuelven TODOS los trades de una sesion
-- (o de un usuario) en una sola sentencia, como un unico jsonb. Una sentencia
-- de PostgreSQL ve una sola instantanea: no puede mezclar estados.
--
-- QUE CREA:
--   public.sim_trades_de_sesion(p_session_id uuid) → jsonb   (status, advance)
--   public.sim_trades_de_usuario(p_user_id uuid)   → jsonb   (admin, Analytics)
--   Cada una: un array jsonb con las filas de sim_trades (to_jsonb), ordenadas
--   por id (cada pantalla reordena despues). Sin filas: [].
--   · SECURITY INVOKER: se aplica la RLS de quien llama. Un alumno solo recibe
--     sus trades; pedir los de otro devuelve [] (no un error que confirme que
--     existen). service_role (el servidor) los ve todos (bypassrls).
--   · search_path vacio y objetos calificados (public.sim_trades): nada se
--     resuelve por el search_path de quien llama.
--   · STABLE.
--   · EXECUTE solo para authenticated y service_role; revocado a PUBLIC y a
--     anon (en Supabase los privilegios por defecto lo conceden a ambos).
--
-- ── LO QUE ESTO NO TOCA ────────────────────────────────────────────────────
--   Ninguna tabla, politica, grant de tabla ni dato. Solo crea (o reemplaza)
--   estas dos funciones y fija sus permisos.
--
-- ── COMO SE EJECUTA ────────────────────────────────────────────────────────
--   Entero, de una vez, en el editor SQL de Supabase. Son DOS ordenes:
--     1. un solo bloque DO que crea las funciones, fija permisos y COMPRUEBA
--        el resultado. Si una comprobacion falla, revienta con «sim-002: …» y
--        no queda NADA creado: un bloque DO es una sola transaccion.
--     2. una SELECT de informe, que no cambia nada y acaba en
--        «FIN | sim-002 aplicada».
--   Idempotente: una segunda ejecucion deja la base igual.
--
-- ⚠️ DESPLIEGUE: el codigo de la rama (status, advance, admin, Analytics) lee
--    por estas funciones. Sin sim-002 aplicado, esas pantallas dan error (503 /
--    aviso): se aplica ANTES de desplegar ese codigo.
--
-- Ensayado en PostgreSQL 17 local con el esquema INVENTADO de la s04
-- (pruebas/sim-002.mjs): aplicar, repetir, permisos por rol, RLS, y el caso
-- +800 frente a −400 con UPDATE alterno. No prueba el editor de Supabase.
-- ============================================================================

DO $sim_002$
DECLARE
  f    text;
  rol  text;
  cfg  text[];
BEGIN
  -- ── 0 · lo que se da por hecho ──────────────────────────────────────────
  IF to_regclass('public.sim_trades') IS NULL THEN
    RAISE EXCEPTION 'sim-002: no existe public.sim_trades: no se aplica nada';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sim_trades'::regclass) THEN
    RAISE EXCEPTION 'sim-002: RLS esta apagada en sim_trades; una funcion SECURITY INVOKER no protegeria nada: revisar antes';
  END IF;
  FOREACH f IN ARRAY ARRAY['id', 'session_id', 'user_id'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.sim_trades'::regclass AND attname = f AND NOT attisdropped) THEN
      RAISE EXCEPTION 'sim-002: sim_trades no tiene la columna %', f;
    END IF;
  END LOOP;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      RAISE EXCEPTION 'sim-002: no existe el rol %', rol;
    END IF;
  END LOOP;

  -- ── 1 · las funciones ───────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.sim_trades_de_sesion(p_session_id uuid)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
  AS $f$
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
      FROM public.sim_trades t
     WHERE t.session_id = p_session_id
  $f$;

  CREATE OR REPLACE FUNCTION public.sim_trades_de_usuario(p_user_id uuid)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
  AS $f$
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
      FROM public.sim_trades t
     WHERE t.user_id = p_user_id
  $f$;

  -- ── 2 · permisos ────────────────────────────────────────────────────────
  REVOKE ALL ON FUNCTION public.sim_trades_de_sesion(uuid)  FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.sim_trades_de_usuario(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.sim_trades_de_sesion(uuid)  FROM anon;
  REVOKE ALL ON FUNCTION public.sim_trades_de_usuario(uuid) FROM anon;
  GRANT EXECUTE ON FUNCTION public.sim_trades_de_sesion(uuid)  TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.sim_trades_de_usuario(uuid) TO authenticated, service_role;

  -- ── 3 · comprobaciones: si una falla, no queda NADA ─────────────────────
  FOREACH f IN ARRAY ARRAY['public.sim_trades_de_sesion(uuid)', 'public.sim_trades_de_usuario(uuid)'] LOOP
    IF (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure) THEN
      RAISE EXCEPTION 'sim-002: % quedo SECURITY DEFINER', f;
    END IF;
    IF (SELECT provolatile FROM pg_proc WHERE oid = f::regprocedure) <> 's' THEN
      RAISE EXCEPTION 'sim-002: % no quedo STABLE', f;
    END IF;
    SELECT proconfig INTO cfg FROM pg_proc WHERE oid = f::regprocedure;
    IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
      RAISE EXCEPTION 'sim-002: % no tiene el search_path fijado (vacio): %', f, cfg;
    END IF;
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'sim-002: anon puede ejecutar % (¿grant a PUBLIC?)', f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = f::regprocedure AND a.grantee = 0) THEN
      RAISE EXCEPTION 'sim-002: PUBLIC conserva EXECUTE sobre %', f;
    END IF;
    FOREACH rol IN ARRAY ARRAY['authenticated', 'service_role'] LOOP
      IF NOT has_function_privilege(rol, f, 'EXECUTE') THEN
        RAISE EXCEPTION 'sim-002: % no puede ejecutar %: las pantallas dejarian de funcionar', rol, f;
      END IF;
    END LOOP;
  END LOOP;
END
$sim_002$;


-- ============================================================================
-- INFORME (solo lectura). Lo que el bloque ha dejado, para pegarlo tal cual.
-- Sin filas de datos: solo catalogo.
-- ============================================================================
with f(firma) as (values ('public.sim_trades_de_sesion(uuid)'), ('public.sim_trades_de_usuario(uuid)'))
select seccion, detalle from (
  select 1 o, 'funcion' seccion,
         p.pronamespace::regnamespace::text || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || ' · devuelve ' || pg_get_function_result(p.oid)
         || ' · security_definer=' || p.prosecdef || ' · volatil=' || p.provolatile::text
         || ' · config=' || coalesce(array_to_string(p.proconfig, ','), '-') detalle
    from pg_proc p where p.oid in (select firma::regprocedure from f)
  union all
  select 2, 'execute', p.pronamespace::regnamespace::text || '.' || p.proname || ' · ' || r.rol || '=' || has_function_privilege(r.rol, p.oid, 'EXECUTE')
    from pg_proc p, (values ('anon'), ('authenticated'), ('service_role')) r(rol)
   where p.oid in (select firma::regprocedure from f)
  union all
  select 3, 'execute', p.pronamespace::regnamespace::text || '.' || p.proname || ' · PUBLIC='
         || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
    from pg_proc p where p.oid in (select firma::regprocedure from f)
  union all
  select 9, 'FIN', 'sim-002 aplicada'
) x order by o, detalle;
