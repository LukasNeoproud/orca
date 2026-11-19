import { describe, expect, it } from 'vitest'
import { AZURE_DEVOPS_REVIEW_CASTABLE_VOTES } from '../azure-devops-review-vote'
import {
  AzureDevOpsReviewCreateDraftParams,
  AzureDevOpsReviewListParams,
  AzureDevOpsReviewPublishParams,
  AzureDevOpsReviewUpdateDraftParams
} from './azure-devops-review-params'

const pullRequestKey = 'dev.azure.com/contoso+repo+7'

describe('AzureDevOpsReviewPublishParams', () => {
  it('keeps the request of a client that knows no vote', () => {
    expect(AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'] })).toEqual({
      pullRequestKey,
      draftIds: ['d1']
    })
  })

  it.each(AZURE_DEVOPS_REVIEW_CASTABLE_VOTES)('accepts the vote %s with drafts', (vote) => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'], vote }).vote
    ).toBe(vote)
  })

  it('accepts a vote without drafts', () => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: [], vote: 'approved' })
    ).toEqual({ pullRequestKey, draftIds: [], vote: 'approved' })
  })

  it('rejects a request that would publish nothing', () => {
    expect(AzureDevOpsReviewPublishParams.safeParse({ pullRequestKey, draftIds: [] }).success).toBe(
      false
    )
  })

  // Why: a vote this host cannot cast must fail loudly instead of publishing without it.
  it.each(['none', 'reset', 10, null])('rejects the vote %j', (vote) => {
    expect(
      AzureDevOpsReviewPublishParams.safeParse({ pullRequestKey, draftIds: ['d1'], vote }).success
    ).toBe(false)
  })

  // Why pinned: this is how a host from before votes treats `vote`, hence the capability.
  it('drops fields it does not know without an error', () => {
    expect(
      AzureDevOpsReviewPublishParams.parse({ pullRequestKey, draftIds: ['d1'], later: true })
    ).toEqual({ pullRequestKey, draftIds: ['d1'] })
  })
})

describe('AzureDevOpsReviewListParams', () => {
  it.each([undefined, null, {}, { status: 'active' }])(
    'keeps the request %j of a client that knows no pages',
    (params) => {
      expect(AzureDevOpsReviewListParams.parse(params)).toEqual({ status: 'active' })
    }
  )

  it('passes the number of pages a client asks for', () => {
    expect(AzureDevOpsReviewListParams.parse({ status: 'all', pages: 3 })).toEqual({
      status: 'all',
      pages: 3
    })
  })

  // Why accepted: the host clamps, so a client with a larger limit still gets a list.
  it('accepts more pages than this host reads', () => {
    expect(AzureDevOpsReviewListParams.safeParse({ pages: 10_000 }).success).toBe(true)
  })

  it.each([0, -1, 1.5, '2', null])('rejects pages %j', (pages) => {
    expect(AzureDevOpsReviewListParams.safeParse({ pages }).success).toBe(false)
  })

  // Why pinned: a host from before paging parses `pages` like this and answers the first page
  // without `truncatedRepoKeys`, which is why clients offer more only when that field arrives.
  it('drops fields it does not know without an error', () => {
    expect(AzureDevOpsReviewListParams.parse({ status: 'completed', later: 2 })).toEqual({
      status: 'completed'
    })
  })
})

const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 5,
  quote: 'sum += item'
}

/** The first issue's message, which is what the caller of the RPC method gets. */
function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : (result.error?.issues[0]?.message ?? '')
}

