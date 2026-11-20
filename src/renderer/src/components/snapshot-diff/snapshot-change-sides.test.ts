import { describe, expect, it } from 'vitest'
import { imagePixelDifference } from '../editor/image-pixel-difference'
import { findSnapshotChangeRegions } from './snapshot-change-regions'
import {
  SNAPSHOT_PIXEL_ADDED,
  SNAPSHOT_PIXEL_REMOVED,
  paintSnapshotChangeSides,
  splitSnapshotChangeSides
} from './snapshot-change-sides'

type Rgb = readonly [number, number, number]
type Rect = { x: number; y: number; width: number; height: number; color: Rgb }

const WIDTH = 160
const HEIGHT = 120
const PAPER: Rgb = [246, 246, 248]
const INK: Rgb = [40, 44, 52]
const CARD: Rgb = [30, 34, 60]
const WHITE: Rgb = [255, 255, 255]

function draw(background: Rgb, rects: readonly Rect[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    pixels.set([...background, 255], pixel * 4)
  }
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        pixels.set([...rect.color, 255], (y * WIDTH + x) * 4)
      }
    }
  }
  return pixels
}

/** Glyph-like strokes of one text line: 2 px wide, 3 px apart, of varying height. */
function textLine(x: number, y: number, color: Rgb): Rect[] {
  return Array.from({ length: 12 }, (_, index) => ({
    x: x + index * 5,
    y: y + (index % 3),
    width: 2,
    height: 10 - (index % 3),
    color
  }))
}

function split(original: Uint8ClampedArray, modified: Uint8ClampedArray) {
  const mask = new Uint8Array(WIDTH * HEIGHT)
  imagePixelDifference(original, modified, { changedMask: mask })
  const regions = findSnapshotChangeRegions(mask, WIDTH, HEIGHT)
  const counts = splitSnapshotChangeSides(
    { original, modified, width: WIDTH, height: HEIGHT },
    mask,
    regions
  )
  const sideAt = (x: number, y: number): number => mask[y * WIDTH + x]
  return { mask, counts, sideAt }
}

/** Pixels painted in `color` among `rects`, minus those also inside `except`. */
function coveredPixels(rects: readonly Rect[], except: readonly Rect[] = []): number {
  const inside = (list: readonly Rect[], x: number, y: number): boolean =>
    list.some(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
    )
  let count = 0
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (inside(rects, x, y) && !inside(except, x, y)) {
        count += 1
      }
    }
  }
  return count
}

describe('splitSnapshotChangeSides', () => {
  it('marks content that appears as added', () => {
    const badge: Rect = { x: 100, y: 20, width: 24, height: 16, color: INK }
    const { counts, sideAt } = split(draw(PAPER, []), draw(PAPER, [badge]))
    expect(counts).toEqual({ removedPixels: 0, addedPixels: 24 * 16 })
    expect(sideAt(110, 28)).toBe(SNAPSHOT_PIXEL_ADDED)
  })

  it('marks content that disappears as removed', () => {
    const badge: Rect = { x: 100, y: 20, width: 24, height: 16, color: INK }
    const { counts, sideAt } = split(draw(PAPER, [badge]), draw(PAPER, []))
    expect(counts).toEqual({ removedPixels: 24 * 16, addedPixels: 0 })
    expect(sideAt(110, 28)).toBe(SNAPSHOT_PIXEL_REMOVED)
  })

  it('splits moved text into its old place as removed and its new place as added', () => {
    const before = textLine(20, 40, INK)
    const after = textLine(21, 44, INK)
    const { counts, sideAt } = split(draw(PAPER, before), draw(PAPER, after))

    expect(counts).toEqual({
      removedPixels: coveredPixels(before, after),
      addedPixels: coveredPixels(after, before)
    })
    // Top of the first stroke: only the old line had ink there.
    expect(sideAt(20, 40)).toBe(SNAPSHOT_PIXEL_REMOVED)
    // Bottom of the first stroke in its new place.
    expect(sideAt(22, 53)).toBe(SNAPSHOT_PIXEL_ADDED)
    // Ink in both: unchanged.
    expect(sideAt(21, 45)).toBe(0)
  })

  it('takes the background of the changed area, so light text on a dark card splits the same way', () => {
    const card: Rect = { x: 10, y: 20, width: 140, height: 60, color: CARD }
    const before = textLine(30, 40, WHITE)
    const after = textLine(30, 48, WHITE)
    const { counts, sideAt } = split(draw(PAPER, [card, ...before]), draw(PAPER, [card, ...after]))

    expect(counts).toEqual({
      removedPixels: coveredPixels(before, after),
      addedPixels: coveredPixels(after, before)
    })
    expect(sideAt(30, 40)).toBe(SNAPSHOT_PIXEL_REMOVED)
    expect(sideAt(30, 57)).toBe(SNAPSHOT_PIXEL_ADDED)
  })

  it('shows content that changes colour in place as added, the new state', () => {
    const button = (color: Rgb): Rect => ({ x: 20, y: 70, width: 120, height: 30, color })
    const { counts, sideAt } = split(
      draw(PAPER, [button([38, 92, 190])]),
      draw(PAPER, [button([24, 140, 90])])
    )
    expect(counts).toEqual({ removedPixels: 0, addedPixels: 120 * 30 })
    expect(sideAt(80, 85)).toBe(SNAPSHOT_PIXEL_ADDED)
  })

  it('falls back to the old image for the background when nothing around an area stayed', () => {
    const { counts } = split(draw(PAPER, []), draw(INK, []))
    expect(counts).toEqual({ removedPixels: 0, addedPixels: WIDTH * HEIGHT })
  })

  it('leaves unchanged pixels alone', () => {
    const { mask, counts } = split(
      draw(PAPER, textLine(20, 40, INK)),
      draw(PAPER, textLine(20, 40, INK))
    )
    expect(counts).toEqual({ removedPixels: 0, addedPixels: 0 })
    expect(mask.every((side) => side === 0)).toBe(true)
  })
})

describe('paintSnapshotChangeSides', () => {
  it('paints each side in its colour and keeps unchanged pixels', () => {
    const pixels = new Uint8ClampedArray([9, 9, 9, 77, 0, 0, 0, 0, 0, 0, 0, 0])
    const mask = new Uint8Array([0, SNAPSHOT_PIXEL_REMOVED, SNAPSHOT_PIXEL_ADDED])
    paintSnapshotChangeSides(pixels, mask, {
      removedRgba: [173, 7, 7, 255],
      addedRgba: [88, 124, 12, 255]
    })
    expect(Array.from(pixels)).toEqual([9, 9, 9, 77, 173, 7, 7, 255, 88, 124, 12, 255])
  })
})
