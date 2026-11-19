import type { QualityGateDefinition } from '../shared/quality-gate-types'

/** Gates and run records shaped as the host returns them, for the `orca gates` CLI tests. */
export const LINT_GATE: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint',
  required: true,
  timeoutSeconds: 60
}

export const TEST_GATE: QualityGateDefinition = {
  ...LINT_GATE,
  id: 'test',
  name: 'Unit tests',
  command: 'exit 4',
  required: false
}

export const GATE_WORKTREE = 'id:repo::/tmp/api'

export function gateRunView(gate: QualityGateDefinition, overrides: Record<string, unknown> = {}) {
  const { id: gateId, ...snapshot } = gate
  return {
    id: `run-${gateId}`,
    gateId,
    gate: snapshot,
    repoId: 'repo',
    worktreeId: 'repo::/tmp/api',
    worktreePath: '/tmp/api',
    startedBy: { kind: 'local-cli' },
    source: { head: 'a'.repeat(40), clean: true, fingerprint: 'f0' },
    status: 'passed',
    requestedAt: 1_000,
    startedAt: 1_000,
    finishedAt: 2_500,
    exitCode: 0,
    error: null,
    outputTruncated: false,
    liveness: 'exited',
    freshness: { state: 'current' },
    ...overrides
  }
}
