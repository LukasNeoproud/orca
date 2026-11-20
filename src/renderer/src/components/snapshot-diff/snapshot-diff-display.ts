/** What the third pane shows: the pixel difference, or before and after blended. */
export type SnapshotDiffMode = 'difference' | 'blend'

/** How the snapshots are shown; kept while the reviewer moves between snapshots. */
export type SnapshotDiffDisplay = {
  mode: SnapshotDiffMode
  /** Difference only: changed pixels in the removed and added colours, with outlined areas. */
  highlight: boolean
  /** Blend only: opacity of the after image over the before image, 0 to 100. */
  afterPercent: number
}

export const DEFAULT_SNAPSHOT_DIFF_DISPLAY: SnapshotDiffDisplay = {
  mode: 'difference',
  highlight: true,
  afterPercent: 50
}
