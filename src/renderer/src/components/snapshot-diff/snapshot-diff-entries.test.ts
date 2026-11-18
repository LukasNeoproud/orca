import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewChange } from '../../../../shared/azure-devops-review-types'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import { snapshotEntriesOfAzureDevOpsChanges } from './azure-devops-snapshot-entries'
import { snapshotEntriesOfCombinedDiff } from './combined-diff-snapshot-entries'
import {
  snapshotImagesOfDiff,
  splitSnapshotPath,
  toSnapshotDiffEntry
} from './snapshot-diff-entries'

const PAPARAZZI = 'app/src/test/snapshots/images/com.example_PaymentTest_default.png'
const SWIFT = 'ShopTests/__Snapshots__/PaymentViewTests/testDefault.1.png'
const ROBORAZZI = 'app/src/screenshots/Cart.png'

describe('toSnapshotDiffEntry', () => {
  it('keeps a snapshot image and names its framework', () => {
    expect(toSnapshotDiffEntry({ key: 'k', path: PAPARAZZI, status: 'modified' })).toEqual({
      key: 'k',
      path: PAPARAZZI,
      status: 'modified',
      framework: 'paparazzi'
    })
  })

  it('drops every other changed file', () => {
    expect(toSnapshotDiffEntry({ key: 'k', path: 'app/src/main/Pay.kt', status: 'modified' })).toBe(
      null
    )
    expect(toSnapshotDiffEntry({ key: 'k', path: 'docs/home.png', status: 'added' })).toBeNull()
  })

  it('keeps a snapshot renamed out of its directory, by its old path', () => {
    expect(
      toSnapshotDiffEntry({ key: 'k', path: 'archive/old.png', oldPath: SWIFT, status: 'renamed' })
    ).toMatchObject({ framework: 'swift-snapshot-testing', oldPath: SWIFT })
  })
})

describe('snapshotImagesOfDiff', () => {
  it('returns both sides of an image diff', () => {
    expect(
      snapshotImagesOfDiff({
        kind: 'binary',
        originalContent: 'AAAA',
        modifiedContent: 'BBBB',
        isImage: true,
        mimeType: 'image/png',
        originalIsBinary: true,
        modifiedIsBinary: true
      })
    ).toEqual({ originalContent: 'AAAA', modifiedContent: 'BBBB', mimeType: 'image/png' })
  })

  it('has nothing to show for text, a binary without preview, a PDF or two empty sides', () => {
    const binary = { kind: 'binary', originalIsBinary: true, modifiedIsBinary: true } as const
    expect(
      snapshotImagesOfDiff({
        kind: 'text',
        originalContent: 'a',
        modifiedContent: 'b',
        originalIsBinary: false,
        modifiedIsBinary: false
      })
    ).toBeNull()
    expect(snapshotImagesOfDiff({ ...binary, originalContent: '', modifiedContent: '' })).toBeNull()
    expect(
      snapshotImagesOfDiff({
        ...binary,
        originalContent: 'AAAA',
        modifiedContent: 'BBBB',
        isImage: true,
        mimeType: 'application/pdf'
      })
    ).toBeNull()
    expect(
      snapshotImagesOfDiff({
        ...binary,
        originalContent: '',
        modifiedContent: '',
        isImage: true,
        mimeType: 'image/png'
      })
    ).toBeNull()
  })
})

describe('splitSnapshotPath', () => {
  it('splits on either separator and tolerates a bare name', () => {
    expect(splitSnapshotPath('a/b/c.png')).toEqual({ name: 'c.png', directory: 'a/b' })
    expect(splitSnapshotPath('a\\b\\c.png')).toEqual({ name: 'c.png', directory: 'a\\b' })
    expect(splitSnapshotPath('c.png')).toEqual({ name: 'c.png', directory: '' })
  })
})

describe('snapshotEntriesOfCombinedDiff', () => {
  const committed: GitBranchChangeEntry[] = [
    { path: 'app/src/main/Pay.kt', status: 'modified' },
    { path: PAPARAZZI, status: 'modified' },
    { path: SWIFT, status: 'added' },
    { path: ROBORAZZI, status: 'deleted' }
  ]

  it('lists changed, added and removed snapshots of a branch comparison', () => {
    const { entries, changeByKey } = snapshotEntriesOfCombinedDiff(committed, false)
    expect(entries.map((entry) => [entry.path, entry.status, entry.framework])).toEqual([
      [PAPARAZZI, 'modified', 'paparazzi'],
      [SWIFT, 'added', 'swift-snapshot-testing'],
      [ROBORAZZI, 'deleted', 'roborazzi']
    ])
    expect(entries.every((entry) => entry.uncommitted === undefined)).toBe(true)
    expect(changeByKey.get(entries[0].key)).toBe(committed[1])
  })

  it('keeps a snapshot that is both committed and edited since as two rows in All Changes', () => {
    const unstaged: GitStatusEntry = { path: PAPARAZZI, status: 'modified', area: 'unstaged' }
    const { entries, changeByKey } = snapshotEntriesOfCombinedDiff([unstaged, ...committed], true)
    const rows = entries.filter((entry) => entry.path === PAPARAZZI)
    expect(rows.map((entry) => entry.uncommitted ?? false)).toEqual([true, false])
    expect(new Set(rows.map((entry) => entry.key)).size).toBe(2)
    expect(changeByKey.get(rows[0].key)).toBe(unstaged)
  })
})

describe('snapshotEntriesOfAzureDevOpsChanges', () => {
  const change = (
    path: string,
    changeType: AzureDevOpsReviewChange['changeType'],
    originalPath: string | null = null
  ): AzureDevOpsReviewChange => ({ path, originalPath, changeType, changeTrackingId: null })

  it('lists the snapshot images of a pull request with their change kind', () => {
    const changes = [
      change('Shop/PaymentView.swift', 'edit'),
      change(SWIFT, 'edit'),
      change(PAPARAZZI, 'add'),
      change(ROBORAZZI, 'delete'),
      change('ShopTests/__Snapshots__/CartTests/testCart.1.png', 'rename', SWIFT)
    ]
    const { entries, changeByKey } = snapshotEntriesOfAzureDevOpsChanges(changes)
    expect(entries.map((entry) => [entry.path, entry.status])).toEqual([
      [SWIFT, 'modified'],
      [PAPARAZZI, 'added'],
      [ROBORAZZI, 'deleted'],
      ['ShopTests/__Snapshots__/CartTests/testCart.1.png', 'renamed']
    ])
    expect(entries[3].oldPath).toBe(SWIFT)
    expect(changeByKey.get(entries[1].key)).toBe(changes[2])
  })
})
