import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  azureDevOpsPullRequestKey,
  type AzureDevOpsReviewDraftCreateInput
} from '../../../shared/azure-devops-review-types'
import type { RawReviewItem } from './azure-devops-review-client'
import {
  createAzureDevOpsReviewDraft,
  listAzureDevOpsReviewDrafts,
  publishAzureDevOpsReviewDrafts,
  updateAzureDevOpsReviewDraft
} from './azure-devops-review-draft-actions'
import {
  _setAzureDevOpsReviewDraftStorePath,
  getStoredAzureDevOpsReviewDraft
} from './azure-devops-review-draft-store'
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
const pullRequestKey = azureDevOpsPullRequestKey(source.organizationKey, 'repo', 7)
const host = { listRepos: () => [] }

const CART_AT_FIRST = ['let sum = 0', 'sum += item', 'return sum']
const CART_AT_LATEST = ['let sum = 0', 'sum += Math.max(item, 0)', 'return sum']

const fake = vi.hoisted(
  (): { itemRequests: string[]; postedThreads: Record<string, unknown>[] } => ({
    itemRequests: [],
    postedThreads: []
  })
)

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
  getAzureDevOpsReviewPullRequest: async () => ({ pullRequestId: 7, title: 'Clamp prices' }),
  listAzureDevOpsReviewIterations: async () =>
    [1, 2].map((id) => ({
      id,
      sourceRefCommit: { commitId: `s${id}` },
      commonRefCommit: { commitId: 'b' }
    })),
  listAzureDevOpsReviewIterationChanges: async () => [
    { changeTrackingId: 1, changeType: 'edit', item: { path: '/src/cart.ts' } }
  ],
  listAzureDevOpsReviewThreads: async () => [],
  createAzureDevOpsReviewThread: async (_target: unknown, payload: Record<string, unknown>) => {
    fake.postedThreads.push(payload)
    return { id: 500 + fake.postedThreads.length }
  },
  createAzureDevOpsReviewReply: async () => undefined,
  updateAzureDevOpsReviewThreadStatus: async () => undefined,
  getAzureDevOpsReviewItemAtCommit: async (
    _target: unknown,
    path: string,
    commit: string
  ): Promise<RawReviewItem | null> => {
    fake.itemRequests.push(`${commit}:${path}`)
    if (path !== '/src/cart.ts') {
      return null
    }
    return { content: (commit === 's1' ? CART_AT_FIRST : CART_AT_LATEST).join('\n') }
  }
}))

function cite(quote: string, startLine = 2) {
  return { kind: 'code-citation', filePath: 'src/cart.ts', startLine, endLine: startLine, quote }
}

function finding(
  patch: Partial<AzureDevOpsReviewDraftCreateInput>
): AzureDevOpsReviewDraftCreateInput {
  return {
    pullRequestKey,
    kind: 'inline',
    body: 'The clamp hides refunds.',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 2, endLine: 2 },
    author: { kind: 'agent', label: 'claude' },
    ...patch
  }
}

let storeDir = ''

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'orca-ado-draft-findings-'))
  _setAzureDevOpsReviewDraftStorePath(join(storeDir, 'drafts.json'))
})

afterAll(() => {
  _setAzureDevOpsReviewDraftStorePath(null)
  rmSync(storeDir, { recursive: true, force: true })
})

beforeEach(() => {
  fake.itemRequests.length = 0
  fake.postedThreads.length = 0
})

