import { describe, expect, it } from 'vitest'
import type {
  QualityGateProposal,
  QualityGateProposalItem
} from '../../../../shared/quality-gate-proposal'
import type { QualityGateDefinition } from '../../../../shared/quality-gate-types'
import {
  draftFromQualityGateProposalItem,
  presentQualityGateProposal
} from './quality-gate-proposal-view'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'pnpm lint',
  required: true,
  timeoutSeconds: 60
}

function item(fields: Partial<QualityGateProposalItem> & { id: string }): QualityGateProposalItem {
  return { name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 600, ...fields }
}

function proposal(items: QualityGateProposalItem[]): QualityGateProposal {
  return {
    id: 'p1',
    repoId: 'repo',
    worktreeId: 'repo::/work',
    proposedAt: 1,
    proposedBy: { kind: 'local-cli' },
    items
  }
}

describe('presentQualityGateProposal', () => {
  it('reads an item without a gate as a gate to add', () => {
    const { entries, conflict } = presentQualityGateProposal([lint], proposal([item({ id: 'i1' })]))

    expect(conflict).toBeNull()
    expect(entries).toEqual([
      { item: item({ id: 'i1' }), current: null, changed: [], targetGone: false, conflict: null }
    ])
  })

  it('names exactly the fields a change would rewrite', () => {
    const change = item({
      id: 'i1',
      gateId: 'lint',
      name: 'Lint',
      command: 'true',
      required: false
    })

    const [entry] = presentQualityGateProposal([lint], proposal([change])).entries

    expect(entry.current).toEqual(lint)
    expect(entry.changed).toEqual(['command', 'required', 'timeoutSeconds'])
  })

  it('says a change matching the gate in force changes nothing', () => {
    const same = item({ ...lint, id: 'i1', gateId: 'lint' })

    expect(presentQualityGateProposal([lint], proposal([same])).entries[0].changed).toEqual([])
  })

  it('reads a change of a gate that was removed meanwhile as an addition, as the host does', () => {
    const [entry] = presentQualityGateProposal(
      [],
      proposal([item({ id: 'i1', gateId: 'lint' })])
    ).entries

    expect(entry).toMatchObject({ current: null, targetGone: true, conflict: null })
  })

  it('marks an item whose name another gate holds, and the proposal as a whole', () => {
    const { entries, conflict } = presentQualityGateProposal(
      [lint],
      proposal([item({ id: 'i1', name: 'lint' }), item({ id: 'i2' })])
    )

    expect(entries.map((entry) => entry.conflict)).toEqual(['duplicate-name', null])
    expect(conflict).toBe('duplicate-name')
  })

  it('marks two items that would give gates the same name only as a whole', () => {
    const { entries, conflict } = presentQualityGateProposal(
      [],
      proposal([item({ id: 'i1' }), item({ id: 'i2' })])
    )

    expect(entries.map((entry) => entry.conflict)).toEqual([null, null])
    expect(conflict).toBe('duplicate-name')
  })

  it('marks additions past the most gates a repository holds', () => {
    const full = Array.from({ length: 20 }, (_, index) => ({
      ...lint,
      id: `gate-${index}`,
      name: `Gate ${index}`
    }))

    const { entries, conflict } = presentQualityGateProposal(
      full,
      proposal([item({ id: 'i1' }), item({ id: 'i2', gateId: 'gate-0', name: 'Gate 0' })])
    )

    expect(entries.map((entry) => entry.conflict)).toEqual(['too-many', null])
    expect(conflict).toBe('too-many')
  })
})

describe('draftFromQualityGateProposalItem', () => {
  it('edits the gate the item changes in place, and adds a new one at the end', () => {
    const { entries } = presentQualityGateProposal(
      [lint],
      proposal([
        item({ id: 'i1', gateId: 'lint', name: 'Lint', command: 'true' }),
        item({ id: 'i2', gateId: 'gone' }),
        item({ id: 'i3', timeoutSeconds: 90, required: false })
      ])
    )

    expect(entries.map(draftFromQualityGateProposalItem)).toEqual([
      { id: 'lint', name: 'Lint', command: 'true', required: true, timeoutSeconds: '600' },
      { id: null, name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: '600' },
      { id: null, name: 'Tests', command: 'pnpm test', required: false, timeoutSeconds: '90' }
    ])
  })
})
