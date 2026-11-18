/**
 * Path-only recognition of the reference images snapshot tests commit, so a
 * review can list them without per-project settings. Matched against the raw
 * path with anchored regexes, for the reasons in `test-code-path.ts`.
 */

export type SnapshotTestFramework = 'paparazzi' | 'roborazzi' | 'swift-snapshot-testing'

const SNAPSHOT_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp)$/i

// Roborazzi writes these next to a reference when a comparison fails; they are results, not baselines.
const ROBORAZZI_COMPARISON_OUTPUT = /_(?:actual|compare)\.[^./\\]+$/i

// The one place a framework's directory convention is listed. First match wins.
const SNAPSHOT_IMAGE_DIRECTORIES: readonly {
  framework: SnapshotTestFramework
  directory: RegExp
}[] = [
  // Paparazzi records into `<module>/src/test/snapshots/images/`.
  {
    framework: 'paparazzi',
    directory: /(?:^|[/\\])src[/\\][^/\\]+[/\\]snapshots[/\\]images[/\\]/i
  },
  // swift-snapshot-testing keeps `__Snapshots__/<TestFile>/` beside the test source.
  // Case-sensitive: lowercase `__snapshots__` is Jest's, which holds text.
  { framework: 'swift-snapshot-testing', directory: /(?:^|[/\\])__Snapshots__[/\\]/ },
  // Roborazzi has no fixed home: any `roborazzi` directory (its default
  // `build/outputs/roborazzi` when committed, `src/test/snapshots/roborazzi`),
  // or the `src/screenshots` its docs suggest, with or without a source set.
  {
    framework: 'roborazzi',
    directory: /(?:^|[/\\])(?:roborazzi|src[/\\](?:[^/\\]+[/\\])?screenshots)[/\\]/i
  }
]

/** Accepts POSIX and Windows separators — git reports `/`, callers may not. */
export function getSnapshotImageFramework(filePath: string): SnapshotTestFramework | null {
  if (!SNAPSHOT_IMAGE_EXTENSION.test(filePath)) {
    return null
  }
  for (const { framework, directory } of SNAPSHOT_IMAGE_DIRECTORIES) {
    if (directory.test(filePath)) {
      return framework === 'roborazzi' && ROBORAZZI_COMPARISON_OUTPUT.test(filePath)
        ? null
        : framework
    }
  }
  return null
}

export function isSnapshotImagePath(filePath: string): boolean {
  return getSnapshotImageFramework(filePath) !== null
}
