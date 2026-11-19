import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawReviewItem } from './azure-devops-review-client'
import { createAzureDevOpsReviewLineLoader } from './azure-devops-review-file-line-cache'

const getItem = vi.hoisted(() =>
  vi.fn<(target: unknown, path: string, commit: string) => Promise<RawReviewItem | null>>()
)

vi.mock('./azure-devops-review-client', () => ({ getAzureDevOpsReviewItemAtCommit: getItem }))

function target(repositoryId: string) {
  return {
    organizationKey: 'dev.azure.com/contoso',
    organizationUrl: 'https://dev.azure.com/contoso',
    project: 'Web',
    repositoryId
  }
}

beforeEach(() => {
  getItem.mockReset()
})

describe('createAzureDevOpsReviewLineLoader', () => {
  it('reads a file version once and serves later loaders from memory', async () => {
    getItem.mockResolvedValue({ content: 'one\r\ntwo' })
    const load = createAzureDevOpsReviewLineLoader(target('cache-hit'))
    expect(await load('src/a.ts', 'c1')).toEqual(['one', 'two'])
    expect(await createAzureDevOpsReviewLineLoader(target('cache-hit'))('src/a.ts', 'c1')).toEqual([
      'one',
      'two'
    ])
    expect(getItem).toHaveBeenCalledTimes(1)
    expect(getItem).toHaveBeenCalledWith(expect.anything(), '/src/a.ts', 'c1')
  })

  it('tells a missing version from a binary one it cannot compare', async () => {
    const load = createAzureDevOpsReviewLineLoader(target('unreadable'))
    getItem.mockResolvedValueOnce(null)
    expect(await load('src/gone.ts', 'c1')).toBe('missing')
    getItem.mockResolvedValueOnce({ contentMetadata: { isBinary: true } })
    expect(await load('logo.png', 'c1')).toBeNull()
  })

  it('does not remember a failed request', async () => {
    const load = createAzureDevOpsReviewLineLoader(target('retry'))
    getItem.mockRejectedValueOnce(new Error('timeout'))
    await expect(load('src/a.ts', 'c1')).rejects.toThrow('timeout')
    getItem.mockResolvedValueOnce({ content: 'x' })
    expect(await load('src/a.ts', 'c1')).toEqual(['x'])
  })

  it('stops requesting past its budget and leaves the rest to the next loader', async () => {
    getItem.mockResolvedValue({ content: 'x' })
    const load = createAzureDevOpsReviewLineLoader(target('budget'))
    const results: (readonly string[] | 'missing' | null)[] = []
    for (let index = 0; index < 82; index += 1) {
      results.push(await load(`src/file-${index}.ts`, 'c1'))
    }
    expect(results.filter((lines) => lines === null)).toHaveLength(2)
    expect(getItem).toHaveBeenCalledTimes(80)
    const next = createAzureDevOpsReviewLineLoader(target('budget'))
    expect(await next('src/file-81.ts', 'c1')).toEqual(['x'])
    expect(await next('src/file-0.ts', 'c1')).toEqual(['x'])
    expect(getItem).toHaveBeenCalledTimes(81)
  })

  it('counts a version stored twice by concurrent reads once', async () => {
    const big = 'x'.repeat(2_000_000)
    getItem.mockImplementation(async (_target, path) => ({
      content: path.startsWith('/src/big-') ? big : 'small'
    }))
    const load = createAzureDevOpsReviewLineLoader(target('concurrent'))
    await load('src/kept.ts', 'c1')
    // Five 2 MB versions fit the cache; each is read twice at once, as two detail loads would.
    for (let index = 0; index < 5; index += 1) {
      await Promise.all([load(`src/big-${index}.ts`, 'c1'), load(`src/big-${index}.ts`, 'c1')])
    }
    getItem.mockClear()
    await load('src/kept.ts', 'c1')
    await load('src/big-0.ts', 'c1')
    expect(getItem).not.toHaveBeenCalled()
  })
})
