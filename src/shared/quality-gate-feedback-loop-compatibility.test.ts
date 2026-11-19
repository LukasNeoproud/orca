import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  HOST_FEATURE_RUNTIME_CAPABILITIES,
  QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY,
  QUALITY_GATES_RUNTIME_CAPABILITY
} from './host-feature-runtime-capabilities'
import { readQualityGateChangeFrame } from './quality-gate-change-stream'
import {
  normalizeQualityGateFeedbackLoopSettings,
  readQualityGateFeedbackLoopStatus
} from './quality-gate-feedback-loop'
import type { QualityGateStatusResult } from './quality-gate-types'
import {
  QualityGateSetFeedbackLoopParams,
  QualityGateWorktreeParams
} from './rpc-contract/quality-gate-params'
import { RPC_PARAMS_BY_METHOD } from './rpc-contract/rpc-params-catalog.generated'

// The gate status as a client from before the feedback loop reads it: the fields it knows, and
// who started a run as one of the three callers that existed then.
const runOfAnOlderClient = z.object({
  id: z.string(),
  gateId: z.string(),
  status: z.string(),
  startedBy: z.object({ kind: z.string() }).passthrough(),
  liveness: z.enum(['live', 'unverifiable', 'exited'])
})
const statusOfAnOlderClient = z.object({
  repoId: z.string(),
  worktreeId: z.string(),
  worktreePath: z.string(),
  source: z.object({ head: z.string().nullable() }).passthrough(),
  gates: z.array(
    z.object({
      gate: z.object({ id: z.string() }).passthrough(),
      latestRun: runOfAnOlderClient.nullable()
    })
  )
})

const statusOfThisHost: QualityGateStatusResult = {
  repoId: 'repo',
  worktreeId: 'repo::/work',
  worktreePath: '/work',
  source: { head: 'aaa', clean: true, fingerprint: 'f0' },
  gates: [
    {
      gate: { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 },
      latestRun: {
        id: 'run-1',
        gateId: 'lint',
        gate: { name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 },
        repoId: 'repo',
        worktreeId: 'repo::/work',
        worktreePath: '/work',
        startedBy: { kind: 'feedback-loop' },
        source: { head: 'aaa', clean: true, fingerprint: 'f0' },
        status: 'failed',
        requestedAt: 1,
        startedAt: 2,
        finishedAt: 3,
        exitCode: 1,
        error: null,
        outputTruncated: false,
        liveness: 'exited',
        freshness: { state: 'current' }
      }
    }
  ],
  feedbackLoop: {
    enabled: true,
    repoEnabled: true,
    workspaceDisabled: false,
    maxRounds: 3,
    state: 'awaiting-agent',
    round: 1,
    failingGateIds: ['lint']
  }
}

describe('feedback loop between a client and a host of different versions', () => {
  it('lets an older client read the gate status this host publishes', () => {
    const read = statusOfAnOlderClient.safeParse(JSON.parse(JSON.stringify(statusOfThisHost)))
    expect(read.success).toBe(true)
    // The loop is one optional field beside the gates; a run it started is an ordinary run.
    expect(read.data?.gates[0].latestRun).toMatchObject({ status: 'failed', liveness: 'exited' })
    expect(Object.keys(statusOfThisHost).filter((key) => !(key in (read.data ?? {})))).toEqual([
      'feedbackLoop'
    ])
  })

  it('reads the status of an older host as one without loop information', () => {
    const { feedbackLoop: _loop, ...statusOfAnOlderHost } = statusOfThisHost
    const received: QualityGateStatusResult = JSON.parse(JSON.stringify(statusOfAnOlderHost))
    expect(received.gates).toHaveLength(1)
    expect(readQualityGateFeedbackLoopStatus(received.feedbackLoop)).toBeNull()
  })

  it('reads a loop state of a newer host it does not know as no loop information', () => {
    expect(
      readQualityGateFeedbackLoopStatus({ ...statusOfThisHost.feedbackLoop, state: 'throttled' })
    ).toBeNull()
  })

  it('announces a loop change with the frame older clients already know', () => {
    // No new frame: the change signal stays `changed`, and the client reads the status again.
    expect(readQualityGateChangeFrame({ type: 'changed' })).toEqual({ type: 'changed' })
  })

  it('puts the new method behind its own capability, beside the one older clients check', () => {
    expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_RUNTIME_CAPABILITY)
    expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(
      QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY
    )
    expect(RPC_PARAMS_BY_METHOD['qualityGates.setFeedbackLoop']).toBe(
      QualityGateSetFeedbackLoopParams
    )
  })

  it('changes no parameter of a method an older client or host already has', () => {
    for (const method of ['qualityGates.status', 'qualityGates.list'] as const) {
      expect(RPC_PARAMS_BY_METHOD[method]).toBe(QualityGateWorktreeParams)
    }
    // What an older client sends is still everything the status needs.
    expect(QualityGateWorktreeParams.parse({ worktree: 'id:repo::/work' })).toEqual({
      worktree: 'id:repo::/work'
    })
    expect(QualityGateSetFeedbackLoopParams.safeParse({ worktree: 'id:repo::/work' }).success).toBe(
      false
    )
    expect(
      QualityGateSetFeedbackLoopParams.parse({
        worktree: 'id:repo::/work',
        enabled: false,
        maxRounds: 99,
        repoEnabled: true
      })
    ).toEqual({ worktree: 'id:repo::/work', enabled: false })
  })

  it('keeps the loop off for a repository row written by a build without the setting', () => {
    const rowOfAnOlderBuild: { qualityGateFeedbackLoop?: unknown } = JSON.parse(
      JSON.stringify({ id: 'repo', qualityGates: [] })
    )
    expect(
      normalizeQualityGateFeedbackLoopSettings(rowOfAnOlderBuild.qualityGateFeedbackLoop).enabled
    ).toBe(false)
  })
})
