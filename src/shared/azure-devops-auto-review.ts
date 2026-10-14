import type { AzureDevOpsReviewListResult } from './azure-devops-review-types'

export type AzureDevOpsAutoReviewSettings = {
  enabled: boolean
  intervalMinutes: number
}

export const AZURE_DEVOPS_AUTO_REVIEW_MIN_INTERVAL_MINUTES = 1
export const AZURE_DEVOPS_AUTO_REVIEW_MAX_INTERVAL_MINUTES = 24 * 60

export const DEFAULT_AZURE_DEVOPS_AUTO_REVIEW_SETTINGS: AzureDevOpsAutoReviewSettings = {
  enabled: true,
  intervalMinutes: 15
}

export function normalizeAzureDevOpsAutoReviewSettings(
  value: unknown
): AzureDevOpsAutoReviewSettings {
  const raw = typeof value === 'object' && value !== null ? value : {}
  const enabled = 'enabled' in raw && typeof raw.enabled === 'boolean' ? raw.enabled : undefined
  const interval =
    'intervalMinutes' in raw && typeof raw.intervalMinutes === 'number'
      ? raw.intervalMinutes
      : Number.NaN
  return {
    enabled: enabled ?? DEFAULT_AZURE_DEVOPS_AUTO_REVIEW_SETTINGS.enabled,
    intervalMinutes: Number.isFinite(interval)
      ? Math.min(
          AZURE_DEVOPS_AUTO_REVIEW_MAX_INTERVAL_MINUTES,
          Math.max(AZURE_DEVOPS_AUTO_REVIEW_MIN_INTERVAL_MINUTES, Math.round(interval))
        )
      : DEFAULT_AZURE_DEVOPS_AUTO_REVIEW_SETTINGS.intervalMinutes
  }
}

/**
 * Pull requests worth offering a review for: open, not the user's own, not yet voted on or
 * drafted, and not already handled (`seenKeys`).
 */
export function azureDevOpsAutoReviewCandidates(
  list: Pick<AzureDevOpsReviewListResult, 'pullRequests' | 'draftCounts'>,
  seenKeys: ReadonlySet<string>
): AzureDevOpsReviewListResult['pullRequests'] {
  return list.pullRequests.filter(
    (pr) =>
      pr.status === 'active' &&
      !pr.isDraft &&
      !pr.isFork &&
      pr.createdByMe !== true &&
      pr.myVote === 'none' &&
      !(list.draftCounts[pr.key] > 0) &&
      !seenKeys.has(pr.key)
  )
}
