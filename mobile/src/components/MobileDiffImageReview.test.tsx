import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileDiffImageReview } from './MobileDiffImageReview'
import { hostType } from '../test-support/host-type-predicate'
import type { ReviewDiffState } from '../session/mobile-diff-review-screen-model'

type ImageDiffState = Extract<ReviewDiffState, { kind: 'image' }>

const pan = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: unknown[]) => unknown> }))

vi.mock('react-native', () => ({
  Image: 'Image',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  PanResponder: {
    create: (handlers: Record<string, (...args: unknown[]) => unknown>) => {
      pan.handlers = handlers
      return { panHandlers: {} }
    }
  },
  StyleSheet: { create: (styles: unknown) => styles }
}))
vi.mock('lucide-react-native', () => ({
  Crosshair: 'Crosshair',
  MessageSquarePlus: 'MessageSquarePlus',
  ZoomIn: 'ZoomIn',
  ZoomOut: 'ZoomOut'
}))

const imageDiff: ImageDiffState = {
  kind: 'image',
  itemKey: 'image.png',
  mimeType: 'image/png',
  original: { kind: 'ready', uri: 'data:image/png;base64,old' },
  modified: { kind: 'ready', uri: 'data:image/png;base64,new' }
}

async function renderReview(diffState = imageDiff) {
  const onAddNote = vi.fn()
  const onEditNote = vi.fn()
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      createElement(MobileDiffImageReview, {
        comments: [],
        diffState,
        staleCommentIds: new Set<string>(),
        onAddNote,
        onEditNote
      })
    )
  })
  return { renderer, onAddNote, onEditNote }
}

describe('MobileDiffImageReview', () => {
  it('switches image sides, zooms, and sends a percentage region from a drag', async () => {
    const { renderer, onAddNote } = await renderReview()
    const image = renderer.root.find(hostType('Image'))
    expect(image.props.source.uri).toBe('data:image/png;base64,new')
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Zoom in' }).props.onPress()
    })
    expect(renderer.root.find(hostType('Image')).props.style[1].transform[0].scale).toBe(1.5)
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Original image' }).props.onPress()
    })
    expect(renderer.root.find(hostType('Image')).props.source.uri).toBe('data:image/png;base64,old')
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Changed image' }).props.onPress()
    })
    await act(async () => {
      renderer.root
        .find(hostType('Image'))
        .props.onLoad({ nativeEvent: { source: { width: 200, height: 100 } } })
      renderer.root
        .findAll(hostType('View'))
        .find((view) => view.props.onLayout)
        ?.props.onLayout({
          nativeEvent: { layout: { width: 200, height: 100 } }
        })
      renderer.root.findByProps({ accessibilityLabel: 'Select image area' }).props.onPress()
    })
    await act(async () => {
      pan.handlers.onPanResponderGrant?.({ nativeEvent: { locationX: 50, locationY: 25 } })
      pan.handlers.onPanResponderMove?.({ nativeEvent: { locationX: 100, locationY: 50 } })
      pan.handlers.onPanResponderRelease?.()
    })
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Add note to selected image area' })
        .props.onPress()
    })
    expect(onAddNote).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    )
    await act(async () => renderer.unmount())
  })

  it('shows unavailable content clearly', async () => {
    const { renderer } = await renderReview({
      ...imageDiff,
      original: { kind: 'absent' },
      modified: { kind: 'unavailable' }
    })
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Changed image' }).props.onPress()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('Preview Unavailable')
    await act(async () => renderer.unmount())
  })
})
