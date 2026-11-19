import { useState } from 'react'
import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, FileDiff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { AzureDevOpsReviewDraftView } from '../../../../shared/azure-devops-review-types'
import {
  isReviewCodeCitation,
  type ReviewEvidenceCheck,
  type ReviewFindingEvidence
} from '../../../../shared/review-finding'
import {
  draftCertainty,
  evidenceCheckExplanation,
  evidenceCheckLabel,
  evidenceCheckOutcome,
  evidenceLocationLabel,
  type EvidenceCheckOutcome
} from './azure-devops-review-finding-labels'
import { AzureDevOpsReviewCodeLines } from './AzureDevOpsReviewCodeLines'

/** Where a piece of evidence can be shown in the pull request's diff. */
export type AzureDevOpsReviewOpenInDiff = {
  /** Only files the pull request changes have a diff. */
  canOpen: (filePath: string) => boolean
  open: (filePath: string, line: number) => void
}

function OutcomeMark({ outcome }: { outcome: EvidenceCheckOutcome }): React.JSX.Element {
  return (
    <span
      data-evidence-outcome={outcome}
      className={cn(
        'flex shrink-0 items-center gap-1',
        outcome === 'confirmed' && 'text-status-success',
        outcome === 'refuted' && 'text-destructive',
        outcome === 'unchecked' && 'text-muted-foreground'
      )}
    >
      {outcome === 'confirmed' ? (
        <CircleCheck className="size-3" />
      ) : outcome === 'refuted' ? (
        <CircleAlert className="size-3" />
      ) : (
        <CircleHelp className="size-3" />
      )}
      {evidenceCheckLabel(outcome)}
    </span>
  )
}

/** Evidence of a kind this build does not know, shown as the data it is. */
function unknownEvidenceLines(evidence: ReviewFindingEvidence): string[] {
  const { kind: _kind, ...fields } = evidence
  try {
    return JSON.stringify(fields, null, 2).split('\n')
  } catch {
    return []
  }
}

function EvidenceItem({
  evidence,
  check,
  openInDiff
}: {
  evidence: ReviewFindingEvidence
  check: ReviewEvidenceCheck | undefined
  openInDiff: AzureDevOpsReviewOpenInDiff
}): React.JSX.Element {
  const outcome = evidenceCheckOutcome(check)
  const explanation = evidenceCheckExplanation(check)
  const citation = isReviewCodeCitation(evidence) ? evidence : null
  const foundAt = check?.status === 'confirmed' ? check.foundAt : undefined
  const actual = check?.status === 'refuted' ? check.actual : undefined
  return (
    <li className="space-y-1.5" data-evidence-kind={evidence.kind}>
      <div className="flex items-center gap-2 text-xs">
        <OutcomeMark outcome={outcome} />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
          {evidenceLocationLabel(evidence)}
        </span>
        {citation && openInDiff.canOpen(citation.filePath) ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              openInDiff.open(citation.filePath, foundAt?.startLine ?? citation.startLine)
            }
          >
            <FileDiff className="size-3" />
            {translate('azureDevOpsReview.evidenceOpenInDiff', 'Open in diff')}
          </Button>
        ) : null}
      </div>
      {citation?.note ? <p className="text-xs whitespace-pre-wrap">{citation.note}</p> : null}
      {citation ? (
        <AzureDevOpsReviewCodeLines
          lines={citation.quote.split('\n')}
          label={translate('azureDevOpsReview.evidenceQuote', 'Quoted code')}
        />
      ) : (
        <AzureDevOpsReviewCodeLines
          lines={unknownEvidenceLines(evidence)}
          label={translate('azureDevOpsReview.evidenceData', 'Evidence data')}
        />
      )}
      {explanation ? (
        <p
          className={cn(
            'text-xs',
            outcome === 'refuted' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {explanation}
        </p>
      ) : null}
      {citation && actual ? (
        <AzureDevOpsReviewCodeLines
          lines={actual.split('\n')}
          startLine={citation.startLine}
          label={translate('azureDevOpsReview.evidenceActual', 'Code in the file')}
        />
      ) : null}
    </li>
  )
}

/** Keys for evidence, which has no id: its content, numbered where two pieces are the same. */
function evidenceKeys(evidence: readonly ReviewFindingEvidence[]): string[] {
  const seen = new Map<string, number>()
  return evidence.map((item) => {
    const content = JSON.stringify(item)
    const earlier = seen.get(content) ?? 0
    seen.set(content, earlier + 1)
    return `${earlier}:${content}`
  })
}

/** The evidence of a draft with how Orca checked each piece; collapsed unless a piece is refuted. */
export function AzureDevOpsReviewDraftEvidence({
  draft,
  openInDiff
}: {
  draft: AzureDevOpsReviewDraftView
  openInDiff: AzureDevOpsReviewOpenInDiff
}): React.JSX.Element | null {
  const evidence = draft.evidence ?? []
  // Why open: a contradicted finding is only as useful as the reason shown with it.
  const [open, setOpen] = useState(draftCertainty(draft) === 'contradicted')
  if (evidence.length === 0) {
    return null
  }
  const keys = evidenceKeys(evidence)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="xs" className="-ml-2">
          <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
          {translate('azureDevOpsReview.evidenceCount', 'Evidence ({{value0}})', {
            value0: evidence.length
          })}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-3 border-l border-border pl-3">
          {evidence.map((item, index) => (
            <EvidenceItem
              key={keys[index]}
              evidence={item}
              check={draft.evidenceChecks?.[index]}
              openInDiff={openInDiff}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
