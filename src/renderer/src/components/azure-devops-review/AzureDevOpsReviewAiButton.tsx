import { Bot, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import StatusIndicator from '@/components/sidebar/StatusIndicator'
import { resolveTerminalTabActivityStatus } from '@/components/tab-bar/terminal-tab-activity-status'
import { translate } from '@/i18n/i18n'
import {
  findAzureDevOpsReviewChatTab,
  openAzureDevOpsReviewChat
} from '@/lib/azure-devops-review-chat'
import { useAppStore } from '@/store'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'

/** "Open AI chat" once a review agent runs for this pull request, else "Review with AI". */
export function AzureDevOpsReviewAiButton({
  pullRequestKey,
  disabled,
  onStartReview
}: {
  pullRequestKey: string
  disabled: boolean
  onStartReview: () => void
}): React.JSX.Element {
  const tabLinks = useAzureDevOpsReviewChatLinks((s) => s.tabs)
  const chatTab = useAppStore((s) => findAzureDevOpsReviewChatTab(s, tabLinks, pullRequestKey))
  const status = useAppStore((s) =>
    chatTab
      ? resolveTerminalTabActivityStatus({
          tab: chatTab,
          agentStatusByPaneKey: s.agentStatusByPaneKey,
          agentStatusEpoch: s.agentStatusEpoch,
          runtimePaneTitlesByTabId: s.runtimePaneTitlesByTabId,
          ptyIdsByTabId: s.ptyIdsByTabId,
          terminalLayout: s.terminalLayoutsByTabId?.[chatTab.id]
        })
      : null
  )
  const startLabel = translate('azureDevOpsReview.reviewWithAi', 'Review with AI')

  if (!chatTab || !status) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Why: a disabled button swallows hover, so the span keeps the tooltip reachable. */}
          <span tabIndex={-1}>
            <Button size="sm" disabled={disabled} onClick={onStartReview}>
              <Bot className="size-3.5" />
              {startLabel}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          {translate(
            'azureDevOpsReview.reviewWithAgentHint',
            'Opens the review workspace and starts your default agent there. It writes findings as drafts; nothing is published until you do it.'
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  const openChat = (): void => {
    if (!openAzureDevOpsReviewChat(chatTab)) {
      toast.error(
        translate(
          'azureDevOpsReview.chatMissing',
          'The AI chat for this pull request is no longer open.'
        )
      )
    }
  }
  const openLabel = translate('azureDevOpsReview.openAiChat', 'Open AI chat')
  return (
    <DropdownMenu modal={false}>
      <ButtonGroup>
        <Button size="sm" onClick={openChat}>
          <StatusIndicator status={status} tooltipSide="bottom" />
          {openLabel}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            disabled={disabled}
            aria-label={translate('azureDevOpsReview.moreAiActions', 'More AI review actions')}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </ButtonGroup>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={openChat}>{openLabel}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onStartReview}>
          {translate('azureDevOpsReview.startNewAiReview', 'Start a new AI review')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
