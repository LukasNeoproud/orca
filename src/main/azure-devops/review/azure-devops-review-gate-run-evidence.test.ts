import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewIteration } from '../../../shared/azure-devops-review-types'
import type { QualityGateDefinition, QualityGateRunView } from '../../../shared/quality-gate-types'
import type { ReviewCommandRunEvidence } from '../../../shared/review-command-run-evidence'
import type { Repo } from '../../../shared/repo-types'
import {
  azureDevOpsReviewGateRunFacts,
  checkAzureDevOpsReviewGateRunEvidence,
  type AzureDevOpsReviewGateRunFacts
} from './azure-devops-review-gate-run-evidence'

const PR = 'dev.azure.com/contoso+repo+7'
const iterations: AzureDevOpsReviewIteration[] = [
  { id: 1, sourceCommit: 'AAA1', targetCommit: 't', baseCommit: 'b' },
  { id: 2, sourceCommit: 'BBB2', targetCommit: 't', baseCommit: 'b' }
]
const tests: QualityGateDefinition = {
  id: 'test',
  name: 'Tests',
  command: 'pnpm test',
  required: true,
  timeoutSeconds: 600
}
const reviewWorktree = {
  worktreeId: 'repo-1::/work/app-review',
  repoId: 'repo-1',
  path: '/work/app-review',
  pullRequestKey: PR,
  commit: 'bbb2'
}
const evidence: ReviewCommandRunEvidence = {
  kind: 'command-run',
  source: 'quality-gate',
  runId: 'run-1'
}

function run(patch: Partial<QualityGateRunView> = {}): QualityGateRunView {
  return {
    id: 'run-1',
    gateId: 'test',
    gate: { name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 600 },
    repoId: 'repo-1',
    worktreeId: reviewWorktree.worktreeId,
    worktreePath: reviewWorktree.path,
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
    freshness: null,
    ...patch
  }
}

function facts(
  recorded: QualityGateRunView | null,
  patch: Partial<AzureDevOpsReviewGateRunFacts> = {}
): AzureDevOpsReviewGateRunFacts {
  return {
    findRun: (runId) => (recorded?.id === runId ? recorded : null),
    reviewWorktree,
    gates: [tests],
    ...patch
  }
}

function check(
  recorded: QualityGateRunView | null,
  patch: Partial<AzureDevOpsReviewGateRunFacts> = {},
  draftCommit: string | null = 'bbb2'
) {
  return checkAzureDevOpsReviewGateRunEvidence({
    evidence,
    draftCommit,
    iterations,
    facts: facts(recorded, patch)
  })
}

