import type { HostDiskVolume, HostSystemSnapshot } from '../../shared/host-system-types'
import { readHostBattery } from './host-battery'
import { HostDiskTrend, measureHostVolumes, toHostDiskVolume } from './host-disk-space'
import { listHostProcesses } from './host-process-list'
import { readHostPowerMode } from './host-power-mode'
import { readHostThermalState } from './host-thermal-state'

// One trend per host process: the watchdog and paired-client polls feed the same samples.
const diskTrend = new HostDiskTrend()
let inflight: { includeProcesses: boolean; promise: Promise<HostSystemSnapshot> } | null = null

export async function sampleHostDisks(platform: NodeJS.Platform): Promise<HostDiskVolume[]> {
  const now = Date.now()
  const volumes = await measureHostVolumes(platform)
  for (const volume of volumes) {
    diskTrend.record(volume.label, volume.availableBytes, now)
  }
  return volumes.map((volume) => toHostDiskVolume(volume, diskTrend))
}

export function collectHostSystemSnapshot(options: {
  includeProcesses: boolean
}): Promise<HostSystemSnapshot> {
  // Why: several phones polling at once must not fan out into parallel ps/nettop runs.
  if (inflight && (inflight.includeProcesses || !options.includeProcesses)) {
    return inflight.promise
  }
  const promise = runSnapshot(options.includeProcesses).finally(() => {
    if (inflight?.promise === promise) {
      inflight = null
    }
  })
  inflight = { includeProcesses: options.includeProcesses, promise }
  return promise
}

async function runSnapshot(includeProcesses: boolean): Promise<HostSystemSnapshot> {
  const platform = process.platform
  const [battery, powerMode, disks, processes] = await Promise.all([
    readHostBattery(platform),
    readHostPowerMode(platform).catch(() => null),
    sampleHostDisks(platform),
    includeProcesses ? listHostProcesses(platform).catch(() => null) : Promise.resolve(null)
  ])
  return {
    platform,
    collectedAt: Date.now(),
    battery,
    thermalState: readHostThermalState(),
    powerMode,
    disks,
    processes
  }
}
