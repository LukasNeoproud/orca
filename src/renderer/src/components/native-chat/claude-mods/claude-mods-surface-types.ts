import type {
  ClaudeModsPaneRoster,
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent,
  ClaudeModsUnavailableReason
} from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsNode } from './claude-mods-tree'

export const CLAUDE_MODS_BAND_ID = 'above-prompt'

export type ClaudeModsComponent = 'Pane' | 'AbovePrompt'

export type ClaudeModsViewport = { columns: number; rows: number; isFullscreen?: boolean }

export type ClaudeModsDrawing = {
  tree: ClaudeModsNode
  hooked: boolean
  drawnBy: string[]
  /** Each plugin's surface-module hash for the `Client` nodes the tree carries. */
  clientModules?: Record<string, string>
}

export type ClaudeModsSnapshot = {
  available: boolean
  reason?: ClaudeModsUnavailableReason
  roster: ClaudeModsPaneRoster
  statuses: Record<string, string>
  drawings: Record<string, ClaudeModsDrawing>
}

export type ClaudeModsTransport = {
  request: (subtype: ClaudeModsRequestSubtype, fields: Record<string, unknown>) => Promise<unknown>
  subscribe: (handlers: {
    onEvent: (event: ClaudeModsSurfaceEvent) => void
    onError: (error: unknown) => void
    onClose: () => void
  }) => Promise<{ unsubscribe: () => void }>
}
