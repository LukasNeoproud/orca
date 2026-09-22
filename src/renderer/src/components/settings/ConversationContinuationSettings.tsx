import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'

export function ConversationContinuationSettings({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  return (
    <SearchableSetting
      className="space-y-4"
      title={translate('continuation.settings.title', 'Conversation continuation')}
      keywords={['continuation', 'compact', 'compaction', 'idle', 'resume', 'Codex']}
    >
      <SettingsSubsectionHeader
        title={translate('continuation.settings.title', 'Conversation continuation')}
        description={translate(
          'continuation.settings.description',
          'Choose how to continue Codex conversations after a pause. The original conversation is preserved.'
        )}
      />
      <Duration
        value={settings.conversationContinuationOfferAfterMs ?? 1_800_000}
        label={translate('continuation.settings.offer', 'Offer continuation after')}
        allowNever
        onChange={(value) => void updateSettings({ conversationContinuationOfferAfterMs: value })}
      />
      <SettingsSwitchRow
        label={translate('continuation.settings.auto', 'Prepare compacted copies automatically')}
        description={translate(
          'continuation.settings.cost',
          'Uses model tokens in the background. Preparation runs while the owning Orca runtime is available.'
        )}
        checked={settings.conversationContinuationAutoCompact === true}
        onChange={() =>
          void updateSettings({
            conversationContinuationAutoCompact:
              settings.conversationContinuationAutoCompact !== true
          })
        }
      />
      {settings.conversationContinuationAutoCompact === true ? (
        <Duration
          value={settings.conversationContinuationCompactAfterMs ?? 1_800_000}
          label={translate('continuation.settings.delay', 'Prepare after inactivity')}
          onChange={(value) =>
            void updateSettings({ conversationContinuationCompactAfterMs: value })
          }
        />
      ) : null}
    </SearchableSetting>
  )
}

function Duration({
  value,
  label,
  allowNever,
  onChange
}: {
  value: number
  label: string
  allowNever?: boolean
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger size="sm" className="w-36" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNever ? (
            <SelectItem value="0">{translate('continuation.settings.never', 'Never')}</SelectItem>
          ) : null}
          {[5, 15, 30, 60, 120].map((minutes) => (
            <SelectItem key={minutes} value={String(minutes * 60_000)}>
              {translate('continuation.settings.minutes', '{{minutes}} minutes', { minutes })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
