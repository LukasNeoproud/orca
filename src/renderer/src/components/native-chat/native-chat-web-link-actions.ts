import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
// Chat shares the terminal's link-click vocabulary: plain click asks, modifier click opens.
import {
  isTerminalLinkActionActivation,
  isTerminalLinkDirectActivation
} from '@/components/terminal-pane/terminal-link-activation'
import type { TerminalLinkClickBehavior } from '@/components/terminal-pane/terminal-link-click-behavior'
import {
  buildHttpLinkActions,
  openRoutedHttpLink,
  type HttpLinkActionDestinations,
  type HttpLinkDestination
} from '@/lib/http-link-destinations'
import type { HttpLinkSourceOwner } from '@/lib/http-link-routing'

export type NativeChatWebLinkDeps = {
  worktreeId: string
  sourceOwner: HttpLinkSourceOwner
  destinations: HttpLinkActionDestinations
  /** Off: a plain click opens the routed destination outright, as it did before actions existed. */
  actionsEnabled: boolean
  plainClickBehavior?: TerminalLinkClickBehavior
  restoreFocus: () => void
  request: (request: LinkActionRequest) => void
}

type NativeChatWebLinkRequestDeps = Pick<
  NativeChatWebLinkDeps,
  'worktreeId' | 'sourceOwner' | 'destinations' | 'restoreFocus'
>

type ChatLinkMouseEvent = Pick<
  MouseEvent,
  'altKey' | 'clientX' | 'clientY' | 'ctrlKey' | 'metaKey' | 'shiftKey'
> & {
  detail?: number
  currentTarget?: Pick<HTMLElement, 'getBoundingClientRect'>
  button?: number
  preventDefault: () => void
}

function openNativeChatWebLink(
  url: string,
  deps: NativeChatWebLinkRequestDeps,
  destination: HttpLinkDestination | undefined
): void {
  openRoutedHttpLink(url, {
    worktreeId: deps.worktreeId,
    sourceOwner: deps.sourceOwner,
    modifierHeld: false,
    ...(destination ? { forceDestination: destination } : {})
  })
}

export function nativeChatWebLinkActionRequest(
  anchor: HTMLElement,
  url: string,
  deps: NativeChatWebLinkRequestDeps
): LinkActionRequest {
  const bounds = anchor.getBoundingClientRect()
  return {
    anchorX: bounds.left,
    anchorY: bounds.bottom,
    anchorElement: anchor,
    destination: url,
    kind: 'url',
    restoreFocus: deps.restoreFocus,
    ...buildHttpLinkActions(deps.destinations, (destination) =>
      openNativeChatWebLink(url, deps, destination)
    )
  }
}

/** Returns true when the click was consumed; false leaves the anchor's default. */
export function handleNativeChatWebLink(
  event: ChatLinkMouseEvent,
  url: string,
  deps: NativeChatWebLinkDeps
): boolean {
  const open = (destination: HttpLinkDestination | undefined): void =>
    openNativeChatWebLink(url, deps, destination)

  if (isTerminalLinkDirectActivation(event)) {
    event.preventDefault()
    open(
      event.shiftKey
        ? (deps.destinations.alternate ?? deps.destinations.primary)
        : deps.destinations.primary
    )
    return true
  }
  if (!isTerminalLinkActionActivation(event)) {
    return false
  }

  if (!deps.actionsEnabled) {
    if (deps.plainClickBehavior === 'none') {
      return false
    }
    event.preventDefault()
    open(deps.destinations.primary)
    return true
  }
  event.preventDefault()
  const keyboardAnchor = event.detail === 0 ? event.currentTarget?.getBoundingClientRect() : null
  const anchor = event.currentTarget
  if (anchor instanceof HTMLElement) {
    const request = nativeChatWebLinkActionRequest(anchor, url, deps)
    request.anchorX = keyboardAnchor?.left ?? event.clientX
    request.anchorY = keyboardAnchor?.bottom ?? event.clientY
    deps.request(request)
  } else {
    deps.request({
      anchorX: keyboardAnchor?.left ?? event.clientX,
      anchorY: keyboardAnchor?.bottom ?? event.clientY,
      destination: url,
      kind: 'url',
      restoreFocus: deps.restoreFocus,
      ...buildHttpLinkActions(deps.destinations, open)
    })
  }
  return true
}
