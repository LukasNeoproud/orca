import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS } from '../../../src/shared/azure-devops-review-options'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('./use-azure-devops-review', () => ({ azureDevOpsReviewRequest: requestMock }))

import { runAzureDevOpsReviewAgent } from './azure-devops-review-agent-launch'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every request goes through the mocked azureDevOpsReviewRequest, so the client is never touched.
const client = {} as RpcClient
const ask = {
  kind: 'review' as const,
  pullRequestKey: 'org+repo+7',
  options: DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS
}

describe('runAzureDevOpsReviewAgent', () => {
  beforeEach(() => requestMock.mockReset())

  it('asks before discarding changes, then retries with the discard', async () => {
    requestMock
      .mockResolvedValueOnce({ kind: 'dirty', message: 'dirty' })
      .mockResolvedValueOnce({ kind: 'started', worktreeId: 'wt' })
    const confirm = vi.fn(async () => true)
    await expect(
      runAzureDevOpsReviewAgent({ client, ask, confirmDiscard: confirm })
    ).resolves.toEqual({ kind: 'started', worktreeId: 'wt' })
    expect(confirm).toHaveBeenCalledOnce()
    expect(requestMock).toHaveBeenLastCalledWith(client, 'azureDevOpsReview.runAgent', {
      ...ask,
      discardChanges: true
    })
  })

  it('leaves a dirty workspace alone when the user declines', async () => {
    requestMock.mockResolvedValue({ kind: 'dirty', message: 'dirty' })
    const result = await runAzureDevOpsReviewAgent({
      client,
      ask,
      confirmDiscard: async () => false
    })
    expect(result.kind).toBe('not-started')
    expect(requestMock).toHaveBeenCalledOnce()
  })

  it("reports the desktop's refusal", async () => {
    requestMock.mockResolvedValue({ kind: 'failed', message: 'No agent' })
    await expect(
      runAzureDevOpsReviewAgent({ client, ask, confirmDiscard: async () => true })
    ).resolves.toEqual({ kind: 'not-started', message: 'No agent' })
  })
})
