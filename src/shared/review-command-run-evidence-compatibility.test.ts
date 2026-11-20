import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewDraftView } from './azure-devops-review-types'
import {
  AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_GATE_RUN_EVIDENCE_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY,
  HOST_FEATURE_RUNTIME_CAPABILITIES,
  QUALITY_GATES_RUNTIME_CAPABILITY
} from './host-feature-runtime-capabilities'
import { isReviewCommandRunEvidence } from './review-command-run-evidence'
import {
  deriveReviewFindingCertainty,
  type ReviewEvidenceCheck,
  type ReviewEvidenceProof
} from './review-finding'
import { deriveReviewFindingPriority } from './review-finding-priority'
import {
  AzureDevOpsReviewCreateDraftParams,
  AzureDevOpsReviewUpdateDraftParams
} from './rpc-contract/azure-devops-review-params'

/**
 * Evidence from a gate run between builds of different age. The build before it (commit
 * 38d52bcfdf) knew one kind of evidence, the code citation, kept every other kind as sent and
 * never derived `verified`. Its rules are written out here so that both directions stay pinned.
 */

const run = { kind: 'command-run', source: 'quality-gate', runId: 'run-1' }
const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 4,
  quote: 'sum += item'
}
const summary = {
  source: 'quality-gate',
  runId: 'run-1',
  worktreeId: 'repo-1::/work/app-review',
  name: 'Tests',
  command: 'pnpm test',
  status: 'failed',
  exitCode: 1,
  commit: 'bbb2',
  cleanTree: true,
  finishedAt: 20,
  outputTruncated: false
} as const

type Loose = Record<string, unknown>

/** How the older build stored one piece of evidence a client sent (`unknownKinds: 'keep'`). */
function keepAsOlderHost(input: Loose & { kind: string }): Loose & { kind: string } {
  if (input.kind === 'code-citation') {
    throw new Error('not needed here: citations did not change')
  }
  const kept: Loose & { kind: string } = { kind: input.kind }
  for (const [field, value] of Object.entries(input)) {
    if (field !== '__proto__' && field !== 'origin' && field !== 'check') {
      kept[field] = value
    }
  }
  return kept
}

/** The older host's check of evidence that is not a citation, and its table of proof. */
const checkAsOlderHost = (): ReviewEvidenceCheck => ({
  status: 'unchecked',
  reason: 'unknown-kind'
})
const OLDER_PROVES = new Map<string, ReviewEvidenceProof>([['code-citation', 'likely']])

/** What the older draft card showed for a check: its outcome and the sentence under it. */
function showAsOlderClient(
  check: { status?: string; reason?: string; foundAt?: unknown } | undefined
): {
  outcome: 'confirmed' | 'refuted' | 'unchecked'
  explained: boolean
} {
  const outcome =
    check?.status === 'confirmed' || check?.status === 'refuted' ? check.status : 'unchecked'
  const known =
    outcome === 'confirmed'
      ? check?.foundAt !== undefined
      : outcome === 'refuted'
        ? ['file-missing', 'lines-out-of-range', 'text-mismatch'].includes(check?.reason ?? '')
        : [
            'unknown-kind',
            'unreadable-file',
            'commit-not-in-review',
            'request-limit',
            'request-failed'
          ].includes(check?.reason ?? '')
  return { outcome, explained: known }
}

const OLDER_CERTAINTIES = ['verified', 'likely', 'uncertain', 'contradicted']

