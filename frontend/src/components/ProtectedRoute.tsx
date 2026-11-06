import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toApiError } from '../api/client'
import { checkWorkspaceMapping } from '../api/workspaces'
import { useAuth } from '../contexts/AuthContext'
import { RouteLoading } from './GuestRoute'

type WorkspaceState =
  | { userId: string; status: 'checking' | 'linked' | 'missing' }
  | { userId: string; status: 'error'; message: string }

export function ProtectedRoute({
  children,
  requireWorkspace = true,
}: {
  children?: ReactNode
  requireWorkspace?: boolean
}) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!user || !requireWorkspace) return
    const userId = user.id
    const controller = new AbortController()
    setWorkspaceState({ userId, status: 'checking' })

    void checkWorkspaceMapping(controller.signal).then((hasWorkspace) => {
      if (!controller.signal.aborted) {
        setWorkspaceState({ userId, status: hasWorkspace ? 'linked' : 'missing' })
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const apiError = toApiError(error)
      setWorkspaceState({ userId, status: 'error', message: apiError.message })
    })

    return () => controller.abort()
  }, [user?.id, requireWorkspace, retryCount])

  if (loading) return <RouteLoading />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  if (requireWorkspace) {
    if (!workspaceState || workspaceState.userId !== user.id || workspaceState.status === 'checking') {
      return <RouteLoading />
    }
    if (workspaceState.status === 'missing') {
      return <Navigate to="/claim-workspace" replace state={{ from: location }} />
    }
    if (workspaceState.status === 'error') {
      return (
        <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
          <section className="w-full max-w-md rounded-lg border border-rule bg-panel p-6 text-center">
            <h1 className="text-lg font-semibold">Workspace unavailable</h1>
            <p role="alert" className="mt-2 text-sm text-danger">{workspaceState.message}</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
            >
              Retry
            </button>
          </section>
        </main>
      )
    }
  }

  return children ?? <Outlet />
}
