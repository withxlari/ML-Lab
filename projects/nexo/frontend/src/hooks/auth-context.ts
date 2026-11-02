import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
export interface AuthState {
  session: Session | null
  loading: boolean
  configured: boolean
  signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  configured: false,
  signOut: async () => {},
})
export function useAuth() {
  return useContext(AuthContext)
}
