import { readGitCommandFailureText } from './git-command-failure-text'
import { shortGitHash } from './git-history-log-parser'
import type { GitHistoryItem } from './git-history-types'

export const GIT_LINE_HISTORY_DEFAULT_LIMIT = 50
export const GIT_LINE_HISTORY_MAX_LIMIT = 200
/** Lines of one commit's block change sent to the client; longer changes are cut. */
export const GIT_LINE_HISTORY_MAX_PATCH_LINES = 400
/** A wider selection is a file history, which the commit list already offers. */
export const GIT_LINE_HISTORY_MAX_SELECTED_LINES = 5000

/** A commit that changed the block, with the hunks of that change. */
export type GitLineHistoryItem = GitHistoryItem & {
  patch: string
  patchTruncated?: boolean
}

export type GitLineRange = { startLine: number; endLine: number }

export type GitLineHistoryResult = {
  /**
   * `uncommitted`: every selected line is new in the working tree. `untracked`: the path has no
   * committed version. `no-commits`: the repository has no first commit.
   */
  status: 'ready' | 'uncommitted' | 'untracked' | 'no-commits'
  items: GitLineHistoryItem[]
  hasMore: boolean
  limit: number
  /** The selection's lines in HEAD, which is where the history starts. */
  headRange?: GitLineRange
}

export type GitLineHistoryOptions = GitLineRange & {
  relativePath: string
  limit?: number
}

export type GitLineHistoryExecutor = (args: string[], cwd: string) => Promise<{ stdout: string }>

const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'
// Why a leading record separator: a patch line always starts with ' ', '+', '-', '@' or a header word.
const LINE_HISTORY_FORMAT = `%x1e%H%x1f%aN%x1f%aE%x1f%at%x1f%B%x1f`
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return GIT_LINE_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(
    GIT_LINE_HISTORY_MAX_LIMIT,
    Math.max(1, Math.trunc(limit ?? GIT_LINE_HISTORY_DEFAULT_LIMIT))
  )
}

/** `-L` implies a patch; `--no-patch` does not silence it before Git 2.42, so the patch is parsed. */
export function buildGitLineHistoryArgs(
  relativePath: string,
  range: GitLineRange,
  limit: number,
  revision: string
): string[] {
  return [
    'log',
    '--no-show-signature',
    '--no-color',
    `--format=${LINE_HISTORY_FORMAT}`,
    `-n${limit + 1}`,
    `-L${range.startLine},${range.endLine}:${relativePath}`,
    revision
  ]
}

/**
 * Maps working-tree lines to the lines of the compared revision from a `git diff -U0` of one
 * file. Null when every selected line was added in the working tree.
 */
export function mapWorktreeLinesToRevision(
  diffStdout: string,
  range: GitLineRange
): GitLineRange | null {
  let mapped: GitLineRange | null = null
  const include = (startLine: number, endLine: number): void => {
    mapped = mapped
      ? {
          startLine: Math.min(mapped.startLine, startLine),
          endLine: Math.max(mapped.endLine, endLine)
        }
      : { startLine, endLine }
  }
  const includeUnchanged = (workStart: number, workEnd: number, revisionStart: number): void => {
    const start = Math.max(workStart, range.startLine)
    const end = Math.min(workEnd, range.endLine)
    if (start <= end) {
      include(revisionStart + start - workStart, revisionStart + end - workStart)
    }
  }

  let workLine = 1
  let revisionLine = 1
  for (const line of diffStdout.split('\n')) {
    const hunk = HUNK_HEADER.exec(line)
    if (!hunk) {
      continue
    }
    const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2])
    const newCount = hunk[4] === undefined ? 1 : Number(hunk[4])
    // Why +1: an empty side names the line before the change, not its first line.
    const oldStart = Number(hunk[1]) + (oldCount === 0 ? 1 : 0)
    const newStart = Number(hunk[3]) + (newCount === 0 ? 1 : 0)
    includeUnchanged(workLine, newStart - 1, revisionLine)
    const touchesSelection =
      newCount > 0 && newStart <= range.endLine && newStart + newCount - 1 >= range.startLine
    if (touchesSelection && oldCount > 0) {
      include(oldStart, oldStart + oldCount - 1)
    }
    workLine = newStart + newCount
    revisionLine = oldStart + oldCount
  }
  includeUnchanged(workLine, Number.MAX_SAFE_INTEGER, revisionLine)
  return mapped
}

