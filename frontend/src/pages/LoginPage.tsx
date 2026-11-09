import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '../contexts/AuthContext'
import { isEmailNotConfirmedError, readableAuthError } from '../lib/authError'

interface ReturnLocation {
  pathname?: string
  search?: string
  hash?: string
}

export function LoginPage() {
  const { signInWithPassword, resendSignupVerification } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const verificationLinkExpiredFromState =
    (location.state as { verificationLinkExpired?: boolean } | null)?.verificationLinkExpired ?? false
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [verificationRequired, setVerificationRequired] = useState(verificationLinkExpiredFromState)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const from = (location.state as { from?: ReturnLocation } | null)?.from
  const returnTo = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//')
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setResendMessage('')
    setResendError('')
    setSubmitting(true)
    try {
      const { data, error } = await signInWithPassword(email.trim(), password)
      if (error) {
        if (isEmailNotConfirmedError(error)) {
          setVerificationRequired(true)
          setErrorMessage('Your email address is not verified. Resend a verification email to continue.')
        } else {
          setVerificationRequired(false)
          setErrorMessage(readableAuthError(error))
        }
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

  async function handleResendVerification() {
    setResendMessage('')
    setResendError('')
    if (!email.trim()) {
      setResendError('Enter your email address above first.')
      return
    }

    setResending(true)
    try {
      const { error } = await resendSignupVerification(email.trim())
      if (error) setResendError(readableAuthError(error))
      else setResendMessage('Verification email sent. Check your inbox.')
    } catch (error) {
      setResendError(readableAuthError(error))
    } finally {
      setResending(false)
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
        {verificationRequired && (
          <div className="space-y-2">
            {verificationLinkExpiredFromState && (
              <p role="status" className="text-sm text-burrow">
                That verification link has expired. Enter your email address and request a new one.
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleResendVerification()}
              disabled={resending}
              className="text-sm font-semibold text-burrow underline disabled:cursor-wait disabled:opacity-60"
            >
              {resending ? 'Sending verification email...' : 'Resend verification email'}
            </button>
            {resendMessage && <p role="status" className="text-sm text-burrow">{resendMessage}</p>}
            {resendError && <p role="alert" className="text-sm text-danger">{resendError}</p>}
          </div>
        )}
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