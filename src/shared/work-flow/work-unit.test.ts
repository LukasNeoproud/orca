import { describe, expect, it } from 'vitest'
import type { HostedReviewInfo } from '../hosted-review'
import { workPullRequestFromHostedReview } from './hosted-review-work-facts'
import {
  forgetWorkFact,
  knownWorkFact,
  readWorkFactUnknownReason,
  unknownWorkFact
} from './work-fact'
import { DEFAULT_WORK_FLOW_SETTINGS, readWorkFlowSettings } from './work-flow-settings'
import { deriveWorkPhase } from './work-phase'
import { workReviewVerdictFromVotes } from './work-review-verdict'
import {
  composeWorkUnit,
  restallWorkUnit,
  workUnitId,
  workUnitOfUnreachableHost,
  type WorkUnitFacts
} from './work-unit'
import type { WorkRelease, WorkReviewVote } from './work-unit-facts'

const UTC = (): number => 0
const UNRELEASED: WorkRelease = {
  production: { state: 'unreleased' },
  dev: { state: 'off' }
}

function hostedReview(overrides: Partial<HostedReviewInfo> = {}): HostedReviewInfo {
  return {
    provider: 'github',
    number: 41,
    title: 'APP-7 Add export',
    state: 'open',
    url: 'https://example.test/pull/41',
    status: 'success',
    updatedAt: '2026-11-17T10:00:00.000Z',
    mergeable: 'MERGEABLE',
    ...overrides
  }
}

describe('phase from what every review provider gives', () => {
  const phaseOf = (review: HostedReviewInfo) =>
    deriveWorkPhase({
      branch: null,
      pullRequest: knownWorkFact(workPullRequestFromHostedReview(review, 'feature/export')),
      release: UNRELEASED
    })

  it('follows the decision of the provider, counted from the last activity', () => {
    const decisions = [
      ['REVIEW_REQUIRED', 'waiting-for-review'],
      [null, 'waiting-for-review'],
      ['CHANGES_REQUESTED', 'changes-requested'],
      ['APPROVED', 'approved']
    ] as const
    for (const [reviewDecision, phase] of decisions) {
      expect(phaseOf(hostedReview({ reviewDecision }))).toEqual({
        kind: 'phase',
        phase,
        since: '2026-11-17T10:00:00.000Z',
        sinceExact: false
      })
    }
    expect(phaseOf(hostedReview({ state: 'draft' }))).toMatchObject({ phase: 'draft' })
  })

  it('is unknown for a provider that reports no decision', () => {
    expect(phaseOf(hostedReview({ provider: 'gitlab' }))).toEqual({
      kind: 'unknown',
      missing: 'review',
      reason: 'not-provided'
    })
  })

  it('is unknown after a merge until the provider names the merge commit', () => {
    expect(phaseOf(hostedReview({ state: 'merged' }))).toEqual({
      kind: 'unknown',
      missing: 'merge-commit',
      reason: 'not-provided'
    })
  })

  it('carries the pull request over without inventing what the provider left out', () => {
    expect(workPullRequestFromHostedReview(hostedReview({ baseRefName: 'main' }))).toMatchObject({
      provider: 'github',
      number: 41,
      targetBranch: 'main',
      sourceBranch: null,
      createdByUser: null,
      lastVersionAt: null,
      mergedAt: null,
      mergeCommit: null
    })
  })
})

describe('what the votes of reviewers add up to', () => {
  const verdict = (...votes: [WorkReviewVote, boolean?][]) =>
    workReviewVerdictFromVotes(votes.map(([vote, required = false]) => ({ vote, required })))

  it('is blocked by one waiting-for-author or rejecting vote', () => {
    expect(verdict(['approved'], ['waiting-for-author'])).toBe('changes-requested')
    expect(verdict(['approved-with-suggestions'], ['rejected'])).toBe('changes-requested')
  })

  it('is approved once somebody approved and no required reviewer is missing', () => {
    expect(verdict(['approved'], ['none'])).toBe('approved')
    expect(verdict(['approved-with-suggestions', true])).toBe('approved')
    expect(verdict(['approved'], ['none', true])).toBe('none')
    expect(verdict(['none'])).toBe('none')
    expect(verdict()).toBe('none')
  })
})

