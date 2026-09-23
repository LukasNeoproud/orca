import {
  nativeChatTokensPerSecond,
  type NativeChatGeneration
} from '../../../src/shared/native-chat-generation'

export function mobileGenerationLabel(generation: NativeChatGeneration): string | null {
  const rate = nativeChatTokensPerSecond(generation)
  const mode =
    generation.serviceTier === 'priority'
      ? 'Fast mode'
      : generation.serviceTier === 'default'
        ? 'Standard mode'
        : generation.serviceTier
          ? `${generation.serviceTier} mode`
          : null
  const values = [
    generation.model?.trim() || null,
    mode,
    rate === null
      ? generation.model || mode
        ? 'tok/s unavailable'
        : null
      : `≈ ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(rate)} tok/s`
  ].filter((value): value is string => Boolean(value))
  return values.length > 0 ? values.join(' · ') : null
}
