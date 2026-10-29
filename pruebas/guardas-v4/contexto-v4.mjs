/**
 * CONTEXTO COMPLETO (CTO, orden 1-071, 21-oct): la UNICA comprobación de «contexto» de las migraciones de la Suite
 * (Hub, Eirene, Macro, Simulador y motor). Se acabó perseguir subfamilias de una en una (H039-01, F18-01, F19-01,
 * F18R2-01/02/03…): cada migración que toca funciones o escribe tablas pega ESTE bloque, idéntico byte a byte, en la
 * guarda (antes de cualquier «ya estaba hecho»), en la comprobación final y en su vuelta atrás; y el bloque ORIGEN,
 * idéntico, justo antes de CADA escritura.
 *
 * v2 (21-oct, revisión adversaria única de la v1, orden 1-074): la tabla escrita entera, el grafo en las dos
 * direcciones, el entorno global y la ficha ampliada. La v1, en contexto-v1.mjs.
 * v3 (22-oct, DICTAMEN CANON1 de Astra, orden 1-077):
 *   · CANON1-01: los permisos sobre PARÁMETROS (pg_parameter_acl, en el entorno) y, decisivo, ningún rol del modelo
 *     con SET sobre un parámetro de superusuario (session_replication_role y los demás) ni con ALTER SYSTEM; y el
 *     bloque ORIGEN (session_replication_role = origin) justo antes de cada escritura
 *   · CANON1-02: la tabla con su INTEGRIDAD: restricciones (tipo, validada, diferible, definición), índices (forma),
 *     columnas (tipo, NOT NULL, default, identidad, generada, colación, ACL, posición lógica: la física cambia al
 *     borrar y volver a añadir) y los disparadores INTERNOS (los
 *     de sus FK, también los del otro lado, con su encendido); y, decisivo, 0 huérfanos en cada FK de las tablas
 *     escritas (una cuenta de solo lectura)
 *   · CANON1-03: la FICHA ENTERA (no un md5 de su texto) de cada función de un disparador de la tabla, de un disparador
 *     de evento, de un default, de una restricción o de una política (por pg_depend). Las que llaman las funciones
 *     tocadas desde su cuerpo (pg_depend no las ve) van en CC_FUNCIONES: lista declarada, y probada en cada uso
 *     (auxiliares(), abajo)
 *   · CANON1-04: el grafo, el componente ENTERO (todos los caminos: subir, bajar y mixtos), con la ficha de cada rol
 *   · CANON1-05: todo en JSON (jsonb, claves y listas en orden estable): nada se une con «;», «|» ni espacios
 * La v2, en contexto-v2.mjs (solo para los rojos previos).
 * v4 (22-oct, DICTAMEN MCQ2 de Astra, orden 1-081):
 *   · MCQ-01: el CIERRE DE TABLAS, en la base: toda tabla que nombra el cuerpo de una función cubierta (las de
 *     CC_FUNCIONES y las de las fichas de las tablas: disparadores, defaults, restricciones, políticas, índices) y
 *     toda hija con una FK en cascada (ON DELETE/UPDATE CASCADE, SET NULL o SET DEFAULT) de una tabla declarada tiene
 *     que estar en CC_DISPARADORES, con su ficha entera (RLS, FORCE, políticas, ACL de tabla y de columna, dueño,
 *     réplica, publicación…). Una que falta PARA: la lista declarada no se cree, se contrasta
 *   · MCQ-04: el CIERRE DE FUNCIONES, igual y en la base: toda función que se llama desde una cubierta (y no es de
 *     pg_catalog) tiene que estar cubierta; como la regla se aplica a todas, el cierre es transitivo. Quitar una
 *     auxiliar de la lista PARA. En JS, cierreAuxiliares() hasta el punto fijo
 *   · MCQ-02: la MARCA del DO: si el bloque pasa, deja cc.contexto (local a la transacción: prefijo, proceso y hora
 *     de inicio). Una consulta de solo lectura da su veredicto con VEREDICTO(prefijo): sin el DO en ESA transacción,
 *     en otra sesión o en una transacción posterior, NO VALE. Y una consulta de solo lectura, en REPEATABLE READ (una
 *     sola instantánea para el DO y el veredicto): el bloque lo exige
 *   · MCQ-03: la publicación con su dueño, sus columnas y su filtro, y el índice de réplica (indisreplident)
 *   · MCQ-05: el ORDEN lógico de las columnas vivas (no el attnum físico)
 * La v3, en contexto-v3.mjs.
 *
 * El bloque es código FIJO: lee lo esperado de cuatro constantes que declara la migración en su DECLARE exterior:
 *   CC_PREFIJO      text     p. ej. 'E039' (sale en el mensaje)
 *   CC_FUNCIONES    text[][] ARRAY[['public.f(uuid)', '<ficha esperada>'], …]   (o '{}' si no toca funciones)
 *   CC_GRAFO        text     el grafo de roles y el entorno global esperados (medidos en producción con s-contexto.sql)
 *   CC_DISPARADORES text[][] ARRAY[['public.profiles', '<tabla esperada>'], …]  (o '{}' si no escribe tablas)
 * Cualquier diferencia PARA (nada se corrige solo).
 *
 * Uso en las pruebas de cada repo:
 *   import { BLOQUE, ORIGEN, comprueba, mide, auxiliares } from '<revisiones-suite>/guardas/contexto.mjs'
 *   comprueba(textoMigracion) → { ok, n, origenes, por }: cada bloque entre marcas es BLOQUE byte a byte, hay ≥ 1, y
 *   cada línea ORIGEN es la canónica
 * LÍMITES declarados: comprueba() no mira DÓNDE está el bloque (dentro de un comentario pasaría): lo frena que las
 * pruebas de cada migración la EJECUTAN y miden que para. Las FK se cuentan con «=» de pg_catalog (columnas de tipos
 * de base, las de la Suite).
 */
