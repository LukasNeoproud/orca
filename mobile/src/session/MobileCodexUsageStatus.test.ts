import { describe, expect, it } from 'vitest'
import { usageLabels } from './mobile-codex-usage-labels'

describe('mobile Codex usage labels', () => {
  it('shows live context and unexpired weekly allowance', () => {
    expect(
      usageLabels(
        {
          contextUsage: { usedTokens: 84_000, maxTokens: 258_400 },
          codexWeeklyUsage: { usedPercent: 59, resetsAt: 2_000 }
        },
        1_000
      )
    ).toEqual(['Context 33%', 'Weekly 41% left'])
  })

  it('hides stale context and expired weekly usage', () => {
    expect(
      usageLabels(
        {
          contextUsage: { usedTokens: 84_000, maxTokens: 258_400, stale: true },
          codexWeeklyUsage: { usedPercent: 59, resetsAt: 1_000 }
        },
        1_001
      )
    ).toEqual([])
  })
})
