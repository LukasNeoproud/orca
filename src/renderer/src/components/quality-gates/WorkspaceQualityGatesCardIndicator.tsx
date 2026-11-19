import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  ShieldQuestionMark,
  ShieldX,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  hasQualityGateDefinitions,
  type QualityGateDefinition
} from '../../../../shared/quality-gate-types'
import { useWorktreeGitOwnerTarget } from '../right-sidebar/worktree-git-owner-target'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { useQualityGateStatus } from './use-quality-gate-status'
import {
  readWorkspaceQualityGatesForCard,
  type WorkspaceQualityGatesCardState
} from './workspace-quality-gates-card-state'

const GLYPH: Record<WorkspaceQualityGatesCardState, { Icon: LucideIcon; tone: string }> = {
  running: { Icon: ShieldEllipsis, tone: 'text-muted-foreground' },
  failed: { Icon: ShieldX, tone: 'text-destructive' },
  unknown: { Icon: ShieldQuestionMark, tone: 'text-status-warning' },
  outdated: { Icon: ShieldAlert, tone: 'text-status-warning' },
  passed: { Icon: ShieldCheck, tone: 'text-status-success' },
  incomplete: { Icon: Shield, tone: 'text-muted-foreground' }
}

type WorkspaceQualityGatesCardIndicatorProps = {
  worktreeId: string
  /** The gates this app holds for the repository of the card; a remote host holds its own. */
  gateDefinitions: QualityGateDefinition[] | undefined
}

/**
 * The gates of one workspace on its sidebar card, as its owning host last ran them. Renders
 * nothing for a workspace without gates, and asks the host for nothing when this app is the host
 * and holds none.
 */
export function WorkspaceQualityGatesCardIndicator({
  worktreeId,
  gateDefinitions
}: WorkspaceQualityGatesCardIndicatorProps): React.JSX.Element | null {
  const target = useWorktreeGitOwnerTarget(worktreeId)
  const isActive = useAppStore((state) => state.activeWorktreeId === worktreeId)
  const knownToHaveNone = target?.kind === 'local' && !hasQualityGateDefinitions(gateDefinitions)
  // Why background unless active: every card watching its tree every few seconds would not scale.
  const { view } = useQualityGateStatus(
    knownToHaveNone ? null : target,
    worktreeId,
    JSON.stringify(gateDefinitions ?? null),
    { watch: true, background: !isActive }
  )
  const reading = readWorkspaceQualityGatesForCard(view)
  if (!reading) {
    return null
  }
  const { Icon, tone } = GLYPH[reading.state]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={reading.label}
          className="inline-flex shrink-0 items-center"
          data-workspace-quality-gates-card={reading.state}
        >
          <Icon className={cn('size-3', tone)} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {reading.label}
      </TooltipContent>
    </Tooltip>
  )
}
