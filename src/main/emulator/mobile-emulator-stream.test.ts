import { describe, expect, it } from 'vitest'
import { mobileEmulatorDevices } from './mobile-emulator-stream'

describe('mobile emulator device selection', () => {
  it('keeps existing simulators and AVDs while excluding physical Android devices', () => {
    expect(
      mobileEmulatorDevices([
        { backend: 'ios', id: 'ios-1', name: 'iPhone', state: 'booted', isAvailable: true },
        {
          backend: 'android',
          id: 'emulator-5554',
          name: 'Pixel',
          state: 'booted',
          detail: 'emulator',
          isAvailable: true
        },
        {
          backend: 'android',
          id: 'Pixel_8',
          name: 'Pixel 8',
          state: 'shutdown',
          detail: 'avd',
          isAvailable: true
        },
        {
          backend: 'android',
          id: 'USB123',
          name: 'Phone',
          state: 'booted',
          detail: 'device',
          isAvailable: true
        }
      ])
    ).toHaveLength(3)
  })
})
