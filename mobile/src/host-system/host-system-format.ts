import type {
  HostDiskLevel,
  HostPowerMode,
  HostProcessEntry,
  HostThermalState
} from '../../../src/shared/host-system-types'
import { colors } from '../theme/mobile-theme'

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatFullIn(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 90 ? `~${minutes} min` : `~${Math.round(minutes / 60)} h`
}

export const THERMAL_LABELS: Record<HostThermalState, string> = {
  nominal: 'Normal',
  fair: 'Warm',
  serious: 'Hot (throttling)',
  critical: 'Critical'
}

export const THERMAL_COLORS: Record<HostThermalState, string> = {
  nominal: colors.statusGreen,
  fair: colors.statusGreen,
  serious: colors.statusAmber,
  critical: colors.statusRed
}

export const DISK_LEVEL_COLORS: Record<HostDiskLevel, string> = {
  ok: colors.statusGreen,
  warning: colors.statusAmber,
  critical: colors.statusRed
}

export const POWER_MODE_LABELS: Record<HostPowerMode, string> = {
  automatic: 'Automatic',
  'low-power': 'Low Power',
  'high-power': 'High Power'
}

export type ProcessSort = 'cpu' | 'memory' | 'network'

export function sortProcesses(
  processes: readonly HostProcessEntry[],
  sort: ProcessSort
): HostProcessEntry[] {
  const key = (entry: HostProcessEntry): number =>
    sort === 'cpu'
      ? entry.cpuPercent
      : sort === 'memory'
        ? entry.memoryBytes
        : (entry.networkBytesPerSecond ?? 0)
  return [...processes].sort((a, b) => key(b) - key(a))
}
