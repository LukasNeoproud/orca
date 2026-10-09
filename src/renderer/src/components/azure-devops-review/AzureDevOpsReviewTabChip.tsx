import { GitPullRequest, TriangleAlert } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { openAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { parseAzureDevOpsPullRequestKey } from '../../../../shared/azure-devops-review-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

type TabPullRequestLink = { pullRequestKey: string; pullRequestId: number; stale: boolean }

function useTabPullRequestLink(tab: TerminalTab): TabPullRequestLink | null {
  const pullRequestKey = useAzureDevOpsReviewChatLinks((s) => s.tabs[tab.id]?.pullRequestKey)
  const checkedOut = useAzureDevOpsReviewChatLinks((s) => s.worktrees[tab.worktreeId])
  const parsed = pullRequestKey ? parseAzureDevOpsPullRequestKey(pullRequestKey) : null
  if (!pullRequestKey || !parsed) {
    return null
  }
  // Why: the review worktree is shared, so a later PR checkout leaves this chat reviewing old code.
  const stale = checkedOut !== undefined && checkedOut !== pullRequestKey
  return { pullRequestKey, pullRequestId: parsed.pullRequestId, stale }
}

function linkLabel(link: TabPullRequestLink): string {
  return link.stale
    ? translate(
        'azureDevOpsReview.tabChipStale',
        'Open pull request !{{id}} (the review workspace now has another pull request checked out)',
        { id: link.pullRequestId }
      )
    : translate('azureDevOpsReview.tabChip', 'Open pull request !{{id}}', {
        id: link.pullRequestId
      })
}

/** Opens the pull request an AI review tab belongs to, without activating the tab. */
export function AzureDevOpsReviewTabChip({ tab }: { tab: TerminalTab }): React.JSX.Element | null {
  const link = useTabPullRequestLink(tab)
  if (!link) {
    return null
  }
  const label = linkLabel(link)
  const Icon = link.stale ? TriangleAlert : GitPullRequest
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'relative z-10 mr-1 flex h-4 shrink-0 items-center gap-0.5 rounded-sm border border-border px-1 text-[10px] font-medium leading-none hover:bg-muted hover:text-foreground',
            link.stale ? 'text-workspace-status-progress' : 'text-muted-foreground'
          )}
          // Why: the chip sits inside the draggable tab; claim the press so it neither drags nor activates.
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            openAzureDevOpsPullRequestPage(link.pullRequestKey)
          }}
        >
          <Icon className="size-2.5" />!{link.pullRequestId}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-72">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AzureDevOpsReviewTabMenuItem({
  tab
}: {
  tab: TerminalTab
}): React.JSX.Element | null {
  const link = useTabPullRequestLink(tab)
  if (!link) {
    return null
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => openAzureDevOpsPullRequestPage(link.pullRequestKey)}>
        <GitPullRequest className="size-3.5 shrink-0" />
        {translate('azureDevOpsReview.tabMenuOpenPr', 'Open pull request !{{id}}', {
          id: link.pullRequestId
        })}
      </DropdownMenuItem>
    </>
  )
}
