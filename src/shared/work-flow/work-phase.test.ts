import { describe, expect, it } from 'vitest'
import { knownWorkFact, unknownWorkFact, type WorkFact } from './work-fact'
import { deriveWorkPhase, type WorkPhaseFacts } from './work-phase'
import type { WorkBranch, WorkPullRequest, WorkRelease, WorkReview } from './work-unit-facts'

const LAST_COMMIT = '2026-11-16T09:00:00.000Z'
const LAST_VERSION = '2026-11-17T09:00:00.000Z'
const FEEDBACK = '2026-11-18T09:00:00.000Z'
const LAST_ACTIVITY = '2026-11-19T09:00:00.000Z'
const MERGED = '2026-11-19T08:00:00.000Z'
const TAGGED = '2026-11-20T08:00:00.000Z'

const UNRELEASED: WorkRelease = {
  production: { state: 'unreleased' },
  dev: { state: 'unreleased' }
}

function branch(overrides: Partial<WorkBranch> = {}): WorkFact<WorkBranch> {
  return knownWorkFact({ ownCommitCount: 3, lastCommitAt: LAST_COMMIT, pushed: true, ...overrides })
}

function review(overrides: Partial<WorkReview> = {}): WorkFact<WorkReview> {
  return knownWorkFact({
    verdict: 'none',
    reviewers: [],
    unresolvedThreads: 0,
    lastFeedbackAt: null,
    ...overrides
  })
}

function pullRequest(overrides: Partial<WorkPullRequest> = {}): WorkFact<WorkPullRequest | null> {
  return knownWorkFact({
    provider: 'azure-devops',
    number: 12,
    title: 'Add sign-in',
    url: 'https://example.test/pr/12',
    state: 'open',
    createdByUser: true,
    sourceBranch: 'feature/sign-in',
    targetBranch: 'main',
    updatedAt: LAST_ACTIVITY,
    lastVersionAt: LAST_VERSION,
    review: review(),
    mergedAt: null,
    mergeCommit: null,
    ...overrides
  })
}

function phaseOf(facts: Partial<WorkPhaseFacts>): ReturnType<typeof deriveWorkPhase> {
  return deriveWorkPhase({
    branch: branch(),
    pullRequest: knownWorkFact(null),
    release: UNRELEASED,
    ...facts
  })
}

const merged = (overrides: Partial<WorkPullRequest> = {}): WorkFact<WorkPullRequest | null> =>
  pullRequest({ state: 'merged', mergedAt: MERGED, mergeCommit: 'c0ffee', ...overrides })

describe('phase of a unit of work, one row of the documented table each', () => {
  it('no pull request: own commits and no pull request, since the last commit', () => {
    expect(phaseOf({})).toEqual({
      kind: 'phase',
      phase: 'no-pull-request',
      since: LAST_COMMIT,
      sinceExact: true
    })
  })

  it('waiting for review: open, not a draft, nobody answered the last version', () => {
    expect(phaseOf({ pullRequest: pullRequest() })).toEqual({
      kind: 'phase',
      phase: 'waiting-for-review',
      since: LAST_VERSION,
      sinceExact: true
    })
  })

  it('changes requested: open threads of others, since the last feedback', () => {
    const waiting = pullRequest({
      review: review({ unresolvedThreads: 2, lastFeedbackAt: FEEDBACK })
    })
    expect(phaseOf({ pullRequest: waiting })).toEqual({
      kind: 'phase',
      phase: 'changes-requested',
      since: FEEDBACK,
      sinceExact: true
    })
  })

  it('changes requested: a waiting-for-author or rejecting vote without any thread', () => {
    const voted = pullRequest({
      review: review({ verdict: 'changes-requested', lastFeedbackAt: FEEDBACK })
    })
    expect(phaseOf({ pullRequest: voted })).toMatchObject({ phase: 'changes-requested' })
  })

  it('approved: approved and not merged', () => {
    const approved = pullRequest({
      review: review({ verdict: 'approved', lastFeedbackAt: FEEDBACK })
    })
    expect(phaseOf({ pullRequest: approved })).toEqual({
      kind: 'phase',
      phase: 'approved',
      since: LAST_ACTIVITY,
      sinceExact: false
    })
  })

  it('merged, not released: no production tag holds the merge commit, since the merge', () => {
    expect(phaseOf({ pullRequest: merged() })).toEqual({
      kind: 'phase',
      phase: 'merged-unreleased',
      since: MERGED,
      sinceExact: true
    })
  })

  it('merged, not released also when only a dev build has it', () => {
    const release: WorkRelease = {
      production: { state: 'unreleased' },
      dev: { state: 'released', tag: 'v2.4.0-dev', taggedAt: TAGGED }
    }
    expect(phaseOf({ pullRequest: merged(), release })).toMatchObject({
      phase: 'merged-unreleased'
    })
  })

  it('released: a production tag holds the merge commit, since the tag', () => {
    const release: WorkRelease = {
      production: { state: 'released', tag: 'v2.4.0', taggedAt: TAGGED },
      dev: { state: 'unreleased' }
    }
    expect(phaseOf({ pullRequest: merged(), release })).toEqual({
      kind: 'phase',
      phase: 'released',
      since: TAGGED,
      sinceExact: true
    })
  })
})

