import { describe, expect, it } from 'vitest'
import { QUALITY_GATE_LIMITS } from '../quality-gate-types'
import {
  QualityGateCancelParams,
  QualityGateOutputParams,
  QualityGateProposalParams,
  QualityGateProposeParams,
  QualityGateResolveProposalParams,
  QualityGateRunParams,
  QualityGateSetRepositorySettingsParams,
  QualityGateSubscribeParams,
  QualityGateUnsubscribeParams,
  QualityGateWorktreeParams
} from './quality-gate-params'
import { RPC_PARAMS_BY_METHOD } from './rpc-params-catalog.generated'

const worktree = 'id:repo::/work'

describe('quality gate RPC params', () => {
  it('registers every method in the generated catalog', () => {
    expect(
      Object.keys(RPC_PARAMS_BY_METHOD)
        .filter((name) => name.startsWith('qualityGates.'))
        .sort()
    ).toEqual([
      'qualityGates.cancel',
      'qualityGates.list',
      'qualityGates.output',
      'qualityGates.proposal',
      'qualityGates.propose',
      'qualityGates.resolveProposal',
      'qualityGates.run',
      'qualityGates.setFeedbackLoop',
      'qualityGates.setRepositorySettings',
      'qualityGates.status',
      'qualityGates.subscribe',
      'qualityGates.unsubscribe'
    ])
  })

  it('opens the change stream with a worktree and an optional cadence, and ends it by its id', () => {
    expect(RPC_PARAMS_BY_METHOD['qualityGates.subscribe']).toBe(QualityGateSubscribeParams)
    // What a client from before the cadence sends.
    expect(QualityGateSubscribeParams.parse({ worktree })).toEqual({ worktree })
    expect(QualityGateSubscribeParams.parse({ worktree, cadence: 'background' })).toEqual({
      worktree,
      cadence: 'background'
    })
    // A word of a newer client is not an error; the host reads it as the default.
    expect(QualityGateSubscribeParams.safeParse({ worktree, cadence: 'idle' }).success).toBe(true)
    expect(QualityGateSubscribeParams.safeParse({ worktree, cadence: 7 }).success).toBe(false)
    // A host from before the cadence validates with the worktree-only schema and drops the field.
    expect(QualityGateWorktreeParams.parse({ worktree, cadence: 'background' })).toEqual({
      worktree
    })
    expect(RPC_PARAMS_BY_METHOD['qualityGates.unsubscribe']).toBe(QualityGateUnsubscribeParams)
    expect(QualityGateUnsubscribeParams.safeParse({}).success).toBe(false)
    expect(
      QualityGateUnsubscribeParams.parse({ subscriptionId: 'quality-gates-conn-1', command: 'x' })
    ).toEqual({ subscriptionId: 'quality-gates-conn-1' })
  })

  it('needs a worktree selector', () => {
    expect(QualityGateWorktreeParams.safeParse({}).success).toBe(false)
    expect(QualityGateWorktreeParams.safeParse({ worktree: '' }).success).toBe(false)
    expect(QualityGateWorktreeParams.parse({ worktree })).toEqual({ worktree })
  })

  it('runs all gates when none is named and refuses an empty or oversized selection', () => {
    expect(QualityGateRunParams.parse({ worktree })).toEqual({ worktree })
    expect(QualityGateRunParams.parse({ worktree, gateIds: ['lint'] })).toEqual({
      worktree,
      gateIds: ['lint']
    })
    expect(QualityGateRunParams.safeParse({ worktree, gateIds: [] }).success).toBe(false)
    expect(
      QualityGateRunParams.safeParse({
        worktree,
        gateIds: Array.from({ length: QUALITY_GATE_LIMITS.maxGates + 1 }, (_, i) => `g${i}`)
      }).success
    ).toBe(false)
  })

  it('carries no command and no definition: unknown fields are dropped', () => {
    const smuggled = {
      worktree,
      command: 'echo pwned',
      gates: [{ id: 'evil', name: 'Evil', command: 'echo pwned' }],
      qualityGates: [{ id: 'evil', name: 'Evil', command: 'echo pwned' }]
    }
    expect(QualityGateRunParams.parse(smuggled)).toEqual({ worktree })
    expect(QualityGateWorktreeParams.parse(smuggled)).toEqual({ worktree })
    expect(QualityGateCancelParams.parse(smuggled)).toEqual({ worktree })
  })

  it('names a run for its output and optionally a run or gate to cancel', () => {
    expect(QualityGateOutputParams.safeParse({ worktree }).success).toBe(false)
    expect(QualityGateOutputParams.parse({ worktree, runId: 'run-1' })).toEqual({
      worktree,
      runId: 'run-1'
    })
    expect(QualityGateCancelParams.parse({ worktree, gateId: 'lint' })).toEqual({
      worktree,
      gateId: 'lint'
    })
  })

  it('carries definitions in one method only, as the fields `gates` and `feedbackLoop`', () => {
    expect(RPC_PARAMS_BY_METHOD['qualityGates.setRepositorySettings']).toBe(
      QualityGateSetRepositorySettingsParams
    )
    const gate = { id: 'lint', name: 'Lint', command: 'pnpm lint' }
    expect(QualityGateSetRepositorySettingsParams.safeParse({ gates: [gate] }).success).toBe(false)
    // Either field may be left out; the host then keeps what it has.
    expect(QualityGateSetRepositorySettingsParams.parse({ repo: 'id:repo' })).toEqual({
      repo: 'id:repo'
    })
    expect(
      QualityGateSetRepositorySettingsParams.parse({
        repo: 'id:repo',
        gates: [gate],
        feedbackLoop: { enabled: true, maxRounds: 3 },
        hookSettings: { scripts: { setup: 'echo pwned' } }
      })
    ).toEqual({ repo: 'id:repo', gates: [gate], feedbackLoop: { enabled: true, maxRounds: 3 } })
    expect(
      QualityGateSetRepositorySettingsParams.safeParse({ repo: 'id:repo', gates: 'pnpm lint' })
        .success
    ).toBe(false)
  })

  it('takes a proposal as bounded gates of a workspace, and an answer by proposal and item ids', () => {
    expect(RPC_PARAMS_BY_METHOD['qualityGates.propose']).toBe(QualityGateProposeParams)
    expect(RPC_PARAMS_BY_METHOD['qualityGates.proposal']).toBe(QualityGateProposalParams)
    expect(RPC_PARAMS_BY_METHOD['qualityGates.resolveProposal']).toBe(
      QualityGateResolveProposalParams
    )
    const gate = { name: ' Lint ', command: ' pnpm lint ' }
    expect(QualityGateProposeParams.parse({ worktree, gates: [gate] })).toEqual({
      worktree,
      gates: [{ name: 'Lint', command: 'pnpm lint' }]
    })
    expect(QualityGateProposeParams.safeParse({ gates: [gate] }).success).toBe(false)
    expect(QualityGateProposeParams.safeParse({ worktree, gates: [] }).success).toBe(false)
    expect(
      QualityGateProposeParams.safeParse({
        worktree,
        gates: Array.from({ length: QUALITY_GATE_LIMITS.maxGates + 1 }, () => gate)
      }).success
    ).toBe(false)
    expect(
      QualityGateProposeParams.safeParse({ worktree, gates: [{ ...gate, required: 'yes' }] })
        .success
    ).toBe(false)
    expect(
      QualityGateProposeParams.safeParse({ worktree, gates: [gate], rationale: 'r'.repeat(1001) })
        .success
    ).toBe(false)

    const answer = { repo: 'id:repo', proposalId: 'p1', action: 'accept' }
    expect(QualityGateResolveProposalParams.parse({ ...answer, itemIds: ['item-1'] })).toEqual({
      ...answer,
      itemIds: ['item-1']
    })
    expect(QualityGateResolveProposalParams.safeParse({ ...answer, itemIds: [] }).success).toBe(
      false
    )
    expect(
      QualityGateResolveProposalParams.safeParse({ repo: 'id:repo', action: 'accept' }).success
    ).toBe(false)
  })
})
