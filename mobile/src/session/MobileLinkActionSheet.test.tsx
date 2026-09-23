import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileLinkActionSheet } from './MobileLinkActionSheet'

vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  Copy: 'Copy',
  ExternalLink: 'ExternalLink',
  Eye: 'Eye',
  Globe: 'Globe',
  MessageSquarePlus: 'MessageSquarePlus'
}))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetContent: 'ActionSheetContent' }))
vi.mock('../components/BottomDrawer', () => ({ BottomDrawer: 'BottomDrawer' }))
vi.mock('../files/MobileContextualFilePreviewCard', () => ({
  MobileContextualFilePreviewCard: 'MobileContextualFilePreviewCard'
}))

const callbacks = {
  onClose: vi.fn(),
  onOpenFile: vi.fn(),
  onPreviewFile: vi.fn(),
  onOpenWeb: vi.fn(),
  onCopy: vi.fn(),
  onAddToMessage: vi.fn()
}

describe('MobileLinkActionSheet', () => {
  it('shows a URL-only web preview without loading website metadata', async () => {
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(
        createElement(MobileLinkActionSheet, {
          target: { source: 'chat', kind: 'web', url: 'https://example.com/page' },
          client: null,
          connectionState: 'connected',
          worktreeId: 'folder:workspace',
          preferredWebMode: 'phone-browser',
          canOpenOrcaBrowser: false,
          ...callbacks
        })
      )
    })
    const output = JSON.stringify(renderer.toJSON())
    expect(output).toContain('https://example.com/page')
    expect(output).toContain('Open the link to view the website.')
    expect(output).not.toContain('MobileContextualFilePreviewCard')
    await act(async () => renderer.unmount())
  })
})
