import type { Terminal } from '@xterm/xterm'
import { installPreviewTerminalAppMenuClipboard } from './preview-terminal-app-menu-clipboard'
import { installPreviewTerminalRightClickPaste } from './preview-terminal-right-click-paste'
import type { PreviewTerminalPasteSource } from './preview-terminal-paste'

// Read-only previews never paste, so they skip both clipboard surfaces.
export function installPreviewTerminalClipboard(args: {
  readOnly: boolean
  container: HTMLElement
  getTerminal: () => Terminal | null
  isRightClickToPasteEnabled: () => boolean
  pasteClipboardText: (
    activeElementAtDispatch: Element | null,
    source: PreviewTerminalPasteSource
  ) => void
}): () => void {
  if (args.readOnly) {
    return () => {}
  }
  const disposeAppMenuClipboard = installPreviewTerminalAppMenuClipboard(args)
  const disposeRightClickPaste = installPreviewTerminalRightClickPaste(args)
  return () => {
    disposeAppMenuClipboard()
    disposeRightClickPaste()
  }
}
