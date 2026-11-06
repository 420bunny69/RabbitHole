import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '../contexts/AuthContext'
import { readableAuthError } from '../lib/authError'

interface ReturnLocation {
  pathname?: string
  search?: string
  hash?: string
}

export function LoginPage() {
  const { signInWithPassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const from = (location.state as { from?: ReturnLocation } | null)?.from
  const returnTo = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//')
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSubmitting(true)
    try {
      const { data, error } = await signInWithPassword(email.trim(), password)
      if (error) {
        setErrorMessage(readableAuthError(error))
      } else if (data.session) {
        navigate(returnTo, { replace: true })
      } else {
        setErrorMessage('No active session was returned. Verify your email, then sign in again.')
      }
    } catch (error) {
      setErrorMessage(readableAuthError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title="Welcome back"
      footer={<>New to RabbitHole? <Link to="/register" className="font-semibold text-burrow hover:underline">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-rule bg-paper px-3 py-2.5 text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-rule bg-paper px-3 py-2.5 text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none"
          />
        </label>
        {errorMessage && <p role="alert" className="text-sm text-danger">{errorMessage}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthPanel>
  )
}