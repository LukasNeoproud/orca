import type { MobileCodexSessionUsage } from './mobile-codex-session-usage'

export function usageLabels(usage: MobileCodexSessionUsage | null, now: number): string[] {
  const labels: string[] = []
  const context = usage?.contextUsage
  if (
    !context?.stale &&
    finiteNonNegative(context?.usedTokens) &&
    finiteNonNegative(context?.maxTokens) &&
    context.maxTokens > 0
  ) {
    labels.push(`Context ${clampedPercent(context.usedTokens / context.maxTokens)}%`)
  }
  const weekly = usage?.codexWeeklyUsage
  if (
    finiteNonNegative(weekly?.usedPercent) &&
    (!finiteNonNegative(weekly?.resetsAt) || weekly.resetsAt > now)
  ) {
    labels.push(`Weekly ${Math.round(Math.min(Math.max(100 - weekly.usedPercent, 0), 100))}% left`)
  }
  return labels
}

function finiteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0
}

function clampedPercent(ratio: number): number {
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 100)
}