describe('gate run evidence between builds of different age', () => {
  describe('an older client with this host', () => {
    it('finds every capability it already had, and can see the new one only by asking', () => {
      for (const capability of [
        AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY,
        AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY,
        QUALITY_GATES_RUNTIME_CAPABILITY
      ]) {
        expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(capability)
      }
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(
        AZURE_DEVOPS_REVIEW_GATE_RUN_EVIDENCE_RUNTIME_CAPABILITY
      )
    })

    it('creates and edits drafts as before: the request it sends parses to the same thing', () => {
      const create = {
        pullRequestKey: 'dev.azure.com/contoso+repo+7',
        kind: 'general',
        body: 'Check the rounding.',
        severity: 'warning',
        evidence: [citation]
      }
      expect(AzureDevOpsReviewCreateDraftParams.parse(create)).toMatchObject(create)
      const update = { id: 'd1', patch: { evidence: [citation] } }
      expect(AzureDevOpsReviewUpdateDraftParams.parse(update)).toEqual(update)
    })

    it('reads `verified`, a value it always knew, and ranks it as it always did', () => {
      expect(OLDER_CERTAINTIES).toContain(
        deriveReviewFindingCertainty([run], [{ status: 'confirmed' }])
      )
      expect(
        deriveReviewFindingPriority({ severity: 'error', certainty: 'verified' })
      ).toBeGreaterThan(deriveReviewFindingPriority({ severity: 'error', certainty: 'likely' }))
    })

    it('shows a confirmed run as confirmed and ignores the record it does not know', () => {
      const confirmed: ReviewEvidenceCheck = { status: 'confirmed', run: summary }
      expect(showAsOlderClient(confirmed)).toEqual({
        outcome: 'confirmed',
        explained: false
      })
    })

    it.each([
      'run-not-found',
      'runs-unavailable',
      'run-other-worktree',
      'run-gate-changed',
      'run-stale-commit',
      'run-other-commit',
      'run-dirty-tree',
      'run-not-finished',
      'run-no-verdict',
      'run-passed'
    ] as const)(
      'shows a run that proves nothing (%s) as not checked, without a wrong reason',
      (reason) => {
        const check: ReviewEvidenceCheck = { status: 'unchecked', reason, run: summary }
        expect(showAsOlderClient(check)).toEqual({ outcome: 'unchecked', explained: false })
        // Never `refuted`: its label there says the quote is not in the file, which is not what happened.
        expect(deriveReviewFindingCertainty([run], [check])).toBe('uncertain')
      }
    )

    it('rewrites the shared drafts file without losing the run a draft cites', () => {
      expect(keepAsOlderHost(run)).toEqual(run)
    })
  })

  describe('this client with an older host', () => {
    it('has its run stored as a kind the host does not know, never as proof', () => {
      const stored = keepAsOlderHost({ ...run, note: 'the cart test fails' })
      expect(stored).toEqual({ ...run, note: 'the cart test fails' })
      expect(deriveReviewFindingCertainty([stored], [checkAsOlderHost()], OLDER_PROVES)).toBe(
        'uncertain'
      )
      // Even a check an older host could never produce would not make it verified there.
      expect(deriveReviewFindingCertainty([stored], [{ status: 'confirmed' }], OLDER_PROVES)).toBe(
        'uncertain'
      )
    })

    it('reads the draft that host answers with: the run is recognisable and its check has no record', () => {
      const view: Pick<AzureDevOpsReviewDraftView, 'evidence' | 'evidenceChecks' | 'certainty'> = {
        evidence: [run],
        evidenceChecks: [checkAsOlderHost()],
        certainty: 'uncertain'
      }
      const [evidence] = view.evidence ?? []
      expect(isReviewCommandRunEvidence(evidence)).toBe(true)
      expect(view.evidenceChecks?.[0]).toEqual({ status: 'unchecked', reason: 'unknown-kind' })
      expect(view.evidenceChecks?.[0]).not.toHaveProperty('run')
    })

    it('can tell that host apart: it does not report the capability', () => {
      const older = HOST_FEATURE_RUNTIME_CAPABILITIES.filter(
        (capability) => capability !== AZURE_DEVOPS_REVIEW_GATE_RUN_EVIDENCE_RUNTIME_CAPABILITY
      )
      expect(older).toContain(AZURE_DEVOPS_REVIEW_FINDINGS_RUNTIME_CAPABILITY)
      expect(older).not.toContain('azure-devops-review.gate-run-evidence.v1')
    })
  })

  describe('this host with any client', () => {
    it('keeps of a run only what names it, whoever sends more', () => {
      const parsed = AzureDevOpsReviewCreateDraftParams.parse({
        pullRequestKey: 'dev.azure.com/contoso+repo+7',
        kind: 'general',
        body: 'The build fails.',
        evidence: [
          { ...run, status: 'failed', exitCode: 1, check: { status: 'confirmed' }, run: summary }
        ]
      })
      expect(parsed.evidence).toEqual([run])
      const patched = AzureDevOpsReviewUpdateDraftParams.parse({
        id: 'd1',
        patch: { evidence: [{ ...run, cleanTree: true }] }
      })
      expect(patched.patch.evidence).toEqual([run])
    })

    it('stores a run from a source only a newer client knows, and proves nothing by it', () => {
      const later = { kind: 'command-run', source: 'one-off', runId: 'r1', command: 'make test' }
      const parsed = AzureDevOpsReviewCreateDraftParams.parse({
        pullRequestKey: 'dev.azure.com/contoso+repo+7',
        kind: 'general',
        body: 'The build fails.',
        evidence: [later]
      })
      expect(parsed.evidence).toEqual([later])
      expect(isReviewCommandRunEvidence(later)).toBe(false)
    })
  })
})
