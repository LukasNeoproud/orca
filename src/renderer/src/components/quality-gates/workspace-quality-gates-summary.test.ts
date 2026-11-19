import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace('{{value0}}', String(values?.value0 ?? ''))
}))

import { gateRun, gateStatus, liveGateRun } from './quality-gate-status-test-fixtures'
import {
  summarizeWorkspaceQualityGates,
  workspaceQualityGatesSummaryLabel
} from './workspace-quality-gates-summary'

describe('workspace quality gates summary', () => {
  it('counts each gate once by what its latest run says now', () => {
    const summary = summarizeWorkspaceQualityGates(
      gateStatus(
        gateRun(),
        gateRun({ status: 'failed', exitCode: 1 }),
        gateRun({ status: 'timed-out', exitCode: null }),
        gateRun({ status: 'not-started', freshness: null }),
        gateRun({ freshness: { state: 'stale', reasons: ['tree-changed'] } }),
        gateRun({
          status: 'failed',
          freshness: { state: 'stale', reasons: ['head-changed'] }
        }),
        liveGateRun(),
        liveGateRun({ status: 'queued' }),
        gateRun({ status: 'unverifiable', liveness: 'unverifiable', freshness: null }),
        gateRun({ status: 'cancelled', exitCode: null, freshness: null }),
        null
      )
    )

    expect(summary).toEqual({
      passed: 1,
      failed: 3,
      outdated: 2,
      running: 2,
      unknown: 1,
      missing: 2
    })
  })

  it('does not count a stopped run an older host calls up to date as passed or outdated', () => {
    const summary = summarizeWorkspaceQualityGates(
      gateStatus(gateRun({ status: 'cancelled', exitCode: null, freshness: { state: 'current' } }))
    )
    expect(summary).toMatchObject({ passed: 0, outdated: 0, missing: 1 })
  })

  it('reads the counts most urgent first and leaves zeros out', () => {
    expect(
      workspaceQualityGatesSummaryLabel({
        passed: 2,
        failed: 1,
        running: 0,
        outdated: 1,
        unknown: 0,
        missing: 0
      })
    ).toBe('1 failed · 1 out of date · 2 passed')
    expect(
      workspaceQualityGatesSummaryLabel({
        passed: 0,
        failed: 0,
        running: 1,
        outdated: 0,
        unknown: 1,
        missing: 3
      })
    ).toBe('1 running · 1 unknown · 3 not run')
  })
})
