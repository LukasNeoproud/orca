import type { MobileNativeChatInputLockReason } from './mobile-native-chat-view-types'

export function mobileNativeChatComposerPlaceholder(
  reason: MobileNativeChatInputLockReason | null
): string {
  switch (reason) {
    case 'disconnected':
      return 'Reconnecting…'
    case 'waiting':
      return 'Waiting for terminal…'
    case 'handoff':
      return 'Session is switching owners…'
    default:
      return 'Message, @files, /commands'
  }
}
