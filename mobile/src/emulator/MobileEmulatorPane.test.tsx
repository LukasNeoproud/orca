import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileEmulatorPane } from './MobileEmulatorPane'
import {
  BrowserScreencastOpcode,
  type BrowserScreencastFrame
} from '../transport/browser-screencast-protocol'
import type { RpcClient } from '../transport/rpc-client'
import { hostType } from '../test-support/host-type-predicate'

vi.mock('./mobile-emulator-native-video', () => ({
  NativeEmulatorVideoView: 'NativeEmulatorVideoView',
  getMobileEmulatorVideoCapabilities: vi
    .fn()
    .mockResolvedValue({ h264: true, hevc: true, av1: true }),
  submitMobileEmulatorVideoFrame: vi.fn().mockResolvedValue(undefined),
  closeMobileEmulatorVideoStream: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Pressable: 'Pressable',
  Platform: { OS: 'ios' },
  StyleSheet: { hairlineWidth: 1, create: (value: unknown) => value }
}))
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 })
}))
vi.mock('./MobileEmulatorImmersiveBars', () => ({ MobileEmulatorImmersiveBars: 'ImmersiveBars' }))
vi.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  Home: 'Home',
  Keyboard: 'Keyboard',
  Maximize: 'Maximize',
  Minimize: 'Minimize',
  Send: 'Send',
  SlidersHorizontal: 'SlidersHorizontal'
}))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})
describe('mobile emulator pane', () => {
  it('moves to fullscreen without duplicating the stream and exposes exit and quality choices', async () => {
    let listener!: (value: unknown) => void
    let onFrame!: (frame: BrowserScreencastFrame) => void
    const cancel = vi.fn()
    const subscribe = vi.fn((_method, _params, event, options) => {
      listener = event
      onFrame = options.onBinaryFrame
      return cancel
    })
    const client = {
      subscribe,
      getState: () => 'connected',
      onStateChange: () => () => {},
      sendRequest: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as RpcClient
    await act(async () => {
      renderer = create(
        createElement(MobileEmulatorPane, {
          client,
          device: {
            id: 'ios-1',
            name: 'iPhone',
            backend: 'ios',
            state: 'booted',
            isAvailable: true
          },
          appActive: true
        })
      )
    })
    act(() => {
      listener({ type: 'ready', subscriptionId: 's1' })
      onFrame({
        opcode: BrowserScreencastOpcode.Frame,
        seq: 1,
        format: 'jpeg',
        metadata: { imageWidth: 400, imageHeight: 800 },
        image: new Uint8Array([1])
      })
    })
    const button = (name: string) =>
      renderer!.root
        .findAll(hostType('Pressable'))
        .find((node) => node.props.accessibilityLabel === name)!
    expect(button('Home').props.disabled).toBe(false)
    expect(button('Back')).toBeUndefined()
    act(() => button('Fullscreen').props.onPress())
    expect(renderer!.root.find(hostType('Modal')).props.visible).toBe(true)
    expect(button('Exit fullscreen')).toBeDefined()
    expect(renderer!.root.findAll(hostType('Pressable'))).toHaveLength(1)
    expect(subscribe).toHaveBeenCalledOnce()
    expect(button('Home')).toBeUndefined()
    expect(button('Stream quality settings')).toBeUndefined()
    expect(renderer!.root.findAll(hostType('SafeAreaView'))).toHaveLength(0)
    expect(renderer!.root.find(hostType('Modal')).props.navigationBarTranslucent).toBe(true)
    expect(renderer!.root.find(hostType('Modal')).props.statusBarTranslucent).toBe(true)
    expect(renderer!.root.findAll(hostType('ImmersiveBars'))).toHaveLength(1)
    act(() => button('Exit fullscreen').props.onPress())
    expect(renderer!.root.findAll(hostType('ImmersiveBars'))).toHaveLength(0)
    expect(button('Home')).toBeDefined()
    act(() => button('Stream quality settings').props.onPress())
    const sheet = renderer!.root
      .findAll(hostType('ActionSheetModal'))
      .find((sheet) => sheet.props.title === 'Stream quality')!
    expect(sheet.props.actions).toHaveLength(3)
    await act(async () => sheet.props.actions[2].onPress())
    expect(cancel).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenLastCalledWith(
      'emulator.mobile.stream',
      expect.objectContaining({ deviceId: 'ios-1', profile: 'data-saver' }),
      expect.any(Function),
      expect.any(Object)
    )
    act(() => button('Fullscreen').props.onPress())
    act(() => renderer!.root.find(hostType('Modal')).props.onRequestClose())
    expect(renderer!.root.findAll(hostType('Modal'))).toHaveLength(0)
  })
})
