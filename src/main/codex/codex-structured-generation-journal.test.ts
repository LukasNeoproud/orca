import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalItemBody } from '../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'

afterEach(() => vi.restoreAllMocks())

function harness() {
  let clock = 0
  let rejectGeneration = false
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const rows = new Map<string, AgentJournalItemBody>()
  const translator = createCodexJournalTranslator({
    primaryThreadId: () => 'root',
    generationMetadata: () => ({ model: 'turn-model', serviceTier: 'priority' }),
    schedule: () => () => {},
    sink: {
      appendItem: (identity, body) => {
        rows.set(agentJournalItemKey(identity), body)
      },
      tryAppendItem: (identity, body) => {
        if (rejectGeneration && body.kind === 'message' && body.generation) {
          return { accepted: false, reason: 'backpressure' }
        }
        rows.set(agentJournalItemKey(identity), body)
        return { accepted: true }
      },
      appendTombstone: (identity) => {
        rows.delete(agentJournalItemKey(identity))
      },
      publish: () => {}
    }
  })
  const send = (method: string, params: Record<string, unknown>) =>
    translator.handle({
      type: 'notification',
      sessionId: 'session',
      threadId: 'root',
      method,
      params: { threadId: 'root', turnId: 'turn', ...params }
    })
  const respond = () => {
    send('turn/started', { turn: { id: 'turn' } })
    send('item/started', { item: { id: 'answer', type: 'agentMessage', text: '' } })
    send('item/agentMessage/delta', { itemId: 'answer', delta: 'Hello' })
    clock = 2_000
    send('item/agentMessage/delta', { itemId: 'answer', delta: ' world' })
    send('item/completed', { item: { id: 'answer', type: 'agentMessage', text: 'Hello world' } })
    send('thread/tokenUsage/updated', {
      tokenUsage: { last: { outputTokens: 120, reasoningOutputTokens: 20 } }
    })
  }
  const generations = () =>
    [...rows.values()].flatMap((body) =>
      body.kind === 'message' && body.generation ? [body.generation] : []
    )
  return {
    send,
    respond,
    generations,
    translator,
    blockGeneration: (value: boolean) => {
      rejectGeneration = value
    },
    advance: () => {
      clock += 60_000
    }
  }
}

describe('Codex generation journal integration', () => {
  it('persists the measured response only on confirmed successful completion', () => {
    const h = harness()
    h.respond()
    expect(h.generations()).toEqual([])
    h.send('turn/completed', { turn: { id: 'turn', status: 'completed' } })
    expect(h.generations()).toEqual([
      {
        method: 'stream-estimate',
        model: 'turn-model',
        serviceTier: 'priority',
        outputTokens: 100,
        generationDurationMs: 2_000
      }
    ])
  })

  it('retains the measurement while its durable append is retried', () => {
    const h = harness()
    h.respond()
    h.blockGeneration(true)
    const completion = { turn: { id: 'turn', status: 'completed' } }
    expect(h.send('turn/completed', completion)).toEqual({
      accepted: false,
      reason: 'backpressure'
    })
    h.advance()
    h.blockGeneration(false)
    expect(h.send('turn/completed', completion)).toEqual({ accepted: true })
    expect(h.generations()[0]?.generationDurationMs).toBe(2_000)
  })

  it('does not publish a pending rate when the provider exits unexpectedly', () => {
    const h = harness()
    h.respond()
    h.translator.handle({ type: 'ended', sessionId: 'session', reason: 'provider exited' })
    expect(h.generations()).toEqual([])
  })

  it('ignores stale previous-turn item completions for metric attribution', () => {
    const h = harness()
    h.respond()
    h.send('item/completed', {
      turnId: 'old-turn',
      item: { id: 'old-answer', type: 'agentMessage', text: 'Old reply' }
    })
    h.send('turn/completed', { turn: { id: 'turn', status: 'completed' } })
    expect(h.generations()[0]?.outputTokens).toBe(100)
  })
})
