import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import type { MobileDiffReviewQueueItem } from './mobile-diff-review-queue'
import { loadMobileDiffReviewDiff } from './mobile-diff-review-loaders'

const DELETED_ITEM: MobileDiffReviewQueueItem = {
  key: 'unstaged\0unstaged\0\0deleted.ts',
  scope: 'unstaged',
  area: 'unstaged',
  filePath: 'deleted.ts',
  status: 'deleted',
  title: 'deleted.ts',
  subtitle: 'Unstaged',
  canStage: true,
  canUnstage: false,
  canDiscard: true,
  isGeneratedOrLockFile: false,
  diffIdentity: 'deleted-diff',
  noteCount: 0,
  unsentNoteCount: 0,
  staleNoteCount: 0,
  isReviewed: false,
  changedSinceReview: false
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8sm7wAAAABJRU5ErkJggg=='

function clientWith(response: RpcResponse): RpcClient {
  return {
    sendRequest: vi.fn().mockResolvedValue(response)
  } as unknown as RpcClient
}

function failure(code: string, message: string): RpcResponse {
  return { id: 'rpc-1', ok: false, error: { code, message }, _meta: { runtimeId: 'runtime-1' } }
}

function success(result: unknown): RpcResponse {
  return { id: 'rpc-1', ok: true, result, _meta: { runtimeId: 'runtime-1' } }
}

describe('loadMobileDiffReviewDiff', () => {
  it('shows the too-large state for an oversized deleted diff', async () => {
    await expect(
      loadMobileDiffReviewDiff({
        client: clientWith(failure('diff_too_large', 'Diff too large')),
        worktreeId: 'wt-1',
        item: DELETED_ITEM,
        branchCompare: null
      })
    ).resolves.toEqual({ kind: 'too-large', itemKey: DELETED_ITEM.key })
  })

  it('keeps the deleted fallback for hosts that cannot return deleted content', async () => {
    await expect(
      loadMobileDiffReviewDiff({
        client: clientWith(failure('internal_error', 'Unable to read deleted file')),
        worktreeId: 'wt-1',
        item: DELETED_ITEM,
        branchCompare: null
      })
    ).resolves.toEqual({ kind: 'deleted', itemKey: DELETED_ITEM.key })
  })

  it('loads original and changed image sides from the SSH-compatible git diff result', async () => {
    await expect(
      loadMobileDiffReviewDiff({
        client: clientWith(
          success({
            kind: 'binary',
            originalContent: PNG_BASE64,
            modifiedContent: PNG_BASE64,
            originalIsBinary: true,
            modifiedIsBinary: true,
            isImage: true,
            mimeType: 'image/png'
          })
        ),
        worktreeId: 'wt-1',
        item: { ...DELETED_ITEM, key: 'image', filePath: 'image.png', status: 'modified' },
        branchCompare: null
      })
    ).resolves.toMatchObject({
      kind: 'image',
      itemKey: 'image',
      original: { kind: 'ready' },
      modified: { kind: 'ready' }
    })
  })
})