describe('AzureDevOpsReviewCreateDraftParams', () => {
  const inline = {
    pullRequestKey,
    kind: 'inline',
    body: 'Negative prices lower the total.',
    filePath: 'src/cart.ts',
    anchor: { startLine: 4 },
    author: { kind: 'agent', label: 'claude' }
  }

  it('keeps the request of a client that knows no severity and no evidence', () => {
    expect(AzureDevOpsReviewCreateDraftParams.parse(inline)).toStrictEqual({
      ...inline,
      anchor: { side: 'right', startLine: 4, endLine: 4 }
    })
  })

  it.each(['error', 'warning', 'suggestion', 'nit', null])(
    'accepts the severity %j',
    (severity) => {
      expect(AzureDevOpsReviewCreateDraftParams.parse({ ...inline, severity }).severity).toBe(
        severity
      )
    }
  )

  it.each(['critical', 'Error', '', 2, {}])(
    'rejects the severity %j and names the values',
    (severity) => {
      expect(
        firstError(AzureDevOpsReviewCreateDraftParams.safeParse({ ...inline, severity }))
      ).toBe('severity must be one of error, warning, suggestion, nit')
    }
  )

  it('normalizes evidence and drops what only a host may write', () => {
    const parsed = AzureDevOpsReviewCreateDraftParams.parse({
      ...inline,
      evidence: [
        {
          ...citation,
          filePath: '/src/cart.ts',
          endLine: undefined,
          check: { status: 'confirmed' }
        },
        { kind: 'emulator-recording', screen: 'Checkout', origin: 'orca' }
      ]
    })
    expect(parsed.evidence).toStrictEqual([
      { ...citation, endLine: 4 },
      { kind: 'emulator-recording', screen: 'Checkout' }
    ])
  })

  it.each([null, []])('accepts %j for no evidence', (evidence) => {
    expect(AzureDevOpsReviewCreateDraftParams.parse({ ...inline, evidence }).evidence).toEqual(
      evidence
    )
  })

  it.each<[string, unknown]>([
    ['evidence must be a list', citation],
    [
      'evidence[0].quote must hold the cited lines as they are in the file',
      [{ ...citation, quote: ' ' }]
    ],
    [
      'evidence[1].filePath must be a repository-relative file path',
      [citation, { ...citation, filePath: '../.env' }]
    ],
    [
      'evidence[0].startLine must be a line number, counted from 1',
      [{ ...citation, startLine: 0 }]
    ],
    [
      'evidence[0].quote is longer than 4000 characters',
      [{ ...citation, quote: 'x'.repeat(4001) }]
    ],
    ['evidence holds more than 10 items', Array.from({ length: 11 }, () => citation)],
    ['evidence[0] is larger than 4000 characters', [{ kind: 'blob', data: 'x'.repeat(4000) }]]
  ])('rejects evidence with "%s"', (error, evidence) => {
    expect(firstError(AzureDevOpsReviewCreateDraftParams.safeParse({ ...inline, evidence }))).toBe(
      error
    )
  })

  // Why pinned: this is how a host from before findings treats `severity` and `evidence`.
  it('drops fields it does not know without an error', () => {
    expect(AzureDevOpsReviewCreateDraftParams.parse({ ...inline, later: [1] })).toStrictEqual({
      ...inline,
      anchor: { side: 'right', startLine: 4, endLine: 4 }
    })
  })
})

describe('AzureDevOpsReviewUpdateDraftParams', () => {
  it('keeps the request of a client that knows no severity and no evidence', () => {
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { body: 'Reworded.' } })
    ).toStrictEqual({ id: 'd1', patch: { body: 'Reworded.' } })
  })

  it('passes a new severity, a removed one and replaced evidence', () => {
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { severity: 'nit' } }).patch
    ).toStrictEqual({ severity: 'nit' })
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { severity: null } }).patch
    ).toStrictEqual({ severity: null })
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { evidence: [citation] } }).patch
    ).toStrictEqual({ evidence: [citation] })
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { evidence: null } }).patch
    ).toStrictEqual({ evidence: null })
  })

  it('rejects a severity or evidence it cannot read', () => {
    expect(
      firstError(
        AzureDevOpsReviewUpdateDraftParams.safeParse({ id: 'd1', patch: { severity: 'blocker' } })
      )
    ).toBe('severity must be one of error, warning, suggestion, nit')
    expect(
      firstError(
        AzureDevOpsReviewUpdateDraftParams.safeParse({
          id: 'd1',
          patch: { evidence: [{ kind: 'code-citation' }] }
        })
      )
    ).toBe('evidence[0].filePath must be a repository-relative file path')
  })

  // Why pinned: this is how a host from before findings treats `severity` and `evidence`.
  it('drops patch fields it does not know without an error', () => {
    expect(
      AzureDevOpsReviewUpdateDraftParams.parse({ id: 'd1', patch: { body: 'x', later: true } })
    ).toStrictEqual({ id: 'd1', patch: { body: 'x' } })
  })
})
