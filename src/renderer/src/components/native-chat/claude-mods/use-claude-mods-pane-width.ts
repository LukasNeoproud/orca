import { useState } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'

/** Claude Desktop's floor for a side tile. */
export const CLAUDE_MODS_PANE_MIN_WIDTH_PX = 280
/** The transcript keeps at least this beside a widened pane. */
const CHAT_MIN_WIDTH_PX = 320

// The width last dragged to, for every chat in this window, as Desktop remembers it per pane kind.
let rememberedWidth: number | null = null

export function claudeModsPaneWidth(dockWidth: number, chosen: number | null): number {
  const max = Math.max(CLAUDE_MODS_PANE_MIN_WIDTH_PX, dockWidth - CHAT_MIN_WIDTH_PX)
  // Unchosen, a pane starts at a third of the row, as Desktop's chat-2 : pane-1 split does.
  const wanted = chosen ?? Math.round(dockWidth / 3)
  return Math.min(max, Math.max(CLAUDE_MODS_PANE_MIN_WIDTH_PX, wanted))
}

/** The docked pane column's width and its drag handle's wiring; the column is `containerRef`. */
export function useClaudeModsPaneWidth(
  dockWidth: number,
  docked: boolean
): {
  width: number
  containerRef: React.RefObject<HTMLDivElement | null>
  isResizing: boolean
  onResizeStart: (event: React.MouseEvent) => void
} {
  const [chosen, setChosen] = useState(rememberedWidth)
  const width = claudeModsPaneWidth(dockWidth, chosen)
  const resize = useSidebarResize<HTMLDivElement>({
    isOpen: docked,
    width,
    minWidth: CLAUDE_MODS_PANE_MIN_WIDTH_PX,
    maxWidth: claudeModsPaneWidth(dockWidth, Number.POSITIVE_INFINITY),
    // The handle sits on the column's left edge: dragging left widens it.
    deltaSign: -1,
    setWidth: (next) => {
      rememberedWidth = next
      setChosen(next)
    }
  })
  return { width, ...resize }
}