export const VERSION = 'v4'

// los atributos de un rol (jsonb): para el DUEÑO de cada función y tabla, aunque esté fuera del componente (CC3-04)
const ROL_J = oid => `(SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) ${oid})`

// la ficha de una función (jsonb), sobre «p» (pg_catalog.pg_proc) y «l» (pg_catalog.pg_language). Con search_path
// pg_catalog, pg_temp los tipos de pg_catalog salen sin esquema y los demás, con el suyo
export const FICHA_J = `pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', ${ROL_J('p.proowner')},
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace))`
export const FICHA = `${FICHA_J}::pg_catalog.text`
// la ficha (jsonb) de la función con ese oid, o null
const FICHA_DE = oid => `(SELECT ${FICHA_J} FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) ${oid})`

// los roles que ALCANZA el modelo (cierre hacia arriba: de quién es miembro), para el ALCANCE y los parámetros
const CIERRE = `WITH RECURSIVE cc_r(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])
        UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_r ON m.member OPERATOR(pg_catalog.=) cc_r.oid)`
const ORDEN = x => `${x} COLLATE pg_catalog."C"`
const LISTA = arr => `(SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(${arr}) z(z))`

// el grafo (jsonb): el COMPONENTE entero de los roles del modelo (todos los caminos, subiendo y bajando: CANON1-04),
// cada rol con todos sus atributos y ajustes, cada arista entera, y el ENTORNO global de la base
export const GRAFO = `(WITH RECURSIVE cc_b(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])),
      cc_n(oid) AS (SELECT cc_b.oid FROM cc_b UNION SELECT CASE WHEN m.member OPERATOR(pg_catalog.=) cc_n.oid THEN m.roleid ELSE m.member END
        FROM pg_catalog.pg_auth_members m JOIN cc_n ON m.member OPERATOR(pg_catalog.=) cc_n.oid OR m.roleid OPERATOR(pg_catalog.=) cc_n.oid),
      cc_arriba(oid) AS (SELECT cc_b.oid FROM cc_b UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_arriba ON m.member OPERATOR(pg_catalog.=) cc_arriba.oid),
      cc_db(oid) AS (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname OPERATOR(pg_catalog.=) pg_catalog.current_database())
      SELECT pg_catalog.jsonb_build_object(
        'roles', (SELECT pg_catalog.jsonb_object_agg(a.rolname::pg_catalog.text, pg_catalog.jsonb_build_object(
                 'super', a.rolsuper, 'bypassrls', a.rolbypassrls, 'login', a.rolcanlogin, 'inherit', a.rolinherit,
                 'createrole', a.rolcreaterole, 'createdb', a.rolcreatedb, 'replication', a.rolreplication, 'connlimit', a.rolconnlimit,
                 'validuntil', pg_catalog.date_part('epoch', a.rolvaliduntil),
                 'config', ${LISTA('a.rolconfig')},
                 'configdb', (SELECT ${LISTA('r.setconfig')} FROM pg_catalog.pg_db_role_setting r, cc_db
                   WHERE r.setrole OPERATOR(pg_catalog.=) a.oid AND r.setdatabase OPERATOR(pg_catalog.=) cc_db.oid)))
          FROM pg_catalog.pg_roles a JOIN cc_n ON a.oid OPERATOR(pg_catalog.=) cc_n.oid),
        'aristas', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(m.member)::pg_catalog.text, pg_catalog.pg_get_userbyid(m.roleid)::pg_catalog.text,
                 m.admin_option, m.inherit_option, m.set_option, pg_catalog.pg_get_userbyid(m.grantor)::pg_catalog.text)
                 ORDER BY ${ORDEN('pg_catalog.pg_get_userbyid(m.member)::pg_catalog.text')}, ${ORDEN('pg_catalog.pg_get_userbyid(m.roleid)::pg_catalog.text')}, ${ORDEN('pg_catalog.pg_get_userbyid(m.grantor)::pg_catalog.text')})
          FROM pg_catalog.pg_auth_members m
         WHERE m.member OPERATOR(pg_catalog.=) ANY (SELECT cc_n.oid FROM cc_n) OR m.roleid OPERATOR(pg_catalog.=) ANY (SELECT cc_n.oid FROM cc_n)),
        'base', (SELECT ${LISTA('r.setconfig')} FROM pg_catalog.pg_db_role_setting r, cc_db
                 WHERE r.setrole OPERATOR(pg_catalog.=) 0::pg_catalog.oid AND r.setdatabase OPERATOR(pg_catalog.=) cc_db.oid),
        'eventos', (SELECT pg_catalog.jsonb_object_agg(e.evtname::pg_catalog.text, pg_catalog.jsonb_build_object('evento', e.evtevent::pg_catalog.text,
                 'enabled', e.evtenabled::pg_catalog.text, 'dueño', pg_catalog.pg_get_userbyid(e.evtowner)::pg_catalog.text, 'tags', pg_catalog.to_jsonb(e.evttags),
                 'funcion', e.evtfoid::pg_catalog.regprocedure::pg_catalog.text, 'ficha', ${FICHA_DE('e.evtfoid')}))
          FROM pg_catalog.pg_event_trigger e),
        'esquema_public', (SELECT pg_catalog.jsonb_build_object('dueño', pg_catalog.pg_get_userbyid(n.nspowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(n.nspacl::pg_catalog.text[]))
          FROM pg_catalog.pg_namespace n WHERE n.nspname OPERATOR(pg_catalog.=) 'public'),
        'lenguajes', (SELECT pg_catalog.jsonb_object_agg(g.lanname::pg_catalog.text, pg_catalog.jsonb_build_object('dueño', pg_catalog.pg_get_userbyid(g.lanowner)::pg_catalog.text,
                 'acl', pg_catalog.to_jsonb(g.lanacl::pg_catalog.text[]), 'confiable', g.lanpltrusted))
          FROM pg_catalog.pg_language g WHERE g.lanname OPERATOR(pg_catalog.=) ANY (ARRAY['sql', 'plpgsql']::pg_catalog.name[])),
        'parametros', (SELECT pg_catalog.jsonb_object_agg(x.parname, pg_catalog.to_jsonb(x.paracl::pg_catalog.text[])) FROM pg_catalog.pg_parameter_acl x),
        'parametros_del_modelo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.rolname::pg_catalog.text, s.name, q.q)
                 ORDER BY ${ORDEN('a.rolname::pg_catalog.text')}, ${ORDEN('s.name')}, q.q)
          FROM pg_catalog.pg_roles a JOIN cc_arriba ON a.oid OPERATOR(pg_catalog.=) cc_arriba.oid, pg_catalog.pg_settings s,
               (VALUES ('SET'), ('ALTER SYSTEM')) q(q)
         WHERE (s.context OPERATOR(pg_catalog.=) 'superuser' OR q.q OPERATOR(pg_catalog.=) 'ALTER SYSTEM')
           AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q)))::pg_catalog.text)`

