import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StructuredTaskProposal } from '../../../shared/structured-task-proposal'
import {
  confirmedAgentSessionBranchProposal,
  newAgentSessionBranchProposal,
  taskProposalFromBranchProposal
} from './structured-task-proposal-record'

const proposal: StructuredTaskProposal = {
  proposalId: 'proposal-1',
  source: {
    sessionId: 'source',
    workspaceId: 'workspace-1',
    kind: 'review',
    anchor: { epoch: 'epoch', itemId: 'message' },
    passages: [{ itemId: 'message', text: 'Maybe broken.' }]
  },
  items: [
    {
      itemId: 'item-1',
      branchId: 'branch-1',
      name: 'Verify access',
      scope: 'Verify access.',
      verification: 'Record proof.',
      dependencyIds: [],
      workspaceId: 'workspace-1',
      context: { content: 'Unconfirmed access finding.', sourceItemIds: ['message'] },
      relationKind: 'subtask',
      action: 'prepare',
      uncertain: true
    }
  ],
  shouldOffer: false,
  analysis: 'deterministic',
  truncated: false
}

beforeEach(() => {
  let value = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`
  })
})

describe('structured task proposal persistence mapping', () => {
  it('persists the exact target create intent before preparation', () => {
    const record = newAgentSessionBranchProposal(proposal, 'codex', 1_800_000_000_000)
    expect(record).toMatchObject({ revision: 1, state: 'offered' })
    expect(record.items[0]).toMatchObject({
      verification: 'Record proof.',
      uncertain: true,
      action: { kind: 'prepare', targetCreate: { worktree: 'id:workspace-1', agent: 'codex' } }
    })
  })

  it('reuses a durable create intent for edits in the same workspace', () => {
    const record = newAgentSessionBranchProposal(proposal, 'codex', 1_800_000_000_000)
    const targetCreate =
      record.items[0]!.action.kind === 'prepare' ? record.items[0]!.action.targetCreate : null
    const { uncertain: _uncertain, ...requested } = proposal.items[0]!
    const confirmed = confirmedAgentSessionBranchProposal(
      record,
      {
        proposalId: proposal.proposalId,
        source: proposal.source,
        items: [{ ...requested, name: 'Verify authorization' }]
      },
      'codex',
      1_800_000_000_100
    )
    expect(confirmed.items[0]?.action).toEqual({ kind: 'prepare', targetCreate })
    expect(confirmed).toMatchObject({ revision: 2, state: 'confirmed' })
  })

  it('round-trips verification framing and uncertainty into the editor model', () => {
    const record = newAgentSessionBranchProposal(proposal, 'codex', 1_800_000_000_000)
    const restored = taskProposalFromBranchProposal(record, proposal.source)
    expect(restored.items[0]).toMatchObject({
      verification: 'Record proof.',
      uncertain: true,
      name: 'Verify access'
    })
  })
})
