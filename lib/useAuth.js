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
        .select('id, email, nombre, rol, journal_activo, simulador_activo')
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

    init()
    return () => { cancelled = true }
  }, [])

  // Admin entra siempre; el resto depende del flag del producto.
  const hasAccess = profile
    ? (profile.rol === 'admin' || profile[productFlag] === true)
    : false

  return { user, profile, loading, hasAccess }
}
