import { describe, expect, it, vi } from 'vitest'
import type {
  QualityGateRunStartResult,
  QualityGateRunView,
  QualityGateStatusResult
} from '../shared/quality-gate-types'
import {
  QUALITY_GATE_LOST_CONTACT_POLLS,
  qualityGateRunOutcome,
  waitForQualityGateRuns,
  type QualityGateRpcCall
} from './quality-gate-run-wait'
import { RuntimeClientError } from './runtime/types'

const worktree = 'id:repo::/work'

function run(overrides: Partial<QualityGateRunView> = {}): QualityGateRunView {
  return {
    id: 'run-1',
    gateId: 'lint',
    gate: { name: 'Lint', command: 'echo lint', required: true, timeoutSeconds: 60 },
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    startedBy: { kind: 'local-cli' },
    source: null,
    status: 'queued',
    requestedAt: 1,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    outputTruncated: false,
    liveness: 'live',
    freshness: null,
    ...overrides
  }
}

const passed = (overrides: Partial<QualityGateRunView> = {}): QualityGateRunView =>
  run({
    status: 'passed',
    exitCode: 0,
    liveness: 'exited',
    startedAt: 2,
    finishedAt: 3,
    ...overrides
  })

function statusOf(...runs: QualityGateRunView[]): QualityGateStatusResult {
  return {
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    source: { head: null, clean: null, fingerprint: null },
    gates: runs.map((latestRun) => ({
      gate: { id: latestRun.gateId, ...latestRun.gate },
      latestRun
    }))
  }
}

function started(...runs: QualityGateRunView[]): QualityGateRunStartResult {
  return { runs: runs.map((entry) => ({ run: entry, started: true })) }
}

function client(steps: (QualityGateStatusResult | Error)[], finals: QualityGateRunView[]) {
  const calls: string[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the waiter reads only `result`, and each branch returns the result of the method asked for.
  const call = (async (method: string, params: { runId?: string }) => {
    calls.push(method)
    if (method === 'qualityGates.status') {
      const step = steps.shift()
      if (!step) {
        throw new Error('unexpected status poll')
      }
      if (step instanceof Error) {
        throw step
      }
      return { result: step }
    }
    const final = finals.find((entry) => entry.id === params.runId)
    if (!final) {
      throw new Error(`unexpected output read of ${params.runId}`)
    }
    return { result: { run: final, stdout: `out of ${final.gateId}\n`, stderr: '' } }
  }) as unknown as QualityGateRpcCall
  return { call, calls }
}

const lost = () => new RuntimeClientError('runtime_unavailable', 'socket closed')

describe('waitForQualityGateRuns', () => {
  it('polls until no started run is live, then reads the record and output of each', async () => {
    const sleep = vi.fn(async () => {})
    const tests = run({ id: 'run-2', gateId: 'test', gate: { ...run().gate, name: 'Tests' } })
    const { call, calls } = client(
      [
        statusOf(run({ status: 'running' }), tests),
        statusOf(passed(), run({ ...tests, status: 'running' })),
        statusOf(passed(), { ...tests, status: 'failed', exitCode: 2, liveness: 'exited' })
      ],
      [passed(), { ...tests, status: 'failed', exitCode: 2, liveness: 'exited' }]
    )

    const result = await waitForQualityGateRuns({
      call,
      worktree,
      started: started(run(), tests),
      sleep
    })

    expect(calls).toEqual([
      'qualityGates.status',
      'qualityGates.status',
      'qualityGates.status',
      'qualityGates.output',
      'qualityGates.output'
    ])
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(result.outcome).toBe('failed')
    expect(
      result.runs.map(({ run: entry, stdout }) => [entry.gateId, entry.status, stdout])
    ).toEqual([
      ['lint', 'passed', 'out of lint\n'],
      ['test', 'failed', 'out of test\n']
    ])
  })

  it('treats a newer run of the gate as proof that the awaited one is over', async () => {
    const { call } = client([statusOf(run({ id: 'run-9', status: 'running' }))], [passed()])
    const result = await waitForQualityGateRuns({
      call,
      worktree,
      started: started(run()),
      sleep: async () => {}
    })
    expect(result).toMatchObject({ outcome: 'passed', runs: [{ run: { id: 'run-1' } }] })
  })

  it('keeps waiting through a short loss of contact', async () => {
    const { call } = client(
      [lost(), lost(), statusOf(run({ status: 'running' })), lost(), statusOf(passed())],
      [passed()]
    )
    const result = await waitForQualityGateRuns({
      call,
      worktree,
      started: started(run()),
      sleep: async () => {}
    })
    expect(result.outcome).toBe('passed')
  })

  it('reports a run as unverifiable, never as failed, when the host stays out of reach', async () => {
    const { call, calls } = client(
      [
        statusOf(run({ status: 'running', startedAt: 2 })),
        ...Array.from({ length: QUALITY_GATE_LOST_CONTACT_POLLS }, lost)
      ],
      []
    )
    const result = await waitForQualityGateRuns({
      call,
      worktree,
      started: started(run()),
      sleep: async () => {}
    })

    expect(calls).not.toContain('qualityGates.output')
    expect(result.outcome).toBe('unverifiable')
    expect(result.runs[0].run).toMatchObject({
      status: 'unverifiable',
      liveness: 'unverifiable',
      exitCode: null,
      startedAt: 2
    })
    expect(result.runs[0].run.error).toContain('Contact with the Orca host was lost')
  })

  it('does not swallow a refusal the host actually sent', async () => {
    const { call } = client([new RuntimeClientError('runtime_error', 'workspace was removed')], [])
    await expect(
      waitForQualityGateRuns({ call, worktree, started: started(run()), sleep: async () => {} })
    ).rejects.toThrow('workspace was removed')
  })

  it('has nothing to wait for when no gate is set up', async () => {
    const { call, calls } = client([], [])
    expect(
      await waitForQualityGateRuns({ call, worktree, started: { runs: [] }, sleep: async () => {} })
    ).toEqual({ outcome: 'passed', runs: [] })
    expect(calls).toEqual([])
  })
})

describe('qualityGateRunOutcome', () => {
  const optional = { ...run().gate, required: false }

  it('fails on a required gate that failed, timed out, did not start or was cancelled', () => {
    for (const status of ['failed', 'timed-out', 'not-started', 'cancelled'] as const) {
      expect(qualityGateRunOutcome([passed(), passed({ status, exitCode: null })])).toBe('failed')
    }
  })

  it('does not let an optional gate change the outcome', () => {
    expect(
      qualityGateRunOutcome([passed(), passed({ status: 'failed', exitCode: 1, gate: optional })])
    ).toBe('passed')
  })

  it('is unverifiable when a required gate was not observed and none failed', () => {
    const unobserved = run({ status: 'unverifiable', liveness: 'unverifiable' })
    expect(qualityGateRunOutcome([passed(), unobserved])).toBe('unverifiable')
    expect(qualityGateRunOutcome([passed({ status: 'failed' }), unobserved])).toBe('failed')
  })
})
