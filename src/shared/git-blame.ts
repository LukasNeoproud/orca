import { readGitCommandFailureText } from './git-command-failure-text'
import { shortGitHash } from './git-history-log-parser'

/** Editor content above either bound is not annotated; the host answers `too-large`. */
export const GIT_BLAME_MAX_CONTENT_LENGTH = 2 * 1024 * 1024
export const GIT_BLAME_MAX_LINES = 50_000

export type GitBlameCommit = {
  id: string
  displayId: string
  author: string
  authorEmail?: string
  /** Epoch milliseconds (author-time seconds × 1000). */
  timestamp: number
  subject: string
}

/** Consecutive lines last changed by one commit; `commitId` is null for lines not committed yet. */
export type GitBlameRange = {
  startLine: number
  lineCount: number
  commitId: string | null
}

export type GitBlameResult = {
  /** `untracked`: the path has no committed version. `too-large`: over the content bounds. */
  status: 'ready' | 'untracked' | 'too-large'
  ranges: GitBlameRange[]
  commits: GitBlameCommit[]
  /** Lines Git annotated; a trailing empty editor line is not one of them. */
  lineCount: number
}

export type GitBlameOptions = {
  relativePath: string
  /** The editor's text, saved or not; Git annotates this instead of the file on disk. */
  contents: string
}

export type GitBlameExecutor = (
  args: string[],
  cwd: string,
  stdin: string
) => Promise<{ stdout: string }>

const BLAME_HEADER = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/
const UNCOMMITTED_ID = /^0+$/

/** `--contents -` reads the text from stdin; both options predate Git 2.25. */
export function buildGitBlameArgs(relativePath: string): string[] {
  return ['blame', '--porcelain', '--contents', '-', '--', relativePath]
}

export function isGitBlameContentTooLarge(contents: string): boolean {
  if (contents.length > GIT_BLAME_MAX_CONTENT_LENGTH) {
    return true
  }
  let lines = 1
  for (
    let index = contents.indexOf('\n');
    index !== -1;
    index = contents.indexOf('\n', index + 1)
  ) {
    lines += 1
    if (lines > GIT_BLAME_MAX_LINES) {
      return true
    }
  }
  return false
}

/** A path Git has no committed version of, or a repository without a first commit. */
export function isGitBlameUntrackedPathError(error: unknown): boolean {
  const text = readGitCommandFailureText(error)
  return /fatal: no such path '.*' in HEAD/.test(text) || /fatal: no such ref: HEAD/.test(text)
}

export function parseGitBlamePorcelain(
  stdout: string
): Pick<GitBlameResult, 'ranges' | 'commits' | 'lineCount'> {
  const ranges: GitBlameRange[] = []
  const commits = new Map<string, GitBlameCommit>()
  let current: GitBlameCommit | null = null
  let lineCount = 0

  for (const line of stdout.split('\n')) {
    // Why first: every source line is tab-prefixed, so its text can never read as a header.
    if (line.charCodeAt(0) === 9 || line === '') {
      continue
    }
    const header = BLAME_HEADER.exec(line)
    if (header) {
      const [, id = '', finalLine = ''] = header
      const commitId = UNCOMMITTED_ID.test(id) ? null : id
      const lineNumber = Number(finalLine)
      lineCount = Math.max(lineCount, lineNumber)
      current = commitId ? (commits.get(commitId) ?? null) : null
      if (commitId && !current) {
        current = {
          id: commitId,
          displayId: shortGitHash(commitId),
          author: '',
          timestamp: 0,
          subject: ''
        }
        commits.set(commitId, current)
      }
      const last = ranges.at(-1)
      if (last && last.commitId === commitId && last.startLine + last.lineCount === lineNumber) {
        last.lineCount += 1
      } else {
        ranges.push({ startLine: lineNumber, lineCount: 1, commitId })
      }
      continue
    }
    if (!current) {
      continue
    }
    const separator = line.indexOf(' ')
    const key = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? '' : line.slice(separator + 1)
    if (key === 'author') {
      current.author = value
    } else if (key === 'author-mail') {
      current.authorEmail = value.replace(/^<|>$/g, '') || undefined
    } else if (key === 'author-time') {
      current.timestamp = Number(value) * 1000
    } else if (key === 'summary') {
      current.subject = value
    }
  }

  return { ranges, commits: [...commits.values()], lineCount }
}

export async function loadGitBlameFromExecutor(
  git: GitBlameExecutor,
  cwd: string,
  options: GitBlameOptions
): Promise<GitBlameResult> {
  if (isGitBlameContentTooLarge(options.contents)) {
    return { status: 'too-large', ranges: [], commits: [], lineCount: 0 }
  }
  try {
    const { stdout } = await git(buildGitBlameArgs(options.relativePath), cwd, options.contents)
    return { status: 'ready', ...parseGitBlamePorcelain(stdout) }
  } catch (error) {
    if (isGitBlameUntrackedPathError(error)) {
      return { status: 'untracked', ranges: [], commits: [], lineCount: 0 }
    }
    throw error
  }
}
