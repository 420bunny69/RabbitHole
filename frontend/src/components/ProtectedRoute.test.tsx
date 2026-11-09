import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestRoute } from './GuestRoute'
import { ProtectedRoute } from './ProtectedRoute'

const routeMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  ensureWorkspace: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: routeMocks.useAuth }))
vi.mock('../api/workspaces', () => ({ ensureWorkspace: routeMocks.ensureWorkspace }))

const signedInUser = { id: 'user-id', email: 'person@example.com' }

function renderProtected(initialPath = '/private') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/private" element={<ProtectedRoute><p>Private library</p></ProtectedRoute>} />
        <Route path="/claim-workspace" element={<p>Claim workspace form</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMocks.ensureWorkspace.mockResolvedValue(undefined)
  })

  it('redirects an unauthenticated visitor to login', async () => {
    routeMocks.useAuth.mockReturnValue({ user: null, loading: false })
    renderProtected()
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(routeMocks.ensureWorkspace).not.toHaveBeenCalled()
  })

  it('shows a loading state while restoring the session', () => {
    routeMocks.useAuth.mockReturnValue({ user: null, loading: true })
    renderProtected()
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
  })

  it('ensures a workspace before rendering protected content', async () => {
    routeMocks.useAuth.mockReturnValue({ user: signedInUser, loading: false })
    renderProtected()
    expect(await screen.findByText('Private library')).toBeInTheDocument()
    await waitFor(() => expect(routeMocks.ensureWorkspace).toHaveBeenCalledTimes(1))
  })

  it('shows a retryable error when workspace provisioning fails', async () => {
    routeMocks.useAuth.mockReturnValue({ user: signedInUser, loading: false })
    routeMocks.ensureWorkspace.mockRejectedValue(new Error('Workspace unavailable'))
    renderProtected()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('redirects signed-in visitors away from guest routes', async () => {
    routeMocks.useAuth.mockReturnValue({ user: signedInUser, loading: false })
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<GuestRoute><p>Login form</p></GuestRoute>} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('preserves an explicit workspace claim destination through login', async () => {
    routeMocks.useAuth.mockReturnValue({ user: signedInUser, loading: false })
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/login',
        state: { from: { pathname: '/claim-workspace' } },
      }]}>
        <Routes>
          <Route path="/login" element={<GuestRoute><p>Login form</p></GuestRoute>} />
          <Route path="/claim-workspace" element={<p>Claim workspace form</p>} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Claim workspace form')).toBeInTheDocument()
  })
})