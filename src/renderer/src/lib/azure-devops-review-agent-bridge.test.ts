import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS } from '../../../shared/azure-devops-review-options'

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  open: vi.fn(),
  start: vi.fn(),
  findChat: vi.fn(),
  deliver: vi.fn()
}))

vi.mock('./azure-devops-review-client', () => ({
  getAzureDevOpsReviewDetail: mocks.detail,
  openAzureDevOpsReviewWorktree: mocks.open
}))
vi.mock('./azure-devops-review-agent', () => ({
  startAzureDevOpsReviewAgentInBackground: mocks.start
}))
vi.mock('./azure-devops-review-chat', () => ({ findAzureDevOpsReviewChatTab: mocks.findChat }))
vi.mock('@/components/azure-devops-review/azure-devops-draft-rework-delivery', () => ({
  deliverAzureDevOpsDraftReworkPrompt: mocks.deliver
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/store/azure-devops-review-chat-links', () => ({
  useAzureDevOpsReviewChatLinks: {
    getState: () => ({ tabs: {}, setWorktreePullRequest: () => undefined })
  }
}))
vi.mock('@/store/azure-devops-review-options', () => ({
  readAzureDevOpsReviewOptions: () => DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS
}))
vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'darwin' }))

import { runAzureDevOpsReviewAgentRequest } from './azure-devops-review-agent-bridge'

const pullRequest = { key: 'pr', pullRequestId: 7, title: 'Fix', repository: 'app' }
const draft = {
  id: 'd1',
  kind: 'general',
  state: 'draft',
  filePath: null,
  anchor: null,
  threadId: null,
  body: 'Looks risky'
}
const worktree = { worktreeId: 'wt', repoId: 'r', path: '/w', pullRequestKey: 'pr', commit: null }
const rework = {
  kind: 'rework' as const,
  pullRequestKey: 'pr',
  items: [{ draftId: 'd1', instruction: 'Verify it' }],
  generalInstruction: ''
}

describe('runAzureDevOpsReviewAgentRequest', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.detail.mockResolvedValue({ pullRequest, drafts: [draft] })
    mocks.open.mockResolvedValue({ ok: true, worktree, created: false })
    mocks.start.mockResolvedValue({ tabId: 't', launchedAt: 0 })
    mocks.findChat.mockReturnValue(null)
  })

  it('starts a review in the background with the requested options', async () => {
    const options = { ...DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS, surface: 'chat' as const }
    await expect(
      runAzureDevOpsReviewAgentRequest({ kind: 'review', pullRequestKey: 'pr', options })
    ).resolves.toEqual({ kind: 'started', worktreeId: 'wt' })
    expect(mocks.open).toHaveBeenCalledWith('pr', false)
    expect(mocks.start).toHaveBeenCalledWith(pullRequest, worktree, options, undefined)
  })

  it('reports a dirty review workspace instead of discarding it', async () => {
    mocks.open.mockResolvedValue({ ok: false, reason: 'dirty', message: 'Uncommitted changes' })
    await expect(
      runAzureDevOpsReviewAgentRequest({
        kind: 'review',
        pullRequestKey: 'pr',
        options: DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS
      })
    ).resolves.toEqual({ kind: 'dirty', message: 'Uncommitted changes' })
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it("sends drafts to the pull request's open AI chat without switching the workspace", async () => {
    mocks.findChat.mockReturnValue({ id: 'chat', worktreeId: 'wt' })
    mocks.deliver.mockResolvedValue({ ok: true })
    await expect(runAzureDevOpsReviewAgentRequest(rework)).resolves.toEqual({
      kind: 'sent-to-chat',
      worktreeId: 'wt'
    })
    expect(mocks.deliver.mock.calls[0][1]).toContain('Verify it')
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('starts a new agent with the rework prompt when no chat is open', async () => {
    await runAzureDevOpsReviewAgentRequest(rework)
    expect(mocks.start.mock.calls[0][3]).toContain('Draft d1')
  })

  it('refuses drafts that are gone', async () => {
    mocks.detail.mockResolvedValue({ pullRequest, drafts: [] })
    await expect(runAzureDevOpsReviewAgentRequest(rework)).resolves.toMatchObject({
      kind: 'failed'
    })
  })
})
