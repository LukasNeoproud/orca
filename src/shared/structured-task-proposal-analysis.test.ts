import { describe, expect, it } from 'vitest'
import {
  createStructuredTaskProposal,
  normalizeStructuredTaskProposal
} from './structured-task-proposal-analysis'
import type { StructuredTaskProposalSource } from './structured-task-proposal'

function source(
  text: string,
  kind: StructuredTaskProposalSource['kind'] = 'prompt'
): StructuredTaskProposalSource {
  return {
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    kind,
    anchor: { epoch: 'epoch-1', itemId: 'message-1' },
    passages: [{ itemId: 'message-1', text }]
  }
}

describe('structured task proposal analysis', () => {
  it('separates independent, verifiable outcomes', () => {
    const proposal = createStructuredTaskProposal(
      source(
        [
          '- Add a user CSV invoice export with a downloadable report.',
          '- Add a user OAuth refresh fix when a laptop wakes from sleep.'
        ].join('\n')
      )
    )

    expect(proposal.shouldOffer).toBe(true)
    expect(proposal.items).toHaveLength(2)
    expect(proposal.items.map((item) => item.name)).toEqual([
      'Add a user CSV invoice export with a downloadable report',
      'Add a user OAuth refresh fix when a laptop wakes from sleep'
    ])
    expect(proposal.items.every((item) => item.context.sourceItemIds[0] === 'message-1')).toBe(true)
  })

  it('keeps frontend, backend, and test layers of one outcome together', () => {
    const proposal = createStructuredTaskProposal(
      source(
        [
          '- Add the invoice filtering backend endpoint.',
          '- Build the invoice filtering UI.',
          '- Test the invoice filtering flow.'
        ].join('\n')
      )
    )

    expect(proposal.shouldOffer).toBe(false)
    expect(proposal.items).toHaveLength(1)
    expect(proposal.items[0]?.scope).toContain('backend endpoint')
    expect(proposal.items[0]?.scope).toContain('filtering UI')
    expect(proposal.items[0]?.scope).toContain('filtering flow')
  })

  it('groups review findings with a shared root cause and frames uncertainty as verification', () => {
    const proposal = createStructuredTaskProposal(
      source(
        [
          '- The admin delete route may skip authorization because the permission guard is missing.',
          '- The export route could expose records due to the missing permission guard.'
        ].join('\n'),
        'review'
      )
    )

    expect(proposal.items).toHaveLength(1)
    expect(proposal.items[0]).toMatchObject({ uncertain: true })
    expect(proposal.items[0]?.name).toMatch(/^Verify:/)
    expect(proposal.items[0]?.scope).toContain('Verify whether this finding is reproducible')
    expect(proposal.items[0]?.verification).toContain('confirmed or rejected finding')
  })

  it('normalizes provider candidates into stable branch IDs and bounded dependencies', () => {
    const input = source('Prepare an API and then its client.')
    const candidates = [
      { name: 'API contract', scope: 'Define the API contract.' },
      { name: 'Client', scope: 'Build the client.', dependencyIndexes: [0, 99] }
    ]
    const first = normalizeStructuredTaskProposal(input, candidates, 'provider')
    const second = normalizeStructuredTaskProposal(input, candidates, 'provider')

    expect(second).toEqual(first)
    expect(first.items[1]?.dependencyIds).toEqual([first.items[0]?.itemId])
    expect(first.items[0]?.branchId).toBe(`proposal-${first.proposalId}-${first.items[0]?.itemId}`)
  })

  it('marks bounded analysis instead of silently dropping excess source', () => {
    const proposal = createStructuredTaskProposal(source('x'.repeat(12_100)))
    expect(proposal.truncated).toBe(true)
    expect(proposal.source.passages[0]?.text).toHaveLength(12_000)
  })
})
