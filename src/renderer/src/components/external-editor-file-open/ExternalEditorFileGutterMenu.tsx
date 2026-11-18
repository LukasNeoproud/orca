import React, { useEffect, useState } from 'react'
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import type { ExternalEditorFileTarget } from './external-editor-file-target'
import { ExternalEditorFileOpenMenuItems } from './ExternalEditorFileOpenMenuItems'
import { ExternalEditorFileUnavailableMenuItems } from './ExternalEditorFileUnavailableMenuItems'

function isInGutter(
  codeEditor: editor.ICodeEditor,
  domNode: HTMLElement,
  event: MouseEvent
): boolean {
  return (
    event.clientX < domNode.getBoundingClientRect().left + codeEditor.getLayoutInfo().contentLeft
  )
}

/** Line of the gutter row under the pointer, or null off the text lines. */
function getGutterLineAtPoint(
  codeEditor: editor.ICodeEditor,
  domNode: HTMLElement,
  event: MouseEvent
): number | null {
  const contentLeft = domNode.getBoundingClientRect().left + codeEditor.getLayoutInfo().contentLeft
  // Why: probe the text beside the gutter; the diff "+" button covers the line numbers
  // and Monaco reports no position for a press on it.
  const target = codeEditor.getTargetAtClientPoint(contentLeft + 1, event.clientY)
  if (!target?.position) {
    return null
  }
  if (target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
    return target.position.lineNumber
  }
  return target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY && !target.detail.isAfterLines
    ? target.position.lineNumber
    : null
}

type GutterMenuState = { x: number; y: number; line: number | null }

/**
 * Right-click on a diff gutter line: open that line of the workspace file in a native IDE.
 * Without a target, an `unavailableReason` turns the menu into an explanation.
 */
export function ExternalEditorFileGutterMenu({
  editor: codeEditor,
  target,
  unavailableReason
}: {
  editor: editor.ICodeEditor | null
  target: ExternalEditorFileTarget | null
  unavailableReason?: string | null
}): React.JSX.Element | null {
  const [menu, setMenu] = useState<GutterMenuState | null>(null)
  const hasTarget = target !== null
  const enabled = hasTarget || Boolean(unavailableReason)

  useEffect(() => {
    if (!codeEditor || !enabled) {
      return
    }
    const domNode = codeEditor.getDomNode()
    if (!domNode) {
      return
    }
    const onContextMenu = (event: MouseEvent): void => {
      if (!isInGutter(codeEditor, domNode, event)) {
        return
      }
      const line = getGutterLineAtPoint(codeEditor, domNode, event)
      // Why: the explanation needs no line, so it also shows over deleted-line zones.
      if (line === null && hasTarget) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
      setMenu({ x: event.clientX, y: event.clientY, line })
    }
    // Why capture: the menu must win before Monaco's own context-menu handling runs.
    domNode.addEventListener('contextmenu', onContextMenu, true)
    return () => domNode.removeEventListener('contextmenu', onContextMenu, true)
  }, [codeEditor, enabled, hasTarget])

  useEffect(() => {
    const closeMenu = (): void => setMenu(null)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  const content =
    menu && target && menu.line !== null ? (
      <ExternalEditorFileOpenMenuItems target={target} line={menu.line} />
    ) : menu && unavailableReason ? (
      <ExternalEditorFileUnavailableMenuItems reason={unavailableReason} />
    ) : null
  if (!menu || !content) {
    return null
  }
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          setMenu(null)
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed size-px opacity-0"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={0} align="start">
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
