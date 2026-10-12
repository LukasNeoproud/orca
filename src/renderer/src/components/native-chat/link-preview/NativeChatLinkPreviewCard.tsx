import { isPathInsideWorktree } from '@/lib/terminal-links'
import { translate } from '@/i18n/i18n'
import { useEffect, useRef, useState } from 'react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import NativeChatFilePreviewContent from './NativeChatFilePreviewContent'
import { useNativeChatFilePreview } from './useNativeChatFilePreview'
import type { ChatPreviewTarget } from './native-chat-preview-groups'
import { cn } from '@/lib/utils'
import { nativeChatPreviewKind } from './native-chat-preview-kind'

export function NativeChatLinkPreviewCard({
  target,
  runtimeContext,
  onLinkClick,
  embedded = false,
  expanded = false
}: {
  target: ChatPreviewTarget
  runtimeContext?: RuntimeFileOperationArgs | null
  onLinkClick?: CommentMarkdownLinkClickHandler
  embedded?: boolean
  expanded?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [approvedOutsideKey, setApprovedOutsideKey] = useState<string | null>(null)
  const ownerKey = JSON.stringify([target.path, runtimeContext])
  const outsideWorkspace =
    target.kind === 'file' &&
    !!runtimeContext?.worktreePath &&
    !isPathInsideWorktree(target.path, runtimeContext.worktreePath)
  const needsExplicitRead = outsideWorkspace && approvedOutsideKey !== ownerKey
  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '100px'
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const preview = useNativeChatFilePreview(
    target.path,
    runtimeContext,
    visible && target.kind === 'file' && !needsExplicitRead
  )
  let name = target.path.split(/[/\\]/).pop()
  if (target.kind === 'web') {
    try {
      name = new URL(target.path).hostname
    } catch {
      name = translate('auto.components.nativeChat.preview.web', 'Web')
    }
  }
  return (
    <div
      ref={ref}
      className={
        embedded
          ? 'flex min-h-0 min-w-0 flex-1 flex-col text-sm not-italic'
          : 'my-2 min-w-0 overflow-hidden rounded-md border border-border bg-muted/30 text-sm not-italic'
      }
    >
      {!embedded && (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left hover:bg-accent"
          title={target.path}
          onClick={(event) => onLinkClick?.(event, target.href)}
        >
          <span className="truncate font-medium">
            {name}
            {target.line ? `:${target.line}` : ''}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {target.kind === 'web'
              ? translate('auto.components.nativeChat.preview.web', 'Web')
              : translate('auto.components.nativeChat.preview.currentFile', 'Current file')}{' '}
            ↗
          </span>
        </button>
      )}
      <div
        className={
          target.kind === 'web'
            ? 'p-3'
            : cn(
                'min-h-0',
                expanded ? 'h-[min(32rem,55vh)]' : 'h-64',
                preview.status === 'ready' &&
                  !needsExplicitRead &&
                  nativeChatPreviewKind(target.path, preview.mimeType) === 'code'
                  ? 'overflow-hidden'
                  : 'overflow-auto scrollbar-editor p-3'
              )
        }
      >
        {target.kind === 'web' ? (
          <>
            <p className="break-all text-muted-foreground">{target.path}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {translate(
                'auto.components.nativeChat.preview.openWebsite',
                'Open the link to view the website.'
              )}
            </p>
          </>
        ) : needsExplicitRead ? (
          <div className="text-muted-foreground">
            <p>
              {translate(
                'auto.components.nativeChat.preview.outsideWorkspace',
                'This file is outside the conversation’s workspace.'
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setApprovedOutsideKey(ownerKey)}
            >
              {translate('auto.components.nativeChat.preview.loadFile', 'Load preview')}
            </Button>
          </div>
        ) : preview.status === 'ready' ? (
          <NativeChatFilePreviewContent
            filePath={target.path}
            content={preview.content ?? ''}
            encoding={preview.encoding}
            mimeType={preview.mimeType}
            line={target.line}
            runtimeContext={runtimeContext}
          />
        ) : (
          <div role="status" className="text-muted-foreground">
            {preview.status === 'loading'
              ? translate('auto.components.nativeChat.preview.loading', 'Loading preview…')
              : preview.status === 'missing'
                ? translate('auto.components.nativeChat.preview.missing', 'File no longer exists.')
                : preview.status === 'large'
                  ? translate(
                      'auto.components.nativeChat.preview.large',
                      'This file is too large for an inline preview. Open it to view its content.'
                    )
                  : preview.status === 'unavailable'
                    ? translate(
                        'auto.components.nativeChat.preview.unavailable',
                        'The file’s workspace is unavailable.'
                      )
                    : translate(
                        'auto.components.nativeChat.preview.error',
                        'Could not load this preview.'
                      )}
            {preview.status !== 'loading' && (
              <Button variant="ghost" size="sm" onClick={preview.reload}>
                {translate('auto.components.nativeChat.preview.retry', 'Retry')}
              </Button>
            )}
          </div>
        )}
      </div>
      {target.kind === 'file' && (
        <div className="shrink-0 border-t border-border px-3 py-1 text-xs text-muted-foreground">
          {preview.changed
            ? translate(
                'auto.components.nativeChat.preview.changed',
                'Changed since first preview · showing current content'
              )
            : translate(
                'auto.components.nativeChat.preview.current',
                'Current content · no historical copy'
              )}
        </div>
      )}
    </div>
  )
}
