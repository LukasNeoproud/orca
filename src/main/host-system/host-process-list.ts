import path from 'node:path'
import { runProcess } from '@orca/process-host'
import type { HostProcessEntry } from '../../shared/host-system-types'

const PS_TIMEOUT_MS = 5_000
const NETTOP_TIMEOUT_MS = 5_000
const TOP_BY_CPU = 30
const TOP_BY_MEMORY = 10

type ProcessSample = Omit<HostProcessEntry, 'networkBytesPerSecond'>

export async function listHostProcesses(
  platform: NodeJS.Platform
): Promise<HostProcessEntry[] | null> {
  if (platform !== 'darwin' && platform !== 'linux') {
    return null
  }
  const [psResult, network] = await Promise.all([
    runProcess({
      program: 'ps',
      args: ['-A', '-o', 'pid=,pcpu=,rss=,comm='],
      timeoutMs: PS_TIMEOUT_MS
    }),
    platform === 'darwin' ? sampleDarwinNetworkRates() : Promise.resolve(null)
  ])
  if (psResult.code !== 0) {
    return null
  }
  return selectTopProcesses(parsePsOutput(psResult.stdout)).map((sample) => ({
    ...sample,
    networkBytesPerSecond: network ? (network.get(sample.pid) ?? 0) : null
  }))
}

export function parsePsOutput(stdout: string): ProcessSample[] {
  const samples: ProcessSample[] = []
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
    if (!match) {
      continue
    }
    samples.push({
      pid: Number(match[1]),
      cpuPercent: Number(match[2]),
      memoryBytes: Number(match[3]) * 1024,
      // macOS reports the executable path; the basename is what a user recognises.
      name: path.posix.basename(match[4]) || match[4]
    })
  }
  return samples
}

export function selectTopProcesses(samples: ProcessSample[]): ProcessSample[] {
  const byCpu = [...samples].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, TOP_BY_CPU)
  const chosen = new Set(byCpu.map((sample) => sample.pid))
  const byMemory = [...samples]
    .sort((a, b) => b.memoryBytes - a.memoryBytes)
    .filter((sample) => !chosen.has(sample.pid))
    .slice(0, TOP_BY_MEMORY)
  return [...byCpu, ...byMemory]
}

async function sampleDarwinNetworkRates(): Promise<Map<number, number> | null> {
  try {
    // Two one-second samples in delta mode: the second block is bytes moved during that second.
    const result = await runProcess({
      program: '/usr/bin/nettop',
      args: ['-P', '-x', '-d', '-L', '2', '-s', '1', '-J', 'bytes_in,bytes_out'],
      timeoutMs: NETTOP_TIMEOUT_MS
    })
    return result.code === 0 ? parseNettopDeltaOutput(result.stdout) : null
  } catch {
    return null
  }
}

export function parseNettopDeltaOutput(stdout: string): Map<number, number> | null {
  const blocks = stdout.split(/^,bytes_in,bytes_out,\s*$/m)
  if (blocks.length < 3) {
    return null
  }
  const rates = new Map<number, number>()
  for (const line of blocks.at(-1)!.split('\n')) {
    const match = /^(.*)\.(\d+),(\d+),(\d+),?\s*$/.exec(line)
    if (match) {
      const pid = Number(match[2])
      rates.set(pid, (rates.get(pid) ?? 0) + Number(match[3]) + Number(match[4]))
    }
  }
  return rates
}
