import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import {
  azureDevOpsReviewChatMessageTarget,
  openAzureDevOpsReviewChat
} from '@/lib/azure-devops-review-chat'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

/** Sends a draft rework prompt to the pull request's running AI chat; false keeps the prompts. */
export async function sendAzureDevOpsDraftReworkPrompt(
  chatTab: TerminalTab,
  prompt: string
): Promise<boolean> {
  const target = azureDevOpsReviewChatMessageTarget(chatTab)
  if (!target) {
    toast.error(
      translate(
        'azureDevOpsReview.chatMissing',
        'The AI chat for this pull request is no longer open.'
      )
    )
    return false
  }
  const result = await sendMessageToAgent({ worktreeId: chatTab.worktreeId, target, prompt })
  // Why 'unconfirmed' counts: the host may hold the message, and resending would duplicate it.
  if (result.status !== 'sent' && result.status !== 'unconfirmed') {
    toast.error(
      activeAgentNotesSendFailureMessage(result.status, { explicitTarget: true, code: result.code })
    )
    return false
  }
  toast.success(translate('azureDevOpsReview.aiDraftsSent', 'Sent to the AI chat.'), {
    action: {
      label: translate('azureDevOpsReview.openAiChat', 'Open AI chat'),
      onClick: () => void openAzureDevOpsReviewChat(chatTab)
    }
  })
  return true
}
