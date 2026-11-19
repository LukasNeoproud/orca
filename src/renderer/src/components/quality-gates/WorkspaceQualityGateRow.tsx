import { Play, Square } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type {
  QualityGateDefinition,
  QualityGateRunView
} from '../../../../shared/quality-gate-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { QualityGateRunResult } from './QualityGateRunResult'

type WorkspaceQualityGateRowProps = {
  gate: QualityGateDefinition
  run: QualityGateRunView | null
  target: RuntimeClientTarget
  worktreeId: string
  /** A request is on its way, or the host cannot be asked to start one. */
  disabled: boolean
  onRun: () => void
  onStop: () => void
}

/** One gate of the active workspace: its latest run, and the button that runs or stops just it. */
export function WorkspaceQualityGateRow({
  gate,
  run,
  target,
  worktreeId,
  disabled,
  onRun,
  onStop
}: WorkspaceQualityGateRowProps): React.JSX.Element {
  const live = run?.liveness === 'live'
  const actionLabel = live
    ? translate('qualityGates.stopOne', 'Stop {{value0}}', { value0: gate.name })
    : translate('qualityGates.runOne', 'Run {{value0}}', { value0: gate.name })
  return (
    <li className="space-y-1.5 py-2" data-workspace-quality-gate={gate.id}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {gate.name}
        </span>
        {gate.required ? null : (
          <Badge variant="outline">{translate('qualityGates.optional', 'Optional')}</Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={actionLabel}
              disabled={disabled}
              onClick={live ? onStop : onRun}
            >
              {live ? <Square /> : <Play />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {actionLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <QualityGateRunResult run={run} target={target} worktreeId={worktreeId} />
    </li>
  )
}
