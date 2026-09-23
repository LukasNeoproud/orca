import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'

export const NO_NATIVE_CHAT_IMAGE_ATTACHMENTS: PendingNativeChatImage[] = []

export type MobileNativeChatImagesByScope = Record<string, PendingNativeChatImage[]>

export function withScopeAttachments(
  byScope: MobileNativeChatImagesByScope,
  scope: string,
  next: PendingNativeChatImage[]
): MobileNativeChatImagesByScope {
  if (next.length > 0) {
    return { ...byScope, [scope]: next }
  }
  const remaining = { ...byScope }
  delete remaining[scope]
  return remaining
}

export function copyScopeAttachments(
  byScope: MobileNativeChatImagesByScope,
  sourceScope: string,
  targetScope: string
): MobileNativeChatImagesByScope {
  const source = byScope[sourceScope] ?? []
  return source.length > 0 && sourceScope !== targetScope
    ? withScopeAttachments(byScope, targetScope, [...source])
    : byScope
}