// la tabla escrita (cc_t: oid de pg_class), ENTERA (jsonb): disparadores de usuario (definición y FICHA de su
// función), disparadores INTERNOS de sus restricciones (también los del otro lado de sus FK), restricciones, índices,
// columnas, hijas, dueño, ACL, RLS, FORCE, políticas, reglas y la FICHA de cada función de la que dependen sus
// defaults, restricciones y políticas (pg_depend)
export const TABLA = `(SELECT pg_catalog.jsonb_build_object(
        'disp', (SELECT pg_catalog.jsonb_object_agg(t.tgname::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', t.tgenabled::pg_catalog.text,
                   'def', pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)), 'funcion', t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, 'ficha', ${FICHA_DE('t.tgfoid')}))
          FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t AND NOT t.tgisinternal),
        'internos', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(k.conname::pg_catalog.text, t.tgrelid::pg_catalog.regclass::pg_catalog.text, t.tgtype,
                   t.tgenabled::pg_catalog.text, t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, t.tgdeferrable, t.tginitdeferred)
                   ORDER BY ${ORDEN('k.conname::pg_catalog.text')}, ${ORDEN('t.tgrelid::pg_catalog.regclass::pg_catalog.text')}, t.tgtype, ${ORDEN('t.tgfoid::pg_catalog.regprocedure::pg_catalog.text')})
          FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_constraint k ON k.oid OPERATOR(pg_catalog.=) t.tgconstraint
         WHERE t.tgisinternal AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)),
        'restricciones', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', k.contype::pg_catalog.text, 'validada', k.convalidated,
                   'diferible', k.condeferrable, 'diferida', k.condeferred, 'local', k.conislocal, 'noinherit', k.connoinherit, 'def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid))))
          FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t),
        'indices', (SELECT pg_catalog.jsonb_object_agg(c.relname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_indexdef(i.indexrelid)),
                   'unico', i.indisunique, 'primaria', i.indisprimary, 'exclusion', i.indisexclusion, 'inmediato', i.indimmediate, 'valido', i.indisvalid, 'listo', i.indisready, 'vivo', i.indislive,
                   'replica', i.indisreplident))
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid OPERATOR(pg_catalog.=) i.indexrelid WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t),
        'columnas', (SELECT pg_catalog.jsonb_object_agg(a.attname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
                   'notnull', a.attnotnull, 'default', pg_catalog.md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid)), 'identidad', a.attidentity::pg_catalog.text,
                   'generada', a.attgenerated::pg_catalog.text, 'colacion', a.attcollation::pg_catalog.regcollation::pg_catalog.text, 'acl', pg_catalog.to_jsonb(a.attacl::pg_catalog.text[]),
                   'dominio', (SELECT pg_catalog.jsonb_build_object('base', pg_catalog.format_type(y.typbasetype, y.typtypmod), 'notnull', y.typnotnull, 'default', pg_catalog.md5(y.typdefault),
                       'dueño', pg_catalog.pg_get_userbyid(y.typowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(y.typacl::pg_catalog.text[]),
                       'checks', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid)), 'validada', k.convalidated))
                         FROM pg_catalog.pg_constraint k WHERE k.contypid OPERATOR(pg_catalog.=) y.oid))
                     FROM pg_catalog.pg_type y WHERE y.oid OPERATOR(pg_catalog.=) a.atttypid AND y.typtype OPERATOR(pg_catalog.=) 'd')))
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid OPERATOR(pg_catalog.=) a.attrelid AND d.adnum OPERATOR(pg_catalog.=) a.attnum
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'orden', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'hijas', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_inherits i WHERE i.inhparent OPERATOR(pg_catalog.=) cc_t),
        'padres', (SELECT pg_catalog.jsonb_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text ORDER BY i.inhseqno) FROM pg_catalog.pg_inherits i WHERE i.inhrelid OPERATOR(pg_catalog.=) cc_t),
        'vistas', (SELECT pg_catalog.jsonb_object_agg(v.oid::pg_catalog.regclass::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', v.relkind::pg_catalog.text,
                   'dueño', pg_catalog.pg_get_userbyid(v.relowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(v.relacl::pg_catalog.text[]),
                   'opciones', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(v.reloptions) z(z)),
                   'def', pg_catalog.md5(pg_catalog.pg_get_viewdef(v.oid))))
          FROM pg_catalog.pg_class v WHERE v.oid OPERATOR(pg_catalog.=) ANY (SELECT w.ev_class FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite w ON w.oid OPERATOR(pg_catalog.=) d.objid
                 WHERE d.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_rewrite'::pg_catalog.regclass AND d.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass
                   AND d.refobjid OPERATOR(pg_catalog.=) cc_t AND w.ev_class OPERATOR(pg_catalog.<>) cc_t)),
        'publicaciones', (SELECT pg_catalog.jsonb_object_agg(b.pubname::pg_catalog.text, pg_catalog.jsonb_build_object('todas', b.puballtables, 'insert', b.pubinsert, 'update', b.pubupdate,
                   'delete', b.pubdelete, 'truncate', b.pubtruncate, 'raiz', b.pubviaroot, 'dueño', pg_catalog.pg_get_userbyid(b.pubowner)::pg_catalog.text,
                   'esquema', EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                                WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t),
                   'tabla', (SELECT pg_catalog.jsonb_build_object(
                       'columnas', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY x.n) FROM pg_catalog.unnest(r.prattrs::pg_catalog.int2[]) WITH ORDINALITY x(a, n)
                                    JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) r.prrelid AND a.attnum OPERATOR(pg_catalog.=) x.a),
                       'filtro', pg_catalog.md5(pg_catalog.pg_get_expr(r.prqual, r.prrelid)))
                     FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)))
          FROM pg_catalog.pg_publication b
         WHERE b.puballtables OR EXISTS (SELECT FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)
            OR EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                        WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t)),
        'replident', (SELECT c.relreplident::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'persistencia', (SELECT c.relpersistence::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'opciones', (SELECT (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(c.reloptions) z(z)) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño_rol', (SELECT ${ROL_J('c.relowner')} FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño', (SELECT pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'tipo', (SELECT c.relkind::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'acl', (SELECT pg_catalog.to_jsonb(c.relacl::pg_catalog.text[]) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'rls', (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'force', (SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'pol', (SELECT pg_catalog.jsonb_object_agg(o.polname::pg_catalog.text, pg_catalog.jsonb_build_object('cmd', o.polcmd::pg_catalog.text, 'permisiva', o.polpermissive,
                   'roles', (SELECT pg_catalog.jsonb_agg(z.n ORDER BY z.n COLLATE pg_catalog."C") FROM (SELECT CASE WHEN r.r OPERATOR(pg_catalog.=) 0::pg_catalog.oid THEN 'public'
                      ELSE pg_catalog.pg_get_userbyid(r.r)::pg_catalog.text END n FROM pg_catalog.unnest(o.polroles) r(r)) z),
                   'using', pg_catalog.md5(pg_catalog.pg_get_expr(o.polqual, o.polrelid)), 'check', pg_catalog.md5(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid))))
          FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t),
        'reglas', (SELECT pg_catalog.jsonb_object_agg(w.rulename::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', w.ev_enabled::pg_catalog.text, 'def', pg_catalog.md5(pg_catalog.pg_get_ruledef(w.oid))))
          FROM pg_catalog.pg_rewrite w WHERE w.ev_class OPERATOR(pg_catalog.=) cc_t AND w.rulename OPERATOR(pg_catalog.<>) '_RETURN'),
        'dependencias', (SELECT pg_catalog.jsonb_object_agg(f.f::pg_catalog.regprocedure::pg_catalog.text, ${FICHA_DE('f.f')}) FROM (SELECT DISTINCT dp.refobjid f
          FROM pg_catalog.pg_depend dp
         WHERE dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
           AND ((dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_attrdef'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT d.oid FROM pg_catalog.pg_attrdef d WHERE d.adrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_constraint'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT k.oid FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT o.oid FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_trigger'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t)))) f)
      )::pg_catalog.text)`
