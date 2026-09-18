import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { DiffComment } from './diff-comment-types'
import {
  decodeImageReviewCommentFromLegacyHost,
  decodeImageReviewCommentsFromLegacyHost,
  encodeImageReviewCommentForLegacyHost
} from './image-review-comment-wire'

const comment: DiffComment = {
  id: 'area-1',
  worktreeId: 'folder-1',
  filePath: 'image.png',
  source: 'image',
  imageRegion: { x: 10, y: 20, width: 30, height: 40 },
  lineNumber: 0,
  body: 'Move this',
  side: 'modified',
  createdAt: 100
}

describe('image review notes across older folder hosts', () => {
  it('uses only legacy note fields and restores the region after a round trip', () => {
    const legacyHostComment = z.object({
      id: z.string(),
      worktreeId: z.string(),
      filePath: z.string(),
      source: z.enum(['diff', 'markdown']).optional(),
      selectedText: z.string().optional(),
      lineNumber: z.number().int().positive(),
      body: z.string(),
      side: z.literal('modified'),
      createdAt: z.number()
    })
    const encoded = encodeImageReviewCommentForLegacyHost(comment)
    expect(encoded.source).toBe('diff')
    expect(encoded.lineNumber).toBe(1)
    expect(encoded.imageRegion).toBeUndefined()
    expect(decodeImageReviewCommentFromLegacyHost(legacyHostComment.parse(encoded))).toEqual({
      ...comment,
      selectedText: undefined
    })
  })

  it('keeps selector identity stable for unchanged host snapshots', () => {
    const raw = [encodeImageReviewCommentForLegacyHost(comment)]
    expect(decodeImageReviewCommentsFromLegacyHost(raw)).toBe(
      decodeImageReviewCommentsFromLegacyHost(raw)
    )
  })
})
