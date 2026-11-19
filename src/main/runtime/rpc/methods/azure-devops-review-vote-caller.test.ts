import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { eraseRpcMethods, isStreamingMethod, type RpcContext } from '../core'
import { resolveRpcCallerIdentity, type RpcCallerIdentity } from '../rpc-caller-identity'
import { AZURE_DEVOPS_REVIEW_METHODS } from './azure-devops-review'

const publish = vi.hoisted(() => vi.fn())

vi.mock('../../../azure-devops/review/azure-devops-review-draft-actions', () => ({
  createAzureDevOpsReviewDraft: vi.fn(),
  deleteAzureDevOpsReviewDraft: vi.fn(),
  listAzureDevOpsReviewDrafts: vi.fn(),
  publishAzureDevOpsReviewDrafts: publish,
  updateAzureDevOpsReviewDraft: vi.fn()
}))

const pullRequestKey = 'dev.azure.com/contoso+repo+7'

async function callPublish(params: unknown, caller: RpcCallerIdentity | undefined) {
  const method = eraseRpcMethods(AZURE_DEVOPS_REVIEW_METHODS).find(
    (candidate) => candidate.name === 'azureDevOpsReview.publishDrafts'
  )
  if (!method || isStreamingMethod(method) || !method.params) {
    throw new Error('azureDevOpsReview.publishDrafts must be a request method with params')
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only reads listRepos, which the mocked publish never calls.
  const runtime = { listRepos: () => [] } as unknown as OrcaRuntimeService
  const context: RpcContext = { runtime, caller }
  return method.handler(method.params.parse(params), context)
}

describe('azureDevOpsReview.publishDrafts vote callers', () => {
  beforeEach(() => {
    publish.mockReset()
    publish.mockResolvedValue({ results: [] })
  })

  it('advertises the vote capability', () => {
    expect(RUNTIME_CAPABILITIES).toContain(AZURE_DEVOPS_REVIEW_VOTE_RUNTIME_CAPABILITY)
  })

  it('passes a vote confirmed in the desktop app', async () => {
    await callPublish({ pullRequestKey, draftIds: ['d1'], vote: 'approved' }, { kind: 'desktop' })

    expect(publish).toHaveBeenCalledWith(expect.anything(), pullRequestKey, ['d1'], 'approved')
  })

  it('passes a vote from a paired device', async () => {
    await callPublish(
      { pullRequestKey, draftIds: [], vote: 'rejected' },
      { kind: 'paired-device', deviceId: 'phone-1' }
    )

    expect(publish).toHaveBeenCalledWith(expect.anything(), pullRequestKey, [], 'rejected')
  })

  // The runtime socket carries `orca ado`, its MCP server and the Pi extension that wraps it.
  it.each([
    ['the runtime socket', resolveRpcCallerIdentity(undefined)],
    ['a caller the transport could not name', undefined]
  ])('refuses a vote from %s before anything is published', async (_name, caller) => {
    await expect(
      callPublish({ pullRequestKey, draftIds: ['d1'], vote: 'approved' }, caller)
    ).rejects.toThrow('only from the Orca app')

    expect(publish).not.toHaveBeenCalled()
  })

  it('still publishes drafts without a vote for any caller', async () => {
    await callPublish({ pullRequestKey, draftIds: ['d1'] }, resolveRpcCallerIdentity(undefined))

    expect(publish).toHaveBeenCalledWith(expect.anything(), pullRequestKey, ['d1'], undefined)
  })
})
