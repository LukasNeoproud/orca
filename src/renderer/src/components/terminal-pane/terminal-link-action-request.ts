import type { TerminalLinkPointerGesture } from './terminal-link-pointer-gesture'
import {
  isTerminalLinkActionActivation,
  isTerminalMiddleClickActivation
} from './terminal-link-activation'
import type { TerminalLinkClickBehavior } from './terminal-link-click-behavior'
import type { HttpLinkSourceOwner } from '@/lib/http-link-routing'
import {
  closeLinkActionRequest,
  type LinkAction,
  type LinkActionKind,
  type LinkActionRequest
} from '@/components/link-actions/link-action-request'

export type TerminalLinkActionKind = LinkActionKind

export type TerminalLinkAction = LinkAction

export type TerminalLinkActionRequest = LinkActionRequest & { paneId: number }

export type TerminalLinkActionRequester = (request: TerminalLinkActionRequest) => void

export type TerminalLinkPreviewRequester = (request: TerminalLinkActionRequest) => void

export type TerminalLinkActionContext = {
  paneId: number
  pointerGesture: TerminalLinkPointerGesture
  claimPtyMouse: () => boolean
  request: TerminalLinkActionRequester
  requestPreview?: TerminalLinkPreviewRequester
  leavePreview?: (paneId: number) => void
  focusTerminal: () => void
  plainClickBehavior?: TerminalLinkClickBehavior
  middleClickBehavior?: TerminalLinkClickBehavior
  /** The host running the pane's shell; absent reads as not this machine. */
  sourceOwner?: HttpLinkSourceOwner
}

export function closeTerminalLinkActionRequest(
  current: TerminalLinkActionRequest | null,
  dismissed?: TerminalLinkActionRequest
): TerminalLinkActionRequest | null {
  return closeLinkActionRequest(current, dismissed)
}

export type TerminalLinkActionDetails = Pick<
  TerminalLinkActionRequest,
  'destination' | 'kind' | 'primary' | 'alternate' | 'secondaryActions' | 'preview'
>

function buildTerminalLinkActionRequest(
  event: MouseEvent,
  context: TerminalLinkActionContext,
  details: TerminalLinkActionDetails,
  transient: boolean
): TerminalLinkActionRequest {
  return {
    ...details,
    paneId: context.paneId,
    anchorX: event.clientX,
    anchorY: event.clientY,
    transient,
    restoreFocus: context.focusTerminal
  }
}

export function requestTerminalLinkAction(
  event: MouseEvent | undefined,
  context: TerminalLinkActionContext | null | undefined,
  details: TerminalLinkActionDetails
): boolean {
  if (
    !event ||
    !context ||
    !(
      (isTerminalLinkActionActivation(event) && context.plainClickBehavior !== 'none') ||
      (isTerminalMiddleClickActivation(event) && context.middleClickBehavior !== 'none')
    ) ||
    !context.pointerGesture.canRequestAction(event)
  ) {
    return false
  }

  if (!context.claimPtyMouse()) {
    return false
  }
  event.preventDefault()
  const middleClick = isTerminalMiddleClickActivation(event)
  if ((middleClick ? context.middleClickBehavior : context.plainClickBehavior) === 'open') {
    context.focusTerminal()
    details.primary?.run()
    return true
  }
  if (middleClick && context.middleClickBehavior !== 'actions') {
    return false
  }
  context.request(buildTerminalLinkActionRequest(event, context, details, false))
  return true
}

export function requestTerminalLinkPreview(
  event: MouseEvent | undefined,
  context: TerminalLinkActionContext | null | undefined,
  details: TerminalLinkActionDetails
): boolean {
  if (!event || !context?.requestPreview || !details.preview) {
    return false
  }
  context.requestPreview(buildTerminalLinkActionRequest(event, context, details, true))
  return true
}

export function leaveTerminalLinkPreview(
  context: TerminalLinkActionContext | null | undefined
): void {
  if (context?.leavePreview) {
    context.leavePreview(context.paneId)
  }
}

/** Action and preview requesters as one spread; the mount preparation sits at its line cap. */
export function linkRequesters(deps: {
  requestTerminalLinkAction: TerminalLinkActionRequester
  requestTerminalLinkPreview: TerminalLinkPreviewRequester
  leaveTerminalLinkPreview: (paneId: number) => void
}) {
  return {
    request: deps.requestTerminalLinkAction,
    requestPreview: deps.requestTerminalLinkPreview,
    leavePreview: deps.leaveTerminalLinkPreview
  }
}
