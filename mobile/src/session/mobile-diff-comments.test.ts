import { describe, expect, it } from 'vitest'
import type { DiffComment } from '../../../src/shared/diff-comment-types'
import {
  addMobileDiffComment,
  formatDiffComments,
  formatMobileDiffReviewPrompt,
  normalizeMobileDiffComments,
  removeDeliveredMobileDiffComments,
  removeMobileDiffComments
} from './mobile-diff-comments'

function comment(overrides: Partial<DiffComment> & Pick<DiffComment, 'id'>): DiffComment {
  const { id, ...rest } = overrides
  return {
    id,
    worktreeId: 'wt-1',
    filePath: 'src/app.ts',
    source: 'diff',
    lineNumber: 4,
    body: 'check this',
    createdAt: 100,
    side: 'modified',
    ...rest
  }
}

describe('mobile diff comments', () => {
  it('normalizes persisted worktree metadata for mobile rendering', () => {
    expect(
      normalizeMobileDiffComments(
        [
          comment({ id: 'a' }),
          { id: 'missing-body', filePath: 'src/app.ts', lineNumber: 1, body: ' ' },
          null
        ],
        'wt-1'
      )
    ).toEqual([comment({ id: 'a' })])
  })

  it('creates trimmed modified-side comments', () => {
    const result = addMobileDiffComment([], {
      id: 'mobile-1',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      lineNumber: 8,
      body: '  Needs tests  ',
      createdAt: 200
    })

    expect(result.comment).toMatchObject({
      id: 'mobile-1',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      source: 'diff',
      lineNumber: 8,
      body: 'Needs tests',
      side: 'modified'
    })
    expect(result.comments).toHaveLength(1)
  })

  it('creates file-level scoped comments', () => {
    const result = addMobileDiffComment([], {
      id: 'mobile-1',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      oldPath: 'src/old-app.ts',
      lineNumber: 0,
      body: '  File note  ',
      createdAt: 200,
      scope: 'branch',
      diffIdentity: 'd1'
    })

    expect(result.comment).toMatchObject({
      lineNumber: 0,
      body: 'File note',
      scope: 'branch',
      oldPath: 'src/old-app.ts',
      diffIdentity: 'd1'
    })
  })

  it('rejects blank comment bodies', () => {
    const existing = [comment({ id: 'a' })]
    const result = addMobileDiffComment(existing, {
      id: 'mobile-1',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      lineNumber: 8,
      body: '   ',
      createdAt: 200
    })

    expect(result.comment).toBeNull()
    expect(result.comments).toEqual(existing)
  })

  it('removes delivered comments by snapshot id without touching new notes', () => {
    expect(
      removeMobileDiffComments(
        [comment({ id: 'a' }), comment({ id: 'b' })],
        new Set(['a', 'missing'])
      )
    ).toEqual([comment({ id: 'b' })])
  })

  it('keeps a changed note when clearing an older delivered snapshot', () => {
    const delivered = comment({ id: 'a', body: 'old note' })

    expect(
      removeDeliveredMobileDiffComments(
        [comment({ id: 'a', body: 'new note' }), comment({ id: 'b' })],
        [delivered]
      )
    ).toEqual([comment({ id: 'a', body: 'new note' }), comment({ id: 'b' })])
  })

  it('uses the desktop-compatible prompt format', () => {
    expect(formatDiffComments([comment({ id: 'a', body: 'quote "this"' })])).toBe(
      ['File: src/app.ts', 'Line: 4', 'User comment: "quote \\"this\\""'].join('\n')
    )
  })

  it('formats file-level notes with file scope', () => {
    expect(formatDiffComments([comment({ id: 'a', lineNumber: 0 })])).toBe(
      ['File: src/app.ts', 'Scope: file', 'User comment: "check this"'].join('\n')
    )
  })

  it('wraps sent review notes in the mobile agent prompt', () => {
    expect(formatMobileDiffReviewPrompt([comment({ id: 'a' })])).toBe(
      [
        'You are reviewing the current worktree. Address the following mobile review notes.',
        '',
        'File: src/app.ts',
        'Line: 4',
        'User comment: "check this"',
        '',
        'After applying fixes:',
        '1. Summarize changed files.',
        '2. Run relevant tests.',
        '3. Tell me if anything remains risky.'
      ].join('\n')
    )
  })

  it('keeps review metadata while normalizing persisted notes', () => {
    expect(
      normalizeMobileDiffComments(
        [
          comment({
            id: 'a',
            lineNumber: 0,
            updatedAt: 200,
            sentAt: 300,
            scope: 'staged',
            oldPath: 'src/old.ts',
            diffIdentity: 'd1'
          })
        ],
        'wt-1'
      )
    ).toEqual([
      comment({
        id: 'a',
        lineNumber: 0,
        updatedAt: 200,
        sentAt: 300,
        scope: 'staged',
        oldPath: 'src/old.ts',
        diffIdentity: 'd1'
      })
    ])
  })

  it('round trips native and legacy image annotations without changing their regions', () => {
    const native = comment({
      id: 'image-native',
      filePath: 'assets/new.png',
      source: 'image',
      lineNumber: 0,
      imageRegion: { x: 12.5, y: 20, width: 30, height: 40 },
      scope: 'staged',
      diffIdentity: 'image-diff'
    })
    const legacy = {
      ...native,
      id: 'image-legacy',
      source: 'diff',
      lineNumber: 1,
      imageRegion: undefined,
      selectedText: 'orca:image-region:v1:{"x":12.5,"y":20,"width":30,"height":40}'
    }

    expect(normalizeMobileDiffComments([native, legacy], 'wt-1')).toEqual([
      native,
      { ...native, id: 'image-legacy' }
    ])
  })

  it('preserves image annotations while adding, removing, and editing other notes', () => {
    const image = comment({
      id: 'image',
      source: 'image',
      lineNumber: 0,
      imageRegion: { x: 10, y: 15, width: 25, height: 30 },
      diffIdentity: 'image-diff'
    })
    const added = addMobileDiffComment([image], {
      id: 'text',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      lineNumber: 7,
      body: 'text note',
      createdAt: 300
    }).comments

    expect(added[0]).toEqual(image)
    expect(removeMobileDiffComments(added, new Set(['text']))).toEqual([image])
  })

  it('keeps an image note when a delivered snapshot has a different region or diff identity', () => {
    const image = comment({
      id: 'image',
      source: 'image',
      lineNumber: 0,
      imageRegion: { x: 10, y: 15, width: 25, height: 30 },
      diffIdentity: 'new-diff'
    })

    expect(
      removeDeliveredMobileDiffComments(
        [image],
        [
          {
            ...image,
            imageRegion: { x: 11, y: 15, width: 25, height: 30 },
            diffIdentity: 'old-diff'
          }
        ]
      )
    ).toEqual([image])
  })

  it('creates image comments only with a valid percentage region', () => {
    const valid = addMobileDiffComment([], {
      id: 'image',
      worktreeId: 'wt-1',
      filePath: 'assets/new.png',
      lineNumber: 9,
      body: 'Check this area',
      createdAt: 300,
      source: 'image',
      imageRegion: { x: 10, y: 20, width: 30, height: 40 }
    })
    const invalid = addMobileDiffComment([], {
      id: 'bad-image',
      worktreeId: 'wt-1',
      filePath: 'assets/new.png',
      lineNumber: 0,
      body: 'Outside',
      createdAt: 300,
      source: 'image',
      imageRegion: { x: 90, y: 20, width: 30, height: 40 }
    })

    expect(valid.comment).toMatchObject({
      source: 'image',
      lineNumber: 0,
      imageRegion: { x: 10, y: 20, width: 30, height: 40 }
    })
    expect(invalid.comment).toBeNull()
  })
})
