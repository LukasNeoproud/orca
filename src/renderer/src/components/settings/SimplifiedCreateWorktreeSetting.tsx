import { translateSearchKeyword } from './settings-search-keywords'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { Label } from '../ui/label'

export function getSimplifiedCreateWorktreeSearchEntry() {
  return {
    title: translate('simplifiedWorktree.setting.title', 'Use simplified Create worktree dialog'),
    description: translate(
      'simplifiedWorktree.setting.description',
      'Create worktrees with a branch-first form and explicit names and location.'
    ),
    keywords: [
      ...translateSearchKeyword('simplifiedWorktree.setting.experimental', 'experimental'),
      ...translateSearchKeyword('simplifiedWorktree.setting.worktree', 'worktree'),
      ...translateSearchKeyword('simplifiedWorktree.setting.branch', 'branch'),
      ...translateSearchKeyword('simplifiedWorktree.setting.create', 'create'),
      ...translateSearchKeyword('simplifiedWorktree.setting.location', 'location')
    ]
  }
}

export function SimplifiedCreateWorktreeSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const entry = getSimplifiedCreateWorktreeSearchEntry()
  return (
    <SearchableSetting
      {...entry}
      className="space-y-3 py-2"
      id="experimental-simplified-create-worktree"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label>{entry.title}</Label>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
        </div>
        <SettingsSwitch
          checked={settings.experimentalSimplifiedCreateWorktree === true}
          ariaLabel={entry.title}
          onChange={() =>
            updateSettings({
              experimentalSimplifiedCreateWorktree:
                settings.experimentalSimplifiedCreateWorktree !== true
            })
          }
        />
      </div>
    </SearchableSetting>
  )
}
