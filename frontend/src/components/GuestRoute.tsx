import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <RouteLoading />
  if (user) return <Navigate to="/" replace />
  return children
}

export function RouteLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p role="status" className="text-sm text-ink-soft">Checking your session...</p>
    </main>
  )
}