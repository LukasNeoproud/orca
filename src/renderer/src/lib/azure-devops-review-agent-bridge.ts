import { useAppStore } from '@/store'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { readAzureDevOpsReviewOptions } from '@/store/azure-devops-review-options'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { deliverAzureDevOpsDraftReworkPrompt } from '@/components/azure-devops-review/azure-devops-draft-rework-delivery'
import { findAzureDevOpsReviewChatTab } from './azure-devops-review-chat'
import { startAzureDevOpsReviewAgentInBackground } from './azure-devops-review-agent'
import {
  getAzureDevOpsReviewDetail,
  openAzureDevOpsReviewWorktree
} from './azure-devops-review-client'
import { buildAzureDevOpsDraftReworkPrompt } from '../../../shared/azure-devops-draft-rework-prompt'
import { orcaLaunchCliCommand } from '../../../shared/terminal-interaction-launch'
import type {
  AzureDevOpsReviewAgentRequest,
  AzureDevOpsReviewAgentResult
} from '../../../shared/azure-devops-review-agent-request'

/** Runs a paired client's request with the desktop's own launch code, never moving this window. */
export async function runAzureDevOpsReviewAgentRequest(
  request: AzureDevOpsReviewAgentRequest
): Promise<AzureDevOpsReviewAgentResult> {
  const { pullRequestKey } = request
  const detail = await getAzureDevOpsReviewDetail(pullRequestKey)
  let prompt: string | undefined
  if (request.kind === 'rework') {
    const drafts = new Map(
      detail.drafts.filter((draft) => draft.state !== 'published').map((draft) => [draft.id, draft])
    )
    const items = request.items.flatMap((item) => {
      const draft = drafts.get(item.draftId)
      return draft ? [{ draft, instruction: item.instruction }] : []
    })
    if (items.length === 0) {
      return { kind: 'failed', message: 'The chosen drafts were published or deleted meanwhile.' }
    }
    prompt = buildAzureDevOpsDraftReworkPrompt({
      pullRequest: detail.pullRequest,
      items,
      generalInstruction: request.generalInstruction,
      cli: orcaLaunchCliCommand(CLIENT_PLATFORM, import.meta.env.DEV)
    })
    const chatTab = findAzureDevOpsReviewChatTab(
      useAppStore.getState(),
      useAzureDevOpsReviewChatLinks.getState().tabs,
      pullRequestKey
    )
    // Why the open chat first: it already knows the pull request, as on the desktop.
    if (chatTab) {
      const delivery = await deliverAzureDevOpsDraftReworkPrompt(chatTab, prompt)
      return delivery.ok
        ? { kind: 'sent-to-chat', worktreeId: chatTab.worktreeId }
        : { kind: 'failed', message: delivery.message }
    }
  }
  const opened = await openAzureDevOpsReviewWorktree(
    pullRequestKey,
    request.discardChanges === true
  )
  if (!opened.ok) {
    return opened.reason === 'dirty'
      ? { kind: 'dirty', message: opened.message }
      : { kind: 'failed', message: opened.message }
  }
  useAzureDevOpsReviewChatLinks
    .getState()
    .setWorktreePullRequest(opened.worktree.worktreeId, opened.worktree.pullRequestKey)
  const options =
    request.kind === 'review'
      ? request.options
      : (request.options ?? readAzureDevOpsReviewOptions())
  const launch = await startAzureDevOpsReviewAgentInBackground(
    detail.pullRequest,
    opened.worktree,
    options,
    prompt
  )
  return launch
    ? { kind: 'started', worktreeId: opened.worktree.worktreeId }
    : { kind: 'failed', message: 'The computer could not start the agent.' }
}

export function attachAzureDevOpsReviewAgentBridge(): () => void {
  const ui = window.api.ui
  if (
    typeof ui.onAzureDevOpsReviewAgentRequest !== 'function' ||
    typeof ui.respondAzureDevOpsReviewAgentRequest !== 'function'
  ) {
    return () => {}
  }
  const respond = ui.respondAzureDevOpsReviewAgentRequest
  return ui.onAzureDevOpsReviewAgentRequest(({ id, request }) => {
    runAzureDevOpsReviewAgentRequest(request).then(
      (result) => respond({ id, ok: true, result }),
      (error: unknown) =>
        respond({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
    )
  })
}
