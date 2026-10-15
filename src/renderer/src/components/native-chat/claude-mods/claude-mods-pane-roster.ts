import type { ClaudeModsPaneRoster } from '../../../../../shared/claude-mods-surface'
import { CLAUDE_MODS_BAND_ID, type ClaudeModsDrawing } from './claude-mods-surface-types'

/** The pane on screen: the roster's shown one, else its first, as Claude Desktop falls back. */
export function shownClaudeModsPaneId(roster: ClaudeModsPaneRoster): string | null {
  return roster.panes.some((pane) => pane.id === roster.shown_id)
    ? roster.shown_id
    : (roster.panes[0]?.id ?? null)
}

/** The drawings still worth keeping under `roster`: the band's and the open panes'. */
export function openClaudeModsDrawings(
  roster: ClaudeModsPaneRoster,
  drawings: Record<string, ClaudeModsDrawing>
): Record<string, ClaudeModsDrawing> {
  const open = new Set(roster.panes.map((pane) => pane.id))
  return Object.fromEntries(
    Object.entries(drawings).filter(([id]) => id === CLAUDE_MODS_BAND_ID || open.has(id))
  )
}
