import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  acquireBoundBacklogBoard,
  getBacklogBoardError,
  isBacklogBoardVerified,
  subscribeBacklogBoardErrors
} from '@/lib/backlog-board-client'

export function BacklogBoardPageGate({
  page,
  children
}: {
  page: BrowserPage
  children: ReactNode
}): React.JSX.Element {
  const binding = page.backlogBoardBinding
  const error = useSyncExternalStore(subscribeBacklogBoardErrors, () =>
    getBacklogBoardError(page.id)
  )
  const verified = useSyncExternalStore(subscribeBacklogBoardErrors, () =>
    isBacklogBoardVerified(page.id)
  )
  const pending = !!binding && (!verified || !!error)

  const acquire = (): void => {
    if (binding) {
      void acquireBoundBacklogBoard(binding, page.id).catch(() => {})
    }
  }

  useEffect(() => {
    if (!binding || verified || error) {
      return
    }
    void acquireBoundBacklogBoard(binding, page.id).catch(() => {})
  }, [binding, page.id, verified, error])

  if (!pending) {
    return <>{children}</>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-foreground">
      <p>
        {error
          ? translate('components.backlog.boardFailed', 'Could not open Backlog.md')
          : translate('components.backlog.boardConnecting', 'Connecting to Backlog.md…')}
      </p>
      {error ? (
        <p role="alert" className="max-w-md text-xs text-muted-foreground">
          {error}
        </p>
      ) : null}
      {error ? (
        <Button size="sm" variant="outline" onClick={acquire}>
          {translate('components.backlog.retry', 'Retry')}
        </Button>
      ) : null}
    </div>
  )
}