// el nombre de antes, para los usos que lo importan
export const DISPARADORES = TABLA

// MCQ-01 y MCQ-04 (v4): lo que FALTA declarar, medido en la base. fs: las firmas de CC_FUNCIONES; ts: las tablas de
// CC_DISPARADORES (dos expresiones text[]). Las CUBIERTAS son las de fs y las de las fichas de las tablas de ts (sus
// disparadores y las de sus defaults, restricciones, políticas e índices, por pg_depend). De su cuerpo (prosrc y el de
// BEGIN ATOMIC; sin los comentarios «--»; también dentro de los literales) salen:
//   · funciones: las llamadas «esquema.nombre(» de cualquier esquema que no sea de sistema, y «nombre(» si pg_catalog
//     no tiene ese nombre; tienen que estar CUBIERTAS (como la regla vale para todas, el cierre es transitivo)
//   · tablas: «esquema.nombre» de cualquier esquema que no sea de sistema y «nombre» de public; más las hijas con una FK
//     en cascada de una tabla de ts; tienen que estar en ts
// Por nombre: sobra antes que faltar (una mención en un texto de error también cuenta). Las funciones de los
// disparadores de evento van en el grafo con su ficha, pero su cuerpo no se recorre
const ESC = x => `pg_catalog.regexp_replace(${x}, '([^A-Za-z0-9_])', '\\\\\\1', 'g')`
const SISTEMA = n => `${n} OPERATOR(pg_catalog.<>) ALL (ARRAY['pg_catalog', 'information_schema']::pg_catalog.name[]) AND ${n}::pg_catalog.text OPERATOR(pg_catalog.!~) '^pg_'`
export const FALTAN = (fs, ts) => `(WITH cc_ta AS (SELECT pg_catalog.to_regclass(z.z)::pg_catalog.oid t FROM pg_catalog.unnest(${ts}) z(z)),
      cc_cu AS (SELECT pg_catalog.to_regprocedure(z.z)::pg_catalog.oid f FROM pg_catalog.unnest(${fs}) z(z)
        UNION SELECT t.tgfoid FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)
        UNION SELECT dp.refobjid FROM pg_catalog.pg_depend dp
         WHERE dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
           AND ((dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_attrdef'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT d.oid FROM pg_catalog.pg_attrdef d WHERE d.adrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_constraint'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT k.oid FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT o.oid FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_trigger'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta))))),
      cc_tx AS (SELECT pg_catalog.regexp_replace(COALESCE(p.prosrc, '') OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) COALESCE(pg_catalog.pg_get_function_sqlbody(p.oid), ''), '--[^\\n]*', '', 'g') x
          FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
         WHERE p.oid OPERATOR(pg_catalog.=) ANY (SELECT cc_cu.f FROM cc_cu) AND l.lanname OPERATOR(pg_catalog.=) ANY (ARRAY['sql', 'plpgsql']::pg_catalog.name[])),
      cc_fc AS (SELECT p.oid, n.nspname::pg_catalog.text esq, p.proname::pg_catalog.text nom FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) p.pronamespace
         WHERE ${SISTEMA('n.nspname')}),
      cc_ll AS (SELECT DISTINCT c.oid FROM cc_fc c, cc_tx x
         WHERE x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$"])"?' OPERATOR(pg_catalog.||) ${ESC('c.esq')} OPERATOR(pg_catalog.||) '"?\\s*\\.\\s*"?' OPERATOR(pg_catalog.||) ${ESC('c.nom')} OPERATOR(pg_catalog.||) '"?\\s*\\(')
            OR (NOT EXISTS (SELECT FROM pg_catalog.pg_proc q WHERE q.pronamespace OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.regnamespace AND q.proname::pg_catalog.text OPERATOR(pg_catalog.=) c.nom)
                AND x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$."])"?' OPERATOR(pg_catalog.||) ${ESC('c.nom')} OPERATOR(pg_catalog.||) '"?\\s*\\('))),
      cc_tc AS (SELECT c.oid, n.nspname::pg_catalog.text esq, c.relname::pg_catalog.text nom FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) c.relnamespace
         WHERE c.relkind OPERATOR(pg_catalog.=) ANY (ARRAY['r', 'p', 'v', 'm', 'f']::pg_catalog."char"[]) AND ${SISTEMA('n.nspname')}),
      cc_me AS (SELECT DISTINCT c.oid FROM cc_tc c, cc_tx x
         WHERE x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$"])"?' OPERATOR(pg_catalog.||) ${ESC('c.esq')} OPERATOR(pg_catalog.||) '"?\\s*\\.\\s*"?' OPERATOR(pg_catalog.||) ${ESC('c.nom')} OPERATOR(pg_catalog.||) '"?($|[^A-Za-z0-9_$"])')
            OR (c.esq OPERATOR(pg_catalog.=) 'public' AND x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$."])"?' OPERATOR(pg_catalog.||) ${ESC('c.nom')} OPERATOR(pg_catalog.||) '"?($|[^A-Za-z0-9_$"])'))
        UNION SELECT k.conrelid FROM pg_catalog.pg_constraint k
         WHERE k.contype OPERATOR(pg_catalog.=) 'f' AND k.confrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)
           AND (k.confdeltype OPERATOR(pg_catalog.=) ANY (ARRAY['c', 'n', 'd']::pg_catalog."char"[]) OR k.confupdtype OPERATOR(pg_catalog.=) ANY (ARRAY['c', 'n', 'd']::pg_catalog."char"[])))
      SELECT pg_catalog.jsonb_build_object(
        'funciones', COALESCE((SELECT pg_catalog.jsonb_agg(l.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY l.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM cc_ll l WHERE NOT EXISTS (SELECT FROM cc_cu WHERE cc_cu.f OPERATOR(pg_catalog.=) l.oid)), '[]'::pg_catalog.jsonb),
        'tablas', COALESCE((SELECT pg_catalog.jsonb_agg(m.oid::pg_catalog.regclass::pg_catalog.text ORDER BY m.oid::pg_catalog.regclass::pg_catalog.text COLLATE pg_catalog."C")
          FROM cc_me m WHERE NOT EXISTS (SELECT FROM cc_ta WHERE cc_ta.t OPERATOR(pg_catalog.=) m.oid)), '[]'::pg_catalog.jsonb)))`