describe('unit of work', () => {
  const facts: WorkUnitFacts = {
    repository: { key: 'example.test/team/app', hostId: 'local', repoId: 'repo-1', name: 'app' },
    branch: 'feature/export',
    worktreeId: 'repo-1::/work/app-export',
    branchFacts: knownWorkFact({
      ownCommitCount: 2,
      lastCommitAt: '2026-11-16T09:00:00.000Z',
      pushed: false
    }),
    pullRequest: knownWorkFact(null),
    ticket: { key: 'APP-7', source: 'branch', ticket: unknownWorkFact('not-connected') },
    release: UNRELEASED
  }
  const wednesday = Date.UTC(2026, 10, 18, 9)

  it('carries its facts with the phase and the stall derived from them', () => {
    const unit = composeWorkUnit(facts, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)
    expect(unit).toMatchObject({
      ...facts,
      id: workUnitId('example.test/team/app', 'feature/export', null),
      phase: { kind: 'phase', phase: 'no-pull-request' },
      stall: { kind: 'stalled', workingDays: 1, deadlineAt: '2026-11-17T09:00:00.000Z' }
    })
  })

  it('keeps the unit when the ticket is unknown: the tracker does not decide the phase', () => {
    const unit = composeWorkUnit(facts, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)
    expect(unit?.ticket?.ticket).toEqual({ known: false, reason: 'not-connected' })
    expect(unit?.phase.kind).toBe('phase')
  })

  it('is no unit when the facts describe no work of the user', () => {
    const idle = {
      ...facts,
      branchFacts: knownWorkFact({ ownCommitCount: 0, lastCommitAt: null, pushed: null })
    }
    expect(composeWorkUnit(idle, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)).toBeNull()
  })

  it('is a different unit for each pull request of a reused branch, the same from any host', () => {
    const review = workPullRequestFromHostedReview(hostedReview({ reviewDecision: null }))
    const withReview = { ...facts, pullRequest: knownWorkFact(review) }
    const unit = composeWorkUnit(withReview, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)
    expect(unit?.id).toBe(workUnitId('example.test/team/app', 'feature/export', 41))
    expect(unit?.id).not.toBe(workUnitId('example.test/team/app', 'feature/export', 42))
    const elsewhere = { ...withReview, repository: { ...facts.repository, hostId: null } }
    expect(composeWorkUnit(elsewhere, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)?.id).toBe(
      unit?.id
    )
    const abandoned = {
      ...facts,
      pullRequest: knownWorkFact({ ...review, state: 'closed' as const })
    }
    expect(composeWorkUnit(abandoned, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)?.id).toBe(
      workUnitId('example.test/team/app', 'feature/export', null)
    )
  })

  it('is stalled by the deadlines of the app that shows it', () => {
    const unit = composeWorkUnit(facts, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)
    const patient = readWorkFlowSettings({ deadlineWorkingDays: { 'no-pull-request': 5 } })
    expect(unit && restallWorkUnit(unit, patient, wednesday, UTC).stall).toMatchObject({
      kind: 'within',
      workingDays: 5
    })
  })

  it('has an unknown phase once its host stops answering, and is not stalled', () => {
    const unit = composeWorkUnit(facts, DEFAULT_WORK_FLOW_SETTINGS, wednesday, UTC)
    const lost = unit && workUnitOfUnreachableHost(unit)
    expect(lost).toMatchObject({
      id: unit?.id,
      branch: 'feature/export',
      ticket: facts.ticket,
      phase: { kind: 'unknown', missing: 'pull-request', reason: 'host-unreachable' },
      stall: { kind: 'unknown' },
      branchFacts: { known: false, reason: 'host-unreachable', lastKnown: { ownCommitCount: 2 } },
      pullRequest: { known: false, reason: 'host-unreachable', lastKnown: null },
      release: {
        production: { state: 'unknown', reason: 'host-unreachable' },
        dev: { state: 'off' }
      }
    })
    // Deriving again from what is left gives the same answer: nothing known remains to guess from.
    expect(
      lost &&
        deriveWorkPhase({
          branch: lost.branchFacts,
          pullRequest: lost.pullRequest,
          release: lost.release
        })
    ).toEqual(lost?.phase)
  })
})

describe('fact of a source', () => {
  it('keeps what it last said for display once the source cannot be asked', () => {
    expect(forgetWorkFact(knownWorkFact(3, '2026-11-18T09:00:00.000Z'), 'source-failed')).toEqual({
      known: false,
      reason: 'source-failed',
      lastKnown: 3
    })
    expect(forgetWorkFact(unknownWorkFact('not-loaded'), 'host-unreachable')).toEqual({
      known: false,
      reason: 'host-unreachable'
    })
  })

  it('reads a reason of a newer build as a failed source', () => {
    expect(readWorkFactUnknownReason('tags-stale')).toBe('tags-stale')
    expect(readWorkFactUnknownReason('quota-exceeded')).toBe('source-failed')
    expect(readWorkFactUnknownReason(undefined)).toBe('source-failed')
  })
})
