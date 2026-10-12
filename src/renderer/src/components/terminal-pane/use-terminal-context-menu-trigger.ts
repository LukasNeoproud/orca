import { useEffect, useRef, useState } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { TerminalPasteSource } from './terminal-paste-coordinator'
import { copyTerminalSelection } from './terminal-selection-copy'
import type { PaneCwdMap } from './resolve-split-cwd'
import type { PtyTransport } from './pty-transport'
import { useAppStore } from '@/store'
import { getConnectionId } from '@/lib/connection-context'
import { resolvePaneWslDistro } from './terminal-pane-wsl-distro'
import { resolveTerminalHttpLinkSourceOwner } from './terminal-http-link-source-owner'
import { getTerminalBufferPositionForMouseEvent } from './terminal-mouse-buffer-position'
import { findFilePathLinkAtBufferPosition } from './terminal-file-link-hit-testing'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'

type UseTerminalContextMenuTriggerDeps = {
  managerRef: React.RefObject<PaneManager | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  contextPaneIdRef: React.RefObject<number | null>
  rightClickToPaste: boolean
  pasteResolvedPane: (
    source: Extract<TerminalPasteSource, 'context-menu' | 'right-click'>
  ) => Promise<void>
  paneCwdRef: React.RefObject<PaneCwdMap>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  worktreeId: string
  fallbackCwd: string
}

type TerminalContextMenuTrigger = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  point: { x: number; y: number }
  filePath: { absolute: string; relative: string | null } | null
  menuOpenedAtRef: React.RefObject<number>
  onContextMenuCapture: (event: React.MouseEvent<HTMLDivElement>) => void
  onPaneTitleContextMenu: (event: React.MouseEvent<HTMLElement>, paneId: number) => void
}

export function useTerminalContextMenuTrigger({
  managerRef,
  containerRef,
  contextPaneIdRef,
  rightClickToPaste,
  pasteResolvedPane,
  paneCwdRef,
  paneTransportsRef,
  worktreeId,
  fallbackCwd
}: UseTerminalContextMenuTriggerDeps): TerminalContextMenuTrigger {
  const menuOpenedAtRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const [filePath, setFilePath] = useState<TerminalContextMenuTrigger['filePath']>(null)

  useEffect(() => {
    const closeMenu = (): void => {
      if (Date.now() - menuOpenedAtRef.current < 100) {
        return
      }
      setOpen(false)
    }
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  const openContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    clickedPaneId: number | null,
    boundsElement: HTMLElement
  ): void => {
    event.preventDefault()
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    const manager = managerRef.current
    if (!manager) {
      contextPaneIdRef.current = null
      return
    }
    const clickedPane =
      clickedPaneId !== null
        ? (manager.getPanes().find((pane) => pane.id === clickedPaneId) ?? null)
        : null
    contextPaneIdRef.current = clickedPane?.id ?? null
    setFilePath(null)

    // Why: when users opt into terminal-style right-click, a selection copies
    // and no selection pastes. Ctrl+right-click keeps the app menu reachable.
    if (rightClickToPaste && !event.ctrlKey) {
      event.stopPropagation()
      if (!clickedPane) {
        return
      }
      if (clickedPane.terminal.getSelection()) {
        void copyTerminalSelection({
          terminal: clickedPane.terminal,
          writeClipboardText: window.api.ui.writeTerminalClipboardText,
          clearSelectionOnSuccess: true
        }).catch(() => {
          /* ignore clipboard write failures */
        })
      } else {
        void pasteResolvedPane('right-click')
      }
      return
    }

    menuOpenedAtRef.current = Date.now()
    if (clickedPane && clickedPane.container.contains(event.target as Node)) {
      const position = getTerminalBufferPositionForMouseEvent(
        clickedPane.terminal,
        event.nativeEvent
      )
      if (position) {
        const state = useAppStore.getState()
        const worktreePath =
          state.allWorktrees().find((item) => item.id === worktreeId)?.path ?? fallbackCwd
        const owner = resolveTerminalHttpLinkSourceOwner(
          paneTransportsRef.current.get(clickedPane.id)
        )
        const runtimeEnvironmentId = owner.kind === 'runtime' ? owner.runtimeEnvironmentId : null
        const match = findFilePathLinkAtBufferPosition(
          clickedPane.terminal.buffer.active,
          position,
          clickedPane.terminal.cols,
          {
            startupCwd: paneCwdRef.current.get(clickedPane.id)?.cwd || fallbackCwd,
            worktreeId,
            worktreePath,
            runtimeEnvironmentId,
            wslDistro: getConnectionId(worktreeId)
              ? null
              : resolvePaneWslDistro(state, worktreeId, worktreePath)
          }
        )
        if (match) {
          const relative = toWorktreeRelativePath(match.absolutePath, worktreePath)
          setFilePath({
            absolute: match.absolutePath,
            relative: relative === '' ? '.' : relative
          })
        }
      }
    }
    const bounds = boundsElement.getBoundingClientRect()
    setPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    setOpen(true)
  }

  const onContextMenuCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    const manager = managerRef.current
    if (!manager) {
      event.preventDefault()
      contextPaneIdRef.current = null
      return
    }
    const target = event.target
    if (!(target instanceof Node)) {
      event.preventDefault()
      contextPaneIdRef.current = null
      return
    }
    const clickedPane = manager.getPanes().find((pane) => pane.container.contains(target)) ?? null
    openContextMenu(event, clickedPane?.id ?? null, event.currentTarget)
  }

  const onPaneTitleContextMenu = (event: React.MouseEvent<HTMLElement>, paneId: number): void => {
    const boundsElement = containerRef.current
    if (!boundsElement) {
      event.preventDefault()
      return
    }
    openContextMenu(event, paneId, boundsElement)
  }

  return {
    open,
    setOpen,
    point,
    filePath,
    menuOpenedAtRef,
    onContextMenuCapture,
    onPaneTitleContextMenu
  }
}