// MCQ-02 (v4): la marca que deja el DO al pasar (local a la transacción) y el VEREDICTO de una consulta de solo lectura
const MARCA_VALOR = p => `${p} OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) pg_catalog.pg_backend_pid()::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) EXTRACT(epoch FROM pg_catalog.now())::pg_catalog.text`
export const VEREDICTO = prefijo => `COALESCE(pg_catalog.current_setting('cc.contexto', true) OPERATOR(pg_catalog.=) (${MARCA_VALOR(`'${prefijo}'`)})
      AND pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on'
      AND pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.=) ANY (ARRAY['repeatable read', 'serializable']), false)`

export const MARCA_INICIO = `-- ⟦contexto-completo ${VERSION} · revisiones-suite/guardas/contexto.mjs · NO EDITAR A MANO⟧`
export const MARCA_FIN = '-- ⟦/contexto-completo⟧'
// CANON1-01: justo antes de CADA escritura (una línea, idéntica en cada sitio)
export const ORIGEN = `  IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN RAISE EXCEPTION '%-CC: session_replication_role=% justo antes de escribir. Nada cambiado; avisar al CTO', CC_PREFIJO, pg_catalog.current_setting('session_replication_role'); END IF;  -- ⟦origen ${VERSION}⟧\n`

export const BLOQUE = `  ${MARCA_INICIO}
  DECLARE
    cc_f pg_catalog.text[];
    cc_v pg_catalog.text;
    cc_t pg_catalog.oid;
    cc_k pg_catalog.record;
    cc_n pg_catalog.int8;
    cc_rs pg_catalog.text;
    cc_fs pg_catalog.text[];
    cc_ts pg_catalog.text[];
    cc_j pg_catalog.jsonb;
    cc_mal pg_catalog.text := '';
  BEGIN
    IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'session_replication_role=' OPERATOR(pg_catalog.||) pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.||) '; ';
    END IF;
    -- MCQ-02: una consulta de solo lectura, con una sola instantánea para el bloque y su veredicto
    IF pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on'
       AND pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) ALL (ARRAY['repeatable read', 'serializable']) THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'una consulta de solo lectura va en BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY (es ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.||) '); ';
    END IF;
    IF pg_catalog.cardinality(CC_FUNCIONES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_FUNCIONES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_FUNCIONES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.cardinality(CC_DISPARADORES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_DISPARADORES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_DISPARADORES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_FUNCIONES LOOP
        cc_v := NULL;
        SELECT ${FICHA}
          INTO cc_v FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
         WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(cc_f[1]);
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTRA ficha (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
      END LOOP;
    END IF;
    cc_v := ${GRAFO};
    IF cc_v IS DISTINCT FROM CC_GRAFO THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el grafo de roles es OTRO, o el entorno (' OPERATOR(pg_catalog.||) coalesce(cc_v, '-') OPERATOR(pg_catalog.||) '); ';
    END IF;
    ${CIERRE}
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text, ',' ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C") INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid
     WHERE a.rolsuper OR (pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 AND a.oid OPERATOR(pg_catalog.=) ANY (
             SELECT p.proowner FROM pg_catalog.pg_proc p, pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)
              WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(CC_FUNCIONES[g.i][1])));
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que alcanzan al dueño o a un superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    ${CIERRE}
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) s.name OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) q.q, ','
             ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C", s.name COLLATE pg_catalog."C", q.q) INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid, pg_catalog.pg_settings s, (VALUES ('SET'), ('ALTER SYSTEM')) q(q)
     WHERE (s.context OPERATOR(pg_catalog.=) 'superuser' OR q.q OPERATOR(pg_catalog.=) 'ALTER SYSTEM') AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q);
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que pueden cambiar parámetros de superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_DISPARADORES LOOP
        cc_t := pg_catalog.to_regclass(cc_f[1]);
        cc_v := CASE WHEN cc_t IS NULL THEN NULL ELSE ${TABLA} END;
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTROS disparadores, hijas, permisos, RLS, políticas, reglas, restricciones, índices o columnas (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
        -- CANON1-02: 0 huérfanos en cada FK de la tabla, en los dos sentidos (solo una cuenta). CC3-07: según MATCH FULL o
        -- SIMPLE, y con row_security = off (quien no se salta la RLS da ERROR, no un 0)
        IF cc_t IS NOT NULL THEN
          cc_rs := pg_catalog.current_setting('row_security');
          PERFORM pg_catalog.set_config('row_security', 'off', true);
          FOR cc_k IN SELECT k.oid, k.conname, k.conrelid, k.confrelid, k.confmatchtype,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NOT NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) nn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) tn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' OR ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) an,
                (SELECT pg_catalog.string_agg(pg_catalog.format('p.%I OPERATOR(pg_catalog.=) c.%I', pa.attname, ca.attname), ' AND ' ORDER BY x.n)
                   FROM ROWS FROM (pg_catalog.unnest(k.conkey), pg_catalog.unnest(k.confkey)) WITH ORDINALITY x(a, b, n)
                   JOIN pg_catalog.pg_attribute ca ON ca.attrelid OPERATOR(pg_catalog.=) k.conrelid AND ca.attnum OPERATOR(pg_catalog.=) x.a
                   JOIN pg_catalog.pg_attribute pa ON pa.attrelid OPERATOR(pg_catalog.=) k.confrelid AND pa.attnum OPERATOR(pg_catalog.=) x.b) eq
              FROM pg_catalog.pg_constraint k
             WHERE k.contype OPERATOR(pg_catalog.=) 'f' AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)
             ORDER BY k.conname COLLATE pg_catalog."C" LOOP
            IF cc_k.confmatchtype OPERATOR(pg_catalog.=) 'f' THEN
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE NOT (%s) AND ((%s) OR NOT EXISTS (SELECT 1 FROM %s p WHERE %s))',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.tn, cc_k.an, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            ELSE
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.nn, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            END IF;
            IF cc_n OPERATOR(pg_catalog.<>) 0 THEN
              cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_k.conname OPERATOR(pg_catalog.||) ' tiene ' OPERATOR(pg_catalog.||) cc_n::pg_catalog.text OPERATOR(pg_catalog.||) ' filas huérfanas; ';
            END IF;
          END LOOP;
          PERFORM pg_catalog.set_config('row_security', cc_rs, true);
        END IF;
      END LOOP;
    END IF;
    -- MCQ-01 y MCQ-04: los cierres de funciones y de tablas, medidos en la base, contra lo declarado
    cc_fs := CASE WHEN pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_FUNCIONES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_ts := CASE WHEN pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_DISPARADORES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_DISPARADORES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_j := ${FALTAN('cc_fs', 'cc_ts')};
    IF cc_j OPERATOR(pg_catalog.<>) '{"funciones": [], "tablas": []}'::pg_catalog.jsonb THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el cierre no está declarado: faltan en CC_FUNCIONES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'funciones')::pg_catalog.text
                OPERATOR(pg_catalog.||) ' y en CC_DISPARADORES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'tablas')::pg_catalog.text OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF cc_mal OPERATOR(pg_catalog.<>) '' THEN
      RAISE EXCEPTION '%-CC: el contexto no es el esperado: %. Nada cambiado; avisar al CTO', CC_PREFIJO, cc_mal;
    END IF;
    -- MCQ-02: la marca (local a esta transacción) que exige VEREDICTO()
    PERFORM pg_catalog.set_config('cc.contexto', ${MARCA_VALOR('CC_PREFIJO')}, true);
  END;
  ${MARCA_FIN}
`

