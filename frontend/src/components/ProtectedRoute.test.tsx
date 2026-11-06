import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestRoute } from './GuestRoute'
import { ProtectedRoute } from './ProtectedRoute'

const routeMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  checkWorkspaceMapping: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: routeMocks.useAuth }))
vi.mock('../api/workspaces', () => ({ checkWorkspaceMapping: routeMocks.checkWorkspaceMapping }))

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
    routeMocks.checkWorkspaceMapping.mockResolvedValue(true)
  })

  it('redirects an unauthenticated visitor to login', async () => {
    routeMocks.useAuth.mockReturnValue({ user: null, loading: false })
    renderProtected()
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(routeMocks.checkWorkspaceMapping).not.toHaveBeenCalled()
  })

  it('shows a loading state while restoring the session', () => {
    routeMocks.useAuth.mockReturnValue({ user: null, loading: true })
    renderProtected()
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
  })

  it('redirects an authenticated visitor without a workspace to claiming', async () => {
    routeMocks.useAuth.mockReturnValue({ user: signedInUser, loading: false })
    routeMocks.checkWorkspaceMapping.mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByText('Claim workspace form')).toBeInTheDocument()
    await waitFor(() => expect(routeMocks.checkWorkspaceMapping).toHaveBeenCalledTimes(1))
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
})