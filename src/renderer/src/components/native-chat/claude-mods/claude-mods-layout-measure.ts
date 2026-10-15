// A site's layout as the engine counts it, read from the DOM that was last drawn: the window
// (offset, body rows), the whole content in rows, and where each keyed element sits.

import {
  claudeModsCellMetrics,
  claudeModsColumnsFitting,
  claudeModsRowAt,
  claudeModsRowContaining,
  claudeModsRowsCovering,
  claudeModsRowsFitting
} from './claude-mods-layout-metrics'

export type ClaudeModsKeyedRow = { plugin: string; key: string; top: number; bottom: number }

export type ClaudeModsSiteLayout = {
  offset: number
  bodyRows: number
  bodyColumns: number
  contentRows: number
  keyed: ClaudeModsKeyedRow[]
}

/** The wire takes at most this many; more would reject the whole request. */
export const MAX_CLAUDE_MODS_KEYED = 512
const MAX_KEYED_NAME = 256

// Stamped by the element renderer: keyed Boxes and controls carry key + owner; controls the ring
// can land on also carry `control`.
export const CLAUDE_MODS_KEY_ATTRIBUTE = 'data-claude-mods-key'
export const CLAUDE_MODS_OWNER_ATTRIBUTE = 'data-claude-mods-owner'
export const CLAUDE_MODS_CONTROL_ATTRIBUTE = 'data-claude-mods-control'

function paddingPx(style: CSSStyleDeclaration, side: 'Left' | 'Right'): number {
  return Number.parseFloat(style[`padding${side}`]) || 0
}

/** A scroll container's window and content in rows; keyed rows are counted from the content top. */
export function measureClaudeModsSite(
  container: HTMLElement,
  withKeyed = true
): ClaudeModsSiteLayout {
  const metrics = claudeModsCellMetrics(container)
  const style = getComputedStyle(container)
  const origin = container.getBoundingClientRect().top + container.clientTop - container.scrollTop
  const keyed: ClaudeModsKeyedRow[] = []
  const elements = withKeyed
    ? container.querySelectorAll<HTMLElement>(
        `[${CLAUDE_MODS_KEY_ATTRIBUTE}][${CLAUDE_MODS_OWNER_ATTRIBUTE}]`
      )
    : []
  for (const element of elements) {
    const key = element.getAttribute(CLAUDE_MODS_KEY_ATTRIBUTE)
    const plugin = element.getAttribute(CLAUDE_MODS_OWNER_ATTRIBUTE)
    const rect = element.getBoundingClientRect()
    // A display:none element has no box; it sits nowhere.
    if (
      !key ||
      !plugin ||
      key.length > MAX_KEYED_NAME ||
      plugin.length > MAX_KEYED_NAME ||
      (rect.width === 0 && rect.height === 0)
    ) {
      continue
    }
    const top = claudeModsRowContaining(rect.top - origin, metrics)
    const bottom = Math.max(top + 1, claudeModsRowsCovering(rect.bottom - origin, metrics))
    keyed.push({ plugin, key, top, bottom })
    if (keyed.length >= MAX_CLAUDE_MODS_KEYED) {
      break
    }
  }
  const bodyRows = claudeModsRowsFitting(container.clientHeight, metrics)
  // The engine's last offset is contentRows - bodyRows, so it must be the row the DOM's real
  // maximum scrollTop lands on; counting the two sides with different roundings overshoots it.
  const maxOffset = claudeModsRowAt(container.scrollHeight - container.clientHeight, metrics)
  return {
    offset: claudeModsRowAt(container.scrollTop, metrics),
    bodyRows,
    bodyColumns: claudeModsColumnsFitting(
      container.clientWidth - paddingPx(style, 'Left') - paddingPx(style, 'Right'),
      metrics
    ),
    contentRows: bodyRows + maxOffset,
    keyed
  }
}
