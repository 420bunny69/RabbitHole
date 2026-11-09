import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from
  const returnTo = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//')
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/'

  if (loading) return <RouteLoading />
  if (user) return <Navigate to={returnTo} replace />
  return children
}

export function RouteLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p role="status" className="text-sm text-ink-soft">Checking your session...</p>
    </main>
  )
}