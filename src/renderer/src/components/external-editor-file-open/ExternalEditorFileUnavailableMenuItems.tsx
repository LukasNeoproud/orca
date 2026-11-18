import React from 'react'
import { FolderOpen } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

/** The disabled Open in action with the reason it cannot open this file. */
export function ExternalEditorFileUnavailableMenuItems({
  reason
}: {
  reason: string
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem disabled>
        <FolderOpen className="size-3.5" />
        {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
      </DropdownMenuItem>
      <p className="max-w-64 px-2 pb-1.5 text-[11px] text-muted-foreground">{reason}</p>
    </>
  )
}
