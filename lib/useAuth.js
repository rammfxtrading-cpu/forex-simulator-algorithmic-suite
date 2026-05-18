import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from './supabase'

/**
 * Hook de autenticación parametrizado por producto.
 *
 * Flujo:
 *  1. Comprueba sesión en Supabase. Si no hay → redirige a '/'.
 *  2. Carga el perfil del usuario de la tabla `profiles`.
 *  3. Calcula `hasAccess`: true si es admin global, o si tiene activo el flag del producto.
 *
 * Uso en una página:
 *   const { user, profile, loading, hasAccess } = useAuth('simulador_activo')
 *   if (loading)    return <Spinner />
 *   if (!hasAccess) return <NoAccess profile={profile} producto="Simulador" />
 *
 * @param {string} productFlag - nombre de la columna en profiles (ej: 'simulador_activo', 'journal_activo')
 * @returns {{ user, profile, loading, hasAccess }}
 */
export function useAuth(productFlag = 'simulador_activo') {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/')
        return
      }
      if (cancelled) return
      setUser(session.user)

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('id, email, nombre, rol_global, journal_activo, simulador_activo')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (error || !prof) {
        // Perfil no encontrado — sesión corrupta. Cerramos y volvemos al login.
        await supabase.auth.signOut()
        router.replace('/')
        return
      }

      setProfile(prof)
      setLoading(false)
    }

    // Revalidación benigna del flag de acceso: re-consulta SOLO el perfil y
    // actualiza el state. NO redirige ni cierra sesión ante error transitorio
    // (eso es exclusivo de init()). Cubre el caso "pestaña viva + acceso
    // revocado desde admin" — el guard hasAccess se recalcula y NoAccess actúa.
    async function revalidate() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('id, email, nombre, rol_global, journal_activo, simulador_activo')
        .eq('id', session.user.id)
        .single()
      if (cancelled || error || !prof) return
      setProfile(prof)
    }

    function onVisible() {
      if (document.visibilityState === 'visible') revalidate()
    }

    init()
    document.addEventListener('visibilitychange', onVisible)
    const revalidateInterval = setInterval(revalidate, 45000)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(revalidateInterval)
    }
  }, [])

  // Admin entra siempre; el resto depende del flag del producto.
  const hasAccess = profile
    ? (profile.rol_global === 'admin' || profile[productFlag] === true)
    : false

  return { user, profile, loading, hasAccess }
}