// cada bloque entre las marcas tiene que ser BLOQUE, byte a byte (sin la sangría de la primera línea), y cada línea
// con la marca de ORIGEN, la canónica
export function comprueba(texto) {
  const partes = texto.split(MARCA_INICIO).slice(1)
  if (!partes.length) return { ok: false, n: 0, origenes: 0, por: 'no hay ningún bloque de contexto completo' }
  const canonico = BLOQUE.slice(BLOQUE.indexOf(MARCA_INICIO) + MARCA_INICIO.length, BLOQUE.indexOf(MARCA_FIN) + MARCA_FIN.length)
  const malos = partes.map((p, i) => [i, p.slice(0, p.indexOf(MARCA_FIN) + MARCA_FIN.length)]).filter(([, p]) => p !== canonico)
  const lineasOrigen = texto.split('\n').filter(l => l.includes(`⟦origen ${VERSION}⟧`) || /⟦origen v\d+⟧/.test(l))
  const origenMal = lineasOrigen.filter(l => l + '\n' !== ORIGEN).length
  const por = [malos.length ? `bloques distintos del canónico: ${malos.map(([i]) => i + 1).join(', ')}` : '', origenMal ? `${origenMal} líneas ORIGEN distintas de la canónica` : ''].filter(Boolean).join('; ')
  return { ok: malos.length === 0 && origenMal === 0, n: partes.length, origenes: lineasOrigen.length, por }
}

