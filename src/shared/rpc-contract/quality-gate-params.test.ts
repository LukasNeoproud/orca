import { describe, expect, it } from 'vitest'
import { QUALITY_GATE_LIMITS } from '../quality-gate-types'
import {
  QualityGateCancelParams,
  QualityGateOutputParams,
  QualityGateRunParams,
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
      'qualityGates.run',
      'qualityGates.status'
    ])
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
})
