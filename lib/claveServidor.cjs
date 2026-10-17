// La clave de servidor de Supabase (orden 2-018 del CTO). UN solo sitio del repo la lee: la app
// (lib/authApi.js), los scripts de scripts/ y los workflows (que pasan las dos variables).
//
//   1 · SUPABASE_SECRET_KEY, la nueva: una secret key propia de esta app (sb_secret_…);
//   2 · si no está, SUPABASE_SERVICE_ROLE_KEY, la vieja (la service_role compartida), mientras dure el cambio;
//   3 · si no hay ninguna, un error claro.
//
// Es CommonJS (.cjs) para que la lean igual los scripts (require, Node 20 en Actions) y la app (import).
// Una variable vacía o de solo espacios cuenta como que no está: un secreto de Actions sin definir llega como ''.
// Si la nueva no tiene forma de secret key (una publishable, o la service_role vieja pegada en la nueva), error:
// con una publishable el servidor iría como anon sin avisar.
// ⛔ Ningún mensaje lleva el valor de una clave, ni un trozo, y aquí no se escribe nada en la consola.
function getClaveServidor(env = process.env) {
  const nueva = (env.SUPABASE_SECRET_KEY ?? '').trim()
  if (nueva) {
    if (!nueva.startsWith('sb_secret_')) {
      throw new Error('SUPABASE_SECRET_KEY no tiene forma de secret key de Supabase (sb_secret_…): revisa la variable (su valor no se muestra)')
    }
    return nueva
  }
  const vieja = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (vieja) return vieja
  throw new Error('Falta la clave de servidor de Supabase: no está SUPABASE_SECRET_KEY ni SUPABASE_SERVICE_ROLE_KEY')
}

// ¿Hay alguna de las dos (no vacía)? Para los scripts que eligen entre el entorno y .env.local
function hayClaveServidor(env = process.env) {
  return !!((env.SUPABASE_SECRET_KEY ?? '').trim() || (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim())
}

// El NOMBRE de la variable que se usa (nunca su valor), para el diagnóstico de credenciales
function variableClaveServidor(env = process.env) {
  return (env.SUPABASE_SECRET_KEY ?? '').trim() ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
}

module.exports = { getClaveServidor, hayClaveServidor, variableClaveServidor }
