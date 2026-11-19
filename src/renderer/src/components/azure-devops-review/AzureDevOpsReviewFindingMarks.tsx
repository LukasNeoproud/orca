import { CircleAlert, CircleCheck, CircleHelp, ShieldCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type {
  ReviewFindingCertainty,
  ReviewFindingSeverity
} from '../../../../shared/review-finding'
import {
  findingCertaintyHint,
  findingCertaintyLabel,
  findingSeverityLabel
} from './azure-devops-review-finding-labels'

/** How serious a finding is, as inline status text like the other marks of a draft card. */
export function AzureDevOpsReviewSeverityMark({
  severity
}: {
  severity: ReviewFindingSeverity
}): React.JSX.Element {
  return (
    <span
      data-severity={severity}
      className={cn(
        'shrink-0 font-medium',
        severity === 'error' && 'text-destructive',
        severity === 'warning' && 'text-status-warning',
        (severity === 'suggestion' || severity === 'nit') && 'text-muted-foreground'
      )}
    >
      {findingSeverityLabel(severity)}
    </span>
  )
}

function CertaintyIcon({ certainty }: { certainty: ReviewFindingCertainty }): React.JSX.Element {
  switch (certainty) {
    case 'verified':
      return <ShieldCheck className="size-3" />
    case 'likely':
      return <CircleCheck className="size-3" />
    case 'uncertain':
      return <CircleHelp className="size-3" />
    case 'contradicted':
      return <CircleAlert className="size-3" />
  }
}

/** How far Orca could confirm an agent's finding, with what that means on hover. */
export function AzureDevOpsReviewCertaintyMark({
  certainty
}: {
  certainty: ReviewFindingCertainty
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-certainty={certainty}
          className={cn(
            'flex shrink-0 items-center gap-1',
            certainty === 'verified' && 'text-status-success',
            certainty === 'likely' && 'text-muted-foreground',
            certainty === 'uncertain' && 'text-status-warning',
            certainty === 'contradicted' && 'text-destructive'
          )}
        >
          <CertaintyIcon certainty={certainty} />
          {findingCertaintyLabel(certainty)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{findingCertaintyHint(certainty)}</TooltipContent>
    </Tooltip>
  )
}
