import type React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { OpenInApplication } from '../../../../shared/ui-chrome-types'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { getOpenInAppPresets, OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { translate } from '@/i18n/i18n'
import { getOpenInAddAppEntries, type OpenInAddAppEntry } from './open-in-add-app-entries'
import { useInstalledOpenInApplications } from './use-installed-open-in-applications'

type OpenInAddAppMenuProps = {
  draft: readonly OpenInApplication[]
  isAtLimit: boolean
  onAddApplication: (application: OpenInApplication) => void
  onAddCustomApp: () => void
}

function AddAppItem({
  entry,
  isAtLimit,
  onAddApplication
}: {
  entry: OpenInAddAppEntry
  isAtLimit: boolean
  onAddApplication: (application: OpenInApplication) => void
}): React.JSX.Element {
  const { application, added } = entry
  return (
    <DropdownMenuItem
      disabled={added || isAtLimit}
      onSelect={() => onAddApplication(application)}
      title={application.command}
    >
      <OpenInApplicationIcon application={application} size={14} />
      <span className="min-w-0 truncate">{application.label}</span>
      {added ? (
        <DropdownMenuShortcut className="inline-flex items-center gap-1">
          <Check className="size-3" />
          {translate('auto.components.settings.OpenInMenuSetting.c1d817e027', 'Added')}
        </DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  )
}

/** Add app: editors found on this computer first, then the usual presets and a custom app. */
export function OpenInAddAppMenu({
  draft,
  isAtLimit,
  onAddApplication,
  onAddCustomApp
}: OpenInAddAppMenuProps): React.JSX.Element {
  const installed = useInstalledOpenInApplications()
  const entries = getOpenInAddAppEntries(installed, getOpenInAppPresets(), draft)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isAtLimit}
          className="h-8 shrink-0 gap-1.5"
        >
          {translate('auto.components.settings.OpenInMenuSetting.e4064916aa', 'Add app')}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {entries.installed.length > 0 ? (
          <>
            <DropdownMenuLabel>
              {translate('components.openInExternalEditor.installedApps', 'Installed')}
            </DropdownMenuLabel>
            {entries.installed.map((entry) => (
              <AddAppItem
                key={entry.application.id}
                entry={entry}
                isAtLimit={isAtLimit}
                onAddApplication={onAddApplication}
              />
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {entries.others.map((entry) => (
          <AddAppItem
            key={entry.application.id}
            entry={entry}
            isAtLimit={isAtLimit}
            onAddApplication={onAddApplication}
          />
        ))}
        <DropdownMenuItem disabled={isAtLimit} onSelect={onAddCustomApp}>
          <OpenInApplicationIcon application={{ command: '' }} size={14} />
          <span className="min-w-0 truncate">
            {translate('auto.components.settings.OpenInMenuSetting.03b00b1f64', 'Custom app')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
