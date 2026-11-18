import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewFileDiff
} from '../../../../shared/azure-devops-review-types'

const getFileDiff = vi.hoisted(() => vi.fn<() => Promise<AzureDevOpsReviewFileDiff>>())

vi.mock('@/lib/azure-devops-review-client', () => ({
  getAzureDevOpsReviewFileDiff: getFileDiff
}))

const { loadAzureDevOpsReviewFileDiff } = await import('./use-azure-devops-review-file-diff')

function fileDiff(original: string | null, modified: string | null): AzureDevOpsReviewFileDiff {
  const side = (content: string | null) => ({
    content: content ?? '',
    missing: content === null,
    binary: false,
    tooLarge: false
  })
  return { iterationId: 1, original: side(original), modified: side(modified) }
}

let nextPath = 0
function change(changeType: AzureDevOpsReviewChange['changeType']): AzureDevOpsReviewChange {
  // Why a fresh path: the loader caches per path for the whole module.
  nextPath += 1
  return { path: `src/file-${nextPath}.ts`, originalPath: null, changeType, changeTrackingId: 1 }
}

beforeEach(() => {
  getFileDiff.mockReset()
})

describe('loadAzureDevOpsReviewFileDiff', () => {
  it('rejects an edited file whose original side the host could not find', async () => {
    getFileDiff.mockResolvedValue(fileDiff(null, 'after\n'))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('edit'))).rejects.toThrow(
      'the original version of this file could not be loaded'
    )
  })

  it('rejects a deleted file whose original side the host could not find', async () => {
    getFileDiff.mockResolvedValue(fileDiff(null, null))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('delete'))).rejects.toThrow(
      'the original version of this file could not be loaded'
    )
  })

  it('rejects an edited file whose changed side the host could not find', async () => {
    getFileDiff.mockResolvedValue(fileDiff('before\n', null))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('edit'))).rejects.toThrow(
      'the changed version of this file could not be loaded'
    )
  })

  it('does not cache the failure, so a retry loads the file again', async () => {
    const edited = change('edit')
    getFileDiff.mockResolvedValueOnce(fileDiff(null, 'after\n'))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, edited)).rejects.toThrow()
    getFileDiff.mockResolvedValueOnce(fileDiff('before\n', 'after\n'))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, edited)).resolves.toMatchObject({
      original: { content: 'before\n', missing: false }
    })
    expect(getFileDiff).toHaveBeenCalledTimes(2)
  })

  it('keeps an added file and a really empty original as they are', async () => {
    getFileDiff.mockResolvedValueOnce(fileDiff(null, 'after\n'))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('add'))).resolves.toMatchObject({
      original: { missing: true }
    })
    getFileDiff.mockResolvedValueOnce(fileDiff('', 'after\n'))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('edit'))).resolves.toMatchObject({
      original: { content: '', missing: false }
    })
    getFileDiff.mockResolvedValueOnce(fileDiff('before\n', null))
    await expect(loadAzureDevOpsReviewFileDiff('pr', 1, change('delete'))).resolves.toMatchObject({
      modified: { missing: true }
    })
  })
})
