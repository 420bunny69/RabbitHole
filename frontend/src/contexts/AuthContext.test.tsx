import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      signInWithPassword: authMocks.signInWithPassword,
      signUp: authMocks.signUp,
      resend: authMocks.resend,
      signOut: authMocks.signOut,
    },
  },
  supabaseConfigurationError: null,
  requireSupabaseClient: () => ({ auth: authMocks }),
}))

function AuthState() {
  const { loading, user, verificationLinkExpired } = useAuth()
  return (
    <>
      <span>{loading ? 'loading' : 'ready'}</span>
      <span>{user?.email ?? 'signed-out'}</span>
      {verificationLinkExpired && <span>verification-link-expired</span>}
    </>
  )
}

function AuthActions() {
  const { resendSignupVerification, signInWithPassword, signOut } = useAuth()
  return (
    <>
      <button onClick={() => void signInWithPassword('person@example.com', 'password')}>Sign in action</button>
      <button onClick={() => void resendSignupVerification('person@example.com')}>Resend action</button>
      <button onClick={() => void signOut()}>Sign out action</button>
    </>
  )
}

const restoredSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_000_000_000,
  user: {
    id: 'user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'person@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  },
} as Session

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    authMocks.getSession.mockResolvedValue({ data: { session: restoredSession }, error: null })
    authMocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: authMocks.unsubscribe } },
    })
  })

  it('restores the persisted session and unsubscribes from auth events on unmount', async () => {
    const { unmount } = render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    )

    expect(await screen.findByText('person@example.com')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(authMocks.getSession).toHaveBeenCalledTimes(1)
    expect(authMocks.onAuthStateChange).toHaveBeenCalledTimes(1)

    act(() => unmount())
    expect(authMocks.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('updates session state after sign-in and clears it after sign-out', async () => {
    const user = userEvent.setup()
    authMocks.signInWithPassword.mockResolvedValue({ data: { session: restoredSession }, error: null })
    authMocks.signOut.mockResolvedValue({ error: null })
    render(
      <AuthProvider>
        <AuthState />
        <AuthActions />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Sign in action' }))
    expect(await screen.findByText('person@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign out action' }))
    expect(await screen.findByText('signed-out')).toBeInTheDocument()
  })

  it('resends a signup verification email for the requested address', async () => {
    const user = userEvent.setup()
    authMocks.resend.mockResolvedValue({ data: { user: null, session: null }, error: null })
    render(
      <AuthProvider>
        <AuthActions />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Resend action' }))
    expect(authMocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
    })
  })

  it('handles expired verification links, clears URL credentials, and does not stay loading', async () => {
    window.history.replaceState(
      {},
      '',
      '/?keep=1&access_token=query-secret#error=access_denied&error_code=otp_expired&error_description=Email+link+expired&access_token=secret-token',
    )
    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    )

    expect(await screen.findByText('verification-link-expired')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.href).not.toContain('secret-token')
    expect(window.location.href).not.toContain('query-secret')
  })
})