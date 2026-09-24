export type MobileEmulatorDevice = {
  id: string
  name: string
  backend: 'ios' | 'android'
  state: 'shutdown' | 'booting' | 'booted'
  detail?: string
  isAvailable: boolean
}

export type MobileEmulatorProfile = 'quality' | 'responsive' | 'data-saver'

export const MOBILE_EMULATOR_PROFILES: {
  id: MobileEmulatorProfile
  label: string
  hint: string
}[] = [
  { id: 'quality', label: 'Quality', hint: 'Sharper image; uses more data' },
  { id: 'responsive', label: 'Responsive', hint: 'Faster updates at a lower resolution' },
  { id: 'data-saver', label: 'Save data', hint: 'Smaller image and fewer updates' }
]

export type MobileEmulatorInput =
  | {
      type: 'touch'
      phase: 'down' | 'move' | 'up' | 'cancel'
      x: number
      y: number
      videoWidth?: number
      videoHeight?: number
    }
  | { type: 'button'; name: string }
  | { type: 'type'; text: string }
