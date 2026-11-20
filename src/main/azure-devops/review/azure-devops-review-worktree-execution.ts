import {
  azureDevOpsReviewDepthRunsCode,
  azureDevOpsReviewExecutionRefusal
} from '../../../shared/azure-devops-review-depth-execution'
import type { AzureDevOpsReviewDepth } from '../../../shared/azure-devops-review-options'
import { findAzureDevOpsReviewWorktreeById } from './azure-devops-review-worktree-registry'

export type AzureDevOpsReviewWorktreeExecution =
  /** Not a review worktree of this host: the review depth says nothing about it. */
  | { reviewWorktree: false; allowed: true }
  | { reviewWorktree: true; allowed: true; depth: Exclude<AzureDevOpsReviewDepth, 'static'> }
  /** `depth` is null for a review worktree opened before depths were remembered. */
  | { reviewWorktree: true; allowed: false; depth: 'static' | null; message: string }

/**
 * Whether this host runs code in the worktree: a gate, the feedback loop's gates, or any command
 * Orca would start there for an agent. A review worktree holds the code of the pull request's
 * author, so it runs only at a depth the user chose.
 *
 * Reads nothing but this host's own registry. `worktreeId` must be the id the host resolved, never
 * a depth or a flag from the request: the caller may be the agent whose work is being checked.
 */
export function azureDevOpsReviewWorktreeExecution(
  worktreeId: string
): AzureDevOpsReviewWorktreeExecution {
  const worktree = findAzureDevOpsReviewWorktreeById(worktreeId)
  if (!worktree) {
    return { reviewWorktree: false, allowed: true }
  }
  const depth = worktree.reviewDepth ?? null
  return azureDevOpsReviewDepthRunsCode(depth)
    ? { reviewWorktree: true, allowed: true, depth }
    : {
        reviewWorktree: true,
        allowed: false,
        depth,
        message: azureDevOpsReviewExecutionRefusal(depth)
      }
}

/** The refusal to show the caller, or null when the worktree may run code. */
export function refuseAzureDevOpsReviewWorktreeExecution(worktreeId: string): string | null {
  const execution = azureDevOpsReviewWorktreeExecution(worktreeId)
  return execution.allowed ? null : execution.message
}

/**
 * The depth of a review is the user's own choice, so only a caller with the user in front of it
 * may set it. The runtime socket is what `orca`, its MCP servers and agent extensions call through.
 */
export function assertAzureDevOpsReviewDepthCaller(caller: { kind: string } | undefined): void {
  if (!azureDevOpsReviewCallerIsApp(caller)) {
    throw new Error('The depth of a review is chosen only in the Orca app, by the user.')
  }
}

export function azureDevOpsReviewCallerIsApp(caller: { kind: string } | undefined): boolean {
  return caller?.kind === 'desktop' || caller?.kind === 'paired-device'
}
