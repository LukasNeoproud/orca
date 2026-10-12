import { describe, expect, it } from 'vitest'
import { encodeOrcaInteractionResult } from '../../shared/orca-interaction'
import { encodeAgentSessionQuestionAnswers } from '../../shared/agent-session-question-answer'
import { CODEX_DYNAMIC_TOOL_CALL_METHOD } from './codex-orca-interaction'
import {
  applyCodexPromptAnswer,
  CodexPromptRegistry,
  prepareCodexPromptAnswer,
  type CodexPendingPrompt
} from './codex-structured-prompt-replies'

function answerInteraction(prompt: CodexPendingPrompt, optionId: string): unknown {
  return applyCodexPromptAnswer(
    prompt,
    prepareCodexPromptAnswer(prompt, { kind: 'option', optionId })
  )
}

describe('Codex Orca interaction prompts', () => {
  it('matches interaction settlement by exact request or non-null thread and turn', () => {
    const registry = new CodexPromptRegistry()
    const interaction = registry.register({
      id: 41,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: 'thread-root',
        turnId: 'turn-1',
        callId: 'call-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          title: 'Root turn',
          fields: [{ id: 'confirm', type: 'boolean', label: 'Continue?' }]
        }
      }
    })
    registry.bindJournalItemId('journal-interaction', 'thread-root', 'call-1')
    registry.register({
      id: 42,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: 'thread-child',
        turnId: 'turn-1',
        callId: 'call-child',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          title: 'Child turn',
          fields: [{ id: 'confirm', type: 'boolean', label: 'Continue?' }]
        }
      }
    })

    expect(registry.interactionSettlements({ requestId: 41 })).toEqual([
      { prompt: interaction, journalItemIds: ['journal-interaction'] }
    ])
    expect(registry.interactionSettlements({ threadId: 'thread-root', turnId: 'turn-1' })).toEqual([
      { prompt: interaction, journalItemIds: ['journal-interaction'] }
    ])
    expect(
      registry.interactionSettlements({ threadId: 'thread-child', turnId: 'turn-other' })
    ).toEqual([])
  })

  it('returns a structured dynamic tool response for submit and cancel', () => {
    for (const result of [
      { status: 'submitted' as const, values: { storage: 'sqlite' } },
      { status: 'cancelled' as const }
    ]) {
      const registry = new CodexPromptRegistry()
      const prompt = registry.register({
        id: 11,
        method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          callId: 'call-1',
          namespace: 'orca',
          tool: 'interact',
          arguments: {
            fields: [
              {
                id: 'storage',
                type: 'single_choice',
                label: 'Storage',
                required: true,
                options: [{ id: 'sqlite', label: 'SQLite' }]
              }
            ]
          }
        }
      })

      expect(
        answerInteraction(prompt as NonNullable<typeof prompt>, encodeOrcaInteractionResult(result))
      ).toEqual({
        contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
        success: true
      })
    }
  })

  it('converts the ordinary grouped-question fallback into a structured tool result', () => {
    const registry = new CodexPromptRegistry()
    const prompt = registry.register({
      id: 13,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: 'thread-1',
        callId: 'call-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          fields: [
            {
              id: 'platforms',
              type: 'multi_choice',
              label: 'Platforms',
              allowCustom: true,
              options: [
                { id: 'android', label: 'Android' },
                { id: 'web', label: 'Web' }
              ]
            },
            { id: 'offline', type: 'boolean', label: 'Offline', required: true },
            { id: 'minSdk', type: 'number', label: 'Minimum SDK', min: 21 },
            { id: 'note', type: 'text', label: 'Note', minLength: 3 }
          ]
        }
      }
    })
    const answer = encodeAgentSessionQuestionAnswers([
      { questionId: 'platforms', optionIds: ['android'], other: 'Desktop' },
      { questionId: 'offline', optionIds: ['__orca_true__'] },
      { questionId: 'minSdk', optionIds: [], other: '26' },
      { questionId: 'note', optionIds: [], other: '  a' }
    ])

    expect(answerInteraction(prompt as NonNullable<typeof prompt>, answer)).toEqual({
      contentItems: [
        {
          type: 'inputText',
          text: JSON.stringify({
            status: 'submitted',
            values: {
              platforms: ['android', { type: 'custom', value: 'Desktop' }],
              offline: true,
              minSdk: 26,
              note: '  a'
            }
          })
        }
      ],
      success: true
    })
  })

  it('rejects malformed or forged Orca interaction answers', () => {
    const registry = new CodexPromptRegistry()
    const prompt = registry.register({
      id: 12,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: 'thread-1',
        callId: 'call-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          fields: [
            {
              id: 'storage',
              type: 'single_choice',
              label: 'Storage',
              options: [{ id: 'sqlite', label: 'SQLite' }]
            }
          ]
        }
      }
    })

    expect(() =>
      answerInteraction(
        prompt as NonNullable<typeof prompt>,
        encodeOrcaInteractionResult({
          status: 'submitted',
          values: { storage: 'not-offered' }
        })
      )
    ).toThrow('not a valid Orca interaction result')
  })

  it('returns the normalized custom value that was validated', () => {
    const registry = new CodexPromptRegistry()
    const prompt = registry.register({
      id: 14,
      method: CODEX_DYNAMIC_TOOL_CALL_METHOD,
      params: {
        threadId: 'thread-1',
        callId: 'call-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: {
          fields: [
            {
              id: 'storage',
              type: 'single_choice',
              label: 'Storage',
              allowCustom: true,
              options: [{ id: 'sqlite', label: 'SQLite' }]
            }
          ]
        }
      }
    })

    expect(
      answerInteraction(
        prompt as NonNullable<typeof prompt>,
        encodeOrcaInteractionResult({
          status: 'submitted',
          values: { storage: { type: 'custom', value: '  PostgreSQL  ' } }
        })
      )
    ).toEqual({
      contentItems: [
        {
          type: 'inputText',
          text: JSON.stringify({
            status: 'submitted',
            values: { storage: { type: 'custom', value: 'PostgreSQL' } }
          })
        }
      ],
      success: true
    })
  })
})
