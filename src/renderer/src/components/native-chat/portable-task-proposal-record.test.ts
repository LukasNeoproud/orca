import { describe, expect, it } from 'vitest'
import { portableTaskProposalRecord } from './portable-task-proposal-record'
const source = {
  executionHostId: 'ssh:host' as const,
  workspace: { id: 'folder:a', path: '/a', kind: 'folder' as const },
  provider: { agent: 'codex' as const, sessionId: 'parent' },
  transcriptPath: '/a.jsonl'
}
const anchor = {
  messageId: 'user',
  cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: 'f' },
  identity: { fingerprint: 'f', size: 1, mtimeMs: 1 }
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
  shouldOffer: true,
  analysis: 'deterministic' as const,
  truncated: false,
  items: [
    {
      itemId: 'one',
      branchId: 'b',
      name: 'One',
      scope: 'scope',
      verification: 'test',
      dependencyIds: [],
      workspaceId: 'folder:a',
      context: { content: 'exact', sourceItemIds: ['user'] },
      relationKind: 'subtask' as const,
      action: 'prepare' as const,
      uncertain: false
    }
  ]
}
describe('portable task proposal record', () => {
  it('keeps the prepared terminal intent stable when exact edited content is persisted again', () => {
    const first = portableTaskProposalRecord({
      proposal,
      proof: {
        source,
        anchor,
        identity: anchor.identity,
        contextSha256: 'hash',
        projectId: 'project'
      },
      anchor
    })
    const edited = {
      ...proposal,
      items: [
        {
          ...proposal.items[0]!,
          context: { content: 'edited exact content', sourceItemIds: ['user'] }
        }
      ]
    }
    const second = portableTaskProposalRecord({
      proposal: edited,
      proof: first.portable,
      anchor,
      previous: first
    })
    expect(second.proposal.items[0]!.context.content).toBe('edited exact content')
    expect(second.proposal.items[0]!.intent).toEqual(first.proposal.items[0]!.intent)
  })
  it('pins attachment to the verified portable family source only', () => {
    const attached = {
      ...proposal,
      items: [{ ...proposal.items[0]!, action: 'attach' as const, targetSessionId: 'related' }]
    }
    const target = { ...source, provider: { ...source.provider, sessionId: 'related' } }
    expect(
      portableTaskProposalRecord({
        proposal: attached,
        proof: {
          source,
          anchor,
          identity: anchor.identity,
          contextSha256: 'hash',
          projectId: 'project'
        },
        anchor,
        related: new Map([['related', target]])
      }).proposal.items[0]!.intent
    ).toEqual({ kind: 'attach', target })
  })
})
