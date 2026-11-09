import { Link } from 'react-router-dom'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '../contexts/AuthContext'

export function VerificationLinkErrorPage() {
  const { clearVerificationLinkExpired } = useAuth()

  return (
    <AuthPanel
      title="Verification link expired"
      footer={
        <Link
          to="/login"
          state={{ verificationLinkExpired: true }}
          onClick={clearVerificationLinkExpired}
          className="font-semibold text-burrow hover:underline"
        >
          Return to sign in and resend the email
        </Link>
      }
    >
      <p className="text-sm text-ink-soft">
        This email verification link has expired or is no longer valid. Return to sign in and request a new
        verification email.
      </p>
    </AuthPanel>
  )
}
