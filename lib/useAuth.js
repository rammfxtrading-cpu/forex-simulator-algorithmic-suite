import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from './supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setUser(session.user)
      const { data } = await supabase.from('fs_profiles').select('*').eq('id', session.user.id).single()
      if (data) setProfile(data)
      setLoading(false)
    }
    init()
  }, [])

  return { user, profile, loading }
}
