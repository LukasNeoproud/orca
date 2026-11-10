import { describe, expect, it } from 'vitest'
import { claudeSessionUsage } from './claude-session-usage-reply'

describe('claudeSessionUsage', () => {
  it('keeps the session cost, the plan and each limit the CLI lists', () => {
    expect(
      claudeSessionUsage({
        session: { total_cost_usd: 0.1234, total_duration_ms: 10 },
        subscription_type: 'max',
        rate_limits: {
          limits: [
            {
              kind: 'weekly_all',
              percent: 89,
              severity: 'warning',
              resets_at: '2026-11-12T16:00:00Z'
            },
            { kind: 'weekly_scoped', percent: 41, scope: { model: { display_name: 'Fable' } } },
            { kind: 'broken', percent: 'many' },
            'noise'
          ]
        }
      })
    ).toEqual({
      costUsd: 0.1234,
      plan: 'max',
      limits: [
        { kind: 'weekly_all', percent: 89, severity: 'warning', resetsAt: '2026-11-12T16:00:00Z' },
        { kind: 'weekly_scoped', percent: 41, model: 'Fable' }
      ]
    })
  })

  it('shows nothing for an answer of a shape it does not know', () => {
    expect(claudeSessionUsage({ rate_limits: null })).toEqual({ costUsd: null, limits: [] })
    expect(claudeSessionUsage('unsupported')).toEqual({ costUsd: null, limits: [] })
  })
})
