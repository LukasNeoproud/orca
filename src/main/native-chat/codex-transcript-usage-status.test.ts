import { describe, expect, it } from 'vitest'
import { CodexTranscriptUsageStatusAccumulator } from './codex-transcript-usage-status'

function line(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ type, payload })
}

describe('CodexTranscriptUsageStatusAccumulator', () => {
  it('reads active request usage instead of cumulative transcript totals', () => {
    const usage = new CodexTranscriptUsageStatusAccumulator()

    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: {
          last_token_usage: { total_tokens: 12_345 },
          total_token_usage: { total_tokens: 987_654 },
          model_context_window: 200_000
        }
      })
    )

    expect(usage.snapshot().contextUsage).toEqual({
      usedTokens: 12_345,
      maxTokens: 200_000,
      stale: false
    })
  })

  it('classifies snake-case rate windows independently of null token info', () => {
    const usage = new CodexTranscriptUsageStatusAccumulator()

    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: null,
        rate_limits: {
          primary: { used_percent: 8, window_minutes: 300, resets_at: 1_800_000_000 },
          secondary: { used_percent: 37, window_minutes: 10_080, resets_at: 1_800_100_000 }
        }
      })
    )

    expect(usage.snapshot()).toEqual({
      codexWeeklyUsage: { usedPercent: 37, resetsAt: 1_800_100_000_000 }
    })
  })

  it('keeps fields whose later token_count record omits them', () => {
    const usage = new CodexTranscriptUsageStatusAccumulator()
    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: { last_token_usage: { total_tokens: 10 }, model_context_window: 100 },
        rate_limits: {
          secondary: { used_percent: 20, window_minutes: 10_080 }
        }
      })
    )
    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: { last_token_usage: { total_tokens: 15 } }
      })
    )

    expect(usage.snapshot()).toEqual({
      contextUsage: { usedTokens: 15, maxTokens: 100, stale: false },
      codexWeeklyUsage: { usedPercent: 20 }
    })
  })

  it('marks pre-compaction and pre-model-switch context snapshots stale', () => {
    const usage = new CodexTranscriptUsageStatusAccumulator()
    usage.observe(line('turn_context', { model: 'gpt-a' }))
    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: { last_token_usage: { total_tokens: 10 }, model_context_window: 100 }
      })
    )
    usage.observe(line('compacted', { replacement_history: [] }))
    expect(usage.snapshot().contextUsage?.stale).toBe(true)

    usage.observe(
      line('event_msg', {
        type: 'token_count',
        info: { last_token_usage: { total_tokens: 4 } }
      })
    )
    expect(usage.snapshot().contextUsage?.stale).toBe(false)

    usage.observe(line('turn_context', { model: 'gpt-b' }))
    expect(usage.snapshot().contextUsage?.stale).toBe(true)
  })
})
