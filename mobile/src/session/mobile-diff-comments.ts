import type {
  DiffComment,
  DiffCommentSource,
  DiffReviewScope,
  ImageReviewRegion
} from '../../../src/shared/diff-comment-types'
import { formatDiffComment, formatDiffComments } from '../../../src/shared/diff-comments-format'
import { decodeImageReviewCommentFromLegacyHost } from '../../../src/shared/image-review-comment-wire'

export { formatDiffComment, formatDiffComments }

export type CreateMobileDiffCommentInput = {
  worktreeId: string
  filePath: string
  oldPath?: string
  lineNumber: number
  body: string
  id: string
  createdAt: number
  scope?: DiffReviewScope
  diffIdentity?: string
  source?: DiffCommentSource
  imageRegion?: ImageReviewRegion
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeScope(value: unknown): DiffReviewScope | undefined {
  return value === 'unstaged' || value === 'staged' || value === 'branch' ? value : undefined
}

function normalizeSource(value: unknown): DiffCommentSource {
  return value === 'markdown' || value === 'image' ? value : 'diff'
}

export function normalizeMobileImageRegion(value: unknown): ImageReviewRegion | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const region = {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height
  }
  if (!Object.values(region).every((part) => typeof part === 'number' && Number.isFinite(part))) {
    return undefined
  }
  const { x, y, width, height } = region as ImageReviewRegion
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100 && y + height <= 100
    ? { x, y, width, height }
    : undefined
}

export function formatMobileDiffReviewPrompt(comments: readonly DiffComment[]): string {
  return [
    'You are reviewing the current worktree. Address the following mobile review notes.',
    '',
    formatDiffComments(comments),
    '',
    'After applying fixes:',
    '1. Summarize changed files.',
    '2. Run relevant tests.',
    '3. Tell me if anything remains risky.'
  ].join('\n')
}

export function normalizeMobileDiffComments(value: unknown, worktreeId: string): DiffComment[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((candidate): DiffComment[] => {
    if (!isRecord(candidate)) {
      return []
    }
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const filePath = typeof candidate.filePath === 'string' ? candidate.filePath : ''
    const lineNumber = typeof candidate.lineNumber === 'number' ? candidate.lineNumber : Number.NaN
    const body = typeof candidate.body === 'string' ? candidate.body.trim() : ''
    const createdAt = typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
    if (!id || !filePath || !Number.isFinite(lineNumber) || lineNumber < 0 || !body) {
      return []
    }
    const normalized = decodeImageReviewCommentFromLegacyHost({
      id,
      worktreeId: typeof candidate.worktreeId === 'string' ? candidate.worktreeId : worktreeId,
      filePath,
      source: normalizeSource(candidate.source),
      selectedText: typeof candidate.selectedText === 'string' ? candidate.selectedText : undefined,
      // Absent unless set, so a plain line note keeps the shape older hosts recorded.
      ...(normalizeMobileImageRegion(candidate.imageRegion)
        ? { imageRegion: normalizeMobileImageRegion(candidate.imageRegion) }
        : {}),
      startLine: typeof candidate.startLine === 'number' ? candidate.startLine : undefined,
      lineNumber,
      body,
      createdAt,
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : undefined,
      sentAt: typeof candidate.sentAt === 'number' ? candidate.sentAt : undefined,
      scope: normalizeScope(candidate.scope),
      oldPath: typeof candidate.oldPath === 'string' ? candidate.oldPath : undefined,
      diffIdentity: typeof candidate.diffIdentity === 'string' ? candidate.diffIdentity : undefined,
      side: 'modified'
    })
    return [normalized]
  })
}

export function createMobileDiffComment(input: CreateMobileDiffCommentInput): DiffComment | null {
  const body = input.body.trim()
  if (!body || !Number.isFinite(input.lineNumber) || input.lineNumber < 0) {
    return null
  }
  const source = input.source ?? 'diff'
  const imageRegion = normalizeMobileImageRegion(input.imageRegion)
  if (source === 'image' && !imageRegion) {
    return null
  }
  return {
    id: input.id,
    worktreeId: input.worktreeId,
    filePath: input.filePath,
    oldPath: input.oldPath,
    source,
    imageRegion,
    lineNumber: source === 'image' ? 0 : input.lineNumber,
    body,
    createdAt: input.createdAt,
    scope: input.scope,
    diffIdentity: input.diffIdentity,
    side: 'modified'
  }
}

export function addMobileDiffComment(
  comments: readonly DiffComment[],
  input: CreateMobileDiffCommentInput
): { comments: DiffComment[]; comment: DiffComment | null } {
  const comment = createMobileDiffComment(input)
  if (!comment) {
    return { comments: [...comments], comment: null }
  }
  return { comments: [...comments, comment], comment }
}

export function removeMobileDiffComments(
  comments: readonly DiffComment[],
  ids: ReadonlySet<string>
): DiffComment[] {
  if (ids.size === 0) {
    return [...comments]
  }
  return comments.filter((comment) => !ids.has(comment.id))
}

function deliveredCommentMatches(comment: DiffComment, delivered: DiffComment): boolean {
  const sameRegion =
    comment.imageRegion === delivered.imageRegion ||
    (comment.imageRegion !== undefined &&
      delivered.imageRegion !== undefined &&
      comment.imageRegion.x === delivered.imageRegion.x &&
      comment.imageRegion.y === delivered.imageRegion.y &&
      comment.imageRegion.width === delivered.imageRegion.width &&
      comment.imageRegion.height === delivered.imageRegion.height)
  return (
    comment.id === delivered.id &&
    comment.worktreeId === delivered.worktreeId &&
    comment.body === delivered.body &&
    comment.filePath === delivered.filePath &&
    comment.lineNumber === delivered.lineNumber &&
    comment.selectedText === delivered.selectedText &&
    comment.source === delivered.source &&
    comment.startLine === delivered.startLine &&
    sameRegion &&
    comment.scope === delivered.scope &&
    comment.oldPath === delivered.oldPath &&
    comment.diffIdentity === delivered.diffIdentity &&
    comment.createdAt === delivered.createdAt &&
    comment.updatedAt === delivered.updatedAt &&
    comment.side === delivered.side
  )
}

export function removeDeliveredMobileDiffComments(
  comments: readonly DiffComment[],
  delivered: readonly DiffComment[]
): DiffComment[] {
  if (delivered.length === 0) {
    return [...comments]
  }
  const deliveredById = new Map(delivered.map((comment) => [comment.id, comment]))
  return comments.filter((comment) => {
    const snapshot = deliveredById.get(comment.id)
    return !snapshot || !deliveredCommentMatches(comment, snapshot)
  })
}

/** Unsent notes that no new-agent send is still carrying. */
export function sendableMobileDiffComments(
  comments: readonly DiffComment[],
  sendingIds: ReadonlySet<string>
): DiffComment[] {
  return comments.filter((comment) => !comment.sentAt && !sendingIds.has(comment.id))
}
