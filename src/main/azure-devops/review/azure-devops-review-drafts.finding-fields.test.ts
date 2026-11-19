import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewDraftCreateInput } from '../../../shared/azure-devops-review-types'
import {
  applyAzureDevOpsReviewDraftPatch,
  AzureDevOpsReviewDraftError,
  buildAzureDevOpsReviewDraft,
  normalizeAzureDevOpsReviewDraft
} from './azure-devops-review-drafts'

const iterations = [{ id: 1, sourceCommit: 'aaa', targetCommit: 't', baseCommit: 'b' }]
const context = { id: 'd1', now: 100, iterations }
const patchContext = { now: 200, latestIteration: iterations[0] }

const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 5,
  quote: 'sum += item'
}
const finding: AzureDevOpsReviewDraftCreateInput = {
  pullRequestKey: 'k',
  kind: 'inline',
  body: 'Negative prices lower the total.',
  filePath: 'src/cart.ts',
  anchor: { side: 'right', startLine: 5, endLine: 5 },
  author: { kind: 'agent', label: 'claude' }
}

/** A value an agent or a newer client may send where the types name fewer. */
function sent<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tests pass values the types forbid to prove the host rejects or drops them.
  return value as T
}

describe('buildAzureDevOpsReviewDraft with a finding', () => {
  it('keeps the shape of a draft without severity and evidence', () => {
    const draft = buildAzureDevOpsReviewDraft(finding, context)
    expect(draft).not.toHaveProperty('severity')
    expect(draft).not.toHaveProperty('evidence')
    expect(
      buildAzureDevOpsReviewDraft({ ...finding, severity: null, evidence: [] }, context)
    ).toEqual(draft)
  })

  it('stores the severity and the evidence as normalized', () => {
    const draft = buildAzureDevOpsReviewDraft(
      {
        ...finding,
        severity: 'warning',
        evidence: [{ ...citation, filePath: '/src/cart.ts', quote: 'sum += item\r\n' }]
      },
      context
    )
    expect(draft.severity).toBe('warning')
    expect(draft.evidence).toEqual([citation])
  })

  it('refuses a severity or evidence it cannot read, with an error that names the field', () => {
    const build = (patch: Record<string, unknown>) => () =>
      buildAzureDevOpsReviewDraft(sent({ ...finding, ...patch }), context)
    expect(build({ severity: 'critical' })).toThrow(AzureDevOpsReviewDraftError)
    expect(build({ severity: 'critical' })).toThrow(
      'severity must be one of error, warning, suggestion, nit'
    )
    expect(build({ evidence: [{ ...citation, quote: '' }] })).toThrow(
      'evidence[0].quote must hold the cited lines as they are in the file'
    )
    expect(build({ evidence: 'src/cart.ts:4' })).toThrow('evidence must be a list')
  })

  it('keeps evidence of a kind it does not know, without the fields only a host writes', () => {
    const draft = buildAzureDevOpsReviewDraft(
      sent({
        ...finding,
        evidence: [{ kind: 'emulator-recording', screen: 'Checkout', origin: 'orca' }]
      }),
      context
    )
    expect(draft.evidence).toEqual([{ kind: 'emulator-recording', screen: 'Checkout' }])
  })
})

describe('applyAzureDevOpsReviewDraftPatch with a finding', () => {
  const draft = buildAzureDevOpsReviewDraft(
    { ...finding, severity: 'warning', evidence: [citation] },
    context
  )

  it('leaves the severity and the evidence alone when the patch does not name them', () => {
    const next = applyAzureDevOpsReviewDraftPatch(draft, { body: 'Reworded.' }, patchContext)
    expect(next).toMatchObject({ body: 'Reworded.', severity: 'warning', evidence: [citation] })
  })

  it('changes the severity and keeps the rest', () => {
    const next = applyAzureDevOpsReviewDraftPatch(draft, { severity: 'error' }, patchContext)
    expect(next).toMatchObject({ severity: 'error', evidence: [citation], body: draft.body })
    expect(next).toMatchObject({ iterationId: 1, commit: 'aaa', updatedAt: 200 })
  })

  it('removes the severity with null and the evidence with null or an empty list', () => {
    const cleared = applyAzureDevOpsReviewDraftPatch(draft, { severity: null }, patchContext)
    expect(cleared).not.toHaveProperty('severity')
    expect(cleared.evidence).toEqual([citation])
    for (const evidence of [null, []]) {
      const next = applyAzureDevOpsReviewDraftPatch(draft, { evidence }, patchContext)
      expect(next).not.toHaveProperty('evidence')
      expect(next.severity).toBe('warning')
    }
  })

  it('replaces the whole evidence list', () => {
    const other = { ...citation, startLine: 7, endLine: 7, quote: 'return sum' }
    const next = applyAzureDevOpsReviewDraftPatch(draft, { evidence: [other] }, patchContext)
    expect(next.evidence).toEqual([other])
  })

  it('refuses a patch it cannot read and leaves the draft as it was', () => {
    expect(() =>
      applyAzureDevOpsReviewDraftPatch(draft, sent({ severity: 'blocker' }), patchContext)
    ).toThrow('severity must be one of')
    expect(() =>
      applyAzureDevOpsReviewDraftPatch(
        draft,
        sent({ evidence: [{ ...citation, startLine: 0 }] }),
        patchContext
      )
    ).toThrow('evidence[0].startLine')
    expect(draft).toMatchObject({ severity: 'warning', evidence: [citation] })
  })
})

describe('normalizeAzureDevOpsReviewDraft with a finding', () => {
  const stored = { id: 'a', pullRequestKey: 'k', body: 'b', kind: 'general' }

  it('reads a draft written before severity and evidence without adding them', () => {
    const draft = normalizeAzureDevOpsReviewDraft(stored)
    expect(draft).not.toBeNull()
    expect(draft).not.toHaveProperty('severity')
    expect(draft).not.toHaveProperty('evidence')
  })

  it('reads the severity and the evidence', () => {
    expect(
      normalizeAzureDevOpsReviewDraft({ ...stored, severity: 'nit', evidence: [citation] })
    ).toMatchObject({ severity: 'nit', evidence: [citation] })
  })

  it('reads a draft whose severity or evidence a newer build wrote in a form it does not know', () => {
    const draft = normalizeAzureDevOpsReviewDraft({
      ...stored,
      severity: 'blocker',
      evidence: [
        { kind: 'check-run', origin: 'orca', command: 'pnpm test', exitCode: 1 },
        { ...citation, startLine: 'four' },
        citation
      ]
    })
    expect(draft).not.toHaveProperty('severity')
    expect(draft?.evidence).toEqual([
      { kind: 'check-run', origin: 'orca', command: 'pnpm test', exitCode: 1 },
      citation
    ])
  })

  it.each(['text', 7, {}, null])('reads a draft whose evidence is %j', (evidence) => {
    const draft = normalizeAzureDevOpsReviewDraft({ ...stored, evidence })
    expect(draft?.body).toBe('b')
    expect(draft).not.toHaveProperty('evidence')
  })
})
