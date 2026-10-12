import type { TerminalDocumentScope } from './document-scope'
import { notify } from './host-notify'
import {
  buildMouseClickInput,
  getMouseTrackingMode,
  isClickMouseTrackingMode
} from './mouse-input-encoding'
import { oscLinkAtViewportPoint, resolveTerminalFileUrlTap } from './osc-link-tap'
import { filePathAtViewportPoint } from './path-tap'
import { fileUrlAtViewportPoint, urlAtViewportPoint } from './url-tap'

type TerminalLinkAtPoint =
  | { kind: 'file'; pathText: string; line: number | null; column: number | null }
  | { kind: 'web'; url: string }

function terminalLinkAtViewportPoint(
  scope: TerminalDocumentScope,
  originX: number,
  originY: number
): TerminalLinkAtPoint | null {
  const tappedOscLink = oscLinkAtViewportPoint(scope, originX, originY)
  if (tappedOscLink && tappedOscLink.kind === 'file') {
    return { kind: 'file', ...tappedOscLink.fileTap }
  }
  const tappedFileUrl = fileUrlAtViewportPoint(scope, originX, originY)
  const tappedFileUrlPath = tappedFileUrl ? resolveTerminalFileUrlTap(tappedFileUrl) : null
  if (tappedFileUrlPath) {
    return { kind: 'file', ...tappedFileUrlPath }
  }
  const tappedUrl =
    tappedOscLink && tappedOscLink.kind === 'url'
      ? tappedOscLink.url
      : urlAtViewportPoint(scope, originX, originY)
  if (tappedUrl) {
    return { kind: 'web', url: tappedUrl }
  }
  const tappedPath = filePathAtViewportPoint(scope, originX, originY)
  return tappedPath ? { kind: 'file', ...tappedPath } : null
}

/** Long press keeps the selection and also offers actions for the link under the finger. */
export function notifyTerminalLinkActionsAtViewportPoint(
  scope: TerminalDocumentScope,
  originX: number,
  originY: number
) {
  const target = terminalLinkAtViewportPoint(scope, originX, originY)
  if (!target) {
    return
  }
  notify(
    scope,
    target.kind === 'web'
      ? { type: 'link-actions', kind: 'web', url: target.url }
      : {
          type: 'link-actions',
          kind: 'file',
          pathText: target.pathText,
          line: target.line,
          column: target.column
        }
  )
}

export function notifyTerminalSurfaceTap(
  scope: TerminalDocumentScope,
  originX: number,
  originY: number,
  focusKeyboard: boolean
) {
  const target = terminalLinkAtViewportPoint(scope, originX, originY)
  if (target?.kind === 'file') {
    notify(scope, {
      type: 'terminal-file-tap',
      pathText: target.pathText,
      line: target.line,
      column: target.column
    })
    return
  }
  if (target?.kind === 'web') {
    notify(scope, { type: 'open-url', url: target.url })
    return
  }
  const clickInput = buildMouseClickInput(scope, originX, originY)
  if (clickInput) {
    notify(scope, { type: 'terminal-input', bytes: clickInput })
  }
  // Touch still needs native input focus after the TUI consumes its mouse click.
  // A click with an unproven encoding reached no program, so it acts as a plain tap.
  if (
    focusKeyboard ||
    !isClickMouseTrackingMode(getMouseTrackingMode(scope)) ||
    !scope.mouseEncodingKnown
  ) {
    notify(scope, { type: 'terminal-tap' })
  }
}
