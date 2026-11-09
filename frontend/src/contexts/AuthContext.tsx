import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AuthError, AuthOtpResponse, AuthResponse, Session, User } from '@supabase/supabase-js'
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
  verificationLinkExpired: boolean
  clearVerificationLinkExpired: () => void
  signInWithPassword: (email: string, password: string) => Promise<AuthResponse>
  signUp: (email: string, password: string) => Promise<AuthResponse>
  resendSignupVerification: (email: string) => Promise<AuthOtpResponse>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function hasExpiredVerificationError(): boolean {
  if (typeof window === 'undefined') return false
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const searchParams = new URLSearchParams(window.location.search)
  const error = hashParams.get('error') ?? searchParams.get('error')
  const errorCode = hashParams.get('error_code') ?? searchParams.get('error_code')
  const description =
    hashParams.get('error_description') ?? searchParams.get('error_description') ?? ''

  return (
    error === 'access_denied' ||
    errorCode === 'access_denied' ||
    errorCode === 'otp_expired' ||
    /(?:otp|verification).{0,30}expired|expired.{0,30}(?:otp|verification)/i.test(description)
  )
}

function cleanVerificationErrorFromUrl(): void {
  const url = new URL(window.location.href)
  for (const key of [
    'access_token',
    'code',
    'error',
    'error_code',
    'error_description',
    'error_uri',
    'expires_at',
    'expires_in',
    'provider_refresh_token',
    'provider_token',
    'refresh_token',
    'token_hash',
    'token_type',
    'type',
  ]) {
    url.searchParams.delete(key)
  }
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [verificationLinkExpired, setVerificationLinkExpired] = useState(hasExpiredVerificationError)
  const hadExpiredVerificationLink = useRef(verificationLinkExpired)
  const [loading, setLoading] = useState(() => supabase !== null && !hasExpiredVerificationError())

  useEffect(() => {
    if (hadExpiredVerificationLink.current) cleanVerificationErrorFromUrl()
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

  function clearVerificationLinkExpired(): void {
    setVerificationLinkExpired(false)
  }

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

  async function resendSignupVerification(email: string): Promise<AuthOtpResponse> {
    return requireSupabaseClient().auth.resend({ type: 'signup', email })
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
    verificationLinkExpired,
    clearVerificationLinkExpired,
    signInWithPassword,
    signUp,
    resendSignupVerification,
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