export function readableAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(message)) return 'Verify your email before signing in.'
  if (/already registered|user already registered/i.test(message)) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  return message || 'Authentication failed. Please try again.'
}