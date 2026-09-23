import { describe, expect, it, vi } from 'vitest'
import { getMobileLinkActionSheetActions } from './mobile-link-action-sheet-actions'

vi.mock('lucide-react-native', () => ({
  Copy: vi.fn(),
  ExternalLink: vi.fn(),
  Eye: vi.fn(),
  Globe: vi.fn(),
  MessageSquarePlus: vi.fn()
}))

const callbacks = {
  onOpenFile: vi.fn(),
  onPreviewFile: vi.fn(),
  onOpenWeb: vi.fn(),
  onCopy: vi.fn(),
  onAddToMessage: vi.fn()
}

describe('getMobileLinkActionSheetActions', () => {
  it('offers the complete file action set', () => {
    const actions = getMobileLinkActionSheetActions({
      target: { source: 'chat', kind: 'file', pathText: 'src/app.ts' },
      preferredWebMode: 'orca-browser',
      canOpenOrcaBrowser: true,
      ...callbacks
    })

    expect(actions.map((action) => action.label)).toEqual([
      'Open',
      'Preview',
      'Copy Path',
      'Add to Message'
    ])
  })

  it('offers both web destinations with the preferred one first', () => {
    const actions = getMobileLinkActionSheetActions({
      target: { source: 'chat', kind: 'web', url: 'https://example.com' },
      preferredWebMode: 'phone-browser',
      canOpenOrcaBrowser: true,
      ...callbacks
    })

    expect(actions.map((action) => action.label)).toEqual([
      'Open in Phone Browser',
      'Open in Orca Browser',
      'Copy Link',
      'Add to Message'
    ])
  })

  it('hides Orca browser when the workspace cannot create browser tabs', () => {
    const actions = getMobileLinkActionSheetActions({
      target: { source: 'terminal', terminalHandle: 't-1', kind: 'web', url: 'https://x.dev' },
      preferredWebMode: 'orca-browser',
      canOpenOrcaBrowser: false,
      ...callbacks
    })

    expect(actions.map((action) => action.label)).toEqual([
      'Open in Phone Browser',
      'Copy Link',
      'Add to Message'
    ])
  })
})
