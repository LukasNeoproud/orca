import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewThread
} from '../../../../shared/azure-devops-review-types'
import {
  azureDevOpsDraftIdFromInlineComment,
  buildAzureDevOpsInlineComments
} from './azure-devops-review-inline-comments'

function thread(overrides: Partial<AzureDevOpsReviewThread>): AzureDevOpsReviewThread {
  return {
    id: 7,
    status: 'active',
    filePath: 'src/a.ts',
    anchor: { side: 'right', startLine: 3, endLine: 4 },
    comments: [
      {
        id: 1,
        parentCommentId: 0,
        author: { displayName: 'Ann', uniqueName: null },
        content: 'Why?',
        publishedAt: '2026-10-01T10:00:00Z',
        isSystem: false
      },
      {
        id: 2,
        parentCommentId: 1,
        author: { displayName: 'Bob', uniqueName: null },
        content: 'Because.',
        publishedAt: null,
        isSystem: false
      }
    ],
    ...overrides
  }
}

function draft(overrides: Partial<AzureDevOpsReviewDraftView>): AzureDevOpsReviewDraftView {
  return {
    id: 'd1',
    pullRequestKey: 'pr',
    kind: 'inline',
    filePath: 'src/a.ts',
    anchor: { side: 'right', startLine: 10, endLine: 10 },
    threadId: null,
    threadStatus: null,
    body: 'Rename this.',
    author: { kind: 'user' },
    iterationId: 2,
    commit: null,
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 2,
    outdated: false,
    ...overrides
  }
}

function detail(
  threads: AzureDevOpsReviewThread[],
  drafts: AzureDevOpsReviewDraftView[]
): AzureDevOpsReviewDetail {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mapper reads only pullRequest.key/webUrl, threads and drafts.
  return {
    pullRequest: { key: 'pr', webUrl: 'https://dev.azure.com/o/p/_git/r/pullrequest/1' },
    threads,
    drafts
  } as unknown as AzureDevOpsReviewDetail
}

describe('buildAzureDevOpsInlineComments', () => {
  it('places new-side threads with their replies and drafts under their lines', () => {
    const comments = buildAzureDevOpsInlineComments(detail([thread({})], [draft({})]))
    expect(comments.map((c) => [c.id, c.filePath, c.startLine, c.lineNumber])).toEqual([
      ['azure-devops-thread:7', 'src/a.ts', 3, 4],
      ['azure-devops-draft:d1', 'src/a.ts', 10, 10]
    ])
    expect(comments[0].body).toBe('Why?\n\n↳ Bob: Because.')
    expect(comments[0].canEdit).toBe(false)
    expect(comments[1].canEdit).toBe(true)
  })

  it('puts a reply draft under its thread', () => {
    const comments = buildAzureDevOpsInlineComments(
      detail([thread({})], [draft({ kind: 'reply', threadId: 7, filePath: null, anchor: null })])
    )
    expect(comments[1]).toMatchObject({ lineNumber: 4, filePath: 'src/a.ts' })
  })

  it('leaves out old-side, outdated, published and general items', () => {
    const comments = buildAzureDevOpsInlineComments(
      detail(
        [thread({ anchor: { side: 'left', startLine: 1, endLine: 1 } })],
        [
          draft({ id: 'a', outdated: true }),
          draft({ id: 'b', state: 'published' }),
          draft({ id: 'c', kind: 'general', filePath: null, anchor: null })
        ]
      )
    )
    expect(comments).toEqual([])
  })

  it('maps inline comment ids back to draft ids only', () => {
    expect(azureDevOpsDraftIdFromInlineComment('azure-devops-draft:x')).toBe('x')
    expect(azureDevOpsDraftIdFromInlineComment('azure-devops-thread:7')).toBeNull()
  })
})
