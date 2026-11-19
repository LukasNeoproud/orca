import { beforeEach, describe, expect, it, vi } from 'vitest'

type Search = Record<string, string | number>

const PAGE = 500

type Fake = {
  onAzureDevOps: boolean
  /** Completed pull requests into the target branch, newest first. */
  completed: number
  /** `null` answers like a failed request, `throw` like a broken connection. */
  failAtSkip: { skip: number; how: 'null' | 'throw' } | null
  requests: Search[]
}

const { fake } = vi.hoisted(() => {
  const state: Fake = { onAzureDevOps: true, completed: 0, failAtSkip: null, requests: [] }
  return { fake: state }
})

vi.mock('./repository-ref', () => ({
  getAzureDevOpsRepoRef: async () =>
    fake.onAzureDevOps
      ? { host: 'dev.azure.com', project: 'Web', repository: 'app', apiBaseUrl: '', webBaseUrl: '' }
      : null
}))
vi.mock('./azure-devops-api-request', () => ({
  requestAzureDevOpsJson: async (
    _repo: unknown,
    _path: string,
    options: { searchParams: Search }
  ) => {
    const search = options.searchParams
    fake.requests.push(search)
    const skip = Number(search.$skip ?? 0)
    if (fake.failAtSkip?.skip === skip) {
      if (fake.failAtSkip.how === 'throw') {
        throw new Error('socket hang up')
      }
      return null
    }
    const value: { sourceRefName: string; lastMergeSourceCommit: { commitId: string } }[] = []
    for (let index = skip; index < Math.min(fake.completed, skip + Number(search.$top)); index++) {
      value.push({
        sourceRefName: `refs/heads/feature/${index}`,
        lastMergeSourceCommit: { commitId: `commit-${index}` }
      })
    }
    return { value }
  }
}))

import { listAzureDevOpsCompletedPullRequestHeads } from './completed-pull-request-heads'

const skips = (): number[] => fake.requests.map((search) => Number(search.$skip ?? 0))

beforeEach(() => {
  fake.onAzureDevOps = true
  fake.completed = 0
  fake.failAtSkip = null
  fake.requests = []
})

describe('listAzureDevOpsCompletedPullRequestHeads', () => {
  it('asks once when the history fits in a page, with the request it always sent', async () => {
    fake.completed = 3
    const heads = await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')
    expect(heads?.get('feature/2')).toEqual(new Set(['commit-2']))
    expect(fake.requests).toEqual([
      {
        'searchCriteria.status': 'completed',
        'searchCriteria.targetRefName': 'refs/heads/main',
        $top: PAGE
      }
    ])
  })

  it('finds a pull request older than five hundred newer ones', async () => {
    fake.completed = 2 * PAGE + 20
    const heads = await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')
    expect(heads?.size).toBe(2 * PAGE + 20)
    expect(heads?.get(`feature/${2 * PAGE + 19}`)).toEqual(new Set([`commit-${2 * PAGE + 19}`]))
    expect(skips()).toEqual([0, PAGE, 2 * PAGE])
  })

  it('asks for one more page after a full last page and stops on the empty one', async () => {
    fake.completed = PAGE
    const heads = await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')
    expect(heads?.size).toBe(PAGE)
    expect(skips()).toEqual([0, PAGE])
  })

  it('stops at ten pages of a longer history', async () => {
    fake.completed = 12 * PAGE
    const heads = await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')
    expect(fake.requests).toHaveLength(10)
    expect(heads?.size).toBe(10 * PAGE)
    expect(heads?.has(`feature/${10 * PAGE}`)).toBe(false)
  })

  it.each(['null', 'throw'] as const)(
    'keeps the first page when the second fails (%s)',
    async (how) => {
      fake.completed = 3 * PAGE
      fake.failAtSkip = { skip: PAGE, how }
      const heads = await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')
      expect(heads?.size).toBe(PAGE)
      expect(heads?.has('feature/0')).toBe(true)
      expect(skips()).toEqual([0, PAGE])
    }
  )

  it('has no answer when the first page fails', async () => {
    fake.completed = 3
    fake.failAtSkip = { skip: 0, how: 'null' }
    expect(await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')).toBeNull()
  })

  it('asks nothing for a repository of another provider', async () => {
    fake.onAzureDevOps = false
    expect(await listAzureDevOpsCompletedPullRequestHeads('/repo', 'main')).toBeNull()
    expect(fake.requests).toEqual([])
  })
})
