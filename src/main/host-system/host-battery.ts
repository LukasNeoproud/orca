import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import type { HostBattery } from '../../shared/host-system-types'

const PROBE_TIMEOUT_MS = 2_000
const LINUX_POWER_SUPPLY_DIR = '/sys/class/power_supply'

export async function readHostBattery(platform: NodeJS.Platform): Promise<HostBattery | null> {
  try {
    if (platform === 'darwin') {
      const result = await runProcess({
        program: '/usr/bin/pmset',
        args: ['-g', 'batt'],
        timeoutMs: PROBE_TIMEOUT_MS
      })
      return result.code === 0 ? parseDarwinBattery(result.stdout) : null
    }
    if (platform === 'linux') {
      return await readLinuxBattery()
    }
  } catch {
    // A failed probe is "unknown", never a fabricated reading.
  }
  return null
}

export function parseDarwinBattery(stdout: string): HostBattery | null {
  const match = /InternalBattery[^\t]*\t\s*(\d{1,3})%;\s*([^;]+);/.exec(stdout)
  if (!match) {
    return null
  }
  const percent = Number.parseInt(match[1], 10)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null
  }
  const state = match[2].trim().toLowerCase()
  return { percent, charging: state === 'charging' || state === 'finishing charge' }
}

async function readLinuxBattery(): Promise<HostBattery | null> {
  const entries = await readdir(LINUX_POWER_SUPPLY_DIR)
  for (const entry of entries.filter((name) => name.startsWith('BAT')).sort()) {
    const dir = path.join(LINUX_POWER_SUPPLY_DIR, entry)
    const [capacity, status] = await Promise.all([
      readFile(path.join(dir, 'capacity'), 'utf8'),
      readFile(path.join(dir, 'status'), 'utf8').catch(() => '')
    ])
    const percent = Number.parseInt(capacity.trim(), 10)
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      return { percent, charging: status.trim().toLowerCase() === 'charging' }
    }
  }
  return null
}
