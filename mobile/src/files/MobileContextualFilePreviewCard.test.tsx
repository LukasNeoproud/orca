import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileContextualFilePreviewCard } from './MobileContextualFilePreviewCard'
import type { MobileContextualFilePreviewModel } from './use-mobile-contextual-file-preview'
import { hostType } from '../test-support/host-type-predicate'

const previewState = vi.hoisted(() => ({
  model: null as MobileContextualFilePreviewModel | null
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ RefreshCw: 'RefreshCw' }))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('../theme/mobile-theme', () => ({ colors: { textSecondary: '#999' } }))
vi.mock('./MobileContextualHtmlPreview', () => ({
  MobileContextualHtmlPreview: 'MobileContextualHtmlPreview'
}))
vi.mock('./MobileFilePreviewSourceText', () => ({
  MobileFilePreviewSourceText: 'MobileFilePreviewSourceText',
  MobileFilePreviewTruncatedNote: 'MobileFilePreviewTruncatedNote'
}))
vi.mock('./mobile-contextual-preview-styles', () => ({ contextualPreviewStyles: {} }))
vi.mock('./use-mobile-contextual-file-preview', () => ({
  useMobileContextualFilePreview: () => previewState.model
}))

const cardProps = {
  client: null,
  connectionState: 'connected' as const,
  worktreeId: 'wt-1',
  target: { pathText: 'notes/current.md', line: null, column: null }
}

function setModel(
  preview: MobileContextualFilePreviewModel['preview'],
  options: Partial<Omit<MobileContextualFilePreviewModel, 'preview'>> = {}
) {
  previewState.model = {
    preview,
    displayPath: 'notes/current.md',
    line: null,
    needsConsent: false,
    changed: false,
    approveOutsideWorkspace: vi.fn(),
    reload: vi.fn(),
    ...options
  }
}

async function renderCard(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(createElement(MobileContextualFilePreviewCard, cardProps))
  })
  return renderer
}

describe('MobileContextualFilePreviewCard', () => {
  it('requires an explicit load action for an outside-workspace file', async () => {
    const approveOutsideWorkspace = vi.fn()
    setModel(
      { status: 'loading', message: 'Waiting for approval...' },
      { needsConsent: true, approveOutsideWorkspace }
    )
    const renderer = await renderCard()

    expect(JSON.stringify(renderer.toJSON())).toContain('outside the conversation workspace')
    await act(async () => {
      renderer.root.findAll(hostType('Pressable')).at(-1)?.props.onPress()
    })
    expect(approveOutsideWorkspace).toHaveBeenCalledOnce()
  })

  it.each(['Binary preview unavailable', 'File too large for mobile preview', 'File not found'])(
    'shows the %s state with a retry action',
    async (message) => {
      const reload = vi.fn()
      setModel({ status: 'error', message, reconnect: false }, { reload })
      const renderer = await renderCard()

      expect(JSON.stringify(renderer.toJSON())).toContain(message)
      await act(async () => {
        renderer.root.findAll(hostType('Pressable')).at(-1)?.props.onPress()
      })
      expect(reload).toHaveBeenCalledOnce()
    }
  )

  it.each([
    ['text', 'MobileFilePreviewSourceText'],
    ['markdown', 'MobileMarkdown'],
    ['html', 'MobileContextualHtmlPreview']
  ] as const)('routes %s content to its verified renderer', async (kind, component) => {
    setModel({ status: 'ready', kind, content: 'current', truncated: false, byteLength: 7 })
    const renderer = await renderCard()

    expect(renderer.root.findAll(hostType(component))).toHaveLength(1)
    expect(JSON.stringify(renderer.toJSON())).toContain('message text may be historical')
  })

  it('renders a raster preview and identifies refreshed content as changed', async () => {
    const reload = vi.fn()
    setModel(
      { status: 'ready', kind: 'image', dataUri: 'data:image/png;base64,current' },
      { changed: true, reload }
    )
    const renderer = await renderCard()

    expect(renderer.root.find(hostType('Image')).props.source.uri).toContain('image/png')
    expect(JSON.stringify(renderer.toJSON())).toContain('Changed since first load')

    await act(async () => renderer.root.find(hostType('Image')).props.onError())
    expect(JSON.stringify(renderer.toJSON())).toContain('Unable to display image preview')
    await act(async () => renderer.root.findAll(hostType('Pressable')).at(-1)?.props.onPress())
    expect(reload).toHaveBeenCalledOnce()
  })
})
