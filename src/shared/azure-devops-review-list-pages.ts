/** Pull requests one request to Azure DevOps returns for the review list. */
export const AZURE_DEVOPS_REVIEW_LIST_PAGE_SIZE = 100

/** Most pages of one repository a client may ask for. */
export const AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES = 20

export function clampAzureDevOpsReviewListPages(pages: number | null | undefined): number {
  if (typeof pages !== 'number' || !Number.isFinite(pages)) {
    return 1
  }
  return Math.min(AZURE_DEVOPS_REVIEW_LIST_MAX_PAGES, Math.max(1, Math.floor(pages)))
}
