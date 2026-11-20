import type React from 'react'
import { AppWindow } from 'lucide-react'
import type { OpenInApplication } from '../../../shared/ui-chrome-types'
import {
  KNOWN_OPEN_IN_APPLICATIONS,
  findKnownOpenInApplication,
  getOpenInLauncherIdentity,
  type KnownOpenInApplication
} from '../../../shared/open-in-known-applications'
import { cn } from './utils'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export type OpenInAppPreset = {
  id: string
  label: string
  command: string
  faviconDomain: string
  iconClassName?: string
}

// Why: Zed's favicon is a black transparent mark, which disappears on dark menus.
const ICON_CLASS_NAMES: Readonly<Record<string, string>> = { zed: 'dark:invert' }

function toPreset(app: KnownOpenInApplication, label: string): OpenInAppPreset {
  return {
    id: app.id,
    label,
    command: app.command,
    faviconDomain: app.faviconDomain,
    iconClassName: ICON_CLASS_NAMES[app.id]
  }
}

// Why: these stay on offer whether or not they are installed, as they always were.
const getAlwaysOfferedLabels = (): Record<string, string> => ({
  vscode: translate('auto.lib.open.in.app.catalog.173553f73a', 'VS Code'),
  cursor: translate('auto.lib.open.in.app.catalog.d62b12e98a', 'Cursor'),
  zed: translate('auto.lib.open.in.app.catalog.f8b8ca2711', 'Zed')
})

export const getOpenInAppPresets = createLocalizedCatalog(() => {
  const labels = getAlwaysOfferedLabels()
  return KNOWN_OPEN_IN_APPLICATIONS.flatMap((app) => {
    const label = labels[app.id]
    return label ? [toPreset(app, label)] : []
  })
})

/** The known editor a command launches, also when given as a path or a Toolbox script. */
export function getOpenInAppPreset(
  application: Pick<OpenInApplication, 'command'>
): OpenInAppPreset | null {
  const app = findKnownOpenInApplication(application.command)
  if (!app) {
    return null
  }
  return getOpenInAppPresets().find((preset) => preset.id === app.id) ?? toPreset(app, app.label)
}

// Why: `studio`, `studio64` and a Toolbox script path all launch the same editor.
function getOpenInAppKey(command: string): string {
  const app = findKnownOpenInApplication(command)
  return app ? `known:${app.id}` : getOpenInLauncherIdentity(command)
}

export function isOpenInAppPresetAdded(
  applications: readonly Pick<OpenInApplication, 'command'>[],
  preset: Pick<OpenInAppPreset, 'command'>
): boolean {
  const key = getOpenInAppKey(preset.command)
  return applications.some((application) => getOpenInAppKey(application.command) === key)
}

export function OpenInApplicationIcon({
  application,
  size = 14
}: {
  application: Pick<OpenInApplication, 'command'>
  size?: number
}): React.JSX.Element {
  const preset = getOpenInAppPreset(application)
  if (preset) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${preset.faviconDomain}&sz=64`}
        width={size}
        height={size}
        alt=""
        aria-hidden
        className={cn('shrink-0', preset.iconClassName)}
        style={{ borderRadius: 2 }}
      />
    )
  }
  return <AppWindow width={size} height={size} />
}
