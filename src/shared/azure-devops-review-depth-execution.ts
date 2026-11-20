import type { AzureDevOpsReviewDepth } from './azure-devops-review-options'

/** The depths at which Orca runs code in a review worktree; `static` runs nothing. */
const EXECUTING_DEPTHS: ReadonlySet<AzureDevOpsReviewDepth> = new Set(['build', 'build-and-test'])

/** Null for anything but a depth this build knows, so a value from another build grants nothing. */
export function readAzureDevOpsReviewDepth(value: unknown): AzureDevOpsReviewDepth | null {
  return value === 'static' || value === 'build' || value === 'build-and-test' ? value : null
}

/**
 * What a client sends as the user's choice becomes what the host remembers. A depth this build
 * does not know reads as `static`: the user replaced the earlier choice, and nothing unknown runs.
 */
export function azureDevOpsReviewDepthFromChoice(value: unknown): AzureDevOpsReviewDepth {
  return readAzureDevOpsReviewDepth(value) ?? 'static'
}

export function azureDevOpsReviewDepthRunsCode(
  depth: AzureDevOpsReviewDepth | null
): depth is Exclude<AzureDevOpsReviewDepth, 'static'> {
  return depth !== null && EXECUTING_DEPTHS.has(depth)
}

const HOW_TO_CHANGE =
  'To allow it, start a new AI review of the pull request in the Orca app and choose Build or Build and run tests as its depth.'

/** Why Orca runs nothing in a review worktree whose remembered depth does not run code. */
export function azureDevOpsReviewExecutionRefusal(depth: 'static' | null): string {
  return depth === 'static'
    ? `Orca runs no code in this review workspace: the review of this pull request is static, and the workspace holds the code of the pull request's author. ${HOW_TO_CHANGE}`
    : `Orca runs no code in this review workspace: no review depth was chosen for it, so it counts as a static review, and the workspace holds the code of the pull request's author. ${HOW_TO_CHANGE}`
}
