import { describe, expect, it } from 'vitest'
import {
  applyQualityGateProposalItems,
  readQualityGateProposal,
  readQualityGateProposalResult,
  type QualityGateProposalItem
} from './quality-gate-proposal'

const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const item = (overrides: Partial<QualityGateProposalItem> = {}): QualityGateProposalItem => ({
  id: 'item-1',
  name: 'Unit tests',
  command: 'pnpm test',
  required: true,
  timeoutSeconds: 600,
  ...overrides
})
const stored = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/work',
  proposedAt: 5,
  proposedBy: { kind: 'local-cli' },
  items: [item()]
}

describe('reading a quality gate proposal', () => {
  it('reads a proposal as it was stored', () => {
    expect(readQualityGateProposal(stored)).toEqual(stored)
    expect(readQualityGateProposalResult({ proposal: stored })).toEqual(stored)
  })

  it('is no proposal without an id, a repository or a usable item', () => {
    expect(readQualityGateProposal(null)).toBeNull()
    expect(readQualityGateProposal('pnpm lint')).toBeNull()
    expect(readQualityGateProposal({ ...stored, id: '' })).toBeNull()
    expect(readQualityGateProposal({ ...stored, repoId: 7 })).toBeNull()
    expect(readQualityGateProposal({ ...stored, items: 'pnpm lint' })).toBeNull()
    expect(readQualityGateProposal({ ...stored, items: [{ id: 'item-1' }] })).toBeNull()
    expect(readQualityGateProposalResult({ proposal: null })).toBeNull()
    expect(readQualityGateProposalResult({})).toBeNull()
  })

  it('drops a malformed item, a repeated item id and anything over the limits', () => {
    const read = readQualityGateProposal({
      ...stored,
      rationale: 'r'.repeat(5000),
      items: [
        item({ rationale: 'i'.repeat(5000), gateId: 'not an id' }),
        item({ name: 'Repeated id' }),
        { id: 'item-2', name: 'No command' },
        item({ id: 'item-3', command: 'x'.repeat(4001) }),
        ...Array.from({ length: 30 }, (_, index) => item({ id: `more-${index}` }))
      ]
    })
    expect(read?.items).toHaveLength(20)
    expect(read?.items[0]).toEqual(item({ rationale: 'i'.repeat(500) }))
    expect(read?.items[1].id).toBe('more-0')
    expect(read?.rationale).toHaveLength(1000)
  })
})

describe('accepting items of a proposal', () => {
  it('adds a new gate at the end with an id from its name', () => {
    expect(applyQualityGateProposalItems([lint], [item(), item({ name: 'Lint 2' })])).toEqual({
      ok: true,
      gates: [
        lint,
        {
          id: 'unit-tests',
          name: 'Unit tests',
          command: 'pnpm test',
          required: true,
          timeoutSeconds: 600
        },
        { id: 'lint-2', name: 'Lint 2', command: 'pnpm test', required: true, timeoutSeconds: 600 }
      ]
    })
  })

  it('puts a change in place of the gate it names and keeps the id and the order', () => {
    const build = { ...lint, id: 'build', name: 'Build' }
    const applied = applyQualityGateProposalItems(
      [lint, build],
      [item({ gateId: 'lint', name: 'Lint strict', rationale: 'not a gate field' })]
    )
    expect(applied).toEqual({
      ok: true,
      gates: [
        {
          id: 'lint',
          name: 'Lint strict',
          command: 'pnpm test',
          required: true,
          timeoutSeconds: 600
        },
        build
      ]
    })
  })

  it('adds an item whose gate is gone, with an id that is free', () => {
    const applied = applyQualityGateProposalItems(
      [{ ...lint, id: 'unit-tests', name: 'Other' }],
      [item({ gateId: 'removed' })]
    )
    expect(applied.ok && applied.gates.map((gate) => gate.id)).toEqual([
      'unit-tests',
      'unit-tests-2'
    ])
  })

  it('refuses a name another gate has and a list over the limit, and leaves the input alone', () => {
    const gates = [lint]
    expect(applyQualityGateProposalItems(gates, [item({ name: 'LINT' })])).toEqual({
      ok: false,
      reason: 'duplicate-name',
      name: 'LINT'
    })
    const many = Array.from({ length: 20 }, (_, index) => ({
      ...lint,
      id: `g${index}`,
      name: `G${index}`
    }))
    expect(applyQualityGateProposalItems(many, [item()])).toEqual({ ok: false, reason: 'too-many' })
    expect(applyQualityGateProposalItems(many, [item({ gateId: 'g3' })]).ok).toBe(true)
    expect(gates).toEqual([lint])
  })
})
