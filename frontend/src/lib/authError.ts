export function readableAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (isEmailNotConfirmedError(error)) return 'Verify your email before signing in.'
  if (/already registered|user already registered/i.test(message)) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  return message || 'Authentication failed. Please try again.'
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? error.code : undefined
  const message = 'message' in error ? error.message : undefined
  return (
    code === 'email_not_confirmed' ||
    (typeof message === 'string' && /email not confirmed/i.test(message))
  )
}