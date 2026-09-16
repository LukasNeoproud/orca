import { toast } from 'sonner'
import { openBacklogBoard } from '@/lib/backlog-client'
import { translate } from '@/i18n/i18n'

export function openBacklogBoardFromMenu(workspaceId: string, groupId?: string): void {
  void openBacklogBoard(workspaceId, groupId).catch((error: unknown) => {
    toast.error(
      translate('components.backlog.openFailed', 'Could not open Backlog.md: {{value0}}', {
        value0: error instanceof Error ? error.message : String(error)
      })
    )
  })
}
