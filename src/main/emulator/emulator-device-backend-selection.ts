import { platform } from 'node:os'
import type { EmulatorBackend } from './backends/emulator-backend'

export async function backendForEmulatorDevice(
  device: string,
  backends: EmulatorBackend[],
  ios: EmulatorBackend,
  android: EmulatorBackend
): Promise<EmulatorBackend> {
  for (const backend of backends) {
    if (await backend.ownsDevice(device)) {
      return backend
    }
  }
  return (
    backends.find((backend) => backend.isSupportedOnHost()) ??
    (platform() === 'darwin' ? ios : android)
  )
}
