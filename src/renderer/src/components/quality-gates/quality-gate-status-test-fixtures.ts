import type { QualityGateFeedbackLoopStatus } from '../../../../shared/quality-gate-feedback-loop'
import type {
  QualityGateRunView,
  QualityGateStatusResult
} from '../../../../shared/quality-gate-types'

export function gateRun(overrides: Partial<QualityGateRunView> = {}): QualityGateRunView {
  return {
    id: 'run-1',
    gateId: 'lint',
    gate: { name: 'Lint', command: 'echo lint', required: true, timeoutSeconds: 60 },
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    startedBy: { kind: 'desktop' },
    source: { head: 'aaa1112223334445', clean: true, fingerprint: 'f0' },
    status: 'passed',
    requestedAt: 1_000,
    startedAt: 2_000,
    finishedAt: 5_500,
    exitCode: 0,
    error: null,
    outputTruncated: false,
    liveness: 'exited',
    freshness: { state: 'current' },
    ...overrides
  }
}

export function liveGateRun(overrides: Partial<QualityGateRunView> = {}): QualityGateRunView {
  return gateRun({
    status: 'running',
    liveness: 'live',
    finishedAt: null,
    exitCode: null,
    freshness: null,
    ...overrides
  })
}

/** A repository with the loop on, nothing checked yet. */
export function feedbackLoopStatus(
  overrides: Partial<QualityGateFeedbackLoopStatus> = {}
): QualityGateFeedbackLoopStatus {
  return {
    enabled: true,
    repoEnabled: true,
    workspaceDisabled: false,
    maxRounds: 3,
    state: 'idle',
    round: 0,
    failingGateIds: [],
    ...overrides
  }
}

/** One gate per entry, named `gate-<index>`; `required` alternates off for odd indexes. */
export function gateStatus(...runs: (QualityGateRunView | null)[]): QualityGateStatusResult {
  return {
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    source: { head: 'aaa1112223334445', clean: true, fingerprint: 'f0' },
    gates: runs.map((latestRun, index) => ({
      gate: {
        id: `gate-${index}`,
        name: `Gate ${index}`,
        command: 'echo',
        required: index % 2 === 0,
        timeoutSeconds: 60
      },
      latestRun
    }))
  }
}
