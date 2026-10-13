import {
  normalizeAzureDevOpsReviewOptions,
  type AzureDevOpsReviewOptions
} from '../../../shared/azure-devops-review-options'

const STORAGE_KEY = 'orca.azureDevOpsReview.agentOptions'

/** The options the last AI review started with; a convenience, so any read failure yields defaults. */
export function readAzureDevOpsReviewOptions(): AzureDevOpsReviewOptions {
  try {
    return normalizeAzureDevOpsReviewOptions(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    )
  } catch {
    return normalizeAzureDevOpsReviewOptions(null)
  }
}

export function storeAzureDevOpsReviewOptions(options: AzureDevOpsReviewOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // Only the next dialog's preselection is lost.
  }
}
