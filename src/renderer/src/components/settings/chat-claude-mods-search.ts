import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { SettingsSearchEntry } from './settings-search'

export const getChatClaudeModsSearchEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  targetSectionId: 'chat-claude-mods',
  title: translate('components.settings.nativeChat.claudeModsTitle', 'Claude Code mods'),
  description: translate(
    'components.settings.nativeChat.claudeModsCopy',
    'Experimental: draw the panes, band and notifications that Claude Code mods add, in Claude chats. Needs Claude Code 2.1.287 or newer.'
  )
}))
