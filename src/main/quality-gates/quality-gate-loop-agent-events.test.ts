import { describe, expect, it } from 'vitest'
import type { ParsedAgentStatusPayload } from '../../shared/agent-status-types'
import { structuredAgentSessionTabId } from '../../shared/structured-agent-session-projection'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import { createQualityGateLoopAgentEvents } from './quality-gate-loop-agent-events'

let clock = 100

function row(
  payload: Partial<ParsedAgentStatusPayload> & Pick<ParsedAgentStatusPayload, 'state'>,
  extra: Partial<EnrichedAgentHookEventPayload> = {}
): EnrichedAgentHookEventPayload {
  clock += 1
  return {
    paneKey: 'tab:leaf',
    worktreeId: 'repo::/work',
    connectionId: null,
    receivedAt: clock,
    stateStartedAt: clock,
    payload: { prompt: '', agentType: 'claude', ...payload },
    ...extra
  }
}

describe('agent events of the quality gate feedback loop', () => {
  it('reports a finished step once, when the row moves from working to done', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'done' }))
    expect(
      events.observe(
        row(
          { state: 'working', prompt: 'add login' },
          { turnStartedAt: 50, hasExplicitPrompt: true }
        )
      )
    ).toEqual({
      type: 'turn-started',
      worktreeId: 'repo::/work',
      paneKey: 'tab:leaf',
      prompt: 'add login'
    })
    const done = row({ state: 'done' }, { turnStartedAt: 50, terminalHandle: 'term-1' })
    expect(events.observe(done)).toEqual({
      type: 'step-completed',
      worktreeId: 'repo::/work',
      agent: {
        paneKey: 'tab:leaf',
        agentType: 'claude',
        terminalHandle: 'term-1',
        turnStartedAt: 50,
        completedAt: done.receivedAt
      }
    })
    // A repeated done is not another step.
    expect(events.observe(row({ state: 'done' }, { turnStartedAt: 50 }))).toBeNull()
  })

  it('does not take a subagent finishing, or a lead that finished ahead of it, for a step', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))
    // A subagent stopped: the lead still works and the row stays working.
    expect(
      events.observe(row({ state: 'working' }, { turnStartedAt: 50, toolAgentId: 'sub-1' }))
    ).toBeNull()
    // The lead ended its turn while a subagent still runs: the combined row is still working.
    expect(
      events.observe(
        row(
          {
            state: 'working',
            mainAgent: { state: 'done', outcome: 'success', stateStartedAt: 60 }
          },
          { turnStartedAt: 50 }
        )
      )
    ).toBeNull()
    expect(events.observe(row({ state: 'done' }, { turnStartedAt: 50 }))).toMatchObject({
      type: 'step-completed'
    })
  })

  it('does not read a permission prompt answered mid-turn as a new turn', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))
    expect(events.observe(row({ state: 'waiting' }, { turnStartedAt: 50 }))).toBeNull()
    expect(events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))).toBeNull()
  })

  it('reads a later stamp of a running turn as dating it, and a changed stamp as a new turn', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'done' }))
    // A repaint moved the row to working before the prompt hook dated the turn.
    expect(events.observe(row({ state: 'working' }))).toMatchObject({ type: 'turn-started' })
    expect(events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))).toBeNull()
    // A message the agent took in mid-turn opens a turn of its own.
    expect(events.observe(row({ state: 'working' }, { turnStartedAt: 60 }))).toMatchObject({
      type: 'turn-started'
    })
  })

  it('reads a done-to-working change as a turn start for an agent with no turn clock', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }))
    events.observe(row({ state: 'done' }))
    expect(events.observe(row({ state: 'working' }))).toMatchObject({
      type: 'turn-started'
    })
  })

  it('reports an interrupted or failed turn as interrupted, never as a finished step', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))
    expect(events.observe(row({ state: 'done', interrupted: true }))).toEqual({
      type: 'interrupted',
      worktreeId: 'repo::/work',
      paneKey: 'tab:leaf'
    })
    events.observe(row({ state: 'working' }, { turnStartedAt: 70 }))
    expect(
      events.observe(
        row({ state: 'done', mainAgent: { state: 'done', outcome: 'failure', stateStartedAt: 80 } })
      )
    ).toMatchObject({ type: 'interrupted' })
  })

  it('ignores evidence that is not a live turn end', () => {
    const events = createQualityGateLoopAgentEvents()
    // A row first seen done: the turn ended before this host was watching.
    expect(events.observe(row({ state: 'done' }))).toBeNull()
    events.observe(row({ state: 'working' }, { turnStartedAt: 50 }))
    expect(events.observe(row({ state: 'done' }, { isReplay: true }))).toBeNull()
    expect(events.observe(row({ state: 'done' }, { restoredUnconfirmed: true }))).toBeNull()
    expect(events.observe(row({ state: 'done' }, { providerSessionOnly: true }))).toBeNull()
    expect(events.observe(row({ state: 'done', sessionBoundary: true }))).toBeNull()
    // The session boundary moved the row to done, so the next done is a repeat.
    expect(events.observe(row({ state: 'done' }))).toBeNull()
  })

  it('needs a worktree to attribute the step to', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }, { worktreeId: undefined }))
    expect(events.observe(row({ state: 'done' }, { worktreeId: undefined }))).toBeNull()
  })

  it('addresses a structured chat by its session and trusts its prompt', () => {
    const events = createQualityGateLoopAgentEvents()
    const structured = {
      structuredHost: 'owned',
      tabId: structuredAgentSessionTabId('s-1')
    } as const
    events.observe(row({ state: 'working' }, structured))
    expect(events.observe(row({ state: 'done' }, structured))).toMatchObject({
      type: 'step-completed',
      agent: { structuredSessionId: 's-1' }
    })
    expect(events.observe(row({ state: 'working', prompt: 'next' }, structured))).toMatchObject({
      type: 'turn-started',
      prompt: 'next'
    })
  })

  it('forgets a pane that went away', () => {
    const events = createQualityGateLoopAgentEvents()
    events.observe(row({ state: 'working' }))
    expect(events.forget('tab:leaf')).toEqual({ type: 'agent-gone', paneKey: 'tab:leaf' })
    expect(events.observe(row({ state: 'done' }))).toBeNull()
  })
})
