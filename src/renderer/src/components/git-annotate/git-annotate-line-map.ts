import { diffArrays } from 'diff'
import type { GitBlameCommit, GitBlameResult } from '../../../../shared/git-blame'

/** What the gutter shows beside one editor line. */
export type GitAnnotatedLine = {
  /** Null for a line with no committed version: uncommitted in Git or changed since the blame. */
  commit: GitBlameCommit | null
  /** First line of a run of consecutive lines with the same commit. */
  groupStart: boolean
}

/** Past this many changed lines the middle of the file is shown as uncommitted without a diff. */
const MAX_DIFFED_LINES = 4000

function annotateSnapshot(
  blame: GitBlameResult,
  lineCount: number
): (GitBlameCommit | null | undefined)[] {
  const commits = new Map(blame.commits.map((commit) => [commit.id, commit]))
  // Undefined marks a line Git did not annotate, such as the empty line after a final newline.
  const lines: (GitBlameCommit | null | undefined)[] = Array.from({ length: lineCount })
  for (const range of blame.ranges) {
    const commit = range.commitId ? (commits.get(range.commitId) ?? null) : null
    for (let offset = 0; offset < range.lineCount; offset += 1) {
      const index = range.startLine - 1 + offset
      if (index < lineCount) {
        lines[index] = commit
      }
    }
  }
  return lines
}

/**
 * Carries a blame of `snapshotLines` over to `currentLines`: a line the edits left alone keeps
 * its commit, a changed or inserted line reads as uncommitted. Index 0 is line 1.
 */
export function mapGitBlameToLines(
  blame: GitBlameResult,
  snapshotLines: readonly string[],
  currentLines: readonly string[]
): (GitAnnotatedLine | null)[] {
  const snapshot = annotateSnapshot(blame, snapshotLines.length)
  const mapped: (GitBlameCommit | null | undefined)[] = []

  let prefix = 0
  const maxPrefix = Math.min(snapshotLines.length, currentLines.length)
  while (prefix < maxPrefix && snapshotLines[prefix] === currentLines[prefix]) {
    prefix += 1
  }
  let suffix = 0
  const maxSuffix = maxPrefix - prefix
  while (
    suffix < maxSuffix &&
    snapshotLines[snapshotLines.length - 1 - suffix] ===
      currentLines[currentLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  mapped.push(...snapshot.slice(0, prefix))
  const snapshotMiddle = snapshotLines.slice(prefix, snapshotLines.length - suffix)
  const currentMiddle = currentLines.slice(prefix, currentLines.length - suffix)
  if (snapshotMiddle.length + currentMiddle.length > MAX_DIFFED_LINES) {
    mapped.push(...currentMiddle.map(() => null))
  } else {
    let snapshotIndex = prefix
    for (const part of diffArrays(snapshotMiddle, currentMiddle)) {
      if (part.added) {
        mapped.push(...part.value.map(() => null))
      } else if (part.removed) {
        snapshotIndex += part.value.length
      } else {
        mapped.push(...snapshot.slice(snapshotIndex, snapshotIndex + part.value.length))
        snapshotIndex += part.value.length
      }
    }
  }
  mapped.push(...snapshot.slice(snapshotLines.length - suffix))

  return mapped.map((commit, index) => {
    if (commit === undefined) {
      return null
    }
    const previous = index > 0 ? mapped[index - 1] : undefined
    return { commit, groupStart: previous === undefined || previous?.id !== commit?.id }
  })
}
