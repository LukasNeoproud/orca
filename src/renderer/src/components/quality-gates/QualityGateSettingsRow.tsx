import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
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

type QualityGateSettingsRowProps = {
  gate: QualityGateDefinition
  isFirst: boolean
  isLast: boolean
  /** False for a repository whose gates are set up on another host. */
  editable: boolean
  busy: boolean
  /** Null while no workspace is chosen or its status is not known. */
  result: { run: QualityGateRunView | null; target: RuntimeClientTarget; worktreeId: string } | null
  onMove: (direction: -1 | 1) => void
  onEdit: () => void
  onRemove: () => void
}

function IconAction({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function QualityGateSettingsRow({
  gate,
  isFirst,
  isLast,
  editable,
  busy,
  result,
  onMove,
  onEdit,
  onRemove
}: QualityGateSettingsRowProps): React.JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  return (
    <div
      className="space-y-3 rounded-xl border border-border/50 bg-background/70 px-4 py-3 shadow-sm"
      data-quality-gate-row={gate.id}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="min-w-0 truncate text-sm font-medium">{gate.name}</h4>
            <Badge variant={gate.required ? 'secondary' : 'outline'}>
              {gate.required
                ? translate('qualityGates.required', 'Required')
                : translate('qualityGates.optional', 'Optional')}
            </Badge>
            <span className="text-2xs text-muted-foreground">
              {translate('qualityGates.timeLimit', 'Limit {{value0}} s', {
                value0: gate.timeoutSeconds
              })}
            </span>
            <span className="font-mono text-2xs text-muted-foreground">{gate.id}</span>
          </div>
          <pre className="scrollbar-sleek max-h-24 overflow-auto font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground select-text">
            {gate.command}
          </pre>
        </div>
        {editable ? (
          <div className="flex shrink-0 items-center gap-1">
            <IconAction
              label={translate('qualityGates.moveUp', 'Move {{value0}} up', { value0: gate.name })}
              disabled={busy || isFirst}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </IconAction>
            <IconAction
              label={translate('qualityGates.moveDown', 'Move {{value0}} down', {
                value0: gate.name
              })}
              disabled={busy || isLast}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </IconAction>
            <IconAction
              label={translate('qualityGates.edit', 'Edit {{value0}}', { value0: gate.name })}
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil />
            </IconAction>
            {/* Fixed width: the label swaps on the first click and must not shift the row. */}
            <div className="flex w-28 justify-end">
              <Button
                type="button"
                variant={confirmingRemove ? 'destructive' : 'ghost'}
                size="sm"
                aria-label={translate('qualityGates.remove', 'Remove {{value0}}', {
                  value0: gate.name
                })}
                disabled={busy}
                onClick={() => {
                  if (confirmingRemove) {
                    onRemove()
                  }
                  setConfirmingRemove(!confirmingRemove)
                }}
                onBlur={() => setConfirmingRemove(false)}
              >
                <Trash2 />
                {confirmingRemove
                  ? translate('qualityGates.confirmRemove', 'Confirm')
                  : translate('qualityGates.removeShort', 'Remove')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {result ? (
        <QualityGateRunResult
          run={result.run}
          target={result.target}
          worktreeId={result.worktreeId}
        />
      ) : null}
    </div>
  )
}
