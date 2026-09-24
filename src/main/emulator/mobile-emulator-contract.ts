import type { EmulatorDevice } from './backends/emulator-backend'

export type MobileEmulatorProfile = 'quality' | 'responsive' | 'data-saver'
export type MobileEmulatorVideoCodec = 'h264' | 'hevc' | 'av1' | 'jpeg'
export type MobileEmulatorAction =
  | {
      type: 'touch'
      phase: 'down' | 'move' | 'up' | 'cancel'
      x: number
      y: number
      videoWidth?: number
      videoHeight?: number
    }
  | { type: 'tap'; x: number; y: number }
  | {
      type: 'gesture'
      points: { type: 'begin' | 'move' | 'end'; x: number; y: number; edge?: number }[]
    }
  | { type: 'type'; text: string }
  | { type: 'button'; name: string }

export const MOBILE_EMULATOR_PROFILES = {
  quality: { width: 1200, fps: 15, jpegQuality: 76, bitRate: 5_000_000 },
  responsive: { width: 900, fps: 20, jpegQuality: 60, bitRate: 2_500_000 },
  'data-saver': { width: 640, fps: 5, jpegQuality: 45, bitRate: 800_000 }
} as const

export function mobileEmulatorDevices(devices: EmulatorDevice[]): EmulatorDevice[] {
  return devices.filter(
    (device) =>
      device.backend === 'ios' ||
      (device.backend === 'android' && (device.detail === 'avd' || device.detail === 'emulator'))
  )
}
