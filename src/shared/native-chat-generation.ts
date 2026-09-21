/** Provider token counts paired with execution-host stream timing, never character counts. */
export type NativeChatGeneration = {
  model?: string
  serviceTier?: string
  /** Provider output count with reasoning tokens excluded. */
  outputTokens?: number
  /** Execution-host monotonic interval from first to last text delta. */
  generationDurationMs?: number
  method: 'stream-estimate'
  unavailableReason?: string
}

export function nativeChatTokensPerSecond(generation: NativeChatGeneration): number | null {
  const { outputTokens, generationDurationMs, unavailableReason } = generation
  if (
    unavailableReason ||
    generation.method !== 'stream-estimate' ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens === undefined ||
    outputTokens <= 0 ||
    generationDurationMs === undefined ||
    !Number.isFinite(generationDurationMs) ||
    generationDurationMs <= 0
  ) {
    return null
  }
  const rate = (outputTokens * 1_000) / generationDurationMs
  return Number.isFinite(rate) ? rate : null
}
