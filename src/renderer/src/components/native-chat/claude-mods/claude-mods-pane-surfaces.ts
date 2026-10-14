import { useSyncExternalStore } from 'react'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

// The pane dock owns a chat pane's controller; the band above the composer, a sibling outside
// the dock, finds it here by the chat pane's key.
const controllers = new Map<string, ClaudeModsSurfaceController>()
const listeners = new Set<() => void>()

export function publishClaudeModsController(
  paneKey: string,
  controller: ClaudeModsSurfaceController | null
): void {
  if (controller) {
    controllers.set(paneKey, controller)
  } else {
    controllers.delete(paneKey)
  }
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useClaudeModsPaneController(paneKey: string): ClaudeModsSurfaceController | null {
  return useSyncExternalStore(subscribe, () => controllers.get(paneKey) ?? null)
}
