import { describe, expect, it } from 'vitest'
import type {
  QualityGateRunView,
  QualityGateStatusResult
} from '../../../../shared/quality-gate-types'
import {
  QUALITY_GATE_LIVE_POLL_MS,
  QUALITY_GATE_LOST_CONTACT_POLL_MS,
  QUALITY_GATE_WATCH_POLL_MS,
  emptyQualityGateStatusView,
  hasLiveQualityGateRun,
  nextQualityGatePollDelay,
  presentQualityGateStatus
} from './quality-gate-status-view'

function run(overrides: Partial<QualityGateRunView> = {}): QualityGateRunView {
  return {
    id: 'run-1',
    gateId: 'lint',
    gate: { name: 'Lint', command: 'echo lint', required: true, timeoutSeconds: 60 },
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    startedBy: { kind: 'desktop' },
    source: { head: 'aaa', clean: true, fingerprint: 'f0' },
    status: 'running',
    requestedAt: 1,
    startedAt: 2,
    finishedAt: null,
    exitCode: null,
    error: null,
    outputTruncated: false,
    liveness: 'live',
    freshness: null,
    ...overrides
  }
}

function status(...runs: (QualityGateRunView | null)[]): QualityGateStatusResult {
  return {
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    source: { head: 'aaa', clean: true, fingerprint: 'f0' },
    gates: runs.map((latestRun, index) => ({
      gate: {
        id: `gate-${index}`,
        name: `Gate ${index}`,
        command: 'echo',
        required: true,
        timeoutSeconds: 60
      },
      latestRun
    }))
  }
}

const passed = run({
  id: 'run-0',
  status: 'passed',
  exitCode: 0,
  liveness: 'exited',
  finishedAt: 3,
  freshness: { state: 'current' }
})

describe('quality gate status view', () => {
  const scope = 'local\0repo::/work'

  it('shows what the host reported while it answers', () => {
    const view = { ...emptyQualityGateStatusView(scope), status: status(passed, run()) }
    expect(presentQualityGateStatus(view)).toBe(view.status)
    expect(hasLiveQualityGateRun(view.status)).toBe(true)
    expect(nextQualityGatePollDelay(view)).toBe(QUALITY_GATE_LIVE_POLL_MS)
  })

  it('shows a run in progress as unverifiable, not failed, once the host stops answering', () => {
    const view = {
      ...emptyQualityGateStatusView(scope),
      status: status(passed, run(), run({ id: 'run-2', status: 'queued' }), null),
      contactLost: true
    }
    const shown = presentQualityGateStatus(view)

    expect(shown?.gates.map((entry) => entry.latestRun?.status ?? null)).toEqual([
      'passed',
      'unverifiable',
      'unverifiable',
      null
    ])
    expect(shown?.gates[1].latestRun).toMatchObject({
      liveness: 'unverifiable',
      exitCode: null,
      freshness: null,
      startedAt: 2
    })
    // A finished result stays as it was: losing the host later does not undo it.
    expect(shown?.gates[0].latestRun).toBe(passed)
    // Keep asking, slowly, so the real outcome replaces the unknown one when the host is back.
    expect(nextQualityGatePollDelay(view)).toBe(QUALITY_GATE_LOST_CONTACT_POLL_MS)
  })

  it('stops asking when nothing is in progress or the host has no gates at all', () => {
    expect(nextQualityGatePollDelay(emptyQualityGateStatusView(scope))).toBeNull()
    expect(
      nextQualityGatePollDelay({ ...emptyQualityGateStatusView(scope), status: status(passed) })
    ).toBeNull()
    expect(
      nextQualityGatePollDelay({
        ...emptyQualityGateStatusView(scope),
        status: status(run()),
        unsupported: true
      })
    ).toBeNull()
  })

  describe('a panel that follows the workspace', () => {
    const settled = { ...emptyQualityGateStatusView(scope), status: status(passed) }
    const live = { ...emptyQualityGateStatusView(scope), status: status(run()) }

    it('asks nothing on an interval while the host signals changes itself', () => {
      const mode = { watch: true, streaming: true }
      expect(nextQualityGatePollDelay(settled, mode)).toBeNull()
      expect(nextQualityGatePollDelay(live, mode)).toBeNull()
    })

    it('asks an older host on an interval, so a commit or an edit still shows up', () => {
      const mode = { watch: true, streaming: false }
      expect(nextQualityGatePollDelay(settled, mode)).toBe(QUALITY_GATE_WATCH_POLL_MS)
      expect(nextQualityGatePollDelay(live, mode)).toBe(QUALITY_GATE_LIVE_POLL_MS)
      expect(nextQualityGatePollDelay(emptyQualityGateStatusView(scope), mode)).toBe(
        QUALITY_GATE_WATCH_POLL_MS
      )
    })

    it('keeps asking a host that stopped answering, with or without a run in progress', () => {
      for (const streaming of [true, false]) {
        expect(
          nextQualityGatePollDelay({ ...settled, contactLost: true }, { watch: true, streaming })
        ).toBe(QUALITY_GATE_LOST_CONTACT_POLL_MS)
      }
    })

    it('never asks a host that has no gates at all', () => {
      expect(
        nextQualityGatePollDelay(
          { ...emptyQualityGateStatusView(scope), unsupported: true },
          { watch: true, streaming: false }
        )
      ).toBeNull()
    })
  })
})
