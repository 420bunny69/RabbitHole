import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '../contexts/AuthContext'
import { readableAuthError } from '../lib/authError'

export function RegisterPage() {
  const { signUp } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')
    setSubmitting(true)
    try {
      const { data, error } = await signUp(email.trim(), password)
      if (error) {
        setErrorMessage(readableAuthError(error))
      } else if (data.session) {
        const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
        navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true })
      } else {
        setMessage('Check your email for a verification link. You can sign in after confirming your address.')
      }
    } catch (error) {
      setErrorMessage(readableAuthError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title="Create your account"
      footer={(
        <>
          Already registered? <Link to="/login" state={location.state} className="font-semibold text-burrow hover:underline">Sign in</Link>
          <br />
          Have a workspace claim token? <Link to="/claim-workspace" className="font-semibold text-burrow hover:underline">Link an existing workspace</Link>
        </>
      )}
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
            className="w-full rounded-md border border-rule bg-paper px-3 py-2.5 text-ink focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-rule bg-paper px-3 py-2.5 text-ink focus:border-accent focus:outline-none"
          />
        </label>
        {message && <p role="status" className="text-sm text-burrow">{message}</p>}
        {errorMessage && <p role="alert" className="text-sm text-danger">{errorMessage}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthPanel>
  )
}