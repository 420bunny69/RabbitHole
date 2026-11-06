import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { claimWorkspace } from '../api/workspaces'
import { WorkspaceClaimPage } from './WorkspaceClaimPage'

vi.mock('../api/workspaces', () => ({ claimWorkspace: vi.fn() }))

function renderClaimPage() {
  return render(
    <MemoryRouter initialEntries={['/claim-workspace']}>
      <Routes>
        <Route path="/claim-workspace" element={<WorkspaceClaimPage />} />
        <Route path="/" element={<p>Application home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('workspace claim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the supplied token and returns to the application after success', async () => {
    const user = userEvent.setup()
    vi.mocked(claimWorkspace).mockResolvedValue({ status: 'claimed', workspace_id: 'workspace-id' })
    renderClaimPage()
    await user.type(screen.getByLabelText('Workspace claim token'), ' claim-token ')
    await user.click(screen.getByRole('button', { name: 'Link workspace' }))

    expect(await screen.findByText('Application home')).toBeInTheDocument()
    expect(claimWorkspace).toHaveBeenCalledWith('claim-token')
  })

  it('shows claim failures without inventing or retrying a token', async () => {
    const user = userEvent.setup()
    vi.mocked(claimWorkspace).mockRejectedValue(new ApiError(409, 'Claim is invalid or unavailable.'))
    renderClaimPage()
    await user.type(screen.getByLabelText('Workspace claim token'), 'bad-token')
    await user.click(screen.getByRole('button', { name: 'Link workspace' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Claim is invalid or unavailable.')
    expect(claimWorkspace).toHaveBeenCalledTimes(1)
  })
})