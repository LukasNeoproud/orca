import type { CodexContextUsage, CodexWeeklyUsage } from './codex-context-usage'

export type NativeChatUsageStatus = {
  contextUsage?: CodexContextUsage
  codexWeeklyUsage?: CodexWeeklyUsage
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function nonnegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Only optional display metadata crosses this boundary; malformed fields stay unknown. */
export function parseNativeChatUsageStatus(value: unknown): NativeChatUsageStatus | undefined {
  const root = record(value)
  if (!root) {
    return undefined
  }
  const result: NativeChatUsageStatus = {}
  const context = record(root.contextUsage)
  if (context) {
    const usage: CodexContextUsage = {}
    for (const key of ['usedTokens', 'maxTokens', 'autoCompactThresholdTokens'] as const) {
      const number = nonnegative(context[key])
      if (number !== undefined && (key === 'usedTokens' || number > 0)) {
        usage[key] = number
      }
    }
    if (context.thresholdSource === 'config' || context.thresholdSource === 'model-default') {
      usage.thresholdSource = context.thresholdSource
    }
    if (typeof context.thresholdEstimated === 'boolean') {
      usage.thresholdEstimated = context.thresholdEstimated
    }
    if (context.compactScope === 'total' || context.compactScope === 'body_after_prefix') {
      usage.compactScope = context.compactScope
    }
    if (typeof context.stale === 'boolean') {
      usage.stale = context.stale
    }
    result.contextUsage = usage
  }
  const weekly = record(root.codexWeeklyUsage)
  const usedPercent = nonnegative(weekly?.usedPercent)
  if (usedPercent !== undefined) {
    const resetsAt = nonnegative(weekly?.resetsAt)
    result.codexWeeklyUsage = {
      usedPercent,
      ...(resetsAt !== undefined ? { resetsAt } : {})
    }
  }
  return result
}
