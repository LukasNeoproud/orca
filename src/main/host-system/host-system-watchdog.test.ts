import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { HostDiskVolume, HostThermalState } from '../../shared/host-system-types'
import { classifyDiskLevel, HostDiskTrend } from './host-disk-space'
import {
  HostSystemWatchdog,
  settleDiskLevel,
  type HostSystemWatchdogDeps
} from './host-system-watchdog'

const GIB = 1024 ** 3

function volume(availableGiB: number, fullInSeconds: number | null = null): HostDiskVolume {
  const availableBytes = availableGiB * GIB
  return {
    label: '/',
    totalBytes: 500 * GIB,
    availableBytes,
    fullInSeconds,
    level: classifyDiskLevel(availableBytes, fullInSeconds)
  }
}

describe('HostDiskTrend', () => {
  it('projects time to full from a sustained fill rate', () => {
    const trend = new HostDiskTrend()
    trend.record('/', 20 * GIB, 0)
    trend.record('/', 18 * GIB, 120_000)
    // 2 GiB in 120 s leaves 18 GiB for 1080 s.
    expect(trend.fullInSeconds('/')).toBe(1080)
  })

  it('ignores short spans and small churn', () => {
    const trend = new HostDiskTrend()
    trend.record('/', 20 * GIB, 0)
    trend.record('/', 19 * GIB, 30_000)
    expect(trend.fullInSeconds('/')).toBeNull()
    trend.record('/', 19.9 * GIB, 120_000)
    expect(trend.fullInSeconds('/')).toBeNull()
  })

  it('warns on a fast fill even with plenty of space', () => {
    expect(classifyDiskLevel(100 * GIB, 600)).toBe('warning')
    expect(classifyDiskLevel(100 * GIB, null)).toBe('ok')
    expect(classifyDiskLevel(4 * GIB, null)).toBe('critical')
  })
})

describe('settleDiskLevel', () => {
  it('escalates immediately and recovers only past the margin', () => {
    expect(settleDiskLevel('ok', volume(10))).toBe('warning')
    expect(settleDiskLevel('warning', volume(16))).toBe('warning')
    expect(settleDiskLevel('warning', volume(18))).toBe('ok')
    expect(settleDiskLevel('critical', volume(6))).toBe('critical')
  })
})

describe('HostSystemWatchdog', () => {
  let thermalListener: ((state: HostThermalState | null) => void) | null
  let deps: HostSystemWatchdogDeps & {
    notify: Mock<HostSystemWatchdogDeps['notify']>
    requestSleep: Mock<HostSystemWatchdogDeps['requestSleep']>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    thermalListener = null
    deps = {
      platform: 'darwin',
      readThermalState: () => 'nominal',
      subscribeThermalState: (listener) => {
        thermalListener = listener
        return () => {
          thermalListener = null
        }
      },
      sampleDisks: vi.fn(async () => [volume(100)]),
      notify: vi.fn<HostSystemWatchdogDeps['notify']>(),
      requestSleep: vi.fn<HostSystemWatchdogDeps['requestSleep']>(async () => ({
        requested: true
      })),
      now: () => Date.now()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('notifies once per serious episode', () => {
    const watchdog = new HostSystemWatchdog(deps)
    watchdog.start()
    thermalListener!('serious')
    thermalListener!('serious')
    expect(deps.notify).toHaveBeenCalledTimes(1)
    thermalListener!('nominal')
    thermalListener!('serious')
    expect(deps.notify).toHaveBeenCalledTimes(2)
    watchdog.stop()
  })

  it('sleeps once per critical episode and reports a host that stayed awake', async () => {
    const watchdog = new HostSystemWatchdog(deps)
    watchdog.start()
    thermalListener!('critical')
    await vi.advanceTimersByTimeAsync(0)
    thermalListener!('critical')
    expect(deps.requestSleep).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Could not put the Mac to sleep' })
    )
    watchdog.stop()
  })

  it('reports when another app keeps sleep disabled', async () => {
    deps.requestSleep.mockResolvedValue({ requested: false, reason: 'sleep-disabled' })
    const watchdog = new HostSystemWatchdog(deps)
    watchdog.start()
    thermalListener!('critical')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Could not put the Mac to sleep' })
    )
    watchdog.stop()
  })

  it('never sleeps a non-macOS host', async () => {
    deps.platform = 'linux'
    const watchdog = new HostSystemWatchdog(deps)
    watchdog.start()
    thermalListener!('critical')
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.requestSleep).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledTimes(1)
    watchdog.stop()
  })

  it('alerts on disk escalation only', async () => {
    const levels = [volume(10), volume(10), volume(3), volume(30)]
    deps.sampleDisks = vi.fn(async () => [levels.shift() ?? volume(30)])
    const watchdog = new HostSystemWatchdog(deps)
    watchdog.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Disk space running low' })
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect(deps.notify).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(deps.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Disk almost full' })
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect(deps.notify).toHaveBeenCalledTimes(2)
    watchdog.stop()
  })
})
