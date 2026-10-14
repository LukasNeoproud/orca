// Azure DevOps PR review: the paired phone mirrors the desktop list, drafts and publishing.
export const MOBILE_RPC_AZURE_DEVOPS_REVIEW_METHODS = [
  'azureDevOpsReview.createDraft',
  'azureDevOpsReview.deleteDraft',
  'azureDevOpsReview.drafts',
  'azureDevOpsReview.fileDiff',
  'azureDevOpsReview.get',
  'azureDevOpsReview.list',
  'azureDevOpsReview.openWorktree',
  'azureDevOpsReview.publishDrafts',
  'azureDevOpsReview.repos',
  'azureDevOpsReview.runAgent',
  'azureDevOpsReview.updateDraft'
] as const
