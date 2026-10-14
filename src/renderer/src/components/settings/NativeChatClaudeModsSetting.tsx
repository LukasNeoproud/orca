import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SettingsSwitchRow } from './SettingsFormControls'
import { Card, CardContent } from '../ui/card'
import { SearchableSetting } from './SearchableSetting'
import { getChatClaudeModsSearchEntry } from './chat-claude-mods-search'

type NativeChatClaudeModsSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible?: boolean
}

export function NativeChatClaudeModsSetting({
  settings,
  updateSettings,
  forceVisible = false
}: NativeChatClaudeModsSettingProps): React.JSX.Element {
  const enabled = settings.nativeChatClaudeMods !== false
  const entry = getChatClaudeModsSearchEntry()
  return (
    <SearchableSetting
      {...entry}
      id="chat-claude-mods"
      forceVisible={forceVisible}
      className="max-w-none"
    >
      <Card>
        <CardContent>
          <SettingsSwitchRow
            label={entry.title}
            description={entry.description}
            checked={enabled}
            ariaLabel={translate(
              'components.settings.nativeChat.claudeModsToggleLabel',
              'Toggle Claude Code mods'
            )}
            onChange={() => updateSettings({ nativeChatClaudeMods: !enabled })}
          />
        </CardContent>
      </Card>
    </SearchableSetting>
  )
}
