import type {
  HostDiskLevel,
  HostDiskVolume,
  HostThermalState
} from '../../shared/host-system-types'
import { DISK_CRITICAL_BYTES, DISK_WARNING_BYTES, DISK_FULL_SOON_SECONDS } from './host-disk-space'
import type { ThermalSleepOutcome } from './host-thermal-sleep'

const GIB = 1024 ** 3
const DISK_POLL_MS = 60_000
const DISK_ALERT_POLL_MS = 15_000
// Leaving a level needs this much headroom so a disk hovering at a floor does not re-alert.
const DISK_RECOVERY_MARGIN_BYTES = 2 * GIB
const SLEEP_VERIFY_DELAY_MS = 30_000
// A timer that fires this close to on time means the host never slept.
const SLEEP_VERIFY_SLACK_MS = 15_000

export type HostSystemAlert = { id: string; title: string; body: string }

export type HostSystemWatchdogDeps = {
  platform: NodeJS.Platform
  readThermalState(): HostThermalState | null
  subscribeThermalState(listener: (state: HostThermalState | null) => void): () => void
  sampleDisks(): Promise<HostDiskVolume[]>
  notify(alert: HostSystemAlert): void
  requestSleep(): Promise<ThermalSleepOutcome>
  now?: () => number
}

const LEVEL_RANK: Record<HostDiskLevel, number> = { ok: 0, warning: 1, critical: 2 }

export function settleDiskLevel(previous: HostDiskLevel, volume: HostDiskVolume): HostDiskLevel {
  if (LEVEL_RANK[volume.level] >= LEVEL_RANK[previous]) {
    return volume.level
  }
  const floor = previous === 'critical' ? DISK_CRITICAL_BYTES : DISK_WARNING_BYTES
  const fillingFast = volume.fullInSeconds !== null && volume.fullInSeconds < DISK_FULL_SOON_SECONDS
  return volume.availableBytes >= floor + DISK_RECOVERY_MARGIN_BYTES && !fillingFast
    ? volume.level
    : previous
}

function formatGiB(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GB`
}

function diskAlert(volume: HostDiskVolume, level: HostDiskLevel): HostSystemAlert {
  const free = `${formatGiB(volume.availableBytes)} free on ${volume.label}`
  const soon =
    volume.fullInSeconds !== null && volume.fullInSeconds < DISK_FULL_SOON_SECONDS
      ? `, full in ~${Math.max(1, Math.round(volume.fullInSeconds / 60))} min at the current rate`
      : ''
  return {
    id: `host-system:disk:${volume.label}`,
    title: level === 'critical' ? 'Disk almost full' : 'Disk space running low',
    body: `${free}${soon}. The host may stop responding when the disk fills up.`
  }
}

export class HostSystemWatchdog {
  private thermalEpisode: 'none' | 'serious' | 'critical' = 'none'
  private readonly diskLevels = new Map<string, HostDiskLevel>()
  private diskTimer: ReturnType<typeof setTimeout> | null = null
  private sleepVerifyTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeThermal: (() => void) | null = null
  private stopped = false
  private readonly now: () => number

  constructor(private readonly deps: HostSystemWatchdogDeps) {
    this.now = deps.now ?? Date.now
  }

  start(): void {
    this.unsubscribeThermal = this.deps.subscribeThermalState((state) => this.onThermal(state))
    this.onThermal(this.deps.readThermalState())
    void this.pollDisks()
  }

  stop(): void {
    this.stopped = true
    this.unsubscribeThermal?.()
    this.unsubscribeThermal = null
    for (const timer of [this.diskTimer, this.sleepVerifyTimer]) {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  onThermal(state: HostThermalState | null): void {
    if (this.stopped || state === null) {
      return
    }
    if (state === 'nominal' || state === 'fair') {
      this.thermalEpisode = 'none'
      return
    }
    if (state === 'serious' && this.thermalEpisode === 'none') {
      this.thermalEpisode = 'serious'
      this.deps.notify({
        id: 'host-system:thermal',
        title: 'Host is overheating',
        body: 'The system is throttling to cool down. Give it airflow or pause heavy work.'
      })
      return
    }
    // One sleep per episode: waking still critical must not loop the host back to sleep.
    if (state === 'critical' && this.thermalEpisode !== 'critical') {
      this.thermalEpisode = 'critical'
      void this.handleCritical()
    }
  }

  private async handleCritical(): Promise<void> {
    if (this.deps.platform !== 'darwin') {
      this.deps.notify({
        id: 'host-system:thermal',
        title: 'Host temperature is critical',
        body: 'Automatic sleep is only available on macOS. Stop heavy work now.'
      })
      return
    }
    this.deps.notify({
      id: 'host-system:thermal',
      title: 'Host temperature is critical',
      body: 'Putting the Mac to sleep to protect it.'
    })
    const outcome = await this.deps
      .requestSleep()
      .catch(() => ({ requested: false, reason: 'sleep-command-failed' }) as const)
    if (!outcome.requested) {
      this.notifySleepFailed(
        outcome.reason === 'sleep-disabled'
          ? 'Sleep is disabled by another app. Allow power control in Orca Settings → Mobile.'
          : 'The sleep command failed.'
      )
      return
    }
    const requestedAt = this.now()
    this.sleepVerifyTimer = setTimeout(() => {
      this.sleepVerifyTimer = null
      if (
        !this.stopped &&
        this.now() - requestedAt < SLEEP_VERIFY_DELAY_MS + SLEEP_VERIFY_SLACK_MS
      ) {
        this.notifySleepFailed('The Mac is still awake. Another app may be preventing sleep.')
      }
    }, SLEEP_VERIFY_DELAY_MS)
  }

  private notifySleepFailed(reason: string): void {
    this.deps.notify({
      id: 'host-system:thermal',
      title: 'Could not put the Mac to sleep',
      body: reason
    })
  }

  async pollDisks(): Promise<void> {
    let alerting = false
    try {
      const volumes = await this.deps.sampleDisks()
      for (const volume of volumes) {
        const previous = this.diskLevels.get(volume.label) ?? 'ok'
        const next = settleDiskLevel(previous, volume)
        this.diskLevels.set(volume.label, next)
        if (LEVEL_RANK[next] > LEVEL_RANK[previous]) {
          this.deps.notify(diskAlert(volume, next))
        }
        alerting ||= next !== 'ok'
      }
    } catch {
      // A failed sample keeps the previous levels; the next poll retries.
    }
    if (!this.stopped) {
      this.diskTimer = setTimeout(
        () => void this.pollDisks(),
        alerting ? DISK_ALERT_POLL_MS : DISK_POLL_MS
      )
    }
  }
}
