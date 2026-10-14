import { Suspense, useState } from 'react'
import { Columns2, ExternalLink, FileText, MessageSquarePlus, PanelLeft, Rows2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import DiffViewer from '@/components/editor/DiffViewer'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { translate } from '@/i18n/i18n'
import { detectLanguage } from '@/lib/language-detect'
import { createAzureDevOpsReviewDraft } from '@/lib/azure-devops-review-client'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsDraftComposer } from './AzureDevOpsDraftComposer'
import { AzureDevOpsReviewFileComments } from './AzureDevOpsReviewFileComments'
import { useAzureDevOpsReviewFileDiff } from './use-azure-devops-review-file-diff'
import { useAzureDevOpsReviewInlineComments } from './use-azure-devops-review-inline-comments'
import { AzureDevOpsReviewIconButton } from './AzureDevOpsReviewIconButton'
import { azureDevOpsLoadedSectionFields } from './azure-devops-review-diff-sections'

const ImageDiffViewer = lazy(() => import('@/components/editor/ImageDiffViewer'))

export function AzureDevOpsReviewFileDiffPane({
  detail,
  change,
  treeCollapsed,
  onShowTree,
  viewModeToggle,
  onChanged
}: {
  detail: AzureDevOpsReviewDetail
  change: AzureDevOpsReviewChange
  treeCollapsed: boolean
  onShowTree: () => void
  viewModeToggle: React.ReactNode
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const pullRequestKey = detail.pullRequest.key
  const iterationId = detail.latestIteration?.id ?? null
  const { diff, loading, error, retry } = useAzureDevOpsReviewFileDiff(
    pullRequestKey,
    iterationId,
    change
  )
  const inline = useAzureDevOpsReviewInlineComments(detail, onChanged)
  const [sideBySide, setSideBySide] = useState(true)
  const [fileComposer, setFileComposer] = useState(false)
  const result = diff ? azureDevOpsLoadedSectionFields(diff).diffResult : null
  const image = result?.kind === 'binary' && result.isImage ? result : null
  const unavailable =
    image !== null
      ? null
      : diff && (diff.original.binary || diff.modified.binary)
        ? translate(
            'azureDevOpsReview.binaryFile',
            'Binary file; open it in Azure DevOps to compare.'
          )
        : diff && (diff.original.tooLarge || diff.modified.tooLarge)
          ? translate('azureDevOpsReview.largeFile', 'This file is too large to diff here.')
          : null

  const addLineComment = async ({
    lineNumber,
    startLine,
    body
  }: {
    lineNumber: number
    startLine?: number
    body: string
  }): Promise<boolean> => {
    try {
      await createAzureDevOpsReviewDraft({
        pullRequestKey,
        kind: 'inline',
        body,
        filePath: change.path,
        anchor: { side: 'right', startLine: startLine ?? lineNumber, endLine: lineNumber }
      })
      await onChanged()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
        {treeCollapsed ? (
          <AzureDevOpsReviewIconButton
            label={translate('azureDevOpsReview.showFiles', 'Show files')}
            onClick={onShowTree}
          >
            <PanelLeft className="size-3.5" />
          </AzureDevOpsReviewIconButton>
        ) : null}
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={change.path}>
          {change.changeType === 'rename' && change.originalPath
            ? `${change.originalPath} → ${change.path}`
            : change.path}
        </span>
        <Button variant="ghost" size="xs" onClick={() => setFileComposer((open) => !open)}>
          <MessageSquarePlus className="size-3" />
          {translate('azureDevOpsReview.commentFile', 'Comment file')}
        </Button>
        {viewModeToggle}
        <AzureDevOpsReviewIconButton
          label={
            sideBySide
              ? translate('azureDevOpsReview.inlineView', 'Inline view')
              : translate('azureDevOpsReview.sideBySideView', 'Side-by-side view')
          }
          onClick={() => setSideBySide((value) => !value)}
        >
          {sideBySide ? <Rows2 className="size-3.5" /> : <Columns2 className="size-3.5" />}
        </AzureDevOpsReviewIconButton>
        <AzureDevOpsReviewIconButton
          label={translate('azureDevOpsReview.openInBrowser', 'Open in Azure DevOps')}
          onClick={() =>
            void window.api.shell.openUrl(
              `${detail.pullRequest.webUrl}?_a=files&path=${encodeURIComponent(`/${change.path}`)}`
            )
          }
        >
          <ExternalLink className="size-3.5" />
        </AzureDevOpsReviewIconButton>
      </div>
      {fileComposer ? (
        <div className="shrink-0 border-b border-border p-3">
          <AzureDevOpsDraftComposer
            pullRequestKey={pullRequestKey}
            kind="file"
            filePath={change.path}
            onCancel={() => setFileComposer(false)}
            onDone={() => {
              setFileComposer(false)
              void onChanged()
            }}
          />
        </div>
      ) : null}
      <AzureDevOpsReviewFileComments detail={detail} path={change.path} />
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="space-y-2 p-4 text-sm">
            <p role="alert" className="text-destructive">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              {translate('azureDevOpsReview.retry', 'Retry')}
            </Button>
          </div>
        ) : loading || !diff ? (
          <p className="p-4 text-sm text-muted-foreground">
            {translate('azureDevOpsReview.loadingDiff', 'Loading diff…')}
          </p>
        ) : unavailable ? (
          <p className="p-4 text-sm text-muted-foreground">{unavailable}</p>
        ) : image ? (
          <div className="absolute inset-0 flex flex-col">
            <Suspense fallback={null}>
              <ImageDiffViewer
                originalContent={image.originalContent}
                modifiedContent={image.modifiedContent}
                filePath={change.path}
                mimeType={image.mimeType}
                sideBySide={sideBySide}
              />
            </Suspense>
          </div>
        ) : (
          // Why: Monaco sizes to its parent, so it needs a box with a definite height.
          <div className="absolute inset-0 flex flex-col">
            <DiffViewer
              key={`${pullRequestKey}:${diff.iterationId}:${change.path}`}
              modelKey={`azure-devops:${pullRequestKey}:${diff.iterationId}:${change.path}`}
              originalContent={diff.original.content}
              modifiedContent={diff.modified.content}
              language={detectLanguage(change.path)}
              filePath={change.path}
              relativePath={change.path}
              sideBySide={sideBySide}
              worktreeId={inline.scope}
              inlineComments={inline.comments}
              inlineCommentActions={inline.actions}
              onAddLineComment={addLineComment}
              addLineCommentLabel={translate('azureDevOpsReview.addDraft', 'Add draft comment')}
              addLineCommentPlaceholder={translate(
                'azureDevOpsReview.draftPlaceholder',
                'Write a comment (Markdown)'
              )}
            />
          </div>
        )}
      </div>
    </div>
  )
}
