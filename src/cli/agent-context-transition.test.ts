import { afterEach, describe, expect, it } from 'vitest'
import {
  agentContextCallerFromEnvironment,
  agentContextRequestId,
  agentContextTransitionInput
} from './agent-context-transition'

const originalEnvironment = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnvironment)
})

describe('agent context transition CLI binding', () => {
  it('accepts a complete terminal identity and rejects a partial one', () => {
    process.env.ORCA_TERMINAL_HANDLE = 'term_current'
    process.env.ORCA_PANE_KEY = 'tab_current:leaf_current'
    expect(agentContextCallerFromEnvironment()).toEqual({
      terminalHandle: 'term_current',
      paneKey: 'tab_current:leaf_current'
    })

    delete process.env.ORCA_PANE_KEY
    expect(() => agentContextCallerFromEnvironment()).toThrow('ORCA_TERMINAL_HANDLE')
  })

  it('prefers structured session proof when a worker also has a terminal handle', () => {
    expect(
      agentContextCallerFromEnvironment({
        ORCA_AGENT_SESSION_ID: 'session_current',
        ORCA_AGENT_SESSION_SPAWN_TOKEN: 'spawn_current',
        ORCA_TERMINAL_HANDLE: 'term_current'
      })
    ).toEqual({ sessionId: 'session_current', spawnToken: 'spawn_current' })
  })

  it('does not invent request identities supplied for a retry', () => {
    expect(agentContextRequestId('retry-1')).toBe('retry-1')
    expect(
      agentContextTransitionInput({
        mode: 'fresh',
        reason: 'ready for validation',
        checkpoint: {
          goal: 'Validate the feature',
          completed: 'Implementation is complete',
          decisions: [],
          constraints: [],
          changes: [],
          verification: [],
          openQuestions: []
        },
        continuation: 'wait-for-user'
      })
    ).toEqual({
      mode: 'fresh',
      reason: 'ready for validation',
      checkpoint: {
        goal: 'Validate the feature',
        completed: 'Implementation is complete',
        decisions: [],
        constraints: [],
        changes: [],
        verification: [],
        openQuestions: []
      },
      continuation: 'wait-for-user'
    })
  })
})
