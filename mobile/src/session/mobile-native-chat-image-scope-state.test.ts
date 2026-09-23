import { describe, expect, it } from 'vitest'
import { copyScopeAttachments } from './mobile-native-chat-image-scope-state'

describe('copyScopeAttachments', () => {
  it('copies continuation chips while preserving the original scope', () => {
    const image = { id: 'image-1', path: '/tmp/a.png', previewUri: 'file:///a.jpg' }
    const original = { source: [image] }
    const copied = copyScopeAttachments(original, 'source', 'continuation')
    expect(copied).toEqual({ source: [image], continuation: [image] })
    expect(copied.source).toBe(original.source)
    expect(copied.continuation).not.toBe(original.source)
  })

  it('does not create a target when the source has no chips', () => {
    const original = { source: [] }
    expect(copyScopeAttachments(original, 'source', 'continuation')).toBe(original)
  })
})
