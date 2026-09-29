import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { ManagerRow } from './agent-manager-model'

export function AgentManagerConfirmation({
  targets,
  busy,
  completed,
  onCancel,
  onConfirm
}: {
  targets: ManagerRow[] | null
  busy: boolean
  completed: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const working = targets?.filter((row) => row.state === 'working').length ?? 0
  return (
    <Dialog
      open={targets !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel()
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (busy) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('agents.manager.confirmTitle', 'End selected terminals?')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'agents.manager.confirmDescription',
              'This stops the selected local Orca processes, including their running commands. Unsaved work may be lost. Conversation history is not deleted.'
            )}
          </DialogDescription>
        </DialogHeader>
        {working > 0 ? (
          <p className="text-sm text-destructive">
            {translate(
              'agents.manager.workingWarning',
              '{{count}} selected agents are currently working.',
              { count: working }
            )}
          </p>
        ) : null}
        <ul className="max-h-48 space-y-2 overflow-auto text-xs scrollbar-sleek">
          {targets?.map((row) => (
            <li key={row.key} className="min-w-0">
              <div className="truncate font-medium">{row.label}</div>
              <div className="truncate text-muted-foreground">
                {row.session.cwd ?? row.session.sessionId}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {translate(
            'agents.manager.confirmOwnership',
            'Orphan and independent terminals may still be doing useful work. Conversation ownership is not forcibly unlocked.'
          )}
        </p>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {translate('agents.manager.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy
              ? translate('agents.manager.endingProgress', 'Ending… {{completed}} / {{total}}', {
                  completed,
                  total: targets?.length ?? 0
                })
              : translate('agents.manager.endSelectedCount', 'End selected ({{count}})', {
                  count: targets?.length ?? 0
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
