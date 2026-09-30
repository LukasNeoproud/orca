import type { IBufferRange } from '@xterm/xterm'

export type TerminalCommentRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function terminalCommentSelectionRect({
  range,
  screen,
  cols,
  rows,
  viewportY
}: {
  range: IBufferRange
  screen: TerminalCommentRect
  cols: number
  rows: number
  viewportY: number
}): TerminalCommentRect | null {
  if (cols <= 0 || rows <= 0 || screen.width <= 0 || screen.height <= 0) {
    return null
  }
  const endRow = range.end.x === 0 ? range.end.y - 1 : range.end.y
  if (endRow < viewportY || range.start.y >= viewportY + rows) {
    return null
  }
  const row = Math.min(endRow - viewportY, rows - 1)
  const col = endRow >= viewportY + rows || range.end.x === 0 ? cols : range.end.x
  const cellHeight = screen.height / rows
  const right = screen.left + (Math.min(col, cols) / cols) * screen.width
  const top = screen.top + row * cellHeight
  return { left: right, right, top, bottom: top + cellHeight, width: 0, height: cellHeight }
}
