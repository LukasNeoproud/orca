import { routeNativeChatHref } from '../../../../../shared/native-chat-href-routing'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LinkActionPopover } from '@/components/link-actions/LinkActionPopover'
import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'

const PREVIEW_OPEN_DELAY_MS = 250
const PREVIEW_CLOSE_DELAY_MS = 150

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
  const ownerRef = useRef(Symbol('native-chat-link-preview'))
  const requestRef = useRef<LinkActionRequest | null>(null)
  const suppressFocusOpenRef = useRef(false)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [request, setRequest] = useState<LinkActionRequest | null>(null)
  const target = useMemo(
    () => (href ? resolveChatPreviewTarget(href, runtimeContext) : null),
    [href, runtimeContext]
  )
  const preview = useMemo(
    () => (target ? { target, runtimeContext } : undefined),
    [runtimeContext, target]
  )
  const previewAvailable = hover && !!preview && !!onLinkClick?.createPreviewRequest

  const updateRequest = useCallback((next: LinkActionRequest | null) => {
    requestRef.current = next
    setRequest(next)
  }, [])
  const releaseOwnership = useCallback(() => {
    onLinkClick?.releasePreview?.(ownerRef.current)
  }, [onLinkClick])
  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])
  const createRequest = useCallback(
    (transient: boolean, focusOnOpen = false): LinkActionRequest | null => {
      const anchor = anchorRef.current
      if (!anchor || !href || !preview) {
        return null
      }
      const existing = requestRef.current
      const base = existing ?? onLinkClick?.createPreviewRequest?.(anchor, href)
      if (!base) {
        return null
      }
      return {
        ...base,
        anchorElement: anchor,
        preview,
        transient,
        focusOnOpen
      }
    },
    [href, onLinkClick, preview]
  )
  const cancelClose = useCallback(() => {
    clearCloseTimer()
  }, [clearCloseTimer])
  const scheduleOpen = useCallback(() => {
    clearCloseTimer()
    if (
      suppressFocusOpenRef.current ||
      !hover ||
      !preview ||
      !onLinkClick?.createPreviewRequest ||
      requestRef.current
    ) {
      return
    }
    clearOpenTimer()
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null
      const next = createRequest(true)
      if (
        next &&
        onLinkClick.claimPreview?.(
          ownerRef.current,
          () => {
            clearOpenTimer()
            clearCloseTimer()
            updateRequest(null)
          },
          false
        ) !== false
      ) {
        updateRequest(next)
      }
    }, PREVIEW_OPEN_DELAY_MS)
  }, [clearCloseTimer, clearOpenTimer, createRequest, hover, onLinkClick, preview, updateRequest])
  const scheduleClose = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    if (!requestRef.current?.transient) {
      return
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      if (requestRef.current?.transient) {
        releaseOwnership()
        updateRequest(null)
      }
    }, PREVIEW_CLOSE_DELAY_MS)
  }, [clearCloseTimer, clearOpenTimer, releaseOwnership, updateRequest])
  const close = useCallback(
    (dismissed?: LinkActionRequest) => {
      clearOpenTimer()
      clearCloseTimer()
      if (!dismissed || requestRef.current === dismissed) {
        if (dismissed) {
          suppressFocusOpenRef.current = true
          queueMicrotask(() => {
            suppressFocusOpenRef.current = false
          })
        }
        releaseOwnership()
        updateRequest(null)
      }
    },
    [clearCloseTimer, clearOpenTimer, releaseOwnership, updateRequest]
  )
  const pin = useCallback(
    (pinned: boolean) => {
      clearOpenTimer()
      clearCloseTimer()
      const current = requestRef.current
      if (!current) {
        return
      }
      onLinkClick?.claimPreview?.(
        ownerRef.current,
        () => {
          clearOpenTimer()
          clearCloseTimer()
          updateRequest(null)
        },
        pinned
      )
      updateRequest({ ...current, transient: !pinned, focusOnOpen: false })
    },
    [clearCloseTimer, clearOpenTimer, onLinkClick, updateRequest]
  )

  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
      releaseOwnership()
    },
    [clearCloseTimer, clearOpenTimer, releaseOwnership]
  )
  useEffect(() => {
    if (!hover) {
      close()
    }
  }, [close, hover])
  const previewOwnerKey = JSON.stringify([
    href,
    target?.key,
    runtimeContext?.worktreeId,
    runtimeContext?.worktreePath,
    runtimeContext?.connectionId,
    runtimeContext?.expectedExecutionHostId,
    runtimeContext?.expectedSshConnectionGeneration,
    runtimeContext?.settings?.activeRuntimeEnvironmentId
  ])
  useEffect(() => {
    close()
  }, [close, previewOwnerKey])

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    const plainActivation =
      event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    if (hover && preview && plainActivation && onLinkClick?.createPreviewRequest) {
      clearOpenTimer()
      clearCloseTimer()
      const pinned = createRequest(false, event.detail === 0)
      if (pinned && pinned.pinOnClick !== false) {
        event.preventDefault()
        event.stopPropagation()
        onLinkClick.claimPreview?.(
          ownerRef.current,
          () => {
            clearOpenTimer()
            clearCloseTimer()
            updateRequest(null)
          },
          true
        )
        updateRequest(pinned)
        return
      }
    }
    close()
    onLinkClick?.(event, href, preview ? { preview } : undefined)
    if (routeNativeChatHref(href).kind === 'file') {
      event.preventDefault()
    }
  }

  return (
    <>
      <a
        ref={anchorRef}
        href={href || undefined}
        target="_blank"
        rel="noreferrer"
        aria-haspopup={previewAvailable ? 'dialog' : undefined}
        aria-expanded={previewAvailable ? request !== null : undefined}
        data-preview-active={request ? '' : undefined}
        className="text-foreground/80 underline underline-offset-2 hover:text-foreground"
        onClick={handleClick}
        onAuxClick={(event) => {
          if (event.button === 1) {
            close()
            onLinkClick?.(event, href)
            if (routeNativeChatHref(href).kind === 'file') {
              event.preventDefault()
            }
          }
        }}
        onPointerEnter={() => {
          suppressFocusOpenRef.current = false
          scheduleOpen()
        }}
        onPointerLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            close()
          }
        }}
      >
        {children}
      </a>
      <LinkActionPopover
        request={request}
        onClose={close}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onPin={pin}
      />
    </>
  )
}
