import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(value\d)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

import type { QualityGateFeedbackLoopStatus } from '../../../../shared/quality-gate-feedback-loop'
import { readQualityGateFeedbackLoop } from './quality-gate-feedback-loop-view'
import {
  feedbackLoopStatus as loopStatus,
  gateRun,
  gateStatus
} from './quality-gate-status-test-fixtures'
import { emptyQualityGateStatusView, type QualityGateStatusView } from './quality-gate-status-view'

function view(
  feedbackLoop: QualityGateFeedbackLoopStatus | undefined,
  overrides: Partial<QualityGateStatusView> = {}
): QualityGateStatusView {
  return {
    ...emptyQualityGateStatusView('local\0repo::/work'),
    status: { ...gateStatus(gateRun()), ...(feedbackLoop ? { feedbackLoop } : {}) },
    ...overrides
  }
}

const read = (overrides: Partial<QualityGateFeedbackLoopStatus>, contactLost = false) => {
  const reading = readQualityGateFeedbackLoop(view(loopStatus(overrides), { contactLost }))
  return reading ? { tone: reading.tone, text: reading.text } : null
}

describe('readQualityGateFeedbackLoop', () => {
  it('shows nothing for a host from before the loop, or before any answer', () => {
    expect(readQualityGateFeedbackLoop(view(undefined))).toBeNull()
    expect(readQualityGateFeedbackLoop(view(loopStatus(), { unsupported: true }))).toBeNull()
    expect(readQualityGateFeedbackLoop(emptyQualityGateStatusView('scope'))).toBeNull()
  })

  it('shows nothing while the repository has the loop off', () => {
    expect(read({ repoEnabled: false, enabled: false })).toBeNull()
    expect(read({ repoEnabled: false, enabled: false, state: 'stopped' })).toBeNull()
  })

  it('names the round while a chain is in progress', () => {
    expect(read({ state: 'checking' })).toEqual({
      tone: 'active',
      text: "Checking the agent's step"
    })
    expect(read({ state: 'awaiting-agent', round: 1 })).toEqual({
      tone: 'active',
      text: "Round 1 of 3: waiting for the agent's fix"
    })
    expect(read({ state: 'checking', round: 2 })).toEqual({
      tone: 'active',
      text: 'Round 2 of 3: checking the fix'
    })
  })

  it('says passed, and hands findings to the user with the reason', () => {
    expect(read({ state: 'passed' })).toEqual({ tone: 'passed', text: 'Passed' })
    expect(read({ state: 'passed', round: 1 })).toEqual({
      tone: 'passed',
      text: 'Passed after round 1 of 3'
    })
    expect(
      read({ state: 'needs-user', round: 3, stopReason: 'round-limit', failingGateIds: ['lint'] })
    ).toEqual({ tone: 'needs-user', text: 'Findings wait for you: the round limit was reached' })
    expect(read({ state: 'needs-user', stopReason: 'user-input' })?.text).toBe(
      "Findings wait for you: someone typed in the agent's terminal"
    )
  })

  it('shows a reason from a newer host as no reason at all', () => {
    expect(read({ state: 'stopped', stopReason: 'agent-interrupted' })).toEqual({
      tone: 'stopped',
      text: 'Stopped: the agent was interrupted'
    })
    expect(read({ state: 'stopped', stopReason: 'budget-spent' })?.text).toBe('Stopped')
    expect(read({ state: 'needs-user', stopReason: 'budget-spent' })?.text).toBe(
      'Findings wait for you'
    )
  })

  it('says the workspace turned it off, and waits quietly before the first step', () => {
    expect(read({ enabled: false, workspaceDisabled: true, state: 'stopped' })).toEqual({
      tone: 'off',
      text: 'Off in this workspace'
    })
    expect(read({})).toEqual({ tone: 'idle', text: 'Waiting for an agent to finish a step' })
  })

  it('reads a host that stopped answering as unknown, never as still running', () => {
    for (const state of ['checking', 'awaiting-agent', 'passed', 'needs-user'] as const) {
      expect(read({ state, round: 1 }, true)).toEqual({
        tone: 'unknown',
        text: 'Unknown until the host answers'
      })
    }
    expect(read({ workspaceDisabled: true }, true)?.tone).toBe('unknown')
  })

  it('says why the host started no gate in a static review', () => {
    expect(read({ state: 'stopped', stopReason: 'run-refused' })).toEqual({
      tone: 'stopped',
      text: 'Stopped: gates do not run in a static review; choose Build or Build and run tests in a new AI review'
    })
  })
})
