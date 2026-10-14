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
import { openAzureDevOpsReviewWorktree } from '@/lib/azure-devops-review-client'
import {
  revealAzureDevOpsReviewWorktree,
  startAzureDevOpsReviewAgent
} from '@/lib/azure-devops-review-agent'
import { closeAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { useAzureDevOpsReviewDetail } from './use-azure-devops-review-detail'
import { AzureDevOpsReviewFiles } from './AzureDevOpsReviewFiles'
import { AzureDevOpsReviewThreads } from './AzureDevOpsReviewThreads'
import { AzureDevOpsReviewDrafts } from './AzureDevOpsReviewDrafts'
import { AzureDevOpsReviewAiButton } from './AzureDevOpsReviewAiButton'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import {
  readAzureDevOpsReviewOptions,
  storeAzureDevOpsReviewOptions
} from '@/store/azure-devops-review-options'
import type { AzureDevOpsReviewOptions } from '../../../../shared/azure-devops-review-options'
import { AzureDevOpsReviewOptionsDialog } from './AzureDevOpsReviewOptionsDialog'
import { AzureDevOpsDraftsAiDialog } from './AzureDevOpsDraftsAiDialog'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'

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
  const [aiDraftIds, setAiDraftIds] = useState<string[] | null>(null)
  const pr = detail?.pullRequest ?? null
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
    prompt?: string
  ): Promise<boolean> => {
    if (!pr) {
      return false
    }
    setBusy(mode)
    try {
      let result = await openAzureDevOpsReviewWorktree(pullRequestKey)
      if (!result.ok && result.reason === 'dirty') {
        const discard = await confirm({
          title: translate(
            'azureDevOpsReview.dirtyTitle',
            'Discard changes in the review workspace?'
          ),
          description: translate(
            'azureDevOpsReview.dirtyDescription',
            'The shared review workspace has uncommitted changes. Switching to this pull request discards them; ignored files such as dependencies stay.'
          ),
          confirmLabel: translate('azureDevOpsReview.dirtyConfirm', 'Discard and switch'),
          confirmVariant: 'destructive'
        })
        if (!discard) {
          return false
        }
        result = await openAzureDevOpsReviewWorktree(pullRequestKey, true)
      }
      if (!result.ok) {
        toast.error(result.message)
        return false
      }
      useAzureDevOpsReviewChatLinks
        .getState()
        .setWorktreePullRequest(result.worktree.worktreeId, result.worktree.pullRequestKey)
      const opened =
        mode === 'agent'
          ? await startAzureDevOpsReviewAgent(pr, result.worktree, options, prompt)
          : await revealAzureDevOpsReviewWorktree(result.worktree)
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
                : translate(
                    'azureDevOpsReview.reviewInWorkspaceHint',
                    "Checks out this PR's latest commit in the repo's shared review workspace and opens it, with Source Control comparing against the target branch."
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
            disabled={!pr || busy !== null || forkBlocked}
            onStartReview={() => setChoosingOptions(true)}
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
          defaultValue={unpublished > 0 ? 'drafts' : 'overview'}
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
            <AzureDevOpsReviewFiles detail={detail} onChanged={reload} />
          </TabsContent>
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
              <AzureDevOpsReviewDrafts detail={detail} onChanged={reload} onAskAi={setAiDraftIds} />
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