// CANON1-03 (lista declarada y probada): las funciones que un cuerpo LLAMA y no son de pg_catalog. Se le da el cuerpo
// (prosrc) y la lista de funciones de la base [{esquema, nombre}], CON las de pg_catalog; devuelve «esquema.nombre» de
// cada una que se llama: calificada (esquema.nombre( , también entre comillas) o sin calificar (nombre( : cualquier
// esquema con ese nombre, salvo si pg_catalog lo tiene, que va ANTES). CC3-06: también dentro de los literales
// (EXECUTE '…', format('…')): solo se quitan los comentarios
const ID = '(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))'
const nombre = (q, n) => q !== undefined ? q.replace(/""/g, '"') : n.toLowerCase()
export function auxiliares(cuerpo, funciones) {
  const hay = new Set(funciones.map(f => `${f.esquema}.${f.nombre}`)), out = new Set()
  const sin = cuerpo.replace(/--[^\n]*/g, '')
  for (const m of sin.matchAll(new RegExp(`(?:${ID}\\s*\\.\\s*)?${ID}\\s*\\(`, 'g'))) {
    const esq = m[1] !== undefined || m[2] !== undefined ? nombre(m[1], m[2]) : null, nom = nombre(m[3], m[4])
    if (esq === 'pg_catalog') continue
    if (esq) { if (hay.has(`${esq}.${nom}`)) out.add(`${esq}.${nom}`); continue }
    if (hay.has(`pg_catalog.${nom}`)) continue
    for (const f of funciones) if (f.nombre === nom && f.esquema !== 'pg_catalog') out.add(`${f.esquema}.${f.nombre}`)
  }
  return [...out].sort()
}

// MCQ-04 (v4): el CIERRE de auxiliares hasta el punto fijo: desde unas funciones «esquema.nombre», las que llaman, las
// que llaman esas… cuerpos: { 'esquema.nombre': prosrc } (de todas las que se puedan llamar); funciones: como en auxiliares()
export function cierreAuxiliares(iniciales, cuerpos, funciones) {
  const hechas = new Set(), cola = [...iniciales]
  while (cola.length) {
    const f = cola.shift()
    if (hechas.has(f)) continue
    hechas.add(f)
    for (const g of auxiliares(cuerpos[f] ?? '', funciones)) if (!hechas.has(g)) cola.push(g)
  }
  return [...hechas].sort()
}

// MCQ-02 (v4): una consulta de solo lectura vale si pega el BLOQUE, va en REPEATABLE READ READ ONLY y su veredicto
// sale de VEREDICTO(prefijo), tal cual
export function compruebaConsulta(texto, prefijo) {
  const c = comprueba(texto)
  const rr = /^begin isolation level repeatable read read only;$/im.test(texto), v = texto.includes(VEREDICTO(prefijo))
  return { ok: c.ok && rr && v, por: [c.ok ? '' : c.por, rr ? '' : 'sin BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', v ? '' : `el veredicto no sale de VEREDICTO('${prefijo}')`].filter(Boolean).join('; ') }
}

