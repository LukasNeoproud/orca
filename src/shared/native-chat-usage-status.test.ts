import { describe, expect, it } from 'vitest'
import { parseNativeChatUsageStatus } from './native-chat-usage-status'

describe('native chat usage wire metadata', () => {
  it('preserves zero use, scope, provenance and reset time independently', () => {
    const value = {
      contextUsage: {
        usedTokens: 0,
        maxTokens: 258400,
        autoCompactThresholdTokens: 244800,
        thresholdSource: 'model-default',
        thresholdEstimated: true,
        compactScope: 'total',
        stale: false
      },
      codexWeeklyUsage: { usedPercent: 59, resetsAt: 1900000000000 }
    }
    expect(parseNativeChatUsageStatus(value)).toEqual(value)
  })

  it('ignores invalid optional values without treating them as zero', () => {
    expect(
      parseNativeChatUsageStatus({
        contextUsage: { usedTokens: -1, maxTokens: 0, autoCompactThresholdTokens: Infinity },
        codexWeeklyUsage: { usedPercent: '59' }
      })
    ).toEqual({ contextUsage: {} })
    expect(parseNativeChatUsageStatus(undefined)).toBeUndefined()
    expect(parseNativeChatUsageStatus(null)).toBeUndefined()
    expect(parseNativeChatUsageStatus([])).toBeUndefined()
  })
})