describe('a change of phase', () => {
  it('goes back to the reviewers once the author pushes after the feedback', () => {
    const blocked = review({
      verdict: 'changes-requested',
      unresolvedThreads: 1,
      lastFeedbackAt: FEEDBACK
    })
    const before = pullRequest({ review: blocked })
    const pushed = '2026-11-18T15:00:00.000Z'
    const after = pullRequest({ review: blocked, lastVersionAt: pushed })
    expect(phaseOf({ pullRequest: before })).toMatchObject({ phase: 'changes-requested' })
    expect(phaseOf({ pullRequest: after })).toEqual({
      kind: 'phase',
      phase: 'waiting-for-review',
      since: pushed,
      sinceExact: true
    })
  })

  it('counts the reviewers turn from their settled comment when it is later than the version', () => {
    const settled = pullRequest({
      review: review({ unresolvedThreads: 0, lastFeedbackAt: FEEDBACK })
    })
    expect(phaseOf({ pullRequest: settled })).toMatchObject({
      phase: 'waiting-for-review',
      since: FEEDBACK
    })
  })

  it('keeps an approval that stands after a newer version, and open threads outweigh it before', () => {
    const approvedWithThreads = review({
      verdict: 'approved',
      unresolvedThreads: 1,
      lastFeedbackAt: FEEDBACK
    })
    expect(phaseOf({ pullRequest: pullRequest({ review: approvedWithThreads }) })).toMatchObject({
      phase: 'changes-requested'
    })
    const pushed = pullRequest({ review: approvedWithThreads, lastVersionAt: LAST_ACTIVITY })
    expect(phaseOf({ pullRequest: pushed })).toMatchObject({ phase: 'approved' })
  })

  it('takes the pull request over the branch once one exists', () => {
    expect(phaseOf({ branch: branch(), pullRequest: merged() })).toMatchObject({
      phase: 'merged-unreleased'
    })
  })
})

describe('states the table leaves out', () => {
  it('a draft asks nobody for a review', () => {
    expect(phaseOf({ pullRequest: pullRequest({ state: 'draft' }) })).toEqual({
      kind: 'phase',
      phase: 'draft',
      since: LAST_ACTIVITY,
      sinceExact: false
    })
  })

  it('a merge ends the work in a repository without a production tag pattern', () => {
    const release: WorkRelease = { production: { state: 'off' }, dev: { state: 'off' } }
    expect(phaseOf({ pullRequest: merged({ mergeCommit: null }), release })).toMatchObject({
      phase: 'merged',
      since: MERGED
    })
  })

  it('an abandoned pull request leaves the branch without one', () => {
    const abandoned = pullRequest({ state: 'closed' })
    expect(phaseOf({ pullRequest: abandoned })).toMatchObject({ phase: 'no-pull-request' })
    expect(phaseOf({ pullRequest: abandoned, branch: null })).toEqual({
      kind: 'not-work',
      reason: 'pull-request-closed'
    })
  })

  it('is not work of the user without own commits or with a pull request of someone else', () => {
    expect(phaseOf({ branch: branch({ ownCommitCount: 0, lastCommitAt: null }) })).toEqual({
      kind: 'not-work',
      reason: 'no-own-commits'
    })
    expect(phaseOf({ pullRequest: pullRequest({ createdByUser: false }) })).toEqual({
      kind: 'not-work',
      reason: 'pull-request-of-someone-else'
    })
  })
})

describe('a fact that is missing or unknown', () => {
  it('pull request unknown: never "no pull request" from the branch alone', () => {
    expect(phaseOf({ pullRequest: unknownWorkFact('source-failed') })).toEqual({
      kind: 'unknown',
      missing: 'pull-request',
      reason: 'source-failed'
    })
  })

  it('branch unknown: the host that leads the repository cannot be asked', () => {
    expect(phaseOf({ branch: unknownWorkFact('host-unreachable') })).toEqual({
      kind: 'unknown',
      missing: 'branch',
      reason: 'host-unreachable'
    })
  })

  it('review unknown: an open pull request is not waiting, blocked or approved by guess', () => {
    const open = pullRequest({ review: unknownWorkFact('not-provided') })
    expect(phaseOf({ pullRequest: open })).toEqual({
      kind: 'unknown',
      missing: 'review',
      reason: 'not-provided'
    })
  })

  it('release unknown: a merge is not "not released" when the tags cannot say', () => {
    for (const reason of ['no-matching-tags', 'tags-stale', 'host-unreachable'] as const) {
      const release: WorkRelease = {
        production: { state: 'unknown', reason },
        dev: { state: 'unreleased' }
      }
      expect(phaseOf({ pullRequest: merged(), release })).toEqual({
        kind: 'unknown',
        missing: 'release',
        reason
      })
    }
  })

  it('merge commit unknown: no tag can be checked against the merge', () => {
    expect(phaseOf({ pullRequest: merged({ mergeCommit: null }) })).toEqual({
      kind: 'unknown',
      missing: 'merge-commit',
      reason: 'not-provided'
    })
  })

  it('a start the provider does not give is the last activity, marked as not exact', () => {
    const blocked = pullRequest({
      lastVersionAt: null,
      review: review({ verdict: 'changes-requested', unresolvedThreads: null })
    })
    expect(phaseOf({ pullRequest: blocked })).toEqual({
      kind: 'phase',
      phase: 'changes-requested',
      since: LAST_ACTIVITY,
      sinceExact: false
    })
    const silent = pullRequest({ lastVersionAt: null, updatedAt: null })
    expect(phaseOf({ pullRequest: silent })).toEqual({
      kind: 'phase',
      phase: 'waiting-for-review',
      since: null,
      sinceExact: false
    })
  })
})
