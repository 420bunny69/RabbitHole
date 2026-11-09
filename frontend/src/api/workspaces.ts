import { request } from './client'

interface WorkspaceClaimResponse {
  status: 'claimed'
  workspace_id: string
}

interface WorkspaceResponse {
  workspace_id: string
}

export async function ensureWorkspace(signal?: AbortSignal): Promise<void> {
  await request<WorkspaceResponse>('/api/workspaces/me', { signal })
}

export async function claimWorkspace(claimToken: string): Promise<WorkspaceClaimResponse> {
  return (
    await request<WorkspaceClaimResponse>('/api/workspaces/claim', {
      method: 'POST',
      body: { claim_token: claimToken },
    })
  ).data
}