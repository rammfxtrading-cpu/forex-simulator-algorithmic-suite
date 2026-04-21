import { createClient } from '@supabase/supabase-js'

// Cliente server-side con service_role (privilegios totales).
// SOLO se usa dentro de /api/ para operaciones administrativas.
// NUNCA importarlo desde el frontend.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

/**
 * Extrae el usuario autenticado de la petición.
 * Busca el JWT en el header Authorization o en la cookie sb-access-token.
 * Devuelve { user, error }.
 */
async function getUserFromRequest(req) {
  // 1) Intentar por header Authorization: Bearer <token>
  let token = null
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  // 2) Si no hay header, intentar por cookies. Supabase almacena el access token
  //    en una cookie que empieza por 'sb-' y termina en '-auth-token'. El valor
  //    puede ser un JSON con {access_token, refresh_token, ...} o directamente el token.
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim())
    for (const c of cookies) {
      const [name, ...rest] = c.split('=')
      const value = rest.join('=')
      if (name && name.startsWith('sb-') && name.endsWith('-auth-token')) {
        try {
          // Si es JSON con access_token dentro
          const decoded = decodeURIComponent(value)
          const parsed = JSON.parse(decoded)
          if (parsed && parsed.access_token) {
            token = parsed.access_token
            break
          }
        } catch {
          // Si no es JSON, asumir que el valor es directamente el token
          token = decodeURIComponent(value)
          break
        }
      }
    }
  }

  if (!token) {
    return { user: null, error: 'No autenticado' }
  }

  // Validar el token con Supabase
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    return { user: null, error: 'Token inválido' }
  }

  return { user: data.user, error: null }
}

/**
 * Middleware para endpoints que requieren usuario autenticado.
 * Uso:
 *   const auth = await requireUser(req, res)
 *   if (!auth) return // ya se envió 401
 *   const { user } = auth
 */
export async function requireUser(req, res) {
  const { user, error } = await getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: error || 'No autenticado' })
    return null
  }
  return { user, supabaseAdmin }
}

/**
 * Middleware para endpoints que requieren usuario admin.
 * Uso:
 *   const auth = await requireAdmin(req, res)
 *   if (!auth) return // ya se envió 401/403
 *   const { user, profile } = auth
 */
export async function requireAdmin(req, res) {
  const { user, error } = await getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: error || 'No autenticado' })
    return null
  }

  // Consultar el perfil y verificar rol_global === 'admin'
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, rol_global')
    .eq('id', user.id)
    .single()

  if (profErr || !profile) {
    res.status(403).json({ error: 'Perfil no encontrado' })
    return null
  }

  if (profile.rol_global !== 'admin') {
    res.status(403).json({ error: 'Permisos insuficientes' })
    return null
  }

  return { user, profile, supabaseAdmin }
}

export { supabaseAdmin }
