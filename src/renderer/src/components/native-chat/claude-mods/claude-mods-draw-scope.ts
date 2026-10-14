import { createContext, useContext } from 'react'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

export type ClaudeModsDrawScope = {
  controller: ClaudeModsSurfaceController
  instanceId: string
  /** Whether the site was opened asking for the keyboard; `autoFocus` honours only that. */
  focusRequested: boolean
}

export const ClaudeModsDrawContext = createContext<ClaudeModsDrawScope | null>(null)

export function useClaudeModsDrawScope(): ClaudeModsDrawScope | null {
  return useContext(ClaudeModsDrawContext)
}
