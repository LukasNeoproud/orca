import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc }))

async function freshClient() {
  vi.resetModules()
  return import('./azure-devops-review-client')
}

describe('azureDevOpsReviewHostCastsVotes', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
  })

  it('is true once the host advertises the vote capability', async () => {
    callRuntimeRpc.mockResolvedValue({
      capabilities: ['azure-devops-review.v1', 'azure-devops-review.vote.v1']
    })
    const client = await freshClient()

    expect(await client.azureDevOpsReviewHostCastsVotes()).toBe(true)
    expect(await client.azureDevOpsReviewHostCastsVotes()).toBe(true)
    expect(callRuntimeRpc).toHaveBeenCalledTimes(1)
    expect(callRuntimeRpc).toHaveBeenCalledWith({ kind: 'local' }, 'status.get')
  })

  it('is false for a host from before votes and asks again later', async () => {
    callRuntimeRpc.mockResolvedValue({ capabilities: ['azure-devops-review.v1'] })
    const client = await freshClient()

    expect(await client.azureDevOpsReviewHostCastsVotes()).toBe(false)
    expect(await client.azureDevOpsReviewHostCastsVotes()).toBe(false)
    expect(callRuntimeRpc).toHaveBeenCalledTimes(2)
  })

  it('is false when the host cannot be asked', async () => {
    callRuntimeRpc.mockRejectedValue(new Error('offline'))
    const client = await freshClient()

    expect(await client.azureDevOpsReviewHostCastsVotes()).toBe(false)
  })

  it('leaves the vote out of the request unless one is passed', async () => {
    callRuntimeRpc.mockResolvedValue({ results: [] })
    const client = await freshClient()

    await client.publishAzureDevOpsReviewDrafts('key', ['d1'])
    await client.publishAzureDevOpsReviewDrafts('key', [], 'rejected')

    expect(callRuntimeRpc.mock.calls.map((call) => call[2])).toEqual([
      { pullRequestKey: 'key', draftIds: ['d1'] },
      { pullRequestKey: 'key', draftIds: [], vote: 'rejected' }
    ])
  })
})
