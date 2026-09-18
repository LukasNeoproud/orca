import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { NativeChatSupportedAgents } from './NativeChatSupportedAgents'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'
import {
  resolveAgentSessionHistoryOpenMode,
  type AgentSessionHistoryOpenMode
} from '../../../../shared/agent-session-history-open-mode'
import {
  resolveNativeChatLinkPreviewMode,
  type NativeChatLinkPreviewMode
} from '../../../../shared/native-chat-link-preview-mode'

type NativeChatDefaultView = 'terminal-chat' | 'native-chat'

type NativeChatExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function NativeChatExperimentalSetting({
  settings,
  updateSettings
}: NativeChatExperimentalSettingProps): React.JSX.Element {
  const nativeChatEnabled = settings.experimentalNativeChat === true
  const structuredNativeChatEnabled = settings.experimentalStructuredNativeChat === true
  const defaultView: NativeChatDefaultView =
    settings.openAgentTabsInChatByDefault === true ? 'native-chat' : 'terminal-chat'
  const historyOpenMode = resolveAgentSessionHistoryOpenMode(settings)
  const linkPreviewMode = resolveNativeChatLinkPreviewMode(settings)

  return (
    <SearchableSetting
      title={translate('auto.components.settings.ExperimentalPane.nativeChat.title', 'Chat UI')}
      description={translate(
        'auto.components.settings.ExperimentalPane.nativeChat.description',
        'Preview the desktop chat surface for supported agent terminal sessions.'
      )}
      keywords={getExperimentalSearchEntry().nativeChat.keywords}
      className="space-y-3 py-2"
      id="experimental-native-chat"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate('auto.components.settings.ExperimentalPane.nativeChat.title', 'Chat UI')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.nativeChat.copy',
              'Enable the Chat UI for supported Codex and Claude sessions. Configure new tabs and session history separately.'
            )}
          </p>
          <NativeChatSupportedAgents />
        </div>
        <SettingsSwitch
          checked={nativeChatEnabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.nativeChat.toggleLabel',
            'Toggle Chat UI'
          )}
          onChange={() =>
            updateSettings({
              experimentalNativeChat: !nativeChatEnabled
            })
          }
        />
      </div>
      {nativeChatEnabled ? (
        <div className="ml-4 space-y-4 border-l border-border pl-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 shrink space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.defaultTitle',
                  'Default view'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.defaultCopy',
                  'Choose how new supported agent terminal tabs open.'
                )}
              </p>
            </div>
            <Select
              value={defaultView}
              onValueChange={(value: NativeChatDefaultView) => {
                updateSettings({
                  openAgentTabsInChatByDefault: value === 'native-chat'
                })
              }}
            >
              <SelectTrigger
                data-testid="native-chat-default-view-select"
                aria-label={translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.defaultViewLabel',
                  'Default Chat UI view'
                )}
                className="w-36"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false}>
                <SelectItem value="terminal-chat">
                  {translate(
                    'auto.components.settings.ExperimentalPane.nativeChat.defaultViewTerminal',
                    'Terminal chat'
                  )}
                </SelectItem>
                <SelectItem value="native-chat">
                  {translate(
                    'auto.components.settings.ExperimentalPane.nativeChat.defaultViewNative',
                    'Chat UI'
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <LinkPreviewModeSetting
            linkPreviewMode={linkPreviewMode}
            updateSettings={updateSettings}
          />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 shrink space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.structuredTitle',
                  'Enable Codex and Claude chats'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.structuredCopy',
                  'Use dedicated chats for supported Codex and Claude sessions.'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.ExperimentalPane.nativeChat.structuredScope',
                  'Available for local sessions. WSL, remote hosts, and unsupported Windows environments cannot open Chat UI.'
                )}
              </p>
            </div>
            <SettingsSwitch
              checked={structuredNativeChatEnabled}
              ariaLabel={translate(
                'auto.components.settings.ExperimentalPane.nativeChat.structuredToggleLabel',
                'Toggle updated structured native chat'
              )}
              onChange={() =>
                updateSettings({
                  experimentalStructuredNativeChat: !structuredNativeChatEnabled
                })
              }
            />
          </div>
        </div>
      ) : null}
      <div className="ml-4 border-l border-border pl-4">
        <SessionHistoryDefaultSetting
          historyOpenMode={historyOpenMode}
          updateSettings={updateSettings}
        />
      </div>
    </SearchableSetting>
  )
}

function LinkPreviewModeSetting({
  linkPreviewMode,
  updateSettings
}: {
  linkPreviewMode: NativeChatLinkPreviewMode
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
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

function SessionHistoryDefaultSetting({
  historyOpenMode,
  updateSettings
}: {
  historyOpenMode: AgentSessionHistoryOpenMode
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 shrink space-y-0.5">
        <Label>
          {translate(
            'auto.components.settings.ExperimentalPane.nativeChat.historyDefaultTitle',
            'Session history default'
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.ExperimentalPane.nativeChat.historyDefaultCopy',
            'Choose how past Codex and Claude sessions open. This is independent of the default view for new tabs.'
          )}
        </p>
      </div>
      <Select
        value={historyOpenMode}
        onValueChange={(value: AgentSessionHistoryOpenMode) => {
          updateSettings({ agentSessionHistoryOpenMode: value })
        }}
      >
        <SelectTrigger
          data-testid="session-history-default-view-select"
          data-value={historyOpenMode}
          aria-label={translate(
            'auto.components.settings.ExperimentalPane.nativeChat.historyDefaultLabel',
            'Default session history view'
          )}
          className="w-36"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false}>
          <SelectItem value="terminal">
            {translate(
              'auto.components.settings.ExperimentalPane.nativeChat.historyDefaultTerminal',
              'Terminal chat'
            )}
          </SelectItem>
          <SelectItem value="structured">
            {translate(
              'auto.components.settings.ExperimentalPane.nativeChat.historyDefaultStructured',
              'Chat UI'
            )}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
