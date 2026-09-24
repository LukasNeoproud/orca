import type { EmulatorBridge } from '../emulator/emulator-bridge'
import type { EmulatorDevice } from '../emulator/backends/emulator-backend'
import type {
  MobileEmulatorAction,
  MobileEmulatorProfile,
  MobileEmulatorVideoCodec
} from '../emulator/mobile-emulator-contract'

export type MobileEmulatorStreamHostArgs = {
  bridge: EmulatorBridge
  device: EmulatorDevice
  profile: MobileEmulatorProfile
  videoCodecs?: MobileEmulatorVideoCodec[]
  connectionId: string
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  emit: (value: unknown) => void
  registerCleanup: (id: string, cleanup: () => void, connectionId: string) => void
  removeCleanup: (id: string) => void
  signal?: AbortSignal
}

export type MobileEmulatorStreamHost = {
  devices: (devices: EmulatorDevice[]) => EmulatorDevice[]
  start: (args: MobileEmulatorStreamHostArgs) => Promise<void>
  stop: (subscriptionId: string, connectionId: string) => boolean
  input: (
    subscriptionId: string,
    connectionId: string,
    action: MobileEmulatorAction
  ) => Promise<void>
}

let currentHost: MobileEmulatorStreamHost | null = null

export function setMobileEmulatorStreamHost(host: MobileEmulatorStreamHost | null): void {
  currentHost = host
}

export function getMobileEmulatorStreamHost(): MobileEmulatorStreamHost | null {
  return currentHost
}
