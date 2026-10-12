import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  resolveNativeChatLinkPreviewMode,
  type NativeChatLinkPreviewMode
} from '../../../../shared/native-chat-link-preview-mode'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

export function NativeChatLinkPreviewModeSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const linkPreviewMode = resolveNativeChatLinkPreviewMode(settings)
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 shrink space-y-0.5">
        <Label>
          {translate(
            'auto.components.settings.ExperimentalPane.nativeChat.linkPreviewTitle',
            'Link previews'
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.ExperimentalPane.nativeChat.linkPreviewCopy',
            'Show previews when a link is hovered or focused, or after each paragraph and list.'
          )}
        </p>
      </div>
      <Select
        value={linkPreviewMode}
        onValueChange={(value: NativeChatLinkPreviewMode) => {
          updateSettings({ nativeChatLinkPreviewMode: value })
        }}
      >
        <SelectTrigger
          data-testid="native-chat-link-preview-mode-select"
          data-value={linkPreviewMode}
          aria-label={translate(
            'auto.components.settings.ExperimentalPane.nativeChat.linkPreviewLabel',
            'Link preview display'
          )}
          className="w-36"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false}>
          <SelectItem value="hover">
            {translate(
              'auto.components.settings.ExperimentalPane.nativeChat.linkPreviewHover',
              'On hover'
            )}
          </SelectItem>
          <SelectItem value="paragraph">
            {translate(
              'auto.components.settings.ExperimentalPane.nativeChat.linkPreviewParagraph',
              'After paragraph or list'
            )}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
