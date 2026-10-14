// The one cell a mod's rows and columns are counted in: a monospace advance and line height
// derived from the site's font size, so everything a mod measures scales with the chat text.

export type ClaudeModsCellMetrics = { cellWidth: number; rowHeight: number }

const ADVANCE_PER_EM = 0.6
const LINE_HEIGHT_PER_EM = 1.4
/** Absorbs sub-pixel layout error so a row boundary does not flicker between two counts. */
const EPSILON = 0.01

export function claudeModsMetricsForFontSize(fontSize: number): ClaudeModsCellMetrics {
  return { cellWidth: fontSize * ADVANCE_PER_EM, rowHeight: fontSize * LINE_HEIGHT_PER_EM }
}

export function claudeModsCellMetrics(element: Element): ClaudeModsCellMetrics {
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 14
  return claudeModsMetricsForFontSize(fontSize)
}

/** Whole rows that fit in `px`. */
export function claudeModsRowsFitting(px: number, metrics: ClaudeModsCellMetrics): number {
  return Math.max(0, Math.floor(px / metrics.rowHeight + EPSILON))
}

/** Whole columns that fit in `px`. */
export function claudeModsColumnsFitting(px: number, metrics: ClaudeModsCellMetrics): number {
  return Math.max(0, Math.floor(px / metrics.cellWidth + EPSILON))
}

/** Rows a span of `px` touches, partial rows counting whole. */
export function claudeModsRowsCovering(px: number, metrics: ClaudeModsCellMetrics): number {
  return Math.max(0, Math.ceil(px / metrics.rowHeight - EPSILON))
}

/** The row a scroll position of `px` is at, nearest. */
export function claudeModsRowAt(px: number, metrics: ClaudeModsCellMetrics): number {
  return Math.max(0, Math.round(px / metrics.rowHeight))
}
