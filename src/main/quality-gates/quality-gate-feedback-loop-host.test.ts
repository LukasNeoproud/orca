import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import type { QualityGateFeedbackLoop } from './quality-gate-feedback-loop'
import {
  _setQualityGateFeedbackLoopForTests,
  installQualityGateFeedbackLoop
} from './quality-gate-feedback-loop-host'

type Runtime = Parameters<typeof installQualityGateFeedbackLoop>[0]

function row(state: 'working' | 'done', receivedAt: number): EnrichedAgentHookEventPayload {
  return {
    paneKey: 'tab:leaf',
    worktreeId: 'repo::/work',
    connectionId: null,
    receivedAt,
    stateStartedAt: receivedAt,
    turnStartedAt: 1,
    payload: { state, prompt: '', agentType: 'codex' }
  }
}

describe('feedback loop on the hook server of this host', () => {
  afterEach(() => {
    _setQualityGateFeedbackLoopForTests(null)
  })

  it('reads steps from the status events and pane removals, and stops when uninstalled', () => {
    const handle = vi.fn(async (_event: unknown) => {})
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the installer calls only handle on the loop.
    const loop = { handle } as unknown as QualityGateFeedbackLoop
    _setQualityGateFeedbackLoopForTests({
      loop,
      switches: { isDisabled: () => false, setDisabled: () => {} }
    })
    const statusListeners = new Set<(payload: EnrichedAgentHookEventPayload) => void>()
    const dropListeners = new Set<(paneKey: string) => void>()
    const uninstall = installQualityGateFeedbackLoop(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: no event here reaches the runtime; the loop is a double.
      {} as Runtime,
      {
        subscribeEnrichedStatus: (listener) => {
          statusListeners.add(listener)
          return () => statusListeners.delete(listener)
        },
        subscribeStatusDrop: (listener) => {
          dropListeners.add(listener)
          return () => dropListeners.delete(listener)
        }
      }
    )
    const publish = (payload: EnrichedAgentHookEventPayload): void =>
      statusListeners.forEach((listener) => listener(payload))

    publish(row('working', 10))
    publish(row('done', 11))
    dropListeners.forEach((listener) => listener('tab:leaf'))
    expect(handle.mock.calls.map(([event]) => event)).toMatchObject([
      { type: 'step-completed', agent: { paneKey: 'tab:leaf', agentType: 'codex' } },
      { type: 'agent-gone', paneKey: 'tab:leaf' }
    ])

    uninstall()
    expect(statusListeners.size).toBe(0)
    expect(dropListeners.size).toBe(0)
  })
})
