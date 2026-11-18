import type { GitDiffResult } from '../../../../shared/git-diff-compare-types'
import type { GitFileStatus } from '../../../../shared/git-status-types'
import {
  getSnapshotImageFramework,
  type SnapshotTestFramework
} from '../../../../shared/snapshot-image-path'

/** One changed snapshot image, whichever diff it came from. */
export type SnapshotDiffEntry = {
  key: string
  path: string
  oldPath?: string
  status: GitFileStatus
  framework: SnapshotTestFramework
  /** Set where one list mixes working-tree and committed changes. */
  uncommitted?: boolean
}

export type SnapshotDiffImages = {
  /** Base64 image bytes; empty for a side that does not exist. */
  originalContent: string
  modifiedContent: string
  mimeType: string
}

export const SNAPSHOT_FRAMEWORK_NAMES: Record<SnapshotTestFramework, string> = {
  paparazzi: 'Paparazzi',
  roborazzi: 'Roborazzi',
  'swift-snapshot-testing': 'swift-snapshot-testing'
}

/** The entry for a changed file, or null when it is not a snapshot image. */
export function toSnapshotDiffEntry(change: {
  key: string
  path: string
  oldPath?: string | null
  status: GitFileStatus
  uncommitted?: boolean
}): SnapshotDiffEntry | null {
  // Why the old path too: a snapshot moved out of its directory is still a removed baseline.
  const framework =
    getSnapshotImageFramework(change.path) ??
    (change.oldPath ? getSnapshotImageFramework(change.oldPath) : null)
  if (!framework) {
    return null
  }
  return {
    key: change.key,
    path: change.path,
    status: change.status,
    framework,
    ...(change.oldPath ? { oldPath: change.oldPath } : {}),
    ...(change.uncommitted ? { uncommitted: true } : {})
  }
}

/** Both sides of an image diff, or null when the loader could not return a previewable image. */
export function snapshotImagesOfDiff(result: GitDiffResult): SnapshotDiffImages | null {
  if (result.kind !== 'binary' || !result.isImage || !result.mimeType?.startsWith('image/')) {
    return null
  }
  if (!result.originalContent && !result.modifiedContent) {
    return null
  }
  return {
    originalContent: result.originalContent,
    modifiedContent: result.modifiedContent,
    mimeType: result.mimeType
  }
}

export function splitSnapshotPath(filePath: string): { name: string; directory: string } {
  const separator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return separator < 0
    ? { name: filePath, directory: '' }
    : { name: filePath.slice(separator + 1), directory: filePath.slice(0, separator) }
}
