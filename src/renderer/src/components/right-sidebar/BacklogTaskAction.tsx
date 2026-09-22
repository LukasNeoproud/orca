import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  BacklogAssociationContext,
  useBacklogAssociationContext
} from './BacklogAssociationContext'
import { translate } from '@/i18n/i18n'
import { resolveBacklogRoute } from '@/lib/backlog-rpc'
import { readBacklogTaskAssociation } from '@/lib/backlog-task-association-client'
import type { BacklogTaskAssociation } from '../../../../shared/backlog-task-association'
import type { BacklogTask } from '../../../../shared/backlog-types'
import { requestBacklogTaskStart, useBacklogTaskStartRequest } from './backlog-task-start-request'

export default function BacklogTaskAction({
  workspaceId,
  task
}: {
  workspaceId: string
  task: BacklogTask
}): React.JSX.Element {
  const request = useBacklogTaskStartRequest()
  const [association, setAssociation] = useState<BacklogTaskAssociation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const scope = JSON.stringify([workspaceId, task.id])
  const currentAssociation = loadedScope === scope ? association : null
  const context = useBacklogAssociationContext(currentAssociation)
  const [invalid, setInvalid] = useState(false)
  const unavailable = context.unavailable || invalid
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const value = await readBacklogTaskAssociation(resolveBacklogRoute(workspaceId), task.id)
        if (current) {
          setAssociation(value)
          setInvalid(false)
          setError(null)
        }
      } catch (failure) {
        if (current) {
          setAssociation(null)
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      } finally {
        if (current) {
          setLoading(false)
          setLoadedScope(scope)
        }
      }
    })()
    return () => {
      current = false
    }
  }, [workspaceId, task.id, request, scope])

  const open = (): void => {
    try {
      requestBacklogTaskStart(workspaceId, task)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const resume = async (): Promise<void> => {
    if (!currentAssociation || inFlight.current) {
      return
    }
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const { continueBacklogTask } = await import('@/lib/backlog-task-handoff')
      const outcome = await continueBacklogTask(
        resolveBacklogRoute(workspaceId),
        currentAssociation
      )
      if (outcome.status === 'unverifiable') {
        throw new Error(
          translate(
            'components.backlog.ownershipUnverifiable',
            'Conversation ownership is unverifiable. Reconnect the host before continuing.'
          )
        )
      }
      if (outcome.status === 'unavailable') {
        setInvalid(true)
        throw new Error(
          translate(
            'components.backlog.invalidAssociation',
            'The linked workspace or conversation is unavailable. Choose another conversation.'
          )
        )
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  return (
    <div className="space-y-2">
      {currentAssociation ? <BacklogAssociationContext context={context} /> : null}
      <div className="flex items-center gap-2">
        <Button
          className="min-w-0 flex-1"
          size="sm"
          disabled={loading || loadedScope !== scope || pending || Boolean(request)}
          onClick={currentAssociation && !unavailable ? () => void resume() : open}
        >
          {pending
            ? translate('components.backlog.openingConversation', 'Opening conversation…')
            : currentAssociation && unavailable
              ? translate('components.backlog.chooseConversation', 'Choose another conversation')
              : currentAssociation
                ? translate('components.backlog.continue', 'Continue')
                : translate('components.backlog.startTask', 'Start task')}
        </Button>
        {currentAssociation && !unavailable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending || Boolean(request)}
                aria-label={translate(
                  'components.backlog.conversationActions',
                  'Conversation actions'
                )}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={open}>
                {translate('components.backlog.chooseConversation', 'Choose another conversation')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {currentAssociation?.deliveryStatus === 'pending' ||
      currentAssociation?.deliveryStatus === 'unverified' ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'components.backlog.unverifiedDelivery',
            'Delivery is unverified. Continue will not resend the task.'
          )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
