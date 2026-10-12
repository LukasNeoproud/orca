import { describe, expect, it } from 'vitest'
import { encodeOrcaInteractionResult } from '../../shared/orca-interaction'
import { CODEX_DYNAMIC_TOOL_CALL_METHOD } from './codex-orca-interaction'
import type { CodexStructuredSessionEvent } from './codex-structured-session-adapter'
import { THREAD_ID, acquired, fakeCodex } from './codex-structured-session-adapter-fixture'

describe('CodexStructuredSessionAdapter Orca interactions', () => {
  it('pauses a dynamic interaction until a structured answer is returned', async () => {
    const codex = fakeCodex()
    const events: CodexStructuredSessionEvent[] = []
    const adapter = await acquired(codex, {}, events)
    codex.connections[0].handlers.onServerRequest?.({
      id: 12,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: THREAD_ID,
        turnId: 'turn-1',
        callId: 'interaction-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          fields: [
            {
              id: 'storage',
              type: 'single_choice',
              label: 'Storage',
              options: [{ id: 'room', label: 'Room', recommended: true }]
            }
          ]
        }
      }
    })

    expect(codex.connections[0].replies).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: 'prompt', codexItemId: 'interaction-1' })

    adapter.bindPromptItemId('session-1', 'journal-interaction', 'interaction-1')
    const result = { status: 'submitted' as const, values: { storage: 'room' } }
    await adapter.answerPrompt({
      sessionId: 'session-1',
      itemId: 'journal-interaction',
      kind: 'question',
      response: { kind: 'option', optionId: encodeOrcaInteractionResult(result) },
      fence: 7,
      commit: async () => undefined
    })

    expect(codex.connections[0].replies).toEqual([
      {
        id: 12,
        result: {
          contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
          success: true
        }
      }
    ])
  })
})
