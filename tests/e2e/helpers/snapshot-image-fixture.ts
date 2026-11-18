import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/** Invented screens of an invented shop app, drawn here so no real project image enters the repo. */

type Rgb = readonly [number, number, number]
type Rect = { x: number; y: number; width: number; height: number; color: Rgb }

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

/** An 8-bit RGB PNG of a flat background with rectangles painted in order. */
export function drawSnapshotPng(
  width: number,
  height: number,
  background: Rgb,
  rects: readonly Rect[]
): Buffer {
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * stride + 1
    for (let x = 0; x < width; x += 1) {
      raw.set(background, row + x * 3)
    }
  }
  for (const rect of rects) {
    for (let y = rect.y; y < Math.min(height, rect.y + rect.height); y += 1) {
      const row = y * stride + 1
      for (let x = rect.x; x < Math.min(width, rect.x + rect.width); x += 1) {
        raw.set(rect.color, row + x * 3)
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const PAPER: Rgb = [246, 246, 248]
const INK: Rgb = [40, 44, 52]
const MUTED: Rgb = [176, 180, 190]
const BRAND: Rgb = [38, 92, 190]
const WHITE: Rgb = [255, 255, 255]

function paymentScreen(version: 'before' | 'after'): Buffer {
  const after = version === 'after'
  return drawSnapshotPng(360, 640, PAPER, [
    { x: 0, y: 0, width: 360, height: 56, color: BRAND },
    { x: 20, y: 20, width: 120, height: 16, color: WHITE },
    // Area 1 of the change: a badge appears in the header.
    ...(after ? [{ x: 304, y: 16, width: 28, height: 24, color: WHITE }] : []),
    { x: 20, y: 96, width: 320, height: 120, color: WHITE },
    { x: 36, y: 116, width: 180, height: 14, color: INK },
    { x: 36, y: 144, width: 240, height: 10, color: MUTED },
    { x: 36, y: 164, width: 200, height: 10, color: MUTED },
    // Area 2: the amount line gets longer.
    { x: 20, y: 280, width: after ? 230 : 150, height: 14, color: INK },
    { x: 20, y: 310, width: 280, height: 10, color: MUTED },
    // Area 3: the button changes colour.
    { x: 40, y: 540, width: 280, height: 48, color: after ? [24, 140, 90] : BRAND },
    { x: 140, y: 558, width: 80, height: 12, color: WHITE }
  ])
}

function listScreen(accent: Rgb): Buffer {
  return drawSnapshotPng(360, 640, PAPER, [
    { x: 0, y: 0, width: 360, height: 56, color: accent },
    ...[0, 1, 2, 3].flatMap((row): Rect[] => [
      { x: 20, y: 88 + row * 72, width: 48, height: 48, color: MUTED },
      { x: 84, y: 96 + row * 72, width: 200, height: 12, color: INK },
      { x: 84, y: 118 + row * 72, width: 140, height: 10, color: MUTED }
    ])
  ])
}

// 8.4 megapixels: above the view's 8 megapixel limit, yet a few kilobytes once deflated.
function tabletScreen(version: 'before' | 'after'): Buffer {
  return drawSnapshotPng(4000, 2100, PAPER, [
    { x: 0, y: 0, width: 4000, height: 120, color: BRAND },
    { x: 200, y: 400, width: version === 'after' ? 1800 : 1200, height: 600, color: WHITE }
  ])
}

/** The same screens as bytes, for a source that serves them instead of committing them. */
export function snapshotFixtureImages(): Record<
  'changedBefore' | 'changedAfter' | 'added' | 'removed',
  Buffer
> {
  return {
    changedBefore: paymentScreen('before'),
    changedAfter: paymentScreen('after'),
    added: listScreen([24, 140, 90]),
    removed: listScreen(BRAND)
  }
}

export const SNAPSHOT_FIXTURE_PATHS = {
  changed: 'app/src/test/snapshots/images/com.example.shop_PaymentScreenTest_default.png',
  tooLarge: 'app/src/test/snapshots/images/com.example.shop_TabletCatalogTest_wide.png',
  added: 'ShopTests/__Snapshots__/CartViewTests/testEmptyCart.1.png',
  removed: 'app/src/test/roborazzi/ProfileScreen.png',
  // Changed images that are not snapshots and must stay out of the view.
  unrelatedImage: 'docs/images/store-listing.png',
  source: 'app/src/main/PaymentScreen.kt'
} as const

function write(worktreePath: string, relativePath: string, content: Buffer | string): void {
  const target = path.join(worktreePath, ...relativePath.split('/'))
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function git(worktreePath: string, args: string[]): void {
  execFileSync('git', args, { cwd: worktreePath, stdio: 'pipe' })
}

/**
 * Commits a base with the earlier snapshots, marks it with `baseBranch`, then commits a change
 * that edits two snapshots, adds one and removes one.
 */
export function commitSnapshotFixture(worktreePath: string, baseBranch: string): void {
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.changed, paymentScreen('before'))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.tooLarge, tabletScreen('before'))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.removed, listScreen(BRAND))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.source, 'val payLabel = "Pay"\n')
  git(worktreePath, ['add', '-A'])
  git(worktreePath, ['commit', '-m', 'Add shop screens with snapshots'])
  git(worktreePath, ['branch', baseBranch])

  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.changed, paymentScreen('after'))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.tooLarge, tabletScreen('after'))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.added, listScreen([24, 140, 90]))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.unrelatedImage, listScreen(INK))
  write(worktreePath, SNAPSHOT_FIXTURE_PATHS.source, 'val payLabel = "Pay now"\n')
  rmSync(path.join(worktreePath, ...SNAPSHOT_FIXTURE_PATHS.removed.split('/')))
  git(worktreePath, ['add', '-A'])
  git(worktreePath, ['commit', '-m', 'Restyle the payment screen'])
}
