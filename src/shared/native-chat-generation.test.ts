import { describe, expect, it } from 'vitest'
import { AgentJournalRenderItemSchema } from './agent-session-journal-schemas'
import type { AgentJournalRenderItem } from './agent-session-journal-types'
import { nativeChatTokensPerSecond, type NativeChatGeneration } from './native-chat-generation'
import { projectStructuredItemToNativeChat } from './structured-agent-session-projection'

const generation: NativeChatGeneration = {
  method: 'stream-estimate',
  model: 'model-at-dispatch',
  serviceTier: 'priority',
  outputTokens: 100,
  generationDurationMs: 2_000
}

describe('response generation metadata', () => {
  it('uses identical token and time units for standard and fast', () => {
    expect(nativeChatTokensPerSecond(generation)).toBe(50)
    expect(nativeChatTokensPerSecond({ ...generation, serviceTier: 'default' })).toBe(50)
  })

  it.each<Partial<NativeChatGeneration>>([
    { outputTokens: undefined },
    { outputTokens: -1 },
    { outputTokens: 0 },
    { outputTokens: 1.5 },
    { outputTokens: Infinity },
    { generationDurationMs: undefined },
    { generationDurationMs: 0 },
    { generationDurationMs: -1 },
    { generationDurationMs: Number.NaN },
    { generationDurationMs: Infinity },
    { unavailableReason: 'interrupted' }
  ])('does not invent a rate with incomplete or invalid evidence: %j', (override) => {
    expect(nativeChatTokensPerSecond({ ...generation, ...override })).toBeNull()
  })

  it('retains settled metadata through journal JSON and remote schema projection', () => {
    const item: AgentJournalRenderItem = {
      itemId: 'response',
      revision: 2,
      sequence: 10,
      observedAt: 123,
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Done' }],
        generation
      }
    }
    const decoded = AgentJournalRenderItemSchema.parse(JSON.parse(JSON.stringify(item)))
    expect(
      projectStructuredItemToNativeChat(decoded as AgentJournalRenderItem)?.generation
    ).toEqual(generation)
    const { generation: _, ...legacyBody } = item.body as Extract<
      AgentJournalRenderItem['body'],
      { kind: 'message' }
    >
    expect(projectStructuredItemToNativeChat({ ...item, body: legacyBody })).not.toHaveProperty(
      'generation'
    )
  })
})
