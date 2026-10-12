import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hostType } from '../test-support/host-type-predicate'

const native = vi.hoisted(() => ({
  supportsImmersiveWindow: false,
  requireView: vi.fn(() => 'ImmersiveWindow')
}))
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, StatusBar: 'StatusBar' }))
vi.mock('@orca/expo-emulator-video', () => ({ nativeEmulatorVideo: native }))
vi.mock('expo-modules-core', () => ({ requireNativeViewManager: native.requireView }))
afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
describe('emulator immersive window compatibility', () => {
  it.each([false, true])(
    'loads the native window view only when supported: %s',
    async (supported) => {
      native.supportsImmersiveWindow = supported
      const { MobileEmulatorImmersiveBars } = await import('./MobileEmulatorImmersiveBars')
      let renderer!: ReturnType<typeof create>
      act(() => {
        renderer = create(createElement(MobileEmulatorImmersiveBars))
      })
      expect(renderer.root.find(hostType('StatusBar')).props.hidden).toBe(true)
      expect(renderer.root.findAll(hostType('ImmersiveWindow'))).toHaveLength(supported ? 1 : 0)
      expect(native.requireView).toHaveBeenCalledTimes(supported ? 1 : 0)
      act(() => renderer.unmount())
    }
  )
})
