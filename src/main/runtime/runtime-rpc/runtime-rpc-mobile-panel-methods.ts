import { MOBILE_RPC_BACKLOG_METHODS } from './runtime-rpc-mobile-backlog-methods'

// Azure DevOps PR review: the paired phone mirrors the desktop list, drafts and publishing.
const MOBILE_RPC_AZURE_DEVOPS_REVIEW_METHODS = [
  'azureDevOpsReview.createDraft',
  'azureDevOpsReview.deleteDraft',
  'azureDevOpsReview.drafts',
  'azureDevOpsReview.get',
  'azureDevOpsReview.list',
  'azureDevOpsReview.openWorktree',
  'azureDevOpsReview.publishDrafts',
  'azureDevOpsReview.repos',
  'azureDevOpsReview.updateDraft'
] as const

// Why one spread: the allowlist sits at its line cap, so panel method groups join here.
export const MOBILE_RPC_PANEL_METHODS = [
  ...MOBILE_RPC_BACKLOG_METHODS,
  ...MOBILE_RPC_AZURE_DEVOPS_REVIEW_METHODS
] as const
