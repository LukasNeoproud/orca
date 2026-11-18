import React, { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { openOpenInAppsSettings } from '@/components/sidebar/WorktreeOpenInMenu'
import { translate } from '@/i18n/i18n'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { NO_OPEN_IN_APPLICATIONS } from '@/lib/open-in-application-selection'
import { useAppStore } from '@/store'
import {
  getExternalEditorFileOpenEntries,
  pickDefaultExternalEditorFileOpenEntry,
  type ExternalEditorFileOpenEntry
} from './external-editor-file-open-entries'
import type { ExternalEditorFileTarget } from './external-editor-file-target'
import { readLastExternalEditorApplicationId } from './external-editor-last-application'
import { openFileInExternalEditor } from './open-file-in-external-editor'

type ExternalEditorFileOpenMenuItemsProps = {
  target: ExternalEditorFileTarget
  /** 1-based line the action was invoked on. */
  line?: number
  column?: number
}

/** Dropdown items that open a workspace file in a native IDE at the line they were invoked on. */
export function ExternalEditorFileOpenMenuItems({
  target,
  line,
  column
}: ExternalEditorFileOpenMenuItemsProps): React.JSX.Element {
  const openInApplications = useAppStore(
    (s) => s.settings?.openInApplications ?? NO_OPEN_IN_APPLICATIONS
  )
  // Why: menu content mounts on every open, so one read per mount sees the latest choice.
  const [lastApplicationId] = useState(() =>
    readLastExternalEditorApplicationId(target.preferenceKey)
  )
  const entries = getExternalEditorFileOpenEntries(openInApplications, target)
  const defaultEntry = pickDefaultExternalEditorFileOpenEntry(entries, lastApplicationId)
  const open = (entry: ExternalEditorFileOpenEntry): void => {
    void openFileInExternalEditor({ target, application: entry, line, column })
  }

  return (
    <>
      {defaultEntry ? (
        <DropdownMenuItem onSelect={() => open(defaultEntry)}>
          <OpenInApplicationIcon application={defaultEntry} size={14} />
          <span className="min-w-0 truncate">
            {translate('components.openInExternalEditor.openInApp', 'Open in {{value0}}', {
              value0: defaultEntry.label
            })}
          </span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <FolderOpen className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-52">
          {entries.map((entry) => (
            <DropdownMenuItem key={entry.id} disabled={entry.disabled} onSelect={() => open(entry)}>
              <OpenInApplicationIcon application={entry} size={14} />
              <span className="min-w-0 truncate">{entry.label}</span>
              {entry.metadata ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {entry.metadata}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          {entries.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={openOpenInAppsSettings}>
            {translate(
              'auto.components.sidebar.WorktreeOpenInMenu.1417fd8380',
              'Customize apps...'
            )}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}
