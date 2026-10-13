import { createClient } from '@supabase/supabase-js'
import { CABECERA_CLIENTE } from './sim/version'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Storage custom que guarda la sesion de Supabase en cookies
// compartidas con TODO el dominio .algorithmicsuite.com (hub + subdominios).
// Esto permite SSO: loguearse en el hub deja la sesion disponible en
// journal.algorithmicsuite.com y simulator.algorithmicsuite.com sin re-login.
const cookieStorage = {
  getItem: (key) => {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^|; )' + key + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : null
  },
  setItem: (key, value) => {
    if (typeof document === 'undefined') return
    const host = window.location.hostname
    const domainPart = host.endsWith('algorithmicsuite.com')
      ? '; domain=.algorithmicsuite.com'
      : ''
    const securePart = host === 'localhost' ? '' : '; secure'
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax${securePart}${domainPart}`
  },
  removeItem: (key) => {
    if (typeof document === 'undefined') return
    const host = window.location.hostname
    const domainPart = host.endsWith('algorithmicsuite.com')
      ? '; domain=.algorithmicsuite.com'
      : ''
    document.cookie = `${key}=; path=/; max-age=0${domainPart}`
  }
}

// x-sim-cliente en TODAS las peticiones (REST, RPC, auth, storage): el registro
// de escrituras distingue asi este cliente de los anteriores a la etapa 1, y la
// puerta deja pasar solo a quien la trae (diseño sim-004, k.1 b, l.1 b). El CORS
// la admite en /rest/v1, /auth/v1 y /storage/v1 (medido 12 y 13-oct, o.9).
// NO es seguridad: se puede falsificar.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { headers: { 'x-sim-cliente': CABECERA_CLIENTE } },
  auth: {
    storage: cookieStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
})
