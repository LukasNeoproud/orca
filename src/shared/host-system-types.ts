// Wire contract for the paired-client host system panel (`hostSystem.*` RPC).
// Fields are additive-only: older clients ignore unknown keys, so never repurpose one.

export type HostThermalState = 'nominal' | 'fair' | 'serious' | 'critical'

export type HostPowerMode = 'automatic' | 'low-power' | 'high-power'

/** Modes a paired client may request; high power is shown but never set remotely. */
export type HostSwitchablePowerMode = Exclude<HostPowerMode, 'high-power'>

export type HostBattery = {
  percent: number
  charging: boolean
}

export type HostPowerModeState = {
  current: HostPowerMode | null
  /** False until the host's one-time privileged setup is installed. */
  switchable: boolean
}

export type HostDiskLevel = 'ok' | 'warning' | 'critical'

export type HostDiskVolume = {
  label: string
  totalBytes: number
  availableBytes: number
  level: HostDiskLevel
  /** Projected seconds until full at the recent fill rate; null when not filling. */
  fullInSeconds: number | null
}

export type HostProcessEntry = {
  pid: number
  name: string
  cpuPercent: number
  memoryBytes: number
  /** Combined in+out rate; null when this host cannot attribute network per process. */
  networkBytesPerSecond: number | null
}

export type HostSystemSnapshot = {
  platform: string
  collectedAt: number
  battery: HostBattery | null
  thermalState: HostThermalState | null
  /** Null when the host platform has no supported power-mode control. */
  powerMode: HostPowerModeState | null
  disks: HostDiskVolume[]
  /** Null when not requested or unsupported on this host platform. */
  processes: HostProcessEntry[] | null
}

export type HostProcessTerminationVerdict = 'exited' | 'live' | 'unverifiable'

export type HostProcessTerminationResult = {
  pid: number
  verdict: HostProcessTerminationVerdict
}

export type PowerModeSetupStatus = {
  supported: boolean
  installed: boolean
  /** Null when the rule could not be exercised (e.g. high power mode is active). */
  verified: boolean | null
}

export type PowerModeSetupActionResult =
  | { ok: true; status: PowerModeSetupStatus }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'failed'; message?: string }

export const HOST_SYSTEM_ERROR_CODES = {
  powerModeSetupRequired: 'host_power_mode_setup_required',
  processProtected: 'host_process_protected',
  processChanged: 'host_process_changed',
  processPermissionDenied: 'host_process_permission_denied',
  unsupported: 'host_system_unsupported'
} as const

export type HostSystemErrorCode =
  (typeof HOST_SYSTEM_ERROR_CODES)[keyof typeof HOST_SYSTEM_ERROR_CODES]
