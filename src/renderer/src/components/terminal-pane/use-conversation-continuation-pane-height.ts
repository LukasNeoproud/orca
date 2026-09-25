import { useLayoutEffect, type RefObject } from 'react'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'

export function useConversationContinuationPaneHeight(
  toolbarRef: RefObject<HTMLDivElement | null>,
  pane: ManagedPane,
  managerRef: RefObject<PaneManager | null>,
  isVisible: boolean,
  identity: string | null,
  onHeightChange: (paneId: number, height: number) => void
): void {
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) {
      return
    }
    const manager = managerRef.current
    let previousHeight = -1
    const measure = () => {
      const height = Math.ceil(toolbar.getBoundingClientRect().height)
      if (height === previousHeight) {
        return
      }
      previousHeight = height
      pane.container.style.setProperty('--orca-pane-continuation-height', `${height}px`)
      onHeightChange(pane.id, height)
      if (isVisible) {
        manager?.fitAllPanes()
      }
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(toolbar)
    return () => {
      observer?.disconnect()
      pane.container.style.removeProperty('--orca-pane-continuation-height')
      onHeightChange(pane.id, 0)
      if (isVisible) {
        manager?.fitAllPanes()
      }
    }
  }, [toolbarRef, pane.container, pane.id, managerRef, isVisible, identity, onHeightChange])
}
