import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { VerificationLinkErrorPage } from './VerificationLinkErrorPage'

const authPageMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resendSignupVerification: vi.fn(),
  signUp: vi.fn(),
  clearVerificationLinkExpired: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authPageMocks }))

function renderAuthPage(
  page: 'login' | 'register',
  state?: { verificationLinkExpired?: boolean },
) {
  const path = page === 'login' ? '/login' : '/register'
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<p>Application home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderVerificationRecovery() {
  return render(
    <MemoryRouter initialEntries={['/verification-error']}>
      <Routes>
        <Route path="/verification-error" element={<VerificationLinkErrorPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('authentication pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authPageMocks.clearVerificationLinkExpired.mockReset()
  })

  it('requires email verification when registration returns no session', async () => {
    const user = userEvent.setup()
    authPageMocks.signUp.mockResolvedValue({ data: { session: null }, error: null })
    renderAuthPage('register')
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email for a verification link')
    expect(screen.queryByText('Application home')).not.toBeInTheDocument()
  })

  it('offers the explicit workspace claim flow from login and registration', () => {
    const { unmount } = renderAuthPage('login')
    expect(screen.getByRole('link', { name: 'Link an existing workspace' })).toHaveAttribute(
      'href',
      '/claim-workspace',
    )

    unmount()
    renderAuthPage('register')
    expect(screen.getByRole('link', { name: 'Link an existing workspace' })).toHaveAttribute(
      'href',
      '/claim-workspace',
    )
  })

  it('navigates only when registration returns an active session', async () => {
    const user = userEvent.setup()
    authPageMocks.signUp.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    renderAuthPage('register')
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Application home')).toBeInTheDocument()
  })

  it('shows a readable login error', async () => {
    const user = userEvent.setup()
    authPageMocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    })
    renderAuthPage('login')
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  })

  it('shows an expired-link message and offers resend from the recovery page', async () => {
    const user = userEvent.setup()
    renderVerificationRecovery()

    expect(screen.getByRole('heading', { name: 'Verification link expired' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Return to sign in and resend the email' }))

    expect(await screen.findByText(/That verification link has expired/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument()
    expect(authPageMocks.clearVerificationLinkExpired).toHaveBeenCalledOnce()
  })

  it('offers resend after an unconfirmed email login and reports resend loading, success, and errors', async () => {
    const user = userEvent.setup()
    authPageMocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    })
    authPageMocks.resendSignupVerification
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: null })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Resend service unavailable')), 20)
          }),
      )
    renderAuthPage('login')
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/email address is not verified/i)
    const resend = screen.getByRole('button', { name: 'Resend verification email' })

    await user.click(resend)
    expect(await screen.findByRole('status')).toHaveTextContent('Verification email sent')
    expect(authPageMocks.resendSignupVerification).toHaveBeenNthCalledWith(
      1,
      'person@example.com',
    )

    await user.click(resend)
    expect(screen.getByRole('button', { name: 'Sending verification email...' })).toBeDisabled()
    expect(await screen.findByText('Resend service unavailable')).toBeInTheDocument()
    expect(authPageMocks.resendSignupVerification).toHaveBeenNthCalledWith(
      2,
      'person@example.com',
    )
  })

  it('requires an email address before resending verification', async () => {
    const user = userEvent.setup()
    renderAuthPage('login', { verificationLinkExpired: true })

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email address above first.')
    expect(authPageMocks.resendSignupVerification).not.toHaveBeenCalled()
  })
})