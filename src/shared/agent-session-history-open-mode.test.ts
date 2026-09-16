import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SESSION_HISTORY_OPEN_MODE,
  normalizeAgentSessionHistoryOpenMode,
  resolveAgentSessionHistoryOpenMode
} from './agent-session-history-open-mode'

describe('agent session history open mode', () => {
  it('defaults missing and unknown values to terminal independently of new-tab display', () => {
    const chatByDefault = {
      agentSessionHistoryOpenMode: undefined,
      openAgentTabsInChatByDefault: true
    }
    expect(DEFAULT_AGENT_SESSION_HISTORY_OPEN_MODE).toBe('terminal')
    expect(resolveAgentSessionHistoryOpenMode(undefined)).toBe('terminal')
    expect(resolveAgentSessionHistoryOpenMode(chatByDefault)).toBe('terminal')
    expect(normalizeAgentSessionHistoryOpenMode('native-chat')).toBe('terminal')
  })

  it('preserves an explicit structured preference', () => {
    expect(resolveAgentSessionHistoryOpenMode({ agentSessionHistoryOpenMode: 'structured' })).toBe(
      'structured'
    )
  })
})
