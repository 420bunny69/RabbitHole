import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthError, AuthResponse, Session, User } from '@supabase/supabase-js'
import {
  requireSupabaseClient,
  supabase,
  supabaseConfigurationError,
} from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  configurationError: string | null
  signInWithPassword: (email: string, password: string) => Promise<AuthResponse>
  signUp: (email: string, password: string) => Promise<AuthResponse>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(error ? null : data.session)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setSession(null)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithPassword(email: string, password: string): Promise<AuthResponse> {
    const result = await requireSupabaseClient().auth.signInWithPassword({ email, password })
    if (!result.error) setSession(result.data.session)
    return result
  }

  async function signUp(email: string, password: string): Promise<AuthResponse> {
    const result = await requireSupabaseClient().auth.signUp({ email, password })
    if (!result.error) setSession(result.data.session)
    return result
  }

  async function signOut(): Promise<{ error: AuthError | null }> {
    const result = await requireSupabaseClient().auth.signOut()
    if (!result.error) setSession(null)
    return result
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    configurationError: supabaseConfigurationError?.message ?? null,
    signInWithPassword,
    signUp,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {supabaseConfigurationError ? (
        <div role="alert" className="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {supabaseConfigurationError.message}
        </div>
      ) : children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}