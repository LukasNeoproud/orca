import { diffArrays } from 'diff'

export type AzureDevOpsReviewTrackedLines = {
  startLine: number
  endLine: number
  /** At least one of the lines was rewritten, removed, or had lines inserted inside the range. */
  changed: boolean
}

/** Past this many differing lines the middle of the file counts as one rewritten block. */
const MAX_DIFFED_LINES = 20_000

type LineBlock = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  equal: boolean
}

// Why trimmed: re-indented code is still the code the comment was written about.
function comparable(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim())
}

function lineBlocks(before: readonly string[], after: readonly string[]): LineBlock[] {
  const oldLines = comparable(before)
  const newLines = comparable(after)
  const shortest = Math.min(oldLines.length, newLines.length)
  let prefix = 0
  while (prefix < shortest && oldLines[prefix] === newLines[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < shortest - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix)
  const newMiddle = newLines.slice(prefix, newLines.length - suffix)
  const parts =
    oldMiddle.length + newMiddle.length > MAX_DIFFED_LINES
      ? [
          { removed: true, added: false, count: oldMiddle.length },
          { removed: false, added: true, count: newMiddle.length }
        ]
      : diffArrays(oldMiddle, newMiddle).map((part) => ({
          removed: part.removed,
          added: part.added,
          count: part.value.length
        }))

  const blocks: LineBlock[] = [
    { oldStart: 0, oldCount: prefix, newStart: 0, newCount: prefix, equal: true }
  ]
  let oldIndex = prefix
  let newIndex = prefix
  for (const part of parts) {
    const last = blocks.at(-1)
    if (!part.removed && !part.added) {
      blocks.push({
        oldStart: oldIndex,
        oldCount: part.count,
        newStart: newIndex,
        newCount: part.count,
        equal: true
      })
      oldIndex += part.count
      newIndex += part.count
      continue
    }
    // A removal and the addition next to it are one rewritten block.
    const block =
      last && !last.equal
        ? last
        : { oldStart: oldIndex, oldCount: 0, newStart: newIndex, newCount: 0, equal: false }
    if (block !== last) {
      blocks.push(block)
    }
    if (part.removed) {
      block.oldCount += part.count
      oldIndex += part.count
    } else {
      block.newCount += part.count
      newIndex += part.count
    }
  }
  blocks.push({
    oldStart: oldIndex,
    oldCount: suffix,
    newStart: newIndex,
    newCount: suffix,
    equal: true
  })
  return blocks
}

/** A line this short (a brace, `else`) says too little to recognise the code by. */
const MIN_DISTINCTIVE_LINE_LENGTH = 8

function occurrences(lines: readonly string[], wanted: readonly string[]): number[] {
  const starts: number[] = []
  for (let start = 0; start + wanted.length <= lines.length && starts.length < 2; start += 1) {
    if (wanted.every((line, offset) => lines[start + offset] === line)) {
      starts.push(start)
    }
  }
  return starts
}

// Why: a line diff reads code moved past other code as removed here and added there.
function relocatedLines(
  before: readonly string[],
  after: readonly string[],
  first: number,
  last: number
): AzureDevOpsReviewTrackedLines | null {
  const wanted = comparable(before.slice(first, last + 1))
  if (!wanted.some((line) => line.length >= MIN_DISTINCTIVE_LINE_LENGTH)) {
    return null
  }
  const found = occurrences(comparable(after), wanted)
  // Unique on both sides, or the match could be a different copy of the same text.
  if (found.length !== 1 || occurrences(comparable(before), wanted).length !== 1) {
    return null
  }
  return { startLine: found[0] + 1, endLine: found[0] + wanted.length, changed: false }
}

/**
 * Where lines `startLine..endLine` (1-based) of `before` sit in `after`. A rewritten line maps
 * to the line that replaced it; null when every commented line was removed without a replacement.
 */
export function trackAzureDevOpsReviewLines(
  before: readonly string[],
  after: readonly string[],
  startLine: number,
  endLine: number
): AzureDevOpsReviewTrackedLines | null {
  const first = Math.max(1, startLine) - 1
  const last = Math.min(Math.max(startLine, endLine), before.length) - 1
  if (last < first) {
    return null
  }
  let changed = false
  let trackedStart: number | null = null
  let trackedEnd: number | null = null
  for (const block of lineBlocks(before, after)) {
    const from = Math.max(first, block.oldStart)
    const to = Math.min(last, block.oldStart + block.oldCount - 1)
    if (to < from) {
      continue
    }
    if (!block.equal) {
      changed = true
      if (block.newCount === 0) {
        continue
      }
    }
    const lastNew = block.newStart + block.newCount - 1
    const mappedFrom = Math.min(block.newStart + (from - block.oldStart), lastNew)
    const mappedTo = Math.min(block.newStart + (to - block.oldStart), lastNew)
    trackedStart ??= mappedFrom
    trackedEnd = mappedTo
  }
  if (trackedStart === null || trackedEnd === null) {
    return relocatedLines(before, after, first, last)
  }
  if (changed || trackedEnd - trackedStart !== last - first) {
    return (
      relocatedLines(before, after, first, last) ?? {
        startLine: trackedStart + 1,
        endLine: trackedEnd + 1,
        changed: true
      }
    )
  }
  return { startLine: trackedStart + 1, endLine: trackedEnd + 1, changed: false }
}

/** Splits file content the way Azure DevOps numbers its lines. */
export function azureDevOpsReviewContentLines(content: string): string[] {
  return content.split(/\r?\n/)
}
