import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() }
}))
vi.mock('../theme/mobile-theme', () => ({
  colors: { statusGreen: 'green', statusAmber: 'amber', statusRed: 'red' }
}))

import { parseHostSystemSnapshot } from './host-system-snapshot'
import { formatBytes, formatFullIn, sortProcesses } from './host-system-format'

const snapshot = {
  platform: 'darwin',
  collectedAt: 1,
  battery: { percent: 50, charging: false },
  thermalState: 'serious',
  powerMode: { current: 'automatic', switchable: false },
  disks: [{ label: '/', totalBytes: 10, availableBytes: 5, level: 'ok', fullInSeconds: null }],
  processes: null
}

describe('parseHostSystemSnapshot', () => {
  it('accepts a host snapshot', () => {
    expect(parseHostSystemSnapshot(snapshot)).toEqual(snapshot)
  })

  it('degrades unknown enum values from a newer host instead of rejecting', () => {
    const parsed = parseHostSystemSnapshot({
      ...snapshot,
      thermalState: 'melting',
      powerMode: { current: 'turbo', switchable: true }
    })
    expect(parsed?.thermalState).toBeNull()
    expect(parsed?.powerMode).toEqual({ current: null, switchable: true })
  })

  it('rejects a payload missing required fields', () => {
    expect(parseHostSystemSnapshot({ platform: 'darwin' })).toBeNull()
  })
})

describe('host system formatting', () => {
  it('formats sizes and fill projections', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(15 * 1024 ** 3)).toBe('15 GB')
    expect(formatFullIn(30)).toBe('~1 min')
    expect(formatFullIn(3 * 3600)).toBe('~3 h')
  })

  it('sorts processes by the chosen metric', () => {
    const entries = [
      { pid: 2, name: 'a', cpuPercent: 1, memoryBytes: 300, networkBytesPerSecond: null },
      { pid: 3, name: 'b', cpuPercent: 9, memoryBytes: 100, networkBytesPerSecond: 50 }
    ]
    expect(sortProcesses(entries, 'cpu').map((entry) => entry.pid)).toEqual([3, 2])
    expect(sortProcesses(entries, 'memory').map((entry) => entry.pid)).toEqual([2, 3])
    expect(sortProcesses(entries, 'network').map((entry) => entry.pid)).toEqual([3, 2])
  })
})
