import { createContext, useContext } from 'react'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

/** The chat's mods controller, provided by the pane dock around the transcript; null without mods. */
export const ClaudeModsControllerContext = createContext<ClaudeModsSurfaceController | null>(null)

export function useClaudeModsController(): ClaudeModsSurfaceController | null {
  return useContext(ClaudeModsControllerContext)
}
