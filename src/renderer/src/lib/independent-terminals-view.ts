import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { OPEN_FLOATING_TERMINAL_EVENT } from './floating-terminal'

export const CLOSE_INDEPENDENT_TERMINALS_VIEW_EVENT = 'orca-close-independent-terminals-view'

// Marks the content area the independent terminals view docks over.
export const INDEPENDENT_TERMINALS_DOCK_ATTRIBUTE = 'data-independent-terminals-dock'

let viewOpen = false
const listeners = new Set<() => void>()

export function setIndependentTerminalsViewOpen(open: boolean): void {
  if (viewOpen === open) {
    return
  }
  viewOpen = open
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useIndependentTerminalsViewOpen(): boolean {
  return useSyncExternalStore(subscribe, () => viewOpen)
}

export function openIndependentTerminalsView(): void {
  const store = useAppStore.getState()
  // Why: the view docks over the workbench, so a page (settings, tasks…) must yield first.
  if (store.activeView !== 'terminal') {
    store.setActiveView('terminal')
  }
  window.dispatchEvent(new Event(OPEN_FLOATING_TERMINAL_EVENT))
}

export function closeIndependentTerminalsView(): void {
  // Why: activation also runs in non-DOM test and SSR environments.
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }
  window.dispatchEvent(new Event(CLOSE_INDEPENDENT_TERMINALS_VIEW_EVENT))
}
