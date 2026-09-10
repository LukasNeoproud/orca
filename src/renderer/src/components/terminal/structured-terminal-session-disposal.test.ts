import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'

const mocks = vi.hoisted(() => ({ close: vi.fn() }))
vi.mock('@/runtime/structured-agent-session-close', () => ({
  closeStructuredAgentSession: mocks.close
}))
import {
  closeStructuredTerminalSessionWithRetry,
  structuredTerminalSessionId
} from './structured-terminal-session-disposal'

beforeEach(() => vi.clearAllMocks())

describe('structured terminal binding', () => {
  it.each(['chat', 'terminal', undefined])('retains ownership in %s view mode', (viewMode) => {
    const tabs = [
      { contentType: 'terminal', entityId: 'tab-1', structuredSessionId: 'session-1', viewMode }
    ] as Tab[]
    expect(structuredTerminalSessionId(tabs, 'tab-1')).toBe('session-1')
  })

  it('scopes a bound session to its owning pane', () => {
    const tabs = [
      {
        contentType: 'terminal',
        entityId: 'tab-1',
        structuredSessionId: 'session-1',
        structuredSessionPaneKey: 'tab-1:leaf-1'
      }
    ] as Tab[]
    expect(structuredTerminalSessionId(tabs, 'tab-1', 'tab-1:leaf-1')).toBe('session-1')
    expect(structuredTerminalSessionId(tabs, 'tab-1', 'tab-1:leaf-2')).toBeNull()
  })

  it('does not interpret an unsupported remote close as confirmed', async () => {
    mocks.close.mockResolvedValue('unsupported')
    expect(
      await closeStructuredTerminalSessionWithRetry(
        { kind: 'environment', environmentId: 'old-host' },
        'session-1'
      )
    ).toBe(false)
  })
})
