import { describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewIteration
} from '../../../shared/azure-devops-review-types'
import type { ReviewFindingEvidence } from '../../../shared/review-finding'
import { describeAzureDevOpsReviewDraftFindings } from './azure-devops-review-draft-findings'
import type {
  AzureDevOpsReviewFileAtCommit,
  AzureDevOpsReviewFileReader
} from './azure-devops-review-file-line-cache'

const iterations: AzureDevOpsReviewIteration[] = [
  { id: 1, sourceCommit: 'AAA1', targetCommit: 't', baseCommit: 'b' },
  { id: 2, sourceCommit: 'bbb2', targetCommit: 't', baseCommit: 'b' }
]

const CART = [
  'export function total(items: number[]): number {',
  '  let sum = 0',
  '  for (const item of items) {',
  '    sum += item',
  '  }',
  '  return sum',
  '}',
  ''
]

function cite(quote: string, startLine = 4, filePath = 'src/cart.ts'): ReviewFindingEvidence {
  return { kind: 'code-citation', filePath, startLine, endLine: startLine, quote }
}

function draft(patch: Partial<AzureDevOpsReviewDraftView> = {}): AzureDevOpsReviewDraftView {
  return {
    id: 'd1',
    pullRequestKey: 'k',
    kind: 'inline',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 4, endLine: 4 },
    threadId: null,
    threadStatus: null,
    body: 'Negative prices lower the total.',
    author: { kind: 'agent', label: null },
    iterationId: 2,
    commit: 'bbb2',
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 1,
    outdated: false,
    ...patch
  }
}

/** Answers `<commit>:<path>` from `files`; a missing key is a file that does not exist. */
function reader(files: Record<string, AzureDevOpsReviewFileAtCommit | null | Error>) {
  return vi.fn<AzureDevOpsReviewFileReader>(async (path, commit) => {
    const answer = files[`${commit}:${path}`]
    if (answer instanceof Error) {
      throw answer
    }
    return answer === undefined ? { state: 'missing' } : answer
  })
}

const cartAtLatest = { 'bbb2:src/cart.ts': { state: 'text', lines: CART } } as const

async function describeOne(
  view: AzureDevOpsReviewDraftView,
  readFile: AzureDevOpsReviewFileReader = reader(cartAtLatest)
): Promise<AzureDevOpsReviewDraftView> {
  return (await describeAzureDevOpsReviewDraftFindings({ drafts: [view], iterations, readFile }))[0]
}

