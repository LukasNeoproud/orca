import { describe, expect, it } from 'vitest'
import { mobileGenerationLabel } from './mobile-native-chat-generation-label'

describe('mobile native chat generation stats', () => {
  it('shows the response model, requested mode, and provider-counted throughput', () => {
    expect(
      mobileGenerationLabel({
        model: 'gpt-5.6-sol',
        serviceTier: 'priority',
        method: 'stream-estimate',
        outputTokens: 100,
        generationDurationMs: 2_000
      })
    ).toBe('gpt-5.6-sol · Fast mode · ≈ 50 tok/s')
  })

  it('does not invent speed when provider counts or timing are incomplete', () => {
    expect(
      mobileGenerationLabel({
        model: 'gpt-5.6-sol',
        serviceTier: 'default',
        method: 'stream-estimate',
        outputTokens: 100
      })
    ).toBe('gpt-5.6-sol · Standard mode · tok/s unavailable')
  })
})
