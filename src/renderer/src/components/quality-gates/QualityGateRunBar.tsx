import { useId } from 'react'
import { Play, RefreshCcw, Square } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export type QualityGateWorkspaceOption = { id: string; label: string }

type QualityGateRunBarProps = {
  workspaces: QualityGateWorkspaceOption[]
  selectedWorkspaceId: string | null
  /** A run is queued or in progress in the chosen workspace. */
  running: boolean
  /** A start or stop request is on its way to the host. */
  pending: boolean
  canRun: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onRun: () => void
  onStop: () => void
  onRefresh: () => void
}

/** Where to run the gates, and the buttons that start, stop and re-read them. */
export function QualityGateRunBar({
  workspaces,
  selectedWorkspaceId,
  running,
  pending,
  canRun,
  onSelectWorkspace,
  onRun,
  onStop,
  onRefresh
}: QualityGateRunBarProps): React.JSX.Element {
  const id = useId()
  if (workspaces.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate(
          'qualityGates.noWorkspace',
          'This repository has no workspace to run the gates in yet.'
        )}
      </p>
    )
  }
  const refreshLabel = translate('qualityGates.refresh', 'Read the results again')
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Label htmlFor={`${id}-workspace`}>
          {translate('qualityGates.workspaceLabel', 'Run in workspace')}
        </Label>
        <Select
          value={selectedWorkspaceId ?? undefined}
          onValueChange={onSelectWorkspace}
          disabled={running || pending}
        >
          <SelectTrigger id={`${id}-workspace`} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {running ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onStop}>
          <Square />
          {translate('qualityGates.stop', 'Stop')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !canRun}
          onClick={onRun}
        >
          <Play />
          {translate('qualityGates.run', 'Run Gates')}
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={refreshLabel}
            disabled={selectedWorkspaceId === null}
            onClick={onRefresh}
          >
            <RefreshCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {refreshLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
