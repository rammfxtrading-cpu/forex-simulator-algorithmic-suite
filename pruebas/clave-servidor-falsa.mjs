// Doble de lib/claveServidor.cjs SOLO para lib/authApi.js (lo sustituye pruebas/cargador.mjs).
// Bajo `env -i` no hay ninguna variable de Supabase (pruebas/arnes.mjs lo exige) y la real lanzaria «falta la
// clave» al cargar authApi.js, como en produccion sin variables. El doble:
//   · si hay SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY, llama a la REAL (mismas reglas y errores);
//   · si no hay ninguna, devuelve una clave ficticia (el cliente es supabase-falso.mjs: no la usa para nada).
// Apunta en globalThis.__claveServidor de donde salio, para que srk01 vea que la app paso por la real.
import { createRequire } from 'node:module'
const real = createRequire(import.meta.url)('../lib/claveServidor.cjs')
export function getClaveServidor(env = process.env) {
  if (real.hayClaveServidor(env)) { globalThis.__claveServidor = 'real'; return real.getClaveServidor(env) }
  globalThis.__claveServidor = 'ficticia'
  return 'ficticia-de-pruebas'
}
export const { hayClaveServidor, variableClaveServidor } = real
