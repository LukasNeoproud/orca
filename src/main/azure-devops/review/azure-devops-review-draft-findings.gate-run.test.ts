import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewIteration
} from '../../../shared/azure-devops-review-types'
import type { QualityGateRunView } from '../../../shared/quality-gate-types'
import type { ReviewFindingEvidence } from '../../../shared/review-finding'
import { describeAzureDevOpsReviewDraftFindings } from './azure-devops-review-draft-findings'
import type { AzureDevOpsReviewGateRunFacts } from './azure-devops-review-gate-run-evidence'

/** What a draft that cites a gate run carries to whoever shows it: the check, its reason, the record. */

const iterations: AzureDevOpsReviewIteration[] = [
  { id: 1, sourceCommit: 'aaa1', targetCommit: 't', baseCommit: 'b' },
  { id: 2, sourceCommit: 'bbb2', targetCommit: 't', baseCommit: 'b' }
]
const worktree = {
  worktreeId: 'repo-1::/work/app-review',
  repoId: 'repo-1',
  path: '/work/app-review',
  pullRequestKey: 'k',
  commit: 'bbb2'
}
const run: QualityGateRunView = {
  id: 'run-1',
  gateId: 'test',
  gate: { name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 600 },
  repoId: 'repo-1',
  worktreeId: worktree.worktreeId,
  worktreePath: worktree.path,
  startedBy: { kind: 'local-cli' },
  source: { head: 'bbb2', clean: true, fingerprint: 'f' },
  status: 'failed',
  requestedAt: 10,
  startedAt: 11,
  finishedAt: 20,
  exitCode: 1,
  error: null,
  outputTruncated: false,
  liveness: 'exited',
  freshness: null
}
const gateRuns: AzureDevOpsReviewGateRunFacts = {
  findRun: (runId) => (runId === run.id ? run : null),
  reviewWorktree: worktree,
  gates: [{ id: 'test', name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 600 }]
}
const cited: ReviewFindingEvidence = { kind: 'command-run', source: 'quality-gate', runId: 'run-1' }
const quote: ReviewFindingEvidence = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 1,
  endLine: 1,
  quote: 'sum += item'
}

function draft(patch: Partial<AzureDevOpsReviewDraftView> = {}): AzureDevOpsReviewDraftView {
  return {
    id: 'd1',
    pullRequestKey: 'k',
    kind: 'general',
    filePath: null,
    anchor: null,
    threadId: null,
    threadStatus: null,
    body: 'The cart test fails.',
    author: { kind: 'agent', label: null },
    iterationId: 2,
    commit: 'bbb2',
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 1,
    outdated: false,
    severity: 'error',
    evidence: [cited],
    ...patch
  }
}

async function describeOne(
  view: AzureDevOpsReviewDraftView,
  facts: AzureDevOpsReviewGateRunFacts | null | 'not passed' = gateRuns,
  file: string[] = ['sum += item']
): Promise<AzureDevOpsReviewDraftView> {
  const described = await describeAzureDevOpsReviewDraftFindings({
    drafts: [view],
    iterations,
    readFile: async () => ({ state: 'text', lines: file }),
    ...(facts === 'not passed' ? {} : { gateRuns: facts })
  })
  return described[0]
}

describe('a draft that cites a gate run', () => {
  it('is verified and carries the record of the run, by which its output can be opened', async () => {
    const described = await describeOne(draft())
    expect(described.certainty).toBe('verified')
    expect(described.evidenceChecks).toEqual([
      {
        status: 'confirmed',
        run: {
          source: 'quality-gate',
          runId: 'run-1',
          worktreeId: worktree.worktreeId,
          name: 'Tests',
          command: 'pnpm test',
          status: 'failed',
          exitCode: 1,
          commit: 'bbb2',
          cleanTree: true,
          finishedAt: 20,
          outputTruncated: false
        }
      }
    ])
  })

  it('stays verified next to a citation that holds, and is contradicted by one that does not', async () => {
    expect((await describeOne(draft({ evidence: [quote, cited] }))).certainty).toBe('verified')
    const contradicted = await describeOne(draft({ evidence: [cited, quote] }), gateRuns, ['other'])
    expect(contradicted.evidenceChecks?.map((check) => check.status)).toEqual([
      'confirmed',
      'refuted'
    ])
    expect(contradicted.certainty).toBe('contradicted')
  })

  it.each<
    [string, Partial<AzureDevOpsReviewGateRunFacts>, Partial<AzureDevOpsReviewDraftView>, string]
  >([
    ['a run that does not exist', { findRun: () => null }, {}, 'run-not-found'],
    [
      'a run of another worktree',
      { reviewWorktree: { ...worktree, worktreeId: 'x' } },
      {},
      'run-other-worktree'
    ],
    [
      'a run from the commit the draft moved away from',
      { findRun: () => ({ ...run, source: { head: 'aaa1', clean: true, fingerprint: 'f' } }) },
      {},
      'run-stale-commit'
    ],
    [
      'a run that passed',
      { findRun: () => ({ ...run, status: 'passed', exitCode: 0 }) },
      {},
      'run-passed'
    ],
    [
      'a draft on a commit outside the pull request',
      {},
      { commit: 'c0ffee' },
      'commit-not-in-review'
    ]
  ])(
    'is uncertain with %s, and the draft says why',
    async (_what, factsPatch, draftPatch, reason) => {
      const described = await describeOne(draft(draftPatch), { ...gateRuns, ...factsPatch })
      expect(described.evidenceChecks).toMatchObject([{ status: 'unchecked', reason }])
      expect(described.certainty).toBe('uncertain')
    }
  )

  it.each([null, 'not passed'] as const)(
    'is not checked on a host wired without run records (%s)',
    async (facts) => {
      const described = await describeOne(draft(), facts)
      expect(described.evidenceChecks).toEqual([
        { status: 'unchecked', reason: 'runs-unavailable' }
      ])
      expect(described.certainty).toBe('uncertain')
    }
  )

  it('treats a run from a source this build does not know as an unknown kind and looks nothing up', async () => {
    const later = { kind: 'command-run', source: 'one-off', runId: 'run-1' }
    const described = await describeOne(draft({ evidence: [later] }))
    expect(described.evidenceChecks).toEqual([{ status: 'unchecked', reason: 'unknown-kind' }])
    expect(described.certainty).toBe('uncertain')
  })

  it('marks an answer in a thread as nothing, even with a confirmed run', async () => {
    const reply = draft({ kind: 'reply', threadId: 3, severity: undefined })
    const described = await describeOne(reply)
    expect(described.evidenceChecks).toMatchObject([{ status: 'confirmed' }])
    expect(described).not.toHaveProperty('certainty')
  })

  it('checks nothing on a published draft', async () => {
    const described = await describeOne(draft({ state: 'published' }))
    expect(described).not.toHaveProperty('evidenceChecks')
    expect(described).not.toHaveProperty('certainty')
  })
})