function extractHunks(rawPatch: string): { patch: string; patchTruncated: boolean } {
  const lines = rawPatch.split('\n')
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'))
  if (firstHunk === -1) {
    return { patch: '', patchTruncated: false }
  }
  const hunkLines = lines.slice(firstHunk)
  while (hunkLines.at(-1) === '') {
    hunkLines.pop()
  }
  const patchTruncated = hunkLines.length > GIT_LINE_HISTORY_MAX_PATCH_LINES
  return {
    patch: hunkLines.slice(0, GIT_LINE_HISTORY_MAX_PATCH_LINES).join('\n'),
    patchTruncated
  }
}

export function parseGitLineHistoryLog(stdout: string): GitLineHistoryItem[] {
  const items: GitLineHistoryItem[] = []
  for (const record of stdout.split(new RegExp(`^${RECORD_SEPARATOR}`, 'm'))) {
    const [id = '', author = '', authorEmail = '', authorTime = '', message = '', ...patchParts] =
      record.split(FIELD_SEPARATOR)
    if (!/^[0-9a-f]{40,64}$/.test(id)) {
      continue
    }
    const trimmedMessage = message.trim()
    const { patch, patchTruncated } = extractHunks(patchParts.join(FIELD_SEPARATOR))
    items.push({
      id,
      parentIds: [],
      displayId: shortGitHash(id),
      subject: trimmedMessage.split(/\r?\n/, 1)[0]?.trim() || '(no commit message)',
      message: trimmedMessage,
      author,
      authorEmail,
      timestamp: Number(authorTime) * 1000,
      patch,
      ...(patchTruncated ? { patchTruncated } : {})
    })
  }
  return items
}

/** The path has no version in the revision the history starts from. */
export function isGitLineHistoryMissingPathError(error: unknown): boolean {
  return /fatal: There is no path .* in the commit/.test(readGitCommandFailureText(error))
}

/** Git's refusal of a range starting past the end of the file, with the file's line count. */
export function readGitLineHistoryFileLineCount(error: unknown): number | null {
  const match = /fatal: file .* has only (\d+) lines?/.exec(readGitCommandFailureText(error))
  return match ? Number(match[1]) : null
}

async function resolveHead(git: GitLineHistoryExecutor, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await git(
      ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'],
      cwd
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function loadGitLineHistoryFromExecutor(
  git: GitLineHistoryExecutor,
  cwd: string,
  options: GitLineHistoryOptions
): Promise<GitLineHistoryResult> {
  const limit = clampLimit(options.limit)
  const startLine = Math.max(1, Math.trunc(options.startLine))
  const endLine = Math.min(
    Math.max(startLine, Math.trunc(options.endLine)),
    startLine + GIT_LINE_HISTORY_MAX_SELECTED_LINES - 1
  )
  const empty = { items: [], hasMore: false, limit }
  const head = await resolveHead(git, cwd)
  if (!head) {
    return { status: 'no-commits', ...empty }
  }

  // Why the resolved commit: the diff and the log must describe the same revision.
  const { stdout: diffStdout } = await git(
    [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '-U0',
      head,
      '--',
      options.relativePath
    ],
    cwd
  )
  let headRange = mapWorktreeLinesToRevision(diffStdout, { startLine, endLine })
  if (!headRange) {
    return { status: 'uncommitted', ...empty }
  }

  let stdout: string
  try {
    stdout = (await git(buildGitLineHistoryArgs(options.relativePath, headRange, limit, head), cwd))
      .stdout
  } catch (error) {
    if (isGitLineHistoryMissingPathError(error)) {
      return { status: 'untracked', ...empty }
    }
    // An untracked or out-of-date file maps past the committed end; retry once inside the file.
    const fileLineCount = readGitLineHistoryFileLineCount(error)
    if (fileLineCount === null || fileLineCount < 1) {
      throw error
    }
    if (headRange.startLine > fileLineCount) {
      return { status: 'uncommitted', ...empty }
    }
    headRange = { startLine: headRange.startLine, endLine: fileLineCount }
    stdout = (await git(buildGitLineHistoryArgs(options.relativePath, headRange, limit, head), cwd))
      .stdout
  }

  const parsed = parseGitLineHistoryLog(stdout)
  const items = parsed.slice(0, limit)
  // Why: -L lists only the commits that touched the block, so each one's listed parent is the next.
  items.forEach((item, index) => {
    const next = items[index + 1]
    item.parentIds = next ? [next.id] : []
  })
  return { status: 'ready', items, hasMore: parsed.length > limit, limit, headRange }
}
