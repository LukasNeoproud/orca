import type { MobileDiffLine } from '../session/mobile-diff-lines'

export type ReviewExcerptRow<TLine extends MobileDiffLine = MobileDiffLine> =
  | { kind: 'line'; key: string; line: TLine }
  | { kind: 'gap'; key: string; hiddenLines: number }

const CONTEXT_LINES = 3

/**
 * The changed lines with a few lines of context, as Azure DevOps shows a file by default; runs of
 * unchanged lines collapse into gaps. Lines in `pinned` (by `side:number`) stay, so a thread on an
 * unchanged line is never hidden.
 */
export function azureDevOpsReviewDiffExcerpt<TLine extends MobileDiffLine>(
  lines: readonly TLine[],
  pinned: ReadonlySet<string> = new Set()
): ReviewExcerptRow<TLine>[] {
  const keep = Array.from({ length: lines.length }, () => false)
  lines.forEach((line, index) => {
    const isPinned =
      (line.newLineNumber !== undefined && pinned.has(`right:${line.newLineNumber}`)) ||
      (line.oldLineNumber !== undefined && pinned.has(`left:${line.oldLineNumber}`))
    if (line.kind === 'context' && !isPinned) {
      return
    }
    const from = Math.max(0, index - CONTEXT_LINES)
    const to = Math.min(lines.length - 1, index + CONTEXT_LINES)
    for (let kept = from; kept <= to; kept += 1) {
      keep[kept] = true
    }
  })
  const rows: ReviewExcerptRow<TLine>[] = []
  let hidden = 0
  lines.forEach((line, index) => {
    if (!keep[index]) {
      hidden += 1
      return
    }
    if (hidden > 0) {
      rows.push({ kind: 'gap', key: `gap:${index}`, hiddenLines: hidden })
      hidden = 0
    }
    rows.push({ kind: 'line', key: `line:${index}`, line })
  })
  if (hidden > 0) {
    rows.push({ kind: 'gap', key: 'gap:end', hiddenLines: hidden })
  }
  return rows
}
