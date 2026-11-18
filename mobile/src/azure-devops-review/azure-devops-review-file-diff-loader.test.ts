import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type {
  AzureDevOpsReviewChangeType,
  AzureDevOpsReviewFileSide
} from '../../../src/shared/azure-devops-review-types'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('./use-azure-devops-review', () => ({ azureDevOpsReviewRequest: requestMock }))

import { loadAzureDevOpsReviewFileDiff } from './azure-devops-review-file-diff-loader'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every request goes through the mocked azureDevOpsReviewRequest, so the client is never touched.
const client = {} as RpcClient

/** null: the host reported the side missing. */
function side(content: string | null): AzureDevOpsReviewFileSide {
  return { content: content ?? '', missing: content === null, binary: false, tooLarge: false }
}

// The loader caches per module; a fresh pull request key per call keeps the cases apart.
let pullRequest = 0
function load(changeType: AzureDevOpsReviewChangeType, key = `org+repo+${++pullRequest}`) {
  return loadAzureDevOpsReviewFileDiff(client, key, 1, {
    path: '/src/app.ts',
    originalPath: changeType === 'rename' ? '/src/old.ts' : null,
    changeType
  })
}

describe('loadAzureDevOpsReviewFileDiff', () => {
  beforeEach(() => requestMock.mockReset())

  it.each<[AzureDevOpsReviewChangeType, string | null, string | null, RegExp]>([
    ['edit', null, 'b', /original version/],
    ['rename', null, 'b', /original version/],
    ['delete', null, null, /original version/],
    ['add', null, null, /changed version/],
    ['edit', 'a', null, /changed version/]
  ])(
    'rejects %s whose expected side the host reported missing (original %j, modified %j)',
    async (changeType, original, modified, message) => {
      requestMock.mockResolvedValue({
        iterationId: 1,
        original: side(original),
        modified: side(modified)
      })
      await expect(load(changeType)).rejects.toThrow(message)
    }
  )

  it.each<[AzureDevOpsReviewChangeType, string | null, string | null]>([
    ['add', null, 'b'],
    ['delete', 'a', null],
    ['edit', '', 'b'],
    ['edit', 'a', '']
  ])('keeps %s with original %j and modified %j', async (changeType, original, modified) => {
    const diff = { iterationId: 1, original: side(original), modified: side(modified) }
    requestMock.mockResolvedValue(diff)
    await expect(load(changeType)).resolves.toEqual(diff)
  })

  it('keeps an edit from an older host that does not send missing', async () => {
    const legacySide = { content: '', binary: false, tooLarge: false }
    const diff = { iterationId: 1, original: legacySide, modified: { ...legacySide, content: 'b' } }
    requestMock.mockResolvedValue(diff)
    await expect(load('edit')).resolves.toEqual(diff)
  })

  it('does not cache the error, so a retry loads again', async () => {
    const loaded = { iterationId: 1, original: side('a'), modified: side('b') }
    requestMock
      .mockResolvedValueOnce({ iterationId: 1, original: side(null), modified: side('b') })
      .mockResolvedValueOnce(loaded)
    await expect(load('edit', 'org+repo+retry')).rejects.toThrow(/original version/)
    await expect(load('edit', 'org+repo+retry')).resolves.toEqual(loaded)
    expect(requestMock).toHaveBeenCalledTimes(2)
  })
})
