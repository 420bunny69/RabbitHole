import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { claimWorkspace } from '../api/workspaces'
import { AuthPanel } from '../components/AuthPanel'

export function WorkspaceClaimPage() {
  const navigate = useNavigate()
  const [claimToken, setClaimToken] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSubmitting(true)
    try {
      await claimWorkspace(claimToken.trim())
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Unable to claim this workspace. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPanel
      title="Link your workspace"
      footer="Enter a claim token supplied to you by your workspace administrator."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Workspace claim token</span>
          <input
            type="text"
            autoComplete="off"
            required
            maxLength={256}
            value={claimToken}
            onChange={(event) => setClaimToken(event.target.value)}
            className="w-full rounded-md border border-rule bg-paper px-3 py-2.5 font-mono text-ink focus:border-accent focus:outline-none"
          />
        </label>
        {errorMessage && <p role="alert" className="text-sm text-danger">{errorMessage}</p>}
        <button
          type="submit"
          disabled={submitting || !claimToken.trim()}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Linking workspace...' : 'Link workspace'}
        </button>
      </form>
    </AuthPanel>
  )
}