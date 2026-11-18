import type { SnapshotChangeRegion } from './snapshot-change-regions'

export type SnapshotDiffRgba = readonly [number, number, number, number]

export type SnapshotDiffRequest = {
  mimeType: string
  /** Base64 image bytes, as the diff loaders return them. */
  originalContent: string
  modifiedContent: string
  /** Colour of a changed pixel, resolved from a theme token by the caller. */
  changedRgba: SnapshotDiffRgba
  maxPixels: number
}

export type SnapshotDiffResult =
  | {
      kind: 'ready'
      width: number
      height: number
      changedPixels: number
      regions: SnapshotChangeRegion[]
      /** Base64 PNG: changed pixels in the highlight colour over a faint new image. */
      highlightContent: string
      /** Base64 PNG: changed pixels as the new image shows them, the rest faint. */
      plainContent: string
    }
  | { kind: 'too-large'; width: number; height: number }

export type SnapshotDiffWorkerRequest = { id: number; request: SnapshotDiffRequest }

export type SnapshotDiffWorkerResponse =
  | { id: number; ok: true; result: SnapshotDiffResult }
  | { id: number; ok: false; error: string }