describe('describeAzureDevOpsReviewDraftFindings', () => {
  it('marks an agent draft without evidence as uncertain', async () => {
    const described = await describeOne(draft())
    expect(described.certainty).toBe('uncertain')
    expect(described).not.toHaveProperty('evidenceChecks')
  })

  it('marks an agent draft as likely when its citation is in the file at the draft commit', async () => {
    const described = await describeOne(draft({ evidence: [cite('sum += item')] }))
    expect(described.evidenceChecks).toEqual([{ status: 'confirmed' }])
    expect(described.certainty).toBe('likely')
  })

  it('marks an agent draft as contradicted when its citation is not in the file, and says what is', async () => {
    const described = await describeOne(draft({ evidence: [cite('sum -= item')] }))
    expect(described.evidenceChecks).toEqual([
      { status: 'refuted', reason: 'text-mismatch', actual: '    sum += item' }
    ])
    expect(described.certainty).toBe('contradicted')
  })

  it('contradicts a citation of a file that does not exist at the draft commit', async () => {
    const described = await describeOne(
      draft({ evidence: [cite('sum += item', 4, 'src/basket.ts')] })
    )
    expect(described.evidenceChecks).toEqual([{ status: 'refuted', reason: 'file-missing' }])
    expect(described.certainty).toBe('contradicted')
  })

  it('checks a citation against the commit the draft was written on, not the latest', async () => {
    const readFile = reader({
      'aaa1:src/cart.ts': { state: 'text', lines: ['const legacy = true'] },
      ...cartAtLatest
    })
    const described = await describeOne(
      draft({
        iterationId: 1,
        commit: 'aaa1',
        outdated: true,
        evidence: [cite('legacy = true', 1)]
      }),
      readFile
    )
    expect(described.certainty).toBe('likely')
    expect(readFile.mock.calls).toEqual([['src/cart.ts', 'aaa1']])
  })

  it('reads nothing for a commit that is not an iteration of the pull request', async () => {
    const readFile = reader(cartAtLatest)
    const described = await describeOne(
      draft({ commit: 'c0ffee', evidence: [cite('sum += item')] }),
      readFile
    )
    expect(readFile).not.toHaveBeenCalled()
    expect(described.evidenceChecks).toEqual([
      { status: 'unchecked', reason: 'commit-not-in-review' }
    ])
    expect(described.certainty).toBe('uncertain')
    expect(described).not.toHaveProperty('codeExcerpt')
  })

  it.each([
    ['a binary or oversized file', { state: 'unreadable' } as const, 'unreadable-file'],
    ['a spent request budget', null, 'request-limit'],
    ['a failed request', new Error('HTTP 503'), 'request-failed']
  ])('leaves a citation unchecked and the draft uncertain on %s', async (_name, answer, reason) => {
    const described = await describeOne(
      draft({ evidence: [cite('sum += item')] }),
      reader({ 'bbb2:src/cart.ts': answer })
    )
    expect(described.evidenceChecks).toEqual([{ status: 'unchecked', reason }])
    expect(described.certainty).toBe('uncertain')
  })

  it('shows evidence of an unknown kind as unchecked and does not count it', async () => {
    const described = await describeOne(
      draft({
        evidence: [
          { kind: 'check-run', origin: 'orca', check: { status: 'confirmed' }, exitCode: 0 }
        ]
      })
    )
    expect(described.evidenceChecks).toEqual([{ status: 'unchecked', reason: 'unknown-kind' }])
    expect(described.certainty).toBe('uncertain')
    expect(described.evidence?.[0]).toMatchObject({ kind: 'check-run', exitCode: 0 })
  })

  it('checks the evidence of a hand-written draft but gives it no certainty', async () => {
    const described = await describeOne(
      draft({ author: { kind: 'user' }, evidence: [cite('sum -= item')] })
    )
    expect(described.evidenceChecks?.[0]?.status).toBe('refuted')
    expect(described).not.toHaveProperty('certainty')
  })

  it('leaves a published draft as it is', async () => {
    const readFile = reader(cartAtLatest)
    const published = draft({ state: 'published', evidence: [cite('sum += item')] })
    expect(await describeOne(published, readFile)).toBe(published)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('adds the commented lines of an inline draft on the new side', async () => {
    const described = await describeOne(
      draft({ anchor: { side: 'right', startLine: 3, endLine: 5 } })
    )
    expect(described.codeExcerpt).toEqual({
      startLine: 3,
      lines: ['  for (const item of items) {', '    sum += item', '  }']
    })
  })

  it('cuts a long commented range and long lines', async () => {
    const lines = Array.from({ length: 40 }, (_, index) => `${index + 1}: ${'x'.repeat(300)}`)
    const described = await describeOne(
      draft({ anchor: { side: 'right', startLine: 2, endLine: 30 } }),
      reader({ 'bbb2:src/cart.ts': { state: 'text', lines } })
    )
    expect(described.codeExcerpt?.lines).toHaveLength(12)
    expect(described.codeExcerpt?.truncated).toBe(true)
    expect(described.codeExcerpt?.lines.every((line) => line.length === 240)).toBe(true)
  })

  it.each([
    ['an old-side draft', { anchor: { side: 'left', startLine: 4, endLine: 4 } } as const],
    ['a file draft', { kind: 'file', anchor: null } as const],
    ['a general draft', { kind: 'general', filePath: null, anchor: null } as const],
    [
      'lines past the end of the file',
      { anchor: { side: 'right', startLine: 90, endLine: 91 } } as const
    ]
  ])('adds no code excerpt for %s', async (_name, patch) => {
    expect(await describeOne(draft(patch))).not.toHaveProperty('codeExcerpt')
  })

  it('reads each file version once for all drafts and reads evidence before excerpts', async () => {
    const readFile = reader({
      ...cartAtLatest,
      'bbb2:src/coupon.ts': { state: 'text', lines: ['export const PREFIX = "SAVE"'] }
    })
    const described = await describeAzureDevOpsReviewDraftFindings({
      drafts: [
        draft({ id: 'a' }),
        draft({ id: 'b', evidence: [cite('PREFIX', 1, 'src/coupon.ts'), cite('sum += item')] }),
        draft({ id: 'c', evidence: [cite('PREFIX = "SAVE"', 1, 'src/coupon.ts')] })
      ],
      iterations,
      readFile
    })
    expect(readFile.mock.calls).toEqual([
      ['src/coupon.ts', 'bbb2'],
      ['src/cart.ts', 'bbb2']
    ])
    expect(described.map((item) => item.certainty)).toEqual(['uncertain', 'likely', 'likely'])
  })
})
