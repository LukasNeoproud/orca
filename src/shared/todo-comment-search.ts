import type { SearchFileResult, SearchMatch, SearchResult } from './code-search-types'

export const TODO_OVERVIEW_MAX_RESULTS = 1000

// Why: the marker must follow a comment opener (//, /*, #, <!--, --, or a `*` block line) so
// strings and identifiers such as "TODOS" stay out. Plain groups keep it valid for any rg dialect.
export const TODO_COMMENT_QUERY = '(//|/\\*|#|<!--|--|^[ \\t]*\\*)[ \\t]*(TODO|FIXME)\\b'

const MARKER_PATTERN = /TODO|FIXME/

/** Moves each match's highlight and reveal range from the whole comment opener to the marker itself. */
function focusMatchOnMarker(match: SearchMatch): SearchMatch {
  const displayStart = (match.displayColumn ?? match.column) - 1
  const displayLength = match.displayMatchLength ?? match.matchLength
  const matched = match.lineContent.slice(displayStart, displayStart + displayLength)
  const found = MARKER_PATTERN.exec(matched)
  if (!found) {
    return match
  }
  // The prefix before the marker is ASCII, so its length is the same in every column unit.
  const offset = found.index
  const markerLength = found[0].length
  return {
    ...match,
    column: match.column + offset,
    matchLength: markerLength,
    displayColumn: displayStart + 1 + offset,
    displayMatchLength: markerLength
  }
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Narrows a search result to TODO entries: keeps only files in `onlyPaths` when given, focuses
 * matches on the marker and enforces the overview's own cap even if an older host ignored it.
 */
export function toTodoOverviewResult(
  result: SearchResult,
  onlyPaths: ReadonlySet<string> | null
): SearchResult {
  const files: SearchFileResult[] = []
  let totalMatches = 0
  let truncated = result.truncated
  for (const file of result.files) {
    if (onlyPaths && !onlyPaths.has(normalizeRelativePath(file.relativePath))) {
      continue
    }
    const room = TODO_OVERVIEW_MAX_RESULTS - totalMatches
    if (room <= 0) {
      truncated = true
      break
    }
    const matches = file.matches.slice(0, room).map(focusMatchOnMarker)
    if (matches.length < file.matches.length) {
      truncated = true
    }
    totalMatches += matches.length
    files.push({ ...file, matches, matchCount: matches.length })
  }
  return { files, totalMatches, truncated }
}

const GLOB_META = /[\\*?[\]{},!]/

/**
 * Builds a root-anchored include pattern naming exactly `paths`, or null when a path would need
 * glob escaping (escapes differ on Windows rg) or the pattern fails `isWithinLimit`.
 */
export function buildChangedFilesIncludePattern(
  paths: readonly string[],
  isWithinLimit: (pattern: string) => boolean
): string | null {
  if (paths.length === 0) {
    return null
  }
  const globs: string[] = []
  for (const path of paths) {
    const normalized = normalizeRelativePath(path)
    if (!normalized || GLOB_META.test(normalized)) {
      return null
    }
    globs.push(`/${normalized}`)
  }
  const pattern = globs.join(',')
  return isWithinLimit(pattern) ? pattern : null
}
