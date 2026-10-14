import { createContext, useContext, useSyncExternalStore } from 'react'
import { useClaudeModsPaneController } from './claude-mods-pane-surfaces'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

/** The chat's mods controller, provided by the pane dock around the transcript; null without mods. */
export const ClaudeModsControllerContext = createContext<ClaudeModsSurfaceController | null>(null)

export function useClaudeModsController(): ClaudeModsSurfaceController | null {
  return useContext(ClaudeModsControllerContext)
}

const noopSubscribe = (): (() => void) => () => {}

/**
 * The controller of the chat pane `paneKey` while its surface is attached. For what renders
 * outside the dock's provider, such as the question card, but is still a transcript site.
 */
export function useClaudeModsAttachedController(
  paneKey: string | undefined
): ClaudeModsSurfaceController | null {
  const controller = useClaudeModsPaneController(paneKey ?? '')
  const available = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    () => controller?.getSnapshot().available ?? false
  )
  return controller && available ? controller : null
}
