import type { IDisposable, Terminal } from '@xterm/xterm'
import type { LinkHandlerDeps } from './terminal-link-handlers'
import { openFilePathLinkAtBufferPosition } from './terminal-file-link-hit-testing'
import { isTerminalLinkDirectActivation } from './terminal-link-activation'
import { getTerminalBufferPositionForMouseEvent } from './terminal-mouse-buffer-position'

export function installFilePathLinkClickFallback(
  paneId: number,
  terminal: Terminal,
  deps: LinkHandlerDeps
): IDisposable {
  const mouseUpListenerOptions = { capture: true }
  const handleMouseUp = (event: MouseEvent): void => {
    if (!isTerminalLinkDirectActivation(event)) {
      return
    }

    const position = getTerminalBufferPositionForMouseEvent(terminal, event)
    if (!position) {
      return
    }
    const runtimeEnvironmentId =
      deps.getRuntimeEnvironmentIdForPane?.(paneId) ?? deps.runtimeEnvironmentId ?? null
    // Why: xterm can show a wrapped provider link as active while still missing
    // activation for the clicked wrapped row. Always retry file-path hit testing
    // on modifier mouseup; openDetectedFilePath coalesces duplicate opens.
    const opened = openFilePathLinkAtBufferPosition(
      terminal.buffer.active,
      position,
      terminal.cols,
      {
        startupCwd: deps.getPaneLinkCwd?.(paneId) ?? deps.startupCwd,
        terminalHomePath: deps.terminalHomePath,
        worktreeId: deps.worktreeId,
        worktreePath: deps.worktreePath,
        runtimeEnvironmentId,
        wslDistro: deps.wslDistro,
        terminalHandle: deps.getRuntimeTerminalHandleForPane?.(paneId) ?? null,
        pathExistsCache: deps.pathExistsCache,
        openWithSystemDefault: Boolean(event.shiftKey)
      }
    )
    if (opened) {
      event.preventDefault()
      event.stopPropagation()
      terminal.clearSelection()
    }
  }

  const terminalElement = terminal.element
  terminalElement?.addEventListener('mouseup', handleMouseUp, mouseUpListenerOptions)
  return {
    dispose: () => {
      terminalElement?.removeEventListener('mouseup', handleMouseUp, mouseUpListenerOptions)
    }
  }
}