describe('drafts as findings through the host actions', () => {
  it('answers a new agent draft with the check of its citation and the commented code', async () => {
    const draft = await createAzureDevOpsReviewDraft(
      host,
      finding({ severity: 'warning', evidence: [cite('sum += Math.max(item, 0)')] })
    )
    expect(draft).toMatchObject({
      severity: 'warning',
      certainty: 'likely',
      evidenceChecks: [{ status: 'confirmed' }],
      codeExcerpt: { startLine: 2, lines: ['sum += Math.max(item, 0)'] }
    })
    // What the host derives is never stored; it is checked again on every read.
    const stored = getStoredAzureDevOpsReviewDraft(draft.id)
    expect(stored).toMatchObject({ severity: 'warning', evidence: draft.evidence })
    expect(stored).not.toHaveProperty('certainty')
    expect(stored).not.toHaveProperty('evidenceChecks')
    expect(stored).not.toHaveProperty('codeExcerpt')
  })

  it('tells the agent at once that a citation does not match, and accepts the correction', async () => {
    const draft = await createAzureDevOpsReviewDraft(
      host,
      finding({ evidence: [cite('sum -= item')] })
    )
    expect(draft.certainty).toBe('contradicted')
    expect(draft.evidenceChecks).toEqual([
      { status: 'refuted', reason: 'text-mismatch', actual: 'sum += Math.max(item, 0)' }
    ])
    const corrected = await updateAzureDevOpsReviewDraft(host, draft.id, {
      evidence: [cite('Math.max(item, 0)')]
    })
    expect(corrected.certainty).toBe('likely')
  })

  it('marks an agent draft without evidence as uncertain and a hand-written one not at all', async () => {
    const byAgent = await createAzureDevOpsReviewDraft(host, finding({}))
    const byUser = await createAzureDevOpsReviewDraft(host, finding({ author: { kind: 'user' } }))
    expect(byAgent.certainty).toBe('uncertain')
    expect(byUser).not.toHaveProperty('certainty')
  })

  it('checks a citation against the commit the draft names and again after it is rebased', async () => {
    const draft = await createAzureDevOpsReviewDraft(
      host,
      finding({ commit: 's1', evidence: [cite('sum += item')] })
    )
    expect(draft).toMatchObject({ outdated: true, iterationId: 1, certainty: 'likely' })
    const rebased = await updateAzureDevOpsReviewDraft(host, draft.id, { rebaseToLatest: true })
    expect(rebased).toMatchObject({ outdated: false, iterationId: 2, certainty: 'contradicted' })
  })

  it('never reads a file for a commit outside the pull request', async () => {
    fake.itemRequests.length = 0
    const draft = await createAzureDevOpsReviewDraft(
      host,
      finding({ commit: 'feedc0de', evidence: [cite('sum += item')] })
    )
    expect(draft.evidenceChecks).toEqual([{ status: 'unchecked', reason: 'commit-not-in-review' }])
    expect(fake.itemRequests.filter((request) => request.startsWith('feedc0de'))).toEqual([])
  })

  it('lists and shows drafts with their checks without fetching a known file again', async () => {
    await createAzureDevOpsReviewDraft(host, finding({ evidence: [cite('return sum', 3)] }))
    fake.itemRequests.length = 0
    const listed = await listAzureDevOpsReviewDrafts(host, pullRequestKey)
    const detail = await getAzureDevOpsReviewDetail(host, pullRequestKey)
    expect(fake.itemRequests).toEqual([])
    expect(listed.drafts.length).toBeGreaterThan(0)
    expect(detail.drafts).toEqual(listed.drafts)
    for (const draft of listed.drafts) {
      expect(draft.evidenceChecks?.length ?? 0).toBe(draft.evidence?.length ?? 0)
    }
    expect(listed.drafts.at(-1)).toMatchObject({ certainty: 'likely' })
  })

  it('publishes only the text of a draft, whatever severity and evidence it carries', async () => {
    const plain = await createAzureDevOpsReviewDraft(host, finding({ body: 'Same text.' }))
    const withFinding = await createAzureDevOpsReviewDraft(
      host,
      finding({
        body: 'Same text.',
        severity: 'error',
        evidence: [
          { ...cite('sum += Math.max(item, 0)'), note: 'UNPUBLISHED-NOTE' },
          { kind: 'emulator-recording', screen: 'UNPUBLISHED-SCREEN' }
        ]
      })
    )
    const result = await publishAzureDevOpsReviewDrafts(host, pullRequestKey, [
      plain.id,
      withFinding.id
    ])
    expect(result.results.map((entry) => entry.ok)).toEqual([true, true])
    expect(fake.postedThreads).toHaveLength(2)
    expect(fake.postedThreads[1]).toEqual(fake.postedThreads[0])
    expect(fake.postedThreads[1]).toMatchObject({
      comments: [{ parentCommentId: 0, content: 'Same text.', commentType: 1 }]
    })
    expect(JSON.stringify(fake.postedThreads)).not.toMatch(
      /UNPUBLISHED|Math\.max|severity|evidence|error|code-citation/
    )
    // The published draft keeps what it carried, for the record in Orca.
    expect(getStoredAzureDevOpsReviewDraft(withFinding.id)).toMatchObject({
      state: 'published',
      severity: 'error'
    })
  })
})
