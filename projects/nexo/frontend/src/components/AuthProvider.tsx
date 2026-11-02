import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { AuthContext } from '../hooks/auth-context'
import { getSupabase } from '../services/supabase'
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getSupabase()))
  const queryClient = useQueryClient()
  const supabase = getSupabase()
  useEffect(() => {
    if (!supabase) {
      return
    }
    let active = true
    let eventVersion = 0
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventVersion++
      if (active) {
        setSession(next)
        setLoading(false)
      }
    })
    const version = eventVersion
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && version === eventVersion) {
          setSession(data.session)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])
  useEffect(() => {
    const userId = session?.user.id
    void queryClient.cancelQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith('account-') &&
        q.queryKey[1] !== userId,
    })
    queryClient.removeQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith('account-') &&
        q.queryKey[1] !== userId,
    })
  }, [session?.user.id, queryClient])
  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Não foi possível sair agora. Tente novamente.')
    setSession(null)
    queryClient.removeQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith('account-'),
    })
  }
  return (
    <AuthContext
      value={{ session, loading, configured: Boolean(supabase), signOut }}
    >
      {children}
    </AuthContext>
  )
}
