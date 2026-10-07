import type { HostThermalState } from '../../shared/host-system-types'

/**
 * Thermal pressure as the OS reports it (macOS `NSProcessInfo.thermalState`).
 * Injected because only the Electron host can read it; a Node host reports null.
 */
export type HostThermalStateSource = {
  read(): HostThermalState | null
  subscribe(listener: (state: HostThermalState | null) => void): () => void
}

let source: HostThermalStateSource | null = null

export function setHostThermalStateSource(next: HostThermalStateSource | null): void {
  source = next
}

export function getHostThermalStateSource(): HostThermalStateSource | null {
  return source
}

export function readHostThermalState(): HostThermalState | null {
  try {
    return source?.read() ?? null
  } catch {
    return null
  }
}

export function normalizeHostThermalState(value: unknown): HostThermalState | null {
  return value === 'nominal' || value === 'fair' || value === 'serious' || value === 'critical'
    ? value
    : null
}
