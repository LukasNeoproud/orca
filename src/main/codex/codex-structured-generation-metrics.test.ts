import { describe, expect, it } from 'vitest'
import { CodexStructuredGenerationMetrics } from './codex-structured-generation-metrics'

const assistant = (id: string) => ({ type: 'agentMessage', id, text: '' })
const tool = { type: 'commandExecution', id: 'tool-1', command: 'pwd', status: 'inProgress' }

function tracker() {
  let now = 100
  return {
    metrics: new CodexStructuredGenerationMetrics(
      () => ({ model: 'gpt-test', serviceTier: 'priority' }),
      () => now
    ),
    advance: (milliseconds: number) => {
      now += milliseconds
    }
  }
}

function usage(turnId = 'turn-1', outputTokens = 120, reasoningOutputTokens = 20): unknown {
  return { turnId, tokenUsage: { last: { outputTokens, reasoningOutputTokens } } }
}

describe('CodexStructuredGenerationMetrics', () => {
  it('refuses a response window whose text delivery was backpressured', () => {
    const { metrics, advance } = tracker()
    metrics.start('turn-1')
    const event = { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'text' } }
    metrics.observeStreamDelta(event, 'turn-1', false)
    advance(60_000)
    metrics.observeStreamDelta(event, 'turn-1', true)
    advance(10)
    metrics.observeStreamDelta(event, 'turn-1', true)
    metrics.observeItem('turn-1', 'item/completed', assistant('answer'))
    metrics.observeUsage(usage())
    expect(metrics.complete('turn-1', true)?.generation).toMatchObject({
      unavailableReason: 'response-scope-ambiguous'
    })
  })

  it('uses visible provider tokens over first-to-last text delta after a completed turn', () => {
    const { metrics, advance } = tracker()
    metrics.start('turn-1')
    metrics.observeItem('turn-1', 'item/started', assistant('answer'))
    metrics.observeTextDelta('turn-1', 'answer', 'hello')
    advance(250)
    metrics.observeTextDelta('turn-1', 'answer', ' world')
    metrics.observeItem('turn-1', 'item/completed', assistant('answer'))
    metrics.observeUsage(usage())

    expect(metrics.complete('turn-1', true)).toEqual({
      itemId: 'answer',
      generation: {
        model: 'gpt-test',
        serviceTier: 'priority',
        outputTokens: 100,
        generationDurationMs: 250,
        method: 'stream-estimate'
      }
    })
  })

  it('starts a fresh response window after tool usage before measuring the final reply', () => {
    const { metrics, advance } = tracker()
    metrics.start('turn-1')
    metrics.observeItem('turn-1', 'item/started', tool)
    metrics.observeUsage(usage('turn-1', 30, 10))
    metrics.observeItem('turn-1', 'item/completed', tool)
    metrics.observeItem('turn-1', 'item/started', assistant('answer'))
    metrics.observeTextDelta('turn-1', 'answer', 'final')
    advance(125)
    metrics.observeTextDelta('turn-1', 'answer', ' reply')
    metrics.observeItem('turn-1', 'item/completed', assistant('answer'))
    metrics.observeUsage(usage('turn-1', 60, 10))

    expect(metrics.complete('turn-1', true)?.generation).toMatchObject({
      outputTokens: 50,
      generationDurationMs: 125
    })
  })

  it('does not retain a rate when the provider marks the turn interrupted', () => {
    const { metrics, advance } = tracker()
    metrics.start('turn-1')
    metrics.observeItem('turn-1', 'item/started', assistant('answer'))
    metrics.observeTextDelta('turn-1', 'answer', 'partial')
    advance(50)
    metrics.observeTextDelta('turn-1', 'answer', ' answer')
    metrics.observeItem('turn-1', 'item/completed', assistant('answer'))
    metrics.observeUsage(usage())

    expect(metrics.complete('turn-1', false)?.generation).toEqual({
      model: 'gpt-test',
      serviceTier: 'priority',
      method: 'stream-estimate',
      unavailableReason: 'turn-not-completed'
    })
  })

  it('marks missing provider usage unavailable while retaining the turn configuration', () => {
    const { metrics } = tracker()
    metrics.start('turn-1')
    metrics.observeItem('turn-1', 'item/completed', assistant('answer'))

    expect(metrics.complete('turn-1', true)?.generation).toEqual({
      model: 'gpt-test',
      serviceTier: 'priority',
      method: 'stream-estimate',
      unavailableReason: 'provider-token-count-unavailable'
    })
  })
})
