/**
 * S05 · LA CONSULTA DE NOMBRES LIBRES, ENSAYADA ANTES DE PEDIRLA
 *
 * sql/consultas/s05-nombres-libres.sql se le pide a Ramon antes de escribir el
 * SQL estructural de la persistencia (CTO 10-oct: «comprueba antes en el
 * catalogo que todos los nombres estan libres»). Antes de mandarla:
 *   1. entra en PostgreSQL 17 con el esquema STUB inventado (pg-ensayo.mjs),
 *      mas tres choques plantados: una funcion public.sim_comando(integer) de
 *      «otro producto», una tabla macro.sim_eventos en otro esquema y una
 *      columna sim_sessions.version ya existente
 *   2. es de SOLO LECTURA: corre dentro de BEGIN READ ONLY; control: una
 *      escritura en esa transaccion SI falla
 *   3. trae lo que promete: LIBRE / OCUPADO por nombre (en cualquier esquema),
 *      por columna, el inventario del prefijo sim_ en public y pgcrypto; acaba
 *      en FIN. Control positivo: cada choque plantado sale OCUPADO
 *   4. no trae filas de datos
 * ⚠️ Dice que la consulta funciona en un PostgreSQL 17 con ese stub; no prueba
 *    el editor de Supabase ni lo que vaya a devolver la base viva.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const consulta = readFileSync(path.join(REPO, 'sql/consultas/s05-nombres-libres.sql'), 'utf8')
const pg = cluster()
try {
  pg.arranca()
  titulo('1 · montaje')
  const b = pg.base('sim')
  ver('esquema stub creado', b.ok, b.err.split('\n')[0])
  const sin = pg.psql(`begin read only;\n${consulta}\ncommit;`)
  ver('sin choques: corre entera dentro de BEGIN READ ONLY', sin.ok, sin.err.split('\n')[0])
  const filasSin = sin.out.split('\n')
  ver('sin choques: los 12 nombres salen LIBRE', filasSin.filter(l => /^nombre\|[^|]+\|LIBRE$/.test(l)).length === 12, filasSin.filter(l => l.startsWith('nombre|') && !l.endsWith('|LIBRE')).join(' / '))
  ver('choques plantados', pg.psql(`create function public.sim_comando(integer) returns integer language sql as $$ select 1 $$;
    create schema macro; create table macro.sim_eventos (id int);
    alter table public.sim_sessions add column version integer;
    insert into auth.users values ('00000000-0000-0000-0000-00000000000a');
    insert into profiles (id, email) values ('00000000-0000-0000-0000-00000000000a', 'centinela@ejemplo.test');
    insert into sim_sessions (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'CENTINELA-PRIVADO');`).ok)

  titulo('2 · solo lectura')
  const r = pg.psql(`begin read only;\n${consulta}\ncommit;`)
  ver('corre entera dentro de BEGIN READ ONLY', r.ok, r.err.split('\n')[0])
  const control = pg.psql(`begin read only;\ninsert into public.messages (texto) values ('x');\ncommit;`)
  ver('control: en esa transaccion una escritura SI falla', !control.ok && /read-only transaction/.test(control.err), control.err.split('\n')[0])
  ver('el texto de la consulta no contiene ninguna orden de escritura', !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(consulta.replace(/--.*$/mg, '').replace(/'[^']*'/g, "''")))

  titulo('3 · lo que trae')
  const filas = r.out.split('\n')
  const fila = (s, o) => filas.find(l => l.startsWith(`${s}|${o}|`)) ?? ''
  ver('una funcion de otro producto con el mismo nombre: OCUPADO, con su firma', fila('nombre', 'sim_comando') === 'nombre|sim_comando|sim_comando(integer) (funcion)', fila('nombre', 'sim_comando'))
  ver('una tabla en OTRO esquema: OCUPADO, con su esquema', fila('nombre', 'sim_eventos') === 'nombre|sim_eventos|macro.sim_eventos (tabla)', fila('nombre', 'sim_eventos'))
  ver('los demas nombres siguen LIBRE', fila('nombre', 'sim_recibos').endsWith('|LIBRE') && fila('nombre', 'sim_arrendamientos').endsWith('|LIBRE') && filas.filter(l => /^nombre\|[^|]+\|LIBRE$/.test(l)).length === 10)
  ver('una columna que ya existe: OCUPADA con su tipo; una libre: LIBRE', fila('columna', 'sim_sessions.version') === 'columna|sim_sessions.version|OCUPADA · integer' && fila('columna', 'sim_sessions.estado') === 'columna|sim_sessions.estado|LIBRE', fila('columna', 'sim_sessions.version'))
  ver('las 26 columnas pedidas, con las dos formas de los importes (µ y micro)', filas.filter(l => l.startsWith('columna|')).length === 26 && !!fila('columna', 'sim_trades.bruto_µ') && !!fila('columna', 'sim_trades.bruto_micro'))
  ver('la columna nueva de profiles (siguiente_avance_desde): LIBRE en el stub', fila('columna', 'profiles.siguiente_avance_desde') === 'columna|profiles.siguiente_avance_desde|LIBRE')
  ver('prefijo sim_ en public: tablas conocidas, la funcion plantada y la FK de sim_trades', fila('prefijo', 'sim_sessions').startsWith('prefijo|sim_sessions|tabla · conocida') && fila('prefijo', 'sim_comando(integer)').startsWith('prefijo|sim_comando(integer)|funcion') && filas.some(l => /^prefijo\|sim_trades_session_id_fkey\|restriccion de sim_trades · f$/.test(l)), filas.filter(l => l.startsWith('prefijo|')).join(' / '))
  ver('la tabla de otro esquema NO sale en el prefijo de public', !filas.some(l => /^prefijo\|sim_eventos\|/.test(l)))
  ver('pgcrypto: instalada, con su esquema', /^extension\|pgcrypto\|instalada · esquema=public · version=/.test(fila('extension', 'pgcrypto')), fila('extension', 'pgcrypto'))
  ver('acaba en FIN|s05|consulta', filas.at(-1) === 'FIN|s05|consulta', filas.at(-1))

  titulo('4 · sin datos')
  ver('ningun valor de las filas sale en la respuesta', !/CENTINELA|centinela@/.test(r.out))
} catch (e) {
  ver('el ensayo arranco', false, e.message)
} finally {
  pg.cierra()
}
fin()
