import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_CHAT_LINK_PREVIEW_MODE,
  normalizeNativeChatLinkPreviewMode,
  resolveNativeChatLinkPreviewMode
} from './native-chat-link-preview-mode'

describe('native chat link preview mode', () => {
  it('defaults missing and invalid values to hover previews', () => {
    expect(DEFAULT_NATIVE_CHAT_LINK_PREVIEW_MODE).toBe('hover')
    expect(resolveNativeChatLinkPreviewMode(undefined)).toBe('hover')
    expect(normalizeNativeChatLinkPreviewMode('end-of-answer')).toBe('hover')
    expect(normalizeNativeChatLinkPreviewMode(true)).toBe('hover')
  })

  it('preserves paragraph previews', () => {
    expect(resolveNativeChatLinkPreviewMode({ nativeChatLinkPreviewMode: 'paragraph' })).toBe(
      'paragraph'
    )
  })
})
