import { describe, expect, it } from 'vitest'
import { terminalCommentSelectionRect } from './terminal-comment-selection'

const viewport = {
  screen: { left: 100, top: 200, right: 900, bottom: 600, width: 800, height: 400 },
  cols: 80,
  rows: 20,
  viewportY: 50
}

describe('terminal comment selection anchor', () => {
  it('uses buffer rows relative to the scrolled viewport', () => {
    expect(
      terminalCommentSelectionRect({
        ...viewport,
        range: { start: { x: 2, y: 51 }, end: { x: 12, y: 52 } }
      })
    ).toEqual({ left: 220, right: 220, top: 240, bottom: 260, width: 0, height: 20 })
  })

  it('anchors a selection ending at the next line start to the preceding row', () => {
    expect(
      terminalCommentSelectionRect({
        ...viewport,
        range: { start: { x: 0, y: 51 }, end: { x: 0, y: 53 } }
      })
    ).toEqual({ left: 900, right: 900, top: 240, bottom: 260, width: 0, height: 20 })
  })

  it('uses the last visible row for a partially visible selection', () => {
    expect(
      terminalCommentSelectionRect({
        ...viewport,
        range: { start: { x: 0, y: 60 }, end: { x: 5, y: 90 } }
      })?.bottom
    ).toBe(600)
  })

  it('hides an off-screen selection or an unmeasured terminal', () => {
    for (const [start, end] of [
      [0, 20],
      [71, 80]
    ]) {
      expect(
        terminalCommentSelectionRect({
          ...viewport,
          range: { start: { x: 0, y: start }, end: { x: 2, y: end } }
        })
      ).toBeNull()
    }
    expect(
      terminalCommentSelectionRect({
        ...viewport,
        cols: 0,
        range: { start: { x: 0, y: 51 }, end: { x: 1, y: 52 } }
      })
    ).toBeNull()
  })
})