describe('checkAzureDevOpsReviewGateRunEvidence', () => {
  it('confirms a gate of the settings that failed in the review worktree on the commit of the draft', () => {
    expect(check(run())).toEqual({
      status: 'confirmed',
      run: {
        source: 'quality-gate',
        runId: 'run-1',
        worktreeId: reviewWorktree.worktreeId,
        name: 'Tests',
        command: 'pnpm test',
        status: 'failed',
        exitCode: 1,
        commit: 'bbb2',
        cleanTree: true,
        finishedAt: 20,
        outputTruncated: false
      }
    })
  })

  it('compares commits without regard to case', () => {
    expect(check(run({ source: { head: 'BBB2', clean: true, fingerprint: 'f' } })).status).toBe(
      'confirmed'
    )
  })

  it('confirms whoever started the run: what counts is that the host ran a gate of the settings', () => {
    for (const startedBy of [
      { kind: 'desktop' },
      { kind: 'feedback-loop' },
      { kind: 'paired-device', deviceId: 'd' }
    ] as const) {
      expect(check(run({ startedBy })).status).toBe('confirmed')
    }
  })

  it.each<[string, ReturnType<typeof check>, string, boolean]>([
    ['a run this host keeps no record of', check(null), 'run-not-found', false],
    [
      'a run of another worktree',
      check(run({ worktreeId: 'repo-1::/work/app' })),
      'run-other-worktree',
      false
    ],
    [
      'a run of the same path under another repository',
      check(run({ repoId: 'repo-2' })),
      'run-other-worktree',
      false
    ],
    [
      'a pull request without a review worktree',
      check(run(), { reviewWorktree: null }),
      'run-other-worktree',
      false
    ],
    ['a gate the settings no longer hold', check(run(), { gates: [] }), 'run-gate-changed', true],
    [
      'a gate whose command was edited since',
      check(run(), { gates: [{ ...tests, command: 'pnpm test --bail' }] }),
      'run-gate-changed',
      true
    ],
    [
      'a draft on a commit outside the pull request',
      check(run(), {}, null),
      'commit-not-in-review',
      true
    ],
    [
      'a run on the commit of an older iteration',
      check(run({ source: { head: 'aaa1', clean: true, fingerprint: 'f' } })),
      'run-stale-commit',
      true
    ],
    [
      'a run on a commit the pull request never had',
      check(run({ source: { head: 'ccc3', clean: true, fingerprint: 'f' } })),
      'run-other-commit',
      true
    ],
    [
      'a run on a newer iteration than the draft',
      check(run(), {}, 'aaa1'),
      'run-other-commit',
      true
    ],
    [
      'a run without git behind it',
      check(run({ source: { head: null, clean: null, fingerprint: null } })),
      'run-other-commit',
      true
    ],
    [
      'a run and a draft that both stayed on an older iteration',
      check(run({ source: { head: 'aaa1', clean: true, fingerprint: 'f' } }), {}, 'aaa1'),
      'run-stale-commit',
      true
    ],
    [
      'a run over uncommitted changes',
      check(run({ source: { head: 'bbb2', clean: false, fingerprint: 'f' } })),
      'run-dirty-tree',
      true
    ],
    [
      'a run whose tree could not be read',
      check(run({ source: { head: 'bbb2', clean: null, fingerprint: null } })),
      'run-dirty-tree',
      true
    ],
    [
      'a run that has not started reading the tree',
      check(run({ source: null, status: 'queued', liveness: 'live', exitCode: null })),
      'run-not-finished',
      true
    ],
    [
      'a run that is still going',
      check(run({ status: 'running', liveness: 'live', exitCode: null, finishedAt: null })),
      'run-not-finished',
      true
    ],
    ['a run that passed', check(run({ status: 'passed', exitCode: 0 })), 'run-passed', true],
    [
      'a run that timed out',
      check(run({ status: 'timed-out', exitCode: null })),
      'run-no-verdict',
      true
    ],
    [
      'a run that was stopped',
      check(run({ status: 'cancelled', exitCode: null })),
      'run-no-verdict',
      true
    ],
    [
      'a command that never started',
      check(run({ status: 'not-started', exitCode: null })),
      'run-no-verdict',
      true
    ],
    [
      'a run nobody observed to the end',
      check(run({ status: 'unverifiable', liveness: 'unverifiable', exitCode: null })),
      'run-no-verdict',
      true
    ]
  ])('does not confirm %s', (_what, result, reason, describesRun) => {
    expect(result).toMatchObject({ status: 'unchecked', reason })
    // A run that is not this pull request's is not described to whoever reads the draft.
    expect('run' in result).toBe(describesRun)
  })

  it('never contradicts a finding: a run that proves nothing is missing proof, not a false quote', () => {
    for (const status of ['passed', 'timed-out', 'cancelled', 'not-started'] as const) {
      expect(check(run({ status })).status).toBe('unchecked')
    }
  })

  it('says the host has no records when it was wired without the gate service', () => {
    expect(
      checkAzureDevOpsReviewGateRunEvidence({
        evidence,
        draftCommit: 'bbb2',
        iterations,
        facts: null
      })
    ).toEqual({ status: 'unchecked', reason: 'runs-unavailable' })
  })

  it('counts a commit pushed again in a later iteration as that later iteration', () => {
    const repushed = [
      ...iterations,
      { id: 3, sourceCommit: 'aaa1', targetCommit: 't2', baseCommit: 'b' }
    ]
    expect(
      checkAzureDevOpsReviewGateRunEvidence({
        evidence,
        draftCommit: 'aaa1',
        iterations: repushed,
        facts: facts(run({ source: { head: 'aaa1', clean: true, fingerprint: 'f' } }))
      }).status
    ).toBe('confirmed')
  })

  it('carries no output of the command', () => {
    expect(JSON.stringify(check(run()))).not.toMatch(/stdout|stderr/)
  })
})

describe('azureDevOpsReviewGateRunFacts', () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the facts read only `id` and `qualityGates` of a repository row.
  const repo = (patch: Record<string, unknown>) => ({ id: 'repo-1', ...patch }) as unknown as Repo
  const findGateRun = () => null

  it('reads the gates from the repository row of the review worktree and drops broken entries', () => {
    const result = azureDevOpsReviewGateRunFacts(
      {
        listRepos: () => [
          repo({ id: 'repo-0', qualityGates: [{ ...tests, id: 'other' }] }),
          repo({ qualityGates: [tests, { id: 'bad id', name: 'x', command: 'y' }] })
        ],
        findReviewWorktree: () => reviewWorktree,
        findGateRun
      },
      'key',
      PR
    )
    expect(result?.gates).toEqual([tests])
    expect(result?.reviewWorktree).toEqual(reviewWorktree)
  })

  it("does not take the repo's latest review worktree for the worktree of this pull request", () => {
    const result = azureDevOpsReviewGateRunFacts(
      {
        listRepos: () => [repo({ qualityGates: [tests] })],
        // What the registry answers when the pull request has no worktree of its own.
        findReviewWorktree: () => ({ ...reviewWorktree, pullRequestKey: 'another+pr+8' }),
        findGateRun
      },
      'key',
      PR
    )
    expect(result).toMatchObject({ reviewWorktree: null, gates: [] })
  })

  it('knows no gate of a repository that has only a pending proposal', () => {
    const result = azureDevOpsReviewGateRunFacts(
      {
        // A proposal lives in its own store; the row is all the facts read.
        listRepos: () => [repo({ qualityGateProposal: { items: [tests] } })],
        findReviewWorktree: () => reviewWorktree,
        findGateRun
      },
      'key',
      PR
    )
    expect(result?.gates).toEqual([])
  })

  it('is null on a host that cannot look runs up', () => {
    expect(
      azureDevOpsReviewGateRunFacts(
        { listRepos: () => [], findReviewWorktree: () => null },
        'key',
        PR
      )
    ).toBeNull()
  })
})
