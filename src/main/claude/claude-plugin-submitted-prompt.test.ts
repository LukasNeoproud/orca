import { describe, expect, it, vi } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import { claudePluginPromptText } from './claude-plugin-submitted-prompt'
import { createClaudeJournalTranslator } from './claude-structured-journal-translation'
import type { ClaudeStructuredSessionEvent } from './claude-structured-session-state'

// Shapes captured from Claude Code 2.1.300 with --replay-user-messages (the mods-demo guide).
const SUBMITTED =
  "The mods-demo plugin sent a message:\nIn two sentences, what is in this repository?\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns — it starts this turn in the user's place. Address the message above."
const COMMAND =
  '<command-name>/hello-tabs</command-name>\n            <command-message>hello-tabs</command-message>\n            <command-args></command-args>'

function pluginReplay(
  uuid: string,
  content: string,
  observedAt: number
): ClaudeStructuredSessionEvent {
  return {
    type: 'message',
    sessionId: 'orca-session',
    observedAt,
    message: {
      type: 'user',
      uuid,
      session_id: 'claude-session',
      parent_tool_use_id: null,
      isReplay: true,
      origin: { kind: 'plugin', name: 'mods-demo' },
      message: { role: 'user', content }
    }
  }
}

function journal() {
  const items: { identity: AgentJournalItemIdentity; body: AgentJournalItemBody }[] = []
  const sink: StructuredAgentSessionEventSink = {
    appendItem: (identity, body) => items.push({ identity, body }),
    appendTombstone: vi.fn(),
    publish: vi.fn()
  }
  return { items, translator: createClaudeJournalTranslator({ sink }) }
}

describe('claudePluginPromptText', () => {
  it('reads only what the plugin asked', () => {
    expect(claudePluginPromptText(SUBMITTED)).toBe('In two sentences, what is in this repository?')
  })

  it('reads a slash command a plugin ran as the command', () => {
    expect(claudePluginPromptText(COMMAND)).toBe('/hello-tabs')
    expect(
      claudePluginPromptText(
        '<command-name>review</command-name><command-args>src/a.ts</command-args>'
      )
    ).toBe('/review src/a.ts')
  })

  it('keeps text in a shape it does not know', () => {
    expect(claudePluginPromptText('Summarise the diff')).toBe('Summarise the diff')
  })
})

describe('a prompt a plugin submitted', () => {
  it('journals a user row and opens the turn on it', () => {
    const { items, translator } = journal()

    translator.handle(pluginReplay('plugin-1', SUBMITTED, 1_000))

    expect(items[0]?.body).toEqual({
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'In two sentences, what is in this repository?' }]
    })
    const turn = items.map((item) => readAgentJournalTurn(item.body)).find(Boolean)
    expect(turn).toMatchObject({
      turnId: 'plugin-1',
      state: 'running',
      userItemId: 'claude:claude-session:plugin-1'
    })
  })

  it('still drops the echo of a send Orca made', () => {
    const { items, translator } = journal()
    const event = pluginReplay('user-1', 'go', 1_000)
    if (event.type === 'message') {
      delete event.message.origin
    }

    translator.handle(event)

    expect(items.some((item) => item.body.kind === 'message')).toBe(false)
  })

  it("puts a command it ran above that command's output, in one turn", () => {
    const { items, translator } = journal()
    translator.handle({
      type: 'message',
      sessionId: 'orca-session',
      observedAt: 1_000,
      message: {
        type: 'assistant',
        uuid: 'output-1',
        session_id: 'claude-session',
        parent_tool_use_id: null,
        local_command_run: { command: 'replay', args: '', plugin: 'replay-theater' },
        message: {
          id: 'output-1',
          role: 'assistant',
          model: '<synthetic>',
          content: [{ type: 'text', text: 'Replay Theater: no edits in the last turn.' }]
        }
      }
    })
    translator.handle(pluginReplay('command-1', COMMAND.replace(/hello-tabs/g, 'replay'), 1_000))

    const messages = items.filter((item) => item.body.kind === 'message')
    expect(messages.map((item) => item.body.kind === 'message' && item.body.role)).toEqual([
      'user',
      'assistant'
    ])
    const turns = items.map((item) => readAgentJournalTurn(item.body)).filter(Boolean)
    expect(turns.map((turn) => turn?.state)).toEqual(['running'])
    expect(turns[0]?.turnId).toBe('command-1')
  })
})
