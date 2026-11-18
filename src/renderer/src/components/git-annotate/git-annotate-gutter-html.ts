import type { GitAnnotatedLine } from './git-annotate-line-map'

const MAX_AUTHOR_CHARS = 16
/** Short hash, a space, an ISO date and a space. */
const FIXED_CHARS = 7 + 1 + 10 + 1
export const GIT_ANNOTATE_COMMIT_ATTRIBUTE = 'data-git-annotate-commit'

export type GitAnnotateGutterLayout = {
  authorChars: number
  /** Monaco's `lineNumbersMinChars` for an annotation, a gap and the line number. */
  minChars: number
}

// Why: Monaco writes a custom line number into the gutter as HTML, and author names are repository data.
export function escapeGutterHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Local calendar date as YYYY-MM-DD, so every annotation is equally wide. */
export function formatGitAnnotateDate(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function clipAuthor(author: string, authorChars: number): string {
  const characters = Array.from(author)
  return characters.length > authorChars
    ? `${characters.slice(0, authorChars - 1).join('')}…`
    : author
}

export function computeGitAnnotateGutterLayout(
  lines: readonly (GitAnnotatedLine | null)[],
  uncommittedLabel: string
): GitAnnotateGutterLayout {
  let authorChars = 0
  let labelChars = 0
  for (const line of lines) {
    if (line?.commit) {
      authorChars = Math.max(authorChars, Array.from(line.commit.author).length)
    } else if (line) {
      labelChars = Array.from(uncommittedLabel).length
    }
  }
  authorChars = Math.min(MAX_AUTHOR_CHARS, authorChars)
  const annotationChars = Math.max(authorChars > 0 ? FIXED_CHARS + authorChars : 0, labelChars)
  const numberChars = Math.max(3, String(lines.length).length)
  return { authorChars, minChars: annotationChars + 2 + numberChars }
}

/** The gutter cell of one line: its annotation on the first line of a group, then the line number. */
export function renderGitAnnotateGutterLine(
  line: GitAnnotatedLine | null,
  lineNumber: number,
  layout: GitAnnotateGutterLayout,
  uncommittedLabel: string
): string {
  if (!line) {
    return `<span class="orca-git-annotate-row"><span></span><span>${lineNumber}</span></span>`
  }
  const commit = line.commit
  let text = ''
  if (line.groupStart) {
    text = commit
      ? `${commit.displayId} ${formatGitAnnotateDate(commit.timestamp)} ${clipAuthor(commit.author, layout.authorChars)}`
      : uncommittedLabel
  }
  const rowClass = line.groupStart
    ? 'orca-git-annotate-row orca-git-annotate-group-start'
    : 'orca-git-annotate-row'
  const cellClass = commit
    ? 'orca-git-annotate-cell orca-git-annotate-commit'
    : 'orca-git-annotate-cell'
  const commitAttribute = commit ? ` ${GIT_ANNOTATE_COMMIT_ATTRIBUTE}="${commit.id}"` : ''
  return (
    `<span class="${rowClass}"><span class="${cellClass}"${commitAttribute}>` +
    `${escapeGutterHtml(text)}</span><span>${lineNumber}</span></span>`
  )
}

/** Commit details for Monaco's gutter hover; every repository-controlled field is escaped. */
export function formatGitAnnotateHover(commit: NonNullable<GitAnnotatedLine['commit']>): string {
  const escape = (text: string): string => text.replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, '\\$&')
  const date = new Date(commit.timestamp).toLocaleString()
  return `**${escape(commit.subject)}**\n\n${escape(commit.author)} · ${escape(date)} · \`${commit.displayId}\``
}
