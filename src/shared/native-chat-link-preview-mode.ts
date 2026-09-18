export const DEFAULT_NATIVE_CHAT_LINK_PREVIEW_MODE = 'hover' as const

export type NativeChatLinkPreviewMode = 'hover' | 'paragraph'

export function normalizeNativeChatLinkPreviewMode(value: unknown): NativeChatLinkPreviewMode {
  return value === 'paragraph' ? 'paragraph' : DEFAULT_NATIVE_CHAT_LINK_PREVIEW_MODE
}

export function resolveNativeChatLinkPreviewMode(
  settings: { nativeChatLinkPreviewMode?: unknown } | null | undefined
): NativeChatLinkPreviewMode {
  return normalizeNativeChatLinkPreviewMode(settings?.nativeChatLinkPreviewMode)
}
