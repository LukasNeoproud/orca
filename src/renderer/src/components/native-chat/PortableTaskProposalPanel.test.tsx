// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StructuredTaskProposal } from '../../../../shared/structured-task-proposal'
import type { StructuredTaskProposalBatchRequest } from '../../../../shared/structured-task-proposal'
import { PortableTaskProposalPanel } from './PortableTaskProposalPanel'
const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    preferenceGet: vi.fn(),
    preferenceSet: vi.fn(),
    analyze: vi.fn(),
    put: vi.fn(),
    confirm: vi.fn(),
    notices: vi.fn()
  },
  branches: vi.fn(),
  notice: vi.fn()
}))
vi.mock('@/lib/portable-conversation-proposal-client', () => ({
  portableProposalClient: mocks.client
}))
vi.mock('@/lib/portable-conversation-branch-client', () => ({
  readPortableConversationBranches: mocks.branches
}))
vi.mock('@/lib/portable-conversation-proposal-notice-send', () => ({
  sendPortableConversationProposalNotice: mocks.notice
}))
vi.mock('@/lib/backlog-task-handoff-options', () => ({
  getBacklogTaskWorkspaceOptions: () => [{ id: 'folder:a', displayName: 'Workspace', path: '/a' }]
}))
vi.mock('./StructuredTaskProposalEditor', () => ({
  StructuredTaskProposalEditor: ({
    onPrepareBatch,
    proposal
  }: {
    proposal: StructuredTaskProposal
    onPrepareBatch: (x: StructuredTaskProposalBatchRequest) => Promise<unknown>
  }) => (
    <button
      onClick={() =>
        void onPrepareBatch({
          proposalId: proposal.proposalId,
          source: proposal.source,
          items: [
            {
              ...proposal.items[0],
              context: { content: 'reviewed in editor', sourceItemIds: ['user'] }
            }
          ]
        })
      }
    >
      Prepare selected
    </button>
  )
}))
const source = {
  executionHostId: 'ssh:host',
  workspace: { id: 'folder:a', path: '/a', kind: 'folder' },
  provider: { agent: 'codex', sessionId: 'parent' },
  transcriptPath: '/a.jsonl'
} as const
const message = {
  id: 'user',
  role: 'user' as const,
  blocks: [{ type: 'text' as const, text: 'split task' }],
  timestamp: null,
  source: 'transcript' as const
}
const proposal = {
  proposalId: 'p',
  source: {
    sessionId: 'parent',
    workspaceId: 'folder:a',
    kind: 'prompt' as const,
    anchor: { epoch: 'f', itemId: 'user' },
    passages: []
  },
  items: [
    {
      itemId: 'one',
      branchId: 'b',
      name: 'One',
      scope: 'exact',
      verification: 'test',
      dependencyIds: [],
      workspaceId: 'folder:a',
      context: { content: 'exact', sourceItemIds: ['user'] },
      relationKind: 'subtask' as const,
      action: 'prepare' as const,
      uncertain: false
    }
  ],
  shouldOffer: true,
  analysis: 'deterministic' as const,
  truncated: false
}
function record() {
  return {
    schemaVersion: 1 as const,
    proposal: {
      ...proposal,
      items: proposal.items.map((item) => ({
        ...item,
        intent: {
          kind: 'prepare' as const,
          targetSessionId: 'stable',
          agent: 'codex' as const,
          workspaceId: 'folder:a',
          executionHostId: 'ssh:host' as const
        }
      }))
    },
    portable: {
      source,
      anchor: {
        messageId: 'user',
        cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'f' },
        identity: { fingerprint: 'f', size: 1, mtimeMs: 1 }
      },
      identity: { fingerprint: 'f', size: 1, mtimeMs: 1 },
      contextSha256: 'hash',
      projectId: 'project'
    },
    revision: 2,
    state: 'offered' as const,
    results: [],
    createdAt: 1,
    updatedAt: 1
  }
}
function renderPanel() {
  return render(
    <PortableTaskProposalPanel
      target={{ kind: 'local' }}
      source={source}
      messages={[message]}
      anchorFor={() => record().portable.anchor}
    />
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.client.get.mockResolvedValue({ proposal: null })
  mocks.client.preferenceGet.mockResolvedValue({
    preference: { enabled: false, source: 'session' }
  })
  mocks.branches.mockResolvedValue({ branches: [], returns: [] })
  mocks.client.notices.mockResolvedValue({ notices: [] })
})
afterEach(cleanup)
describe('PortableTaskProposalPanel', () => {
  it('does not analyze when automatic proposals are off, but manual analysis persists exact source proof', async () => {
    mocks.client.analyze.mockResolvedValue({ proposal, proof: record().portable })
    mocks.client.put.mockResolvedValue({ proposal: record() })
    renderPanel()
    await waitFor(() => expect(mocks.client.preferenceGet).toHaveBeenCalled())
    expect(mocks.client.analyze).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Propose tasks' }))
    await waitFor(() => expect(mocks.client.put).toHaveBeenCalled())
    expect(mocks.client.put.mock.calls[0][1].proposal.proposal.items[0].context.content).toBe(
      'exact'
    )
  })
  it('restores a durable proposal and confirms only the selected item without launching', async () => {
    mocks.client.get.mockResolvedValue({ proposal: record() })
    mocks.client.put.mockResolvedValue({ proposal: { ...record(), revision: 3 } })
    mocks.client.confirm.mockResolvedValue({
      proposal: { ...record(), state: 'confirmed' },
      batch: { items: [{ itemId: 'one', branchId: 'b', status: 'prepared' }] }
    })
    renderPanel()
    await screen.findByRole('button', { name: 'Saved proposal' })
    fireEvent.click(screen.getByRole('button', { name: 'Saved proposal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare selected' }))
    await waitFor(() =>
      expect(mocks.client.confirm).toHaveBeenCalledWith(
        { kind: 'local' },
        { proposalId: 'p', expectedRevision: 3, itemIds: ['one'] }
      )
    )
    expect(mocks.client.put.mock.calls[0][1].proposal.proposal.items[0].context.content).toBe(
      'reviewed in editor'
    )
    expect(mocks.notice).not.toHaveBeenCalled()
  })
  it('does not re-analyze a restored proposal for the same anchor even when automatic suggestions are enabled', async () => {
    mocks.client.get.mockResolvedValue({ proposal: record() })
    mocks.client.preferenceGet.mockResolvedValue({
      preference: { enabled: true, source: 'session' }
    })
    renderPanel()
    await screen.findByRole('button', { name: 'Saved proposal' })
    expect(mocks.client.analyze).not.toHaveBeenCalled()
  })

  it('creates a new anchor proposal at revision zero rather than using the older proposal revision', async () => {
    mocks.client.get.mockResolvedValue({ proposal: record() })
    mocks.client.preferenceGet.mockResolvedValue({
      preference: { enabled: true, source: 'session' }
    })
    const anchor = { ...record().portable.anchor, messageId: 'new-user' }
    const newer = {
      ...proposal,
      proposalId: 'new-proposal',
      source: { ...proposal.source, anchor: { epoch: 'f', itemId: 'new-user' } }
    }
    mocks.client.analyze.mockResolvedValue({
      proposal: newer,
      proof: { ...record().portable, anchor }
    })
    mocks.client.put.mockImplementation(async (_target, params) => ({ proposal: params.proposal }))
    render(
      <PortableTaskProposalPanel
        target={{ kind: 'local' }}
        source={source}
        messages={[{ ...message, id: 'new-user' }]}
        anchorFor={() => anchor}
      />
    )
    await waitFor(() => expect(mocks.client.put).toHaveBeenCalledTimes(1))
    expect(mocks.client.put.mock.calls[0][1]).toMatchObject({
      expectedRevision: 0,
      proposal: { revision: 1, proposal: { proposalId: 'new-proposal' } }
    })
  })

  it('prevents duplicate manual analysis while its response is pending', async () => {
    let resolve!: (value: unknown) => void
    mocks.client.analyze.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    mocks.client.put.mockResolvedValue({ proposal: record() })
    renderPanel()
    const button = screen.getByRole('button', { name: 'Propose tasks' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mocks.client.analyze).toHaveBeenCalledTimes(1)
    resolve({ proposal, proof: record().portable })
    await screen.findByRole('button', { name: 'Saved proposal' })
  })

  it('does not save an old-source analysis after navigation to another host', async () => {
    let resolve!: (value: unknown) => void
    mocks.client.analyze.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const view = renderPanel()
    const button = screen.getByRole('button', { name: 'Propose tasks' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    fireEvent.click(button)
    view.rerender(
      <PortableTaskProposalPanel
        target={{ kind: 'environment', environmentId: 'peer' }}
        source={{ ...source, executionHostId: 'ssh:other' }}
        messages={[message]}
        anchorFor={() => record().portable.anchor}
      />
    )
    resolve({ proposal, proof: record().portable })
    await waitFor(() => expect(mocks.client.get).toHaveBeenCalledTimes(2))
    expect(mocks.client.put).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Saved proposal' })).toBeNull()
  })

  it('shows a preference write failure without changing the displayed preference', async () => {
    mocks.client.preferenceSet.mockRejectedValue(new Error('Preference connection lost'))
    renderPanel()
    const button = screen.getByRole('button', { name: 'Manual proposals' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    fireEvent.click(button)
    expect((await screen.findByRole('alert')).textContent).toContain('Preference connection lost')
    expect(screen.getByRole('button', { name: 'Manual proposals' })).toBeTruthy()
  })
})
