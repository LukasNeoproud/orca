import type { ReviewCodeCitation, ReviewEvidenceCheck, ReviewLineRange } from './review-finding'

const MAX_ACTUAL_LINES = 12
const MAX_ACTUAL_CHARS = 1200

type ComparableLine = { text: string; lineNumber: number }

// Why: indentation, blank lines and line endings differ between a quote and the file without the
// code being different.
function comparableLines(lines: readonly string[], firstLineNumber: number): ComparableLine[] {
  const comparable: ComparableLine[] = []
  for (const [index, line] of lines.entries()) {
    const text = line.trim().replace(/\s+/g, ' ')
    if (text) {
      comparable.push({ text, lineNumber: firstLineNumber + index })
    }
  }
  return comparable
}

/** Every place where `needle` is a run of text in `lines`; a quote may start and end mid-line. */
function findQuote(
  lines: readonly ComparableLine[],
  needle: string,
  limit: number
): ReviewLineRange[] {
  const starts: number[] = []
  let text = ''
  for (const line of lines) {
    starts.push(text.length)
    text += `${line.text}\n`
  }
  const lineAt = (offset: number): number => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (starts[middle] <= offset) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return lines[low].lineNumber
  }
  const found: ReviewLineRange[] = []
  for (
    let offset = text.indexOf(needle);
    offset !== -1 && found.length < limit;
    offset = text.indexOf(needle, offset + 1)
  ) {
    found.push({ startLine: lineAt(offset), endLine: lineAt(offset + needle.length - 1) })
  }
  return found
}

function lineCount(lines: readonly string[]): number {
  // A file that ends with a newline splits into one more, empty, element.
  return lines.length > 0 && lines.at(-1) === '' ? lines.length - 1 : lines.length
}

/**
 * Compares a code citation with the file it quotes (`fileLines` is the whole file at the cited
 * commit). The quote counts when it is at the cited lines, or exactly once anywhere else in the
 * file: line numbers drift far more often than the code is made up.
 */
export function checkReviewCodeCitation(
  citation: ReviewCodeCitation,
  fileLines: readonly string[]
): ReviewEvidenceCheck {
  const needle = comparableLines(citation.quote.split(/\r?\n/), 1)
    .map((line) => line.text)
    .join('\n')
  const cited = fileLines.slice(citation.startLine - 1, citation.endLine)
  if (needle && findQuote(comparableLines(cited, citation.startLine), needle, 1).length > 0) {
    return { status: 'confirmed' }
  }
  const elsewhere = needle ? findQuote(comparableLines(fileLines, 1), needle, 2) : []
  if (elsewhere.length === 1) {
    return { status: 'confirmed', foundAt: elsewhere[0] }
  }
  if (citation.startLine > lineCount(fileLines)) {
    return { status: 'refuted', reason: 'lines-out-of-range' }
  }
  const actual = cited.slice(0, MAX_ACTUAL_LINES).join('\n').slice(0, MAX_ACTUAL_CHARS)
  return { status: 'refuted', reason: 'text-mismatch', actual }
}
