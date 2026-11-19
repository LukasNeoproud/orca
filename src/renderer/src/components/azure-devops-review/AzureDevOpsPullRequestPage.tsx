import { useEffect, useState } from 'react'
import { ExternalLink, FolderGit2, RefreshCw, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { CommentMarkdownAsync } from '@/components/sidebar/comment-markdown-lazy'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { switchAzureDevOpsReviewWorktree } from '@/lib/azure-devops-review-worktree-switch'
import {
  revealAzureDevOpsReviewWorktree,
  startAzureDevOpsReviewAgent,
  type AzureDevOpsReviewAgentPrompt
} from '@/lib/azure-devops-review-agent'
import {
  azureDevOpsFeedbackAgentPrompt,
  openAzureDevOpsFeedbackWorkspace
} from '@/lib/azure-devops-feedback-agent'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { useAzureDevOpsReviewDetail } from './use-azure-devops-review-detail'
import { useAzureDevOpsReviewDiffRevealRequest } from './use-azure-devops-review-diff-reveal'
import { azureDevOpsReviewVoteLabel } from './azure-devops-review-vote-labels'
import { AzureDevOpsReviewFiles } from './AzureDevOpsReviewFiles'
import { AzureDevOpsReviewThreads } from './AzureDevOpsReviewThreads'
import { AzureDevOpsReviewDrafts } from './AzureDevOpsReviewDrafts'
import { AzureDevOpsReviewAiButton } from './AzureDevOpsReviewAiButton'
import {
  readAzureDevOpsReviewOptions,
  storeAzureDevOpsReviewOptions
} from '@/store/azure-devops-review-options'
import type { AzureDevOpsReviewOptions } from '../../../../shared/azure-devops-review-options'
import { AzureDevOpsReviewOptionsDialog } from './AzureDevOpsReviewOptionsDialog'
import { AzureDevOpsDraftsAiDialog } from './AzureDevOpsDraftsAiDialog'
import { AzureDevOpsFeedbackDialog } from './AzureDevOpsFeedbackDialog'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'
import {
  AzureDevOpsSnapshotsTabContent,
  AzureDevOpsSnapshotsTabTrigger
} from '../snapshot-diff/AzureDevOpsSnapshotsTab'

type ReviewMode = 'workspace' | 'agent'

const SCROLLING_TAB_CLASS = 'min-h-0 flex-1 overflow-y-auto scrollbar-sleek'

function PullRequestMeta({ detail }: { detail: AzureDevOpsReviewDetail }): React.JSX.Element {
  const pr = detail.pullRequest
  return (
    <p className="truncate text-xs text-muted-foreground">
      {pr.project}/{pr.repository} · {pr.author.displayName} ·{' '}
      <span className="font-mono">{pr.sourceBranch}</span> →{' '}
      <span className="font-mono">{pr.targetBranch}</span>
      {pr.isDraft ? ` · ${translate('azureDevOpsReview.draftPr', 'Draft pull request')}` : ''}
      {pr.status !== 'active' ? ` · ${pr.status}` : ''}
      {pr.myVote !== 'none'
        ? ` · ${translate('azureDevOpsReview.myVote', 'Your vote: {{value0}}', {
            value0: azureDevOpsReviewVoteLabel(pr.myVote)
          })}`
        : ''}
    </p>
  )
}

export function AzureDevOpsPullRequestPage({
  pullRequestKey,
  reserveLeftHeaderSpace,
  reserveRightHeaderSpace
}: {
  pullRequestKey: string
  reserveLeftHeaderSpace: boolean
  reserveRightHeaderSpace: boolean
}): React.JSX.Element {
  const { detail, loading, error, reload } = useAzureDevOpsReviewDetail(pullRequestKey)
  const confirm = useConfirmationDialog()
  const [busy, setBusy] = useState<ReviewMode | null>(null)
  const [choosingOptions, setChoosingOptions] = useState(false)
  const [choosingThreads, setChoosingThreads] = useState(false)
  const [aiDraftIds, setAiDraftIds] = useState<string[] | null>(null)
  const [chosenTab, setChosenTab] = useState<string | null>(null)
  const [openingTab, setOpeningTab] = useState<string | null>(null)
  const { reveal, requestReveal } = useAzureDevOpsReviewDiffRevealRequest()
  const pr = detail?.pullRequest ?? null
  // Why: on the user's own open PR the agent and the workspace are the author's branch, not a review checkout.
  const ownPullRequest = pr?.createdByMe === true && pr.status === 'active'
  const unpublished = detail?.drafts.filter((draft) => draft.state !== 'published').length ?? 0
  const pendingAiPrompts = useAzureDevOpsReviewDraftPrompts(
    (s) =>
      Object.values(s.prompts).filter((prompt) => prompt.pullRequestKey === pullRequestKey).length
  )
  useEffect(() => {
    if (detail) {
      useAzureDevOpsReviewDraftPrompts
        .getState()
        .prunePrompts(
          detail.pullRequest.key,
          new Set(detail.drafts.filter((d) => d.state !== 'published').map((d) => d.id))
        )
    }
  }, [detail])

  const review = async (
    mode: ReviewMode,
    options?: AzureDevOpsReviewOptions,
    prompt?: AzureDevOpsReviewAgentPrompt
  ): Promise<boolean> => {
    if (!pr) {
      return false
    }
    setBusy(mode)
    try {
      const worktree = ownPullRequest
        ? await openAzureDevOpsFeedbackWorkspace(pullRequestKey)
        : await switchAzureDevOpsReviewWorktree(pullRequestKey, confirm)
      if (!worktree) {
        return false
      }
      const opened =
        mode === 'agent'
          ? await startAzureDevOpsReviewAgent(pr, worktree, options, prompt)
          : await revealAzureDevOpsReviewWorktree(worktree)
      if (opened) {
        closeAzureDevOpsPullRequestPage()
      }
      return opened
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const forkBlocked = pr?.isFork === true
  // Why once: the tab the page opens on must not follow drafts that arrive while it is open.
  if (detail && openingTab === null) {
    setOpeningTab(unpublished > 0 ? 'drafts' : 'overview')
  }
  const openInDiff = (filePath: string, line: number): void => {
    requestReveal(filePath, line)
    setChosenTab('files')
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header
        className={cn(
          'flex shrink-0 items-start gap-3 border-b border-border px-4 py-3',
          reserveRightHeaderSpace && 'pr-12'
        )}
        style={
          reserveLeftHeaderSpace
            ? { paddingLeft: 'calc(var(--collapsed-sidebar-header-width) + 1rem)' }
            : undefined
        }
      >
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="truncate text-base font-semibold">
            {pr ? (
              <>
                <span className="mr-1.5 font-normal text-muted-foreground">
                  !{pr.pullRequestId}
                </span>
                {pr.title}
              </>
            ) : (
              translate('azureDevOpsReview.title', 'Pull requests')
            )}
          </h1>
          {detail ? <PullRequestMeta detail={detail} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why: a disabled button swallows hover, so the span keeps the tooltip reachable. */}
              <span tabIndex={-1}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pr || busy !== null || forkBlocked}
                  onClick={() => void review('workspace')}
                >
                  <FolderGit2 className="size-3.5" />
                  {translate('azureDevOpsReview.openInWorkspace', 'Open in workspace')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              {forkBlocked
                ? translate(
                    'azureDevOpsReview.forkUnsupported',
                    'Pull requests from forks are not supported for review.'
                  )
                : ownPullRequest
                  ? translate(
                      'azureDevOpsReview.openOwnInWorkspaceHint',
                      "Opens the workspace that has this pull request's branch checked out, or creates one on it."
                    )
                  : translate(
                      'azureDevOpsReview.reviewInWorkspaceHint',
                      "Checks out this PR's latest commit in a review workspace of the repo and opens it, with Source Control comparing against the target branch. Each pull request under review gets its own workspace."
                    )}
            </TooltipContent>
          </Tooltip>
          {pendingAiPrompts > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!detail || busy !== null}
              onClick={() => setAiDraftIds([])}
            >
              <Sparkles className="size-3.5" />
              {translate('azureDevOpsReview.sendAiPrompts', 'Send AI prompts ({{value0}})', {
                value0: pendingAiPrompts
              })}
            </Button>
          ) : null}
          <AzureDevOpsReviewAiButton
            pullRequestKey={pullRequestKey}
            feedback={ownPullRequest}
            disabled={!pr || busy !== null || forkBlocked}
            onStartReview={() =>
              ownPullRequest ? setChoosingThreads(true) : setChoosingOptions(true)
            }
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!pr}
                aria-label={translate('azureDevOpsReview.openInBrowser', 'Open in Azure DevOps')}
                onClick={() => pr && void window.api.shell.openUrl(pr.webUrl)}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('azureDevOpsReview.openInBrowser', 'Open in Azure DevOps')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={loading}
                aria-label={translate('azureDevOpsReview.reload', 'Reload pull request')}
                onClick={() => void reload()}
              >
                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('azureDevOpsReview.reload', 'Reload pull request')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('azureDevOpsReview.close', 'Close pull request')}
                onClick={closeAzureDevOpsPullRequestPage}
              >
                <X className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('azureDevOpsReview.close', 'Close pull request')}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      {error ? (
        <div className="space-y-2 px-4 py-4 text-sm">
          <p role="alert" className="text-destructive">
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            {translate('azureDevOpsReview.retry', 'Retry')}
          </Button>
        </div>
      ) : !detail ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {translate('azureDevOpsReview.loadingDetail', 'Loading pull request…')}
        </p>
      ) : (
        <Tabs
          value={chosenTab ?? openingTab ?? 'overview'}
          onValueChange={setChosenTab}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="shrink-0 border-b border-border px-4 py-2">
            <TabsList>
              <TabsTrigger value="overview">
                {translate('azureDevOpsReview.tabOverview', 'Overview')}
              </TabsTrigger>
              <TabsTrigger value="files">
                {translate('azureDevOpsReview.tabFiles', 'Files')} ({detail.changes.length})
              </TabsTrigger>
              <AzureDevOpsSnapshotsTabTrigger detail={detail} />
              <TabsTrigger value="threads">
                {translate('azureDevOpsReview.tabThreads', 'Threads')} ({detail.threads.length})
              </TabsTrigger>
              <TabsTrigger value="drafts">
                {translate('azureDevOpsReview.tabDrafts', 'Drafts')} ({unpublished})
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Why: Files owns its own tree and diff scrolling; the text tabs scroll as a page. */}
          <TabsContent value="files" className="min-h-0 flex-1">
            <AzureDevOpsReviewFiles detail={detail} onChanged={reload} reveal={reveal} />
          </TabsContent>
          <AzureDevOpsSnapshotsTabContent detail={detail} />
          <TabsContent value="overview" className={SCROLLING_TAB_CLASS}>
            <div className="mx-auto w-full max-w-4xl px-4 py-4">
              {detail.pullRequest.description.trim() ? (
                <CommentMarkdownAsync
                  content={detail.pullRequest.description}
                  variant="document"
                  className="text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate('azureDevOpsReview.noDescription', 'No description provided.')}
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="threads" className={SCROLLING_TAB_CLASS}>
            <div className="mx-auto w-full max-w-4xl px-4 py-4">
              <AzureDevOpsReviewThreads detail={detail} onChanged={reload} />
            </div>
          </TabsContent>
          <TabsContent value="drafts" className={SCROLLING_TAB_CLASS}>
            <div className="mx-auto w-full max-w-4xl px-4 py-4">
              <AzureDevOpsReviewDrafts
                detail={detail}
                onChanged={reload}
                onAskAi={setAiDraftIds}
                onOpenInDiff={openInDiff}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
      {choosingOptions ? (
        <AzureDevOpsReviewOptionsDialog
          initialOptions={readAzureDevOpsReviewOptions()}
          onCancel={() => setChoosingOptions(false)}
          onStart={(options) => {
            setChoosingOptions(false)
            storeAzureDevOpsReviewOptions(options)
            void review('agent', options)
          }}
        />
      ) : null}
      {choosingThreads && detail ? (
        <AzureDevOpsFeedbackDialog
          detail={detail}
          onCancel={() => setChoosingThreads(false)}
          onStart={(threadIds, instruction) => {
            setChoosingThreads(false)
            const options = readAzureDevOpsReviewOptions()
            void review(
              'agent',
              options,
              azureDevOpsFeedbackAgentPrompt(detail, threadIds, instruction, options.language)
            )
          }}
        />
      ) : null}
      {aiDraftIds && detail ? (
        <AzureDevOpsDraftsAiDialog
          detail={detail}
          initialDraftIds={aiDraftIds}
          onClose={() => setAiDraftIds(null)}
          onStartNewChat={(prompt) => review('agent', readAzureDevOpsReviewOptions(), prompt)}
        />
      ) : null}
    </div>
  )
}
