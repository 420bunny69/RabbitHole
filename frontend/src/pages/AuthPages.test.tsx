import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

const authPageMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authPageMocks }))

function renderAuthPage(page: 'login' | 'register') {
  const path = page === 'login' ? '/login' : '/register'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<p>Application home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('authentication pages', () => {
  beforeEach(() => vi.clearAllMocks())

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
})