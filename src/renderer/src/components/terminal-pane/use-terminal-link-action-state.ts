import { useCallback, useEffect, useRef, useState } from 'react'
import {
  closeTerminalLinkActionRequest,
  type TerminalLinkActionRequest,
  type TerminalLinkActionRequester,
  type TerminalLinkPreviewRequester
} from './terminal-link-action-request'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'

const TERMINAL_LINK_PREVIEW_OPEN_DELAY_MS = 250
const TERMINAL_LINK_PREVIEW_CLOSE_DELAY_MS = 150

function previewEnvironmentId(request: TerminalLinkActionRequest): string | null | undefined {
  const context = request.preview?.runtimeContext
  return context ? runtimeTargetEnvironmentId(context.target) : undefined
}

function isSamePreview(
  left: TerminalLinkActionRequest | null,
  right: TerminalLinkActionRequest
): boolean {
  if (!left?.preview || !right.preview) {
    return false
  }
  return (
    left.paneId === right.paneId &&
    left.preview.target.key === right.preview.target.key &&
    left.preview.target.kind === right.preview.target.kind &&
    left.preview.target.line === right.preview.target.line &&
    left.preview.runtimeContext?.worktreeId === right.preview.runtimeContext?.worktreeId &&
    left.preview.runtimeContext?.connectionId === right.preview.runtimeContext?.connectionId &&
    previewEnvironmentId(left) === previewEnvironmentId(right)
  )
}

export function useTerminalLinkActionState(): {
  request: TerminalLinkActionRequest | null
  requestAction: TerminalLinkActionRequester
  requestPreview: TerminalLinkPreviewRequester
  leavePreview: (paneId: number) => void
  invalidatePanePreview: (paneId: number) => void
  dismissPanePreview: (paneId: number) => void
  close: (dismissed?: TerminalLinkActionRequest) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onPin: (pinned: boolean) => void
} {
  const [request, setRequest] = useState<TerminalLinkActionRequest | null>(null)
  const requestRef = useRef(request)
  requestRef.current = request
  const pendingPreviewRef = useRef<TerminalLinkActionRequest | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const pointerOverPopoverRef = useRef(false)

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    pendingPreviewRef.current = null
  }, [])
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleTransientClose = useCallback(
    (paneId?: number) => {
      clearCloseTimer()
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        if (pointerOverPopoverRef.current) {
          return
        }
        setRequest((current) =>
          current?.transient && (paneId === undefined || current.paneId === paneId) ? null : current
        )
      }, TERMINAL_LINK_PREVIEW_CLOSE_DELAY_MS)
    },
    [clearCloseTimer]
  )

  const requestAction = useCallback<TerminalLinkActionRequester>(
    (next) => {
      clearOpenTimer()
      clearCloseTimer()
      pointerOverPopoverRef.current = false
      setRequest((current) =>
        isSamePreview(current, next)
          ? { ...next, anchorX: current!.anchorX, anchorY: current!.anchorY, transient: false }
          : { ...next, transient: false }
      )
    },
    [clearCloseTimer, clearOpenTimer]
  )

  const requestPreview = useCallback<TerminalLinkPreviewRequester>(
    (next) => {
      clearCloseTimer()
      if (requestRef.current && !requestRef.current.transient) {
        return
      }
      pointerOverPopoverRef.current = false
      if (isSamePreview(requestRef.current, next)) {
        return
      }
      if (isSamePreview(pendingPreviewRef.current, next)) {
        return
      }
      clearOpenTimer()
      pendingPreviewRef.current = next
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null
        const pending = pendingPreviewRef.current
        pendingPreviewRef.current = null
        if (pending) {
          setRequest((current) => (current && !current.transient ? current : pending))
        }
      }, TERMINAL_LINK_PREVIEW_OPEN_DELAY_MS)
    },
    [clearCloseTimer, clearOpenTimer]
  )

  const leavePreview = useCallback(
    (paneId: number) => {
      if (pendingPreviewRef.current?.paneId === paneId) {
        clearOpenTimer()
      }
      if (requestRef.current?.paneId === paneId) {
        scheduleTransientClose(paneId)
      }
    },
    [clearOpenTimer, scheduleTransientClose]
  )

  const dismissPanePreview = useCallback(
    (paneId: number) => {
      if (pendingPreviewRef.current?.paneId === paneId) {
        clearOpenTimer()
      }
      if (requestRef.current?.paneId !== paneId) {
        return
      }
      clearCloseTimer()
      pointerOverPopoverRef.current = false
      setRequest((current) => (current?.paneId === paneId ? null : current))
    },
    [clearCloseTimer, clearOpenTimer]
  )

  const invalidatePanePreview = useCallback(
    (paneId: number) => {
      if (pendingPreviewRef.current?.paneId === paneId) {
        clearOpenTimer()
      }
      if (requestRef.current?.paneId !== paneId) {
        return
      }
      clearCloseTimer()
      if (requestRef.current?.paneId === paneId && requestRef.current.transient) {
        pointerOverPopoverRef.current = false
      }
      setRequest((current) => (current?.paneId === paneId && current.transient ? null : current))
    },
    [clearCloseTimer, clearOpenTimer]
  )

  const close = useCallback(
    (dismissed?: TerminalLinkActionRequest) => {
      clearOpenTimer()
      clearCloseTimer()
      pointerOverPopoverRef.current = false
      setRequest((current) => closeTerminalLinkActionRequest(current, dismissed))
    },
    [clearCloseTimer, clearOpenTimer]
  )

  const onPointerEnter = useCallback(() => {
    pointerOverPopoverRef.current = true
    clearCloseTimer()
  }, [clearCloseTimer])
  const onPointerLeave = useCallback(() => {
    pointerOverPopoverRef.current = false
    scheduleTransientClose()
  }, [scheduleTransientClose])
  const onPin = useCallback(
    (pinned: boolean) => {
      clearCloseTimer()
      setRequest((current) => (current ? { ...current, transient: !pinned } : current))
      if (!pinned && !pointerOverPopoverRef.current) {
        scheduleTransientClose()
      }
    },
    [clearCloseTimer, scheduleTransientClose]
  )

  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
    },
    [clearCloseTimer, clearOpenTimer]
  )

  return {
    request,
    requestAction,
    requestPreview,
    leavePreview,
    invalidatePanePreview,
    dismissPanePreview,
    close,
    onPointerEnter,
    onPointerLeave,
    onPin
  }
}
