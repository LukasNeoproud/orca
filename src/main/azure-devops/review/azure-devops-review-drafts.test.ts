import { describe, expect, it } from 'vitest'
import {
  applyAzureDevOpsReviewDraftPatch,
  buildAzureDevOpsReviewDraft,
  isAzureDevOpsReviewDraftOutdated,
  normalizeAzureDevOpsReviewDraft
} from './azure-devops-review-drafts'

const iterations = [
  { id: 1, sourceCommit: 'aaa', targetCommit: 't', baseCommit: 'b' },
  { id: 2, sourceCommit: 'bbb', targetCommit: 't', baseCommit: 'b' }
]
const context = { id: 'd1', now: 100, iterations }

describe('buildAzureDevOpsReviewDraft', () => {
  it('targets the latest iteration by default', () => {
    const draft = buildAzureDevOpsReviewDraft(
      {
        pullRequestKey: 'k',
        kind: 'inline',
        body: ' Missing null check ',
        filePath: '/src/a.ts',
        anchor: { side: 'right', startLine: 4, endLine: 2 }
      },
      context
    )
    expect(draft).toMatchObject({
      filePath: 'src/a.ts',
      anchor: { side: 'right', startLine: 4, endLine: 4 },
      body: 'Missing null check',
      iterationId: 2,
      commit: 'bbb',
      author: { kind: 'user' },
      state: 'draft'
    })
  })

  it('keeps the iteration of an older reviewed commit, making the draft outdated', () => {
    const draft = buildAzureDevOpsReviewDraft(
      { pullRequestKey: 'k', kind: 'file', body: 'x', filePath: 'a.ts', commit: 'AAA' },
      context
    )
    expect(draft.iterationId).toBe(1)
    expect(isAzureDevOpsReviewDraftOutdated(draft, iterations[1])).toBe(true)
  })

  it('validates kind-specific fields', () => {
    expect(() =>
      buildAzureDevOpsReviewDraft(
        { pullRequestKey: 'k', kind: 'inline', body: 'x', filePath: 'a' },
        context
      )
    ).toThrow(/line range/)
    expect(() =>
      buildAzureDevOpsReviewDraft({ pullRequestKey: 'k', kind: 'reply', body: 'x' }, context)
    ).toThrow(/thread id/)
    expect(() =>
      buildAzureDevOpsReviewDraft({ pullRequestKey: 'k', kind: 'general', body: '  ' }, context)
    ).toThrow(/body/)
  })

  it('never treats general and reply drafts as outdated', () => {
    const draft = buildAzureDevOpsReviewDraft(
      {
        pullRequestKey: 'k',
        kind: 'reply',
        body: 'ok',
        threadId: 3,
        threadStatus: 'fixed',
        commit: 'aaa'
      },
      context
    )
    expect(draft.threadStatus).toBe('fixed')
    expect(isAzureDevOpsReviewDraftOutdated(draft, iterations[1])).toBe(false)
  })
})

describe('applyAzureDevOpsReviewDraftPatch', () => {
  const outdated = buildAzureDevOpsReviewDraft(
    {
      pullRequestKey: 'k',
      kind: 'inline',
      body: 'x',
      filePath: 'a.ts',
      anchor: { side: 'right', startLine: 1, endLine: 1 },
      commit: 'aaa'
    },
    context
  )

  it('keeps the iteration on a body-only edit', () => {
    const next = applyAzureDevOpsReviewDraftPatch(
      outdated,
      { body: 'y' },
      { now: 200, latestIteration: iterations[1] }
    )
    expect(next).toMatchObject({ body: 'y', iterationId: 1, updatedAt: 200 })
  })

  it('moves to the latest iteration when re-anchored', () => {
    const next = applyAzureDevOpsReviewDraftPatch(
      outdated,
      { anchor: { side: 'right', startLine: 7, endLine: 8 } },
      { now: 200, latestIteration: iterations[1] }
    )
    expect(next).toMatchObject({
      iterationId: 2,
      commit: 'bbb',
      anchor: { startLine: 7, endLine: 8 }
    })
    expect(isAzureDevOpsReviewDraftOutdated(next, iterations[1])).toBe(false)
  })

  it('refuses to edit published drafts', () => {
    expect(() =>
      applyAzureDevOpsReviewDraftPatch(
        { ...outdated, state: 'published' },
        { body: 'y' },
        { now: 1, latestIteration: null }
      )
    ).toThrow(/published/)
  })
})

describe('normalizeAzureDevOpsReviewDraft', () => {
  it('rejects malformed records and fills defaults', () => {
    expect(normalizeAzureDevOpsReviewDraft({ id: 1 })).toBeNull()
    expect(
      normalizeAzureDevOpsReviewDraft({ id: 'a', pullRequestKey: 'k', body: 'b', kind: 'general' })
    ).toMatchObject({ state: 'draft', author: { kind: 'user' }, iterationId: null })
  })
})
