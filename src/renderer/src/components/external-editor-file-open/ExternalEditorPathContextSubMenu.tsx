import React from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import {
  getOpenInEntryAvailability,
  openOpenInAppsSettings,
  openWorktreePath
} from '@/components/sidebar/WorktreeOpenInMenu'
import { translate } from '@/i18n/i18n'
import { getRouteForLocalPathOpenOwner } from '@/lib/local-path-open-guard'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { NO_OPEN_IN_APPLICATIONS } from '@/lib/open-in-application-selection'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getLocalExternalEditorProjectRoot } from './external-editor-file-target'

type ExternalEditorPathContextSubMenuProps = {
  /** File or folder to open; the trigger is disabled without one. */
  path?: string
  owner: ExecutionHostId | 'unresolved'
  /** Workspace that holds a file at `path`, so the editor opens it in that window. */
  workspaceRoot: string | null
}

/** Open in submenu of a sidebar row's context menu, for a file or folder the row shows. */
export function ExternalEditorPathContextSubMenu({
  path,
  owner,
  workspaceRoot
}: ExternalEditorPathContextSubMenuProps): React.JSX.Element {
  const openInApplications = useAppStore(
    (s) => s.settings?.openInApplications ?? NO_OPEN_IN_APPLICATIONS
  )
  const route = getRouteForLocalPathOpenOwner(owner)
  const projectRoot = getLocalExternalEditorProjectRoot(owner, workspaceRoot)
  const open = (command: string): void => {
    if (path) {
      void openWorktreePath({
        target: 'external-editor',
        worktreePath: path,
        ...route,
        command,
        projectRoot
      })
    }
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={!path}>
        <FolderOpen className="size-3.5" />
        {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-52">
        {openInApplications.map((application) => {
          const availability = getOpenInEntryAvailability(
            { ...application, target: 'external-editor' },
            route.connectionId,
            route.runtimeEnvironmentId,
            route.ownerUnresolved
          )
          return (
            <ContextMenuItem
              key={application.id}
              onSelect={() => open(application.command)}
              disabled={!path || availability.disabled}
            >
              {application.command ? (
                <OpenInApplicationIcon application={application} size={14} />
              ) : (
                <ExternalLink className="size-3.5" />
              )}
              <span className="min-w-0 truncate">{application.label}</span>
              {availability.metadata ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {availability.metadata}
                </span>
              ) : null}
            </ContextMenuItem>
          )
        })}
        {openInApplications.length > 0 ? <ContextMenuSeparator /> : null}
        <ContextMenuItem onSelect={openOpenInAppsSettings}>
          {translate('auto.components.sidebar.WorktreeOpenInMenu.1417fd8380', 'Customize apps...')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
