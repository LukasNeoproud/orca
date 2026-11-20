import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { AZURE_DEVOPS_REVIEW_DEPTH_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { eraseRpcMethods, isStreamingMethod, type RpcContext } from '../core'
import { resolveRpcCallerIdentity, type RpcCallerIdentity } from '../rpc-caller-identity'
import { AZURE_DEVOPS_REVIEW_METHODS } from './azure-devops-review'

const mocks = vi.hoisted(() => ({ open: vi.fn(), runAgent: vi.fn() }))

vi.mock('../../../azure-devops/review/azure-devops-review-worktree', () => ({
  findAzureDevOpsReviewWorktree: vi.fn(),
  openAzureDevOpsReviewWorktree: mocks.open
}))
vi.mock('../../../azure-devops/review/azure-devops-review-service', () => ({
  resolveAzureDevOpsReviewPullRequest: async () => ({
    source: { key: 'repo-key' },
    target: { repositoryId: 'repo' },
    repositoryWebUrl: 'https://dev.azure.com/contoso/web/_git/app'
  })
}))
vi.mock('../../../azure-devops/review/azure-devops-review-client', () => ({
  getAzureDevOpsReviewPullRequest: async () => ({})
}))
vi.mock('../../../azure-devops/review/azure-devops-review-mappers', () => ({
  mapAzureDevOpsReviewPullRequest: () => ({ key: 'dev.azure.com/contoso+repo+7' })
}))
vi.mock('../../../azure-devops/review/azure-devops-review-pi-extension', () => ({
  ensureAzureDevOpsReviewPiExtension: () => null
}))

const pullRequestKey = 'dev.azure.com/contoso+repo+7'
const SOCKET = resolveRpcCallerIdentity(undefined)
const DESKTOP: RpcCallerIdentity = { kind: 'desktop' }
const PHONE: RpcCallerIdentity = { kind: 'paired-device', deviceId: 'phone-1' }

async function call(name: string, params: unknown, caller: RpcCallerIdentity | undefined) {
  const method = eraseRpcMethods(AZURE_DEVOPS_REVIEW_METHODS).find(
    (candidate) => candidate.name === name
  )
  if (!method || isStreamingMethod(method) || !method.params) {
    throw new Error(`${name} must be a request method with params`)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handlers under test read only these two members.
  const runtime = {
    listRepos: () => [],
    runAzureDevOpsReviewAgent: mocks.runAgent
  } as unknown as OrcaRuntimeService
  const context: RpcContext = { runtime, caller }
  return method.handler(method.params.parse(params), context)
}

describe('who writes the depth of a review', () => {
  beforeEach(() => {
    mocks.open.mockReset()
    mocks.open.mockResolvedValue({ ok: false, reason: 'git-failed', message: 'x' })
    mocks.runAgent.mockReset()
    mocks.runAgent.mockResolvedValue({ kind: 'started', worktreeId: 'wt-1' })
  })

  it('advertises that the host remembers and enforces the depth', () => {
    expect(RUNTIME_CAPABILITIES).toContain(AZURE_DEVOPS_REVIEW_DEPTH_RUNTIME_CAPABILITY)
  })

  describe('azureDevOpsReview.openWorktree', () => {
    it.each([
      ['the desktop app', DESKTOP],
      ['a paired device', PHONE]
    ])('remembers the depth chosen in %s', async (_name, caller) => {
      await call('azureDevOpsReview.openWorktree', { pullRequestKey, depth: 'build' }, caller)

      expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ depth: 'build' }))
    })

    // The runtime socket carries `orca`, its MCP servers and agent extensions.
    it.each([
      ['the runtime socket', SOCKET],
      ['a caller the transport could not name', undefined]
    ])('refuses a depth from %s before the worktree is touched', async (_name, caller) => {
      await expect(
        call('azureDevOpsReview.openWorktree', { pullRequestKey, depth: 'build-and-test' }, caller)
      ).rejects.toThrow('only in the Orca app')
      // Lowering it is refused too: the agent does not decide for the user in either direction.
      await expect(
        call('azureDevOpsReview.openWorktree', { pullRequestKey, depth: 'static' }, caller)
      ).rejects.toThrow('only in the Orca app')

      expect(mocks.open).not.toHaveBeenCalled()
    })

    it.each([
      ['the runtime socket', SOCKET],
      ['the desktop app', DESKTOP]
    ])('opens without touching the depth when %s sends none', async (_name, caller) => {
      await call('azureDevOpsReview.openWorktree', { pullRequestKey }, caller)

      expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ depth: undefined }))
    })
  })

  describe('azureDevOpsReview.runAgent', () => {
    const review = { kind: 'review', pullRequestKey, options: { depth: 'build' } }

    it.each([
      ['the desktop app', DESKTOP, true],
      ['a paired device', PHONE, true],
      ['the runtime socket', SOCKET, false],
      ['a caller the transport could not name', undefined, false]
    ])('tells the window whether %s is the user', async (_name, caller, chosen) => {
      await call('azureDevOpsReview.runAgent', review, caller)

      expect(mocks.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'review', depthChosenByUser: chosen })
      )
    })

    it('ignores the flag when the request itself claims it', async () => {
      await call('azureDevOpsReview.runAgent', { ...review, depthChosenByUser: true }, SOCKET)

      expect(mocks.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ depthChosenByUser: false })
      )
    })
  })
})
