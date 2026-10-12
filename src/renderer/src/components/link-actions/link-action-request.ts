import type { HttpLinkAction } from '@/lib/http-link-destinations'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import type { ChatPreviewTarget } from '@/components/native-chat/link-preview/native-chat-preview-groups'

export type LinkActionKind = 'url' | 'file' | 'workspace' | 'terminal' | 'task'

export type LinkAction = HttpLinkAction

/** A pending destination choice for one clicked link, anchored at the pointer. */
export type LinkActionRequest = {
  anchorX: number
  anchorY: number
  destination: string
  kind: LinkActionKind
  primary: LinkAction
  alternate?: LinkAction
  /** Rows after primary/alternate that have no click shortcut. */
  secondaryActions?: readonly LinkAction[]
  preview?: { target: ChatPreviewTarget; runtimeContext?: RuntimeFileOperationArgs | null }
  transient?: boolean
  anchorElement?: HTMLElement
  pinOnClick?: boolean
  focusOnOpen?: boolean
  /** Hands focus back to the surface that owned the click (terminal, chat transcript). */
  restoreFocus: () => void
}

export function closeLinkActionRequest<T extends LinkActionRequest>(
  current: T | null,
  dismissed?: T
): T | null {
  return dismissed && current !== dismissed ? current : null
}
