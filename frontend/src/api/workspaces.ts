import { ApiError, request } from './client'

export const NO_WORKSPACE_DETAIL = 'No workspace is linked to this account'

interface WorkspaceClaimResponse {
  status: 'claimed'
  workspace_id: string
}

export async function checkWorkspaceMapping(signal?: AbortSignal): Promise<boolean> {
  try {
    await request<unknown>('/api/items?limit=1', { signal })
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && error.message === NO_WORKSPACE_DETAIL) {
      return false
    }
    throw error
  }
}

export async function claimWorkspace(claimToken: string): Promise<WorkspaceClaimResponse> {
  return (
    await request<WorkspaceClaimResponse>('/api/workspaces/claim', {
      method: 'POST',
      body: { claim_token: claimToken },
    })
  ).data
}