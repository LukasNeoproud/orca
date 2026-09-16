export type CodexContextUsage = {
  usedTokens?: number
  maxTokens?: number
  autoCompactThresholdTokens?: number
  thresholdSource?: 'config' | 'model-default'
  thresholdEstimated?: boolean
  compactScope?: 'total' | 'body_after_prefix'
  stale?: boolean
}

export type CodexWeeklyUsage = {
  usedPercent: number
  /** Unix epoch milliseconds, matching the existing rate-limit window contract. */
  resetsAt?: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export type CodexContextUsageUpdate = {
  threadId: string
  usage: Pick<CodexContextUsage, 'usedTokens' | 'maxTokens'>
}

/** Reads the active request context. `total` is cumulative session usage and must not back this UI. */
export function readCodexContextUsageUpdate(params: unknown): CodexContextUsageUpdate | null {
  const root = record(params)
  const tokenUsage = record(root?.tokenUsage)
  const last = record(tokenUsage?.last)
  const threadId = typeof root?.threadId === 'string' && root.threadId ? root.threadId : null
  const usedTokens = finiteNonNegative(last?.totalTokens)
  if (!threadId || usedTokens === undefined) {
    return null
  }
  const maxTokens = finiteNonNegative(tokenUsage?.modelContextWindow)
  return {
    threadId,
    usage: {
      usedTokens,
      ...(maxTokens !== undefined ? { maxTokens } : {})
    }
  }
}

export function codexContextUsageEqual(
  left: CodexContextUsage | undefined,
  right: CodexContextUsage | undefined
): boolean {
  return (
    left?.usedTokens === right?.usedTokens &&
    left?.maxTokens === right?.maxTokens &&
    left?.autoCompactThresholdTokens === right?.autoCompactThresholdTokens &&
    left?.thresholdSource === right?.thresholdSource &&
    left?.thresholdEstimated === right?.thresholdEstimated &&
    left?.compactScope === right?.compactScope &&
    left?.stale === right?.stale
  )
}

export function codexWeeklyUsageEqual(
  left: CodexWeeklyUsage | undefined,
  right: CodexWeeklyUsage | undefined
): boolean {
  return left?.usedPercent === right?.usedPercent && left?.resetsAt === right?.resetsAt
}
