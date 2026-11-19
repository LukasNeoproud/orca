import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace('{{value0}}', String(values?.value0 ?? ''))
}))

import { gateRun, gateStatus, liveGateRun } from './quality-gate-status-test-fixtures'
import { emptyQualityGateStatusView, type QualityGateStatusView } from './quality-gate-status-view'
import { readWorkspaceQualityGatesForCard } from './workspace-quality-gates-card-state'

const passed = gateRun()
const failed = gateRun({ status: 'failed', exitCode: 1 })
const stale = gateRun({ freshness: { state: 'stale', reasons: ['head-changed'] } })

function view(overrides: Partial<QualityGateStatusView>): QualityGateStatusView {
  return { ...emptyQualityGateStatusView('local\0repo::/work'), ...overrides }
}
const stateOf = (...runs: Parameters<typeof gateStatus>): string | null =>
  readWorkspaceQualityGatesForCard(view({ status: gateStatus(...runs) }))?.state ?? null

describe('readWorkspaceQualityGatesForCard', () => {
  it('shows nothing without gates, before an answer, on an older host and before any run', () => {
    expect(readWorkspaceQualityGatesForCard(view({}))).toBeNull()
    expect(stateOf()).toBeNull()
    expect(
      readWorkspaceQualityGatesForCard(view({ status: gateStatus(passed), unsupported: true }))
    ).toBeNull()
    expect(stateOf(null, gateRun({ status: 'cancelled', freshness: null }))).toBeNull()
  })

  it('reads passed only when every gate passed on the tree as it is', () => {
    expect(stateOf(passed, passed)).toBe('passed')
    expect(stateOf(passed, null)).toBe('incomplete')
    expect(stateOf(passed, stale)).toBe('outdated')
  })

  it('puts the most urgent reading first: running, failed, unknown, outdated', () => {
    expect(stateOf(failed, liveGateRun(), stale)).toBe('running')
    expect(stateOf(failed, stale, passed)).toBe('failed')
    expect(stateOf(gateRun({ status: 'timed-out', exitCode: null }))).toBe('failed')
    expect(
      stateOf(gateRun({ status: 'unverifiable', liveness: 'unverifiable', freshness: null }), stale)
    ).toBe('unknown')
    // A failure from before a later commit says nothing about the tree as it is.
    expect(
      stateOf(
        gateRun({ status: 'failed', freshness: { state: 'stale', reasons: ['tree-changed'] } })
      )
    ).toBe('outdated')
  })

  it('names the counts in the label', () => {
    expect(
      readWorkspaceQualityGatesForCard(view({ status: gateStatus(failed, passed, null) }))
    ).toEqual({ state: 'failed', label: 'Local gates: 1 failed · 1 passed · 1 not run' })
  })

  it('reads a host that stopped answering as unknown, never as failed, passed or running', () => {
    for (const run of [failed, passed, liveGateRun()]) {
      const reading = readWorkspaceQualityGatesForCard(
        view({ status: gateStatus(run), contactLost: true })
      )
      expect(reading?.state).toBe('unknown')
      expect(reading?.label).toContain('the host did not answer')
    }
    // Nothing was ever seen: whether the workspace has gates is not known either.
    expect(readWorkspaceQualityGatesForCard(view({ contactLost: true }))).toBeNull()
  })
})
