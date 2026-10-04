/**
 * S04 · LA CONSULTA DE SOLO LECTURA DEL ESQUEMA, ENSAYADA ANTES DE PEDIRLA
 *
 * sql/consultas/s04-esquema-simulador.sql se le pide a Ramon para versionar el
 * esquema real del simulador. Antes de mandarla:
 *   1. entra en PostgreSQL 17 con un esquema STUB inventado (pg-ensayo.mjs)
 *   2. es de SOLO LECTURA: corre dentro de BEGIN READ ONLY (si escribiera,
 *      fallaria); control: una escritura en esa misma transaccion SI falla
 *   3. trae lo que promete: la tabla que falta, columnas, constraints (y las FK
 *      entrantes), indices, triggers, politicas, grants (tambien por columna),
 *      funciones (las de los triggers, las que nombran las politicas, is_admin y
 *      handle_new_user), el bucket forex-data y TODAS las politicas de
 *      storage.objects marcando cuales nombran el bucket; acaba en FIN
 *   4. no trae filas de datos: ningun valor de las tablas aparece en la salida
 * ⚠️ Dice que la consulta funciona en un PostgreSQL 17 con ese stub; no prueba
 *    el editor de Supabase ni lo que vaya a devolver la base viva.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const consulta = readFileSync(path.join(REPO, 'sql/consultas/s04-esquema-simulador.sql'), 'utf8')
const pg = cluster()
try {
  pg.arranca()
  titulo('1 · montaje')
  const b = pg.base('sim')
  ver('esquema stub creado', b.ok, b.err.split('\n')[0])
  // un dato que NO debe salir en la consulta
  ver('un dato centinela en sim_sessions', pg.psql(`insert into auth.users values ('00000000-0000-0000-0000-00000000000a');
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
  const de = s => filas.filter(l => l.startsWith(s + '|'))
  ver('la tabla que falta sale como FALTA (user_tool_config)', de('FALTA').length === 1 && de('FALTA')[0].startsWith('FALTA|user_tool_config|'), de('FALTA').join(' / '))
  ver('las 8 tablas que existen, con RLS', de('tabla').length === 8 && filas.includes('tabla|sim_sessions|dueño=postgres · rls=true · rls_forzada=false'), de('tabla').length)
  ver('columnas con tipo, NOT NULL y default', filas.some(l => l === 'columna|sim_sessions.user_id|02 · uuid · NOT NULL · default=-') && filas.some(l => /^columna\|sim_sessions\.status\|.*default='active'::text/.test(l)))
  ver('PK, FK con su ON DELETE, y la FK entrante de otra tabla', de('restriccion').some(l => /sim_trades\.sim_trades_session_id_fkey\|f · FOREIGN KEY \(session_id\) REFERENCES sim_sessions\(id\) ON DELETE CASCADE/.test(l))
    && de('restriccion').some(l => /hub_lectura\.hub_lectura_sesion_fkey \(entrante\)\|f · public\.hub_lectura FOREIGN KEY \(sesion\) REFERENCES sim_sessions\(id\) ON DELETE SET NULL/.test(l)), de('restriccion').filter(l => /entrante/.test(l)).join(' / '))
  ver('indices (incluido el no unico de sim_trades)', de('indice').some(l => l.includes('sim_trades.sim_trades_session|CREATE INDEX')))
  ver('trigger con su definicion', de('trigger').some(l => l.startsWith('trigger|sim_sessions.sim_sessions_limite|CREATE TRIGGER')))
  ver('politicas de las tablas', de('politica').length === 2 && de('politica').some(l => l.startsWith('politica|public.sim_sessions.sesiones_propias|ALL')))
  ver('grants por tabla y por columna', de('grant').some(l => l.startsWith('grant|sim_sessions · authenticated|DELETE,INSERT,SELECT,UPDATE')) && de('grant').some(l => l === 'grant|profiles.nombre · authenticated|POR COLUMNA: UPDATE'), de('grant').filter(l => /POR COLUMNA/.test(l)).join(' / '))
  const funciones = de('funcion').map(l => l.split('|')[1])
  ver('funciones: la del trigger, is_admin (nombrada en la politica) y handle_new_user', ['limite_sesiones()', 'is_admin()', 'handle_new_user()'].every(f => funciones.includes(f)) && r.out.includes('CREATE OR REPLACE FUNCTION public.limite_sesiones()'), funciones.join(', '))
  ver('el bucket forex-data, publico', filas.includes('bucket|forex-data|publico=true · limite_bytes=sin limite · tipos=todos'), de('bucket').join(' / '))
  ver('RLS de storage.objects y TODAS sus politicas, marcando cual nombra forex-data',
    filas.includes('storage|storage.objects|rls=true · rls_forzada=false')
    && de('storage').some(l => l.startsWith('storage|storage.objects.lectura forex|NOMBRA forex-data · SELECT'))
    && de('storage').some(l => l.startsWith('storage|storage.objects.subidas propias|no nombra forex-data · INSERT')), de('storage').length)
  ver('acaba en FIN|s04|consulta', filas.at(-1) === 'FIN|s04|consulta', filas.at(-1))

  titulo('4 · sin datos')
  ver('ningun valor de las filas sale en la respuesta', !/CENTINELA|centinela@/.test(r.out))

  titulo('5 · sin el bucket')
  pg.psql(`delete from storage.objects; delete from storage.buckets where id = 'forex-data';`)
  const sin = pg.psql(`begin read only;\n${consulta}\ncommit;`)
  ver('si forex-data no existe, lo dice', sin.ok && sin.out.split('\n').includes('bucket|forex-data|NO EXISTE el bucket forex-data'))
} catch (e) {
  ver('el ensayo arranco', false, e.message)
} finally {
  pg.cierra()
}
fin()