// CC3-05 (lista declarada y probada): las tablas que un cuerpo ESCRIBE (INSERT INTO, UPDATE, DELETE FROM, MERGE INTO,
// TRUNCATE; también dentro de EXECUTE y format). Se le da la lista de tablas [{esquema, nombre}]; sin calificar, la
// de cualquier esquema con ese nombre. Las que cambian por las FK en cascada, aparte (mide.cascadas)
export function escritas(cuerpo, tablas) {
  const out = new Set(), sin = cuerpo.replace(/--[^\n]*/g, '')
  for (const m of sin.matchAll(new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|MERGE\\s+INTO|TRUNCATE(?:\\s+TABLE)?)\\s+(?:ONLY\\s+)?(?:${ID}\\s*\\.\\s*)?${ID}`, 'gi'))) {
    const esq = m[1] !== undefined || m[2] !== undefined ? nombre(m[1], m[2]) : null, nom = nombre(m[3], m[4])
    for (const t of tablas) if (t.nombre === nom && (esq ? t.esquema === esq : true)) out.add(`${t.esquema}.${t.nombre}`)
  }
  return [...out].sort()
}

// para medir lo esperado en un montaje (o en producción, con s-contexto.sql): la ficha de unas funciones, el grafo
// y la ficha de unas tablas
export const mide = { ficha: firma => `select ${FICHA} from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang where p.oid = pg_catalog.to_regprocedure('${firma}')`,
  grafo: () => `select ${GRAFO}`, disparadores: tabla => `select (select ${TABLA} from (select pg_catalog.to_regclass('${tabla}')::pg_catalog.oid cc_t) x)` }
mide.tabla = mide.disparadores
mide.cascadas = tabla => `with recursive c(t) as (select pg_catalog.to_regclass('${tabla}')::pg_catalog.oid
  union select k.conrelid from pg_catalog.pg_constraint k join c on k.confrelid = c.t where k.contype = 'f' and (k.confdeltype in ('c', 'n', 'd') or k.confupdtype in ('c', 'n', 'd')))
  select pg_catalog.string_agg(t::pg_catalog.regclass::pg_catalog.text, ',' order by t::pg_catalog.regclass::pg_catalog.text) from c`

// s-contexto.sql: la consulta de solo lectura que mide en producción lo que esperan los usos (genera-s-contexto.mjs).
// Solo catálogo: la cuenta de huérfanos NO va aquí (lee filas); va en el bloque de cada migración
export function sContexto(funciones, tablas, cabecera) {
  const lista = xs => xs.map(x => `    ('${x}')`).join(',\n')
  return `${cabecera}begin isolation level repeatable read read only;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
set local row_security = off;
with
guarda as (select case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then true
                       else ('s-contexto: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
fun(firma) as (values
${lista(funciones)}),
tab(nombre) as (values
${lista(tablas)}),
-- MCQ-01 y MCQ-04: lo que falta declarar en estas listas, medido en la base (una vez)
falt as (select ${FALTAN('(select pg_catalog.array_agg(f.firma) from fun f)', '(select pg_catalog.array_agg(x.nombre) from tab x)')} j),
filas as (
  select 0 o, 'envoltura'::pg_catalog.text seccion,
         (case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then 'READ ONLY' else 'NO READ ONLY' end
          OPERATOR(pg_catalog.||) ' · lock_timeout ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('lock_timeout')
          OPERATOR(pg_catalog.||) ' · statement_timeout ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('statement_timeout')) objeto,
         ''::pg_catalog.text valor
  union all
  select 1, 'grafo', 'contexto ${VERSION}: el componente de anon, authenticated, service_role y authenticator, y el entorno', ${GRAFO}
  union all
  select 2, 'funcion', f.firma, coalesce((select ${FICHA}
      from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
     where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma)), 'no existe')
    from fun f
  union all
  select 3, 'tabla', x.nombre, coalesce((select ${TABLA}
      from (select pg_catalog.to_regclass(x.nombre)::pg_catalog.oid cc_t) y where y.cc_t is not null), 'no existe')
    from tab x
  union all
  -- MCQ-01 y MCQ-04: lo que falta declarar en estas listas (tiene que salir vacío) y, por si no, la ficha de cada una
  -- (un nivel más: así no hace falta otra corrida para declararlas)
  select 4, 'cierre', 'faltan', (select x.j from falt x)::pg_catalog.text
  union all
  select 4, 'tabla+', z.z, COALESCE((select ${TABLA}
      from (select pg_catalog.to_regclass(z.z)::pg_catalog.oid cc_t) y where y.cc_t is not null), 'no existe')
    from falt x, pg_catalog.jsonb_array_elements_text(x.j OPERATOR(pg_catalog.->) 'tablas') z(z)
  union all
  select 4, 'funcion+', z.z, COALESCE((select ${FICHA}
      from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
     where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(z.z)), 'no existe')
    from falt x, pg_catalog.jsonb_array_elements_text(x.j OPERATOR(pg_catalog.->) 'funciones') z(z)
  union all
  -- CANON1-02: una CUENTA de huérfanos por cada FK de las tablas (solo un número; ni un id)
  select 5, 'huerfanos', k.conname::pg_catalog.text, (pg_catalog.xpath('/row/n/text()', pg_catalog.query_to_xml(pg_catalog.format(
         'SELECT pg_catalog.count(*) n FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', k.conrelid::pg_catalog.regclass,
         (SELECT CASE WHEN k.confmatchtype OPERATOR(pg_catalog.=) 'f'
                      THEN '(NOT (' OPERATOR(pg_catalog.||) pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' AND ' ORDER BY x.n) OPERATOR(pg_catalog.||) '))'
                      ELSE pg_catalog.string_agg(pg_catalog.format('c.%I IS NOT NULL', a.attname), ' AND ' ORDER BY x.n) END
            FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a),
         k.confrelid::pg_catalog.regclass,
         (SELECT pg_catalog.string_agg(pg_catalog.format('p.%I OPERATOR(pg_catalog.=) c.%I', pa.attname, ca.attname), ' AND ' ORDER BY x.n)
            FROM ROWS FROM (pg_catalog.unnest(k.conkey), pg_catalog.unnest(k.confkey)) WITH ORDINALITY x(a, b, n)
            JOIN pg_catalog.pg_attribute ca ON ca.attrelid OPERATOR(pg_catalog.=) k.conrelid AND ca.attnum OPERATOR(pg_catalog.=) x.a
            JOIN pg_catalog.pg_attribute pa ON pa.attrelid OPERATOR(pg_catalog.=) k.confrelid AND pa.attnum OPERATOR(pg_catalog.=) x.b)),
         false, true, '')))[1]::pg_catalog.text
    from pg_catalog.pg_constraint k
   where k.contype OPERATOR(pg_catalog.=) 'f' and exists (select from tab x where k.conrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(x.nombre) or k.confrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(x.nombre))
  union all
  select 6, 'FIN', 's-contexto', ''
)
select f.seccion, f.objeto, f.valor from filas f where (select g.ok from guarda g) order by f.o, f.objeto collate pg_catalog."C";
rollback;
`
}
