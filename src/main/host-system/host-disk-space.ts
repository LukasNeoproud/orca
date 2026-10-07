import { statfs } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { HostDiskLevel, HostDiskVolume } from '../../shared/host-system-types'

const GIB = 1024 ** 3
// Why these floors: macOS grows swap into free space, so a nearly full disk freezes the
// whole host (and with it the paired-client link) well before writes start failing.
export const DISK_WARNING_BYTES = 15 * GIB
export const DISK_CRITICAL_BYTES = 5 * GIB
/** A fill rate that reaches zero inside this window warns regardless of absolute space. */
export const DISK_FULL_SOON_SECONDS = 30 * 60
const TREND_WINDOW_MS = 5 * 60_000
const TREND_MIN_SPAN_MS = 60_000
// Below this the slope is noise from caches and logs, not a runaway writer.
const TREND_MIN_CONSUMED_BYTES = 512 * 1024 ** 2
const TREND_MAX_SAMPLES = 64

type DiskSample = { at: number; availableBytes: number }

export type MeasuredVolume = { label: string; totalBytes: number; availableBytes: number }

export class HostDiskTrend {
  private readonly samples = new Map<string, DiskSample[]>()

  record(label: string, availableBytes: number, at: number): void {
    const list = this.samples.get(label) ?? []
    list.push({ at, availableBytes })
    while (
      list.length > TREND_MAX_SAMPLES ||
      (list.length > 0 && at - list[0].at > TREND_WINDOW_MS)
    ) {
      list.shift()
    }
    this.samples.set(label, list)
  }

  fullInSeconds(label: string): number | null {
    const list = this.samples.get(label)
    if (!list || list.length < 2) {
      return null
    }
    const first = list[0]
    const last = list.at(-1)!
    const spanMs = last.at - first.at
    const consumed = first.availableBytes - last.availableBytes
    if (spanMs < TREND_MIN_SPAN_MS || consumed < TREND_MIN_CONSUMED_BYTES) {
      return null
    }
    const bytesPerSecond = consumed / (spanMs / 1000)
    return Math.max(0, Math.round(last.availableBytes / bytesPerSecond))
  }
}

export function classifyDiskLevel(
  availableBytes: number,
  fullInSeconds: number | null
): HostDiskLevel {
  if (availableBytes < DISK_CRITICAL_BYTES) {
    return 'critical'
  }
  if (
    availableBytes < DISK_WARNING_BYTES ||
    (fullInSeconds !== null && fullInSeconds < DISK_FULL_SOON_SECONDS)
  ) {
    return 'warning'
  }
  return 'ok'
}

function diskAnchors(platform: NodeJS.Platform): string[] {
  const home = os.homedir()
  return platform === 'win32' ? [path.parse(home).root || home] : [path.sep, home]
}

export async function measureHostVolumes(platform: NodeJS.Platform): Promise<MeasuredVolume[]> {
  const volumes: MeasuredVolume[] = []
  for (const anchor of diskAnchors(platform)) {
    try {
      const stats = await statfs(anchor)
      const totalBytes = stats.blocks * stats.bsize
      const availableBytes = stats.bavail * stats.bsize
      // Why: APFS volumes share their container's space, so `/` and home read identically.
      const duplicate = volumes.some(
        (volume) => volume.totalBytes === totalBytes && volume.availableBytes === availableBytes
      )
      if (!duplicate && totalBytes > 0) {
        volumes.push({ label: anchor, totalBytes, availableBytes })
      }
    } catch {
      // An unreadable anchor is skipped rather than reported as an empty disk.
    }
  }
  return volumes
}

export function toHostDiskVolume(volume: MeasuredVolume, trend: HostDiskTrend): HostDiskVolume {
  const fullInSeconds = trend.fullInSeconds(volume.label)
  return {
    ...volume,
    fullInSeconds,
    level: classifyDiskLevel(volume.availableBytes, fullInSeconds)
  }
}
