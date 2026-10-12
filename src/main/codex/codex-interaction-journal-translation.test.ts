import { describe, expect, it } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import {
  CODEX_MCP_ELICITATION_METHOD,
  encodeOrcaInteractionElicitationMessage,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA,
  ORCA_INTERACTION_MCP_SERVER
} from '../../shared/orca-interaction-elicitation'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { CODEX_DYNAMIC_TOOL_CALL_METHOD } from './codex-orca-interaction'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'

const SESSION_ID = 'session-1'
const THREAD_ID = 'thread-abc'
const TURN_ID = 'turn-1'

function recorder() {
  const rows: { key: string; body: AgentJournalItemBody }[] = []
  const bound: [string, string, string][] = []
  const sink: StructuredAgentSessionEventSink = {
    appendItem: (identity: AgentJournalItemIdentity, body) =>
      rows.push({ key: agentJournalItemKey(identity), body }),
    appendTombstone: () => {},
    publish: () => {}
  }
  return {
    sink,
    rows,
    bound,
    bindPromptItemId: (journalItemId: string, threadId: string, promptKey: string) =>
      bound.push([journalItemId, threadId, promptKey])
  }
}

describe('codex Orca interaction journal translation', () => {
  it.each([CODEX_DYNAMIC_TOOL_CALL_METHOD, CODEX_MCP_ELICITATION_METHOD])(
    'publishes %s as one durable rich question',
    (method) => {
      const tap = recorder()
      const translator = createCodexJournalTranslator({
        sink: tap.sink,
        bindPromptItemId: tap.bindPromptItemId
      })

      const request = {
        title: 'Persistence',
        fields: [
          {
            id: 'storage',
            type: 'single_choice' as const,
            label: 'Storage',
            options: [{ id: 'sqlite', label: 'SQLite', recommended: true }]
          }
        ]
      }
      const admission = translator.handle({
        type: 'prompt',
        sessionId: SESSION_ID,
        threadId: THREAD_ID,
        method,
        params:
          method === CODEX_MCP_ELICITATION_METHOD
            ? {
                threadId: THREAD_ID,
                turnId: TURN_ID,
                serverName: ORCA_INTERACTION_MCP_SERVER,
                mode: 'form',
                message: encodeOrcaInteractionElicitationMessage(request),
                requestedSchema: ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
              }
            : {
                threadId: THREAD_ID,
                turnId: TURN_ID,
                callId: 'interaction-1',
                namespace: 'orca',
                tool: 'interact',
                arguments: request
              },
        codexItemId: 'interaction-1',
        promptKey: 'interaction-1'
      })

      expect(admission).toEqual({ accepted: true })
      expect(tap.rows).toEqual([
        expect.objectContaining({
          body: expect.objectContaining({
            kind: 'question',
            question: 'Persistence',
            interaction: expect.objectContaining({
              fields: [expect.objectContaining({ id: 'storage' })]
            })
          })
        })
      ])
      expect(tap.bound).toEqual([
        ['orca:codex-prompt%3Athread-abc%3Ainteraction-1', THREAD_ID, 'interaction-1']
      ])
    }
  )
})
