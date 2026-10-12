import { routeNativeChatHref } from '../../../../../shared/native-chat-href-routing'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { CommentMarkdownLinkPreviewHooks } from '@/components/sidebar/comment-markdown-element-renderers'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'

const PREVIEW_OPEN_DELAY_MS = 250

export function NativeChatPreviewLink({
  href,
  children,
  hover,
  runtimeContext,
  onLinkClick
}: {
  href?: string
  children?: ReactNode
  hover: boolean
  runtimeContext?: RuntimeFileOperationArgs | null
  onLinkClick?: CommentMarkdownLinkClickHandler
}) {
  const anchorRef = useRef<HTMLAnchorElement>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const target = useMemo(
    () => (href ? resolveChatPreviewTarget(href, runtimeContext) : null),
    [href, runtimeContext]
  )
  const preview = useMemo(
    () => (target ? { target, runtimeContext } : undefined),
    [runtimeContext, target]
  )
  const previewHooks = onLinkClick as CommentMarkdownLinkPreviewHooks | undefined
  const previewAvailable =
    hover && !!preview && !!previewHooks?.createPreviewRequest && !!previewHooks.showPreview
  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])
  const openPreview = (explicit: boolean, focusOnOpen = false): boolean => {
    const anchor = anchorRef.current
    if (!previewAvailable || !anchor || !href) {
      return false
    }
    const request = previewHooks?.createPreviewRequest?.(anchor, href)
    if (!request || (explicit && request.pinOnClick === false)) {
      return false
    }
    const bounds = anchor.getBoundingClientRect()
    previewHooks?.showPreview?.(
      {
        ...request,
        anchorElement: anchor,
        anchorX: bounds.left,
        anchorY: bounds.bottom,
        preview,
        transient: false,
        focusOnOpen
      },
      explicit
    )
    return true
  }
  const scheduleOpen = (): void => {
    clearOpenTimer()
    if (!previewAvailable) {
      return
    }
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null
      openPreview(false)
    }, PREVIEW_OPEN_DELAY_MS)
  }

  // Only pending hovers belong to the message; the transcript owns an opened preview.
  useEffect(() => clearOpenTimer, [clearOpenTimer, href, hover, onLinkClick, runtimeContext])

  return (
    <a
      ref={anchorRef}
      href={href || undefined}
      target="_blank"
      rel="noreferrer"
      aria-haspopup={previewAvailable ? 'dialog' : undefined}
      className="text-chat-foreground underline underline-offset-2 hover:text-chat-foreground-strong"
      onClick={(event) => {
        clearOpenTimer()
        const plainActivation =
          event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        if (plainActivation && openPreview(true, event.detail === 0)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onLinkClick?.(event, href, preview ? { preview } : undefined)
        if (routeNativeChatHref(href).kind === 'file') {
          event.preventDefault()
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          clearOpenTimer()
          onLinkClick?.(event, href)
          if (routeNativeChatHref(href).kind === 'file') {
            event.preventDefault()
          }
        }
      }}
      onPointerEnter={scheduleOpen}
      onPointerLeave={clearOpenTimer}
      onBlur={clearOpenTimer}
    >
      {children}
    </a>
  )
}
