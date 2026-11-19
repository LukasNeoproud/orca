import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { azureDevOpsPullRequestKey } from '../../../shared/azure-devops-review-types'
import type { RawReviewItem } from './azure-devops-review-client'
import { _setAzureDevOpsReviewDraftStorePath } from './azure-devops-review-draft-store'
import type { RawReviewThread } from './azure-devops-review-mappers'
import { getAzureDevOpsReviewDetail } from './azure-devops-review-service'

const source = {
  key: 'dev.azure.com/contoso/web/app',
  organizationKey: 'dev.azure.com/contoso',
  organizationUrl: 'https://dev.azure.com/contoso',
  organizationLabel: 'contoso',
  project: 'Web',
  repository: 'app',
  orcaRepoIds: ['r1']
}

const greetingAtFirst = ['export function greet(name) {', '  return "Hi " + name', '}']
const greetingAtFourth = [
  '// Greets a visitor.',
  '',
  'export function greet(name) {',
  '  return `Hello ${name}`',
  '}'
]

function thread(id: number, line: number): RawReviewThread {
  return {
    id,
    status: 'active',
    threadContext: {
      filePath: '/src/greeting.ts',
      rightFileStart: { line, offset: 1 },
      rightFileEnd: { line, offset: 30 }
    },
    pullRequestThreadContext: {
      changeTrackingId: 1,
      iterationContext: { firstComparingIteration: 1, secondComparingIteration: 1 }
    },
    comments: [{ id: 1, content: `Comment ${id}`, author: { displayName: 'Ada' } }]
  }
}

const itemRequests: string[] = []

vi.mock('./azure-devops-review-repos', () => ({
  collectAzureDevOpsReviewRepos: async () => [source],
  toAzureDevOpsReviewRepo: (repo: unknown) => repo
}))

vi.mock('./azure-devops-review-client', () => ({
  resolveAzureDevOpsReviewRepository: async () => ({
    id: 'repo',
    webUrl: 'https://dev.azure.com/contoso/Web/_git/app'
  }),
  getAzureDevOpsReviewIdentity: async () => ({ id: 'me', displayName: 'Me', at: 0 }),
  getAzureDevOpsReviewPullRequest: async () => ({ pullRequestId: 7, title: 'Greeting' }),
  listAzureDevOpsReviewIterations: async () =>
    [1, 2, 3, 4].map((id) => ({
      id,
      sourceRefCommit: { commitId: `s${id}` },
      targetRefCommit: { commitId: 't' },
      commonRefCommit: { commitId: 'b' }
    })),
  listAzureDevOpsReviewIterationChanges: async () => [
    { changeTrackingId: 1, changeType: 'edit', item: { path: '/src/greeting.ts' } }
  ],
  listAzureDevOpsReviewThreads: async () => [thread(1, 1), thread(2, 2), thread(3, 3)],
  getAzureDevOpsReviewItemAtCommit: async (
    _target: unknown,
    path: string,
    commit: string
  ): Promise<RawReviewItem | null> => {
    itemRequests.push(`${commit}:${path}`)
    const lines = commit === 's1' ? greetingAtFirst : commit === 's4' ? greetingAtFourth : null
    return lines ? { content: lines.join('\n') } : null
  }
}))

// The thread shape clients read before thread tracking existed.
const LegacyThread = z.object({
  id: z.number(),
  status: z.string(),
  filePath: z.string().nullable(),
  anchor: z
    .object({ side: z.enum(['right', 'left']), startLine: z.number(), endLine: z.number() })
    .nullable(),
  comments: z.array(z.object({ id: z.number(), content: z.string(), isSystem: z.boolean() }))
})

const pullRequestKey = azureDevOpsPullRequestKey(source.organizationKey, 'repo', 7)
let storeDir = ''

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'orca-ado-review-service-'))
  _setAzureDevOpsReviewDraftStorePath(join(storeDir, 'drafts.json'))
})

afterAll(() => {
  _setAzureDevOpsReviewDraftStorePath(null)
  rmSync(storeDir, { recursive: true, force: true })
})

describe('getAzureDevOpsReviewDetail', () => {
  it('reports first-iteration threads at their lines in the latest iteration', async () => {
    const detail = await getAzureDevOpsReviewDetail({ listRepos: () => [] }, pullRequestKey)
    expect(detail.latestIteration?.id).toBe(4)
    expect(detail.threads).toMatchObject([
      { id: 1, anchor: { side: 'right', startLine: 3, endLine: 3 }, iterationId: 1 },
      { id: 2, anchor: { side: 'right', startLine: 4, endLine: 4 }, outdated: true },
      { id: 3, anchor: { side: 'right', startLine: 5, endLine: 5 } }
    ])
    expect(detail.threads[0]).not.toHaveProperty('outdated')
    expect(detail.threads[1]?.originalAnchor).toEqual({ side: 'right', startLine: 2, endLine: 2 })
    expect(itemRequests.sort()).toEqual(['s1:/src/greeting.ts', 's4:/src/greeting.ts'])

    // An older client reads only the fields it knows; they must all still be there.
    for (const item of detail.threads) {
      expect(LegacyThread.safeParse(item).success).toBe(true)
    }
  })

  it('does not fetch file versions again for the next load of the same iteration', async () => {
    itemRequests.length = 0
    const detail = await getAzureDevOpsReviewDetail({ listRepos: () => [] }, pullRequestKey)
    expect(detail.threads[0]?.anchor?.startLine).toBe(3)
    expect(itemRequests).toEqual([])
  })
})
