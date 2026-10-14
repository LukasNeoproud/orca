import type { AzureDevOpsReviewOptions } from './azure-devops-review-options'

/**
 * A paired client's request that the desktop start a review agent, or hand drafts back to one.
 * The desktop runs it with its own launch code, so the surface choice and an open AI chat for the
 * pull request behave exactly as when the user acts on the desktop.
 */
export type AzureDevOpsReviewAgentRequest = {
  pullRequestKey: string
  /** Switches the shared review workspace even when it has uncommitted changes. */
  discardChanges?: boolean
} & (
  | { kind: 'review'; options: AzureDevOpsReviewOptions }
  | {
      kind: 'rework'
      items: { draftId: string; instruction: string }[]
      generalInstruction: string
      /** For a new agent when the pull request has no AI chat; the desktop's last choice otherwise. */
      options?: AzureDevOpsReviewOptions
    }
)

export type AzureDevOpsReviewAgentResult =
  | { kind: 'started'; worktreeId: string }
  /** The drafts went to the pull request's running AI chat. */
  | { kind: 'sent-to-chat'; worktreeId: string }
  /** The review workspace has uncommitted changes; ask, then retry with `discardChanges`. */
  | { kind: 'dirty'; message: string }
  | { kind: 'failed'; message: string }

/** One request as it travels from main to the desktop window, and the window's answer. */
export type AzureDevOpsReviewAgentRendererRequest = {
  id: string
  request: AzureDevOpsReviewAgentRequest
}

export type AzureDevOpsReviewAgentRendererResponse =
  | { id: string; ok: true; result: AzureDevOpsReviewAgentResult }
  | { id: string; ok: false; error: string }
