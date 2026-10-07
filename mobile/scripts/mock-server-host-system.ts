import type { RpcRequest, RpcResponse } from './mock-server-rpc-handlers'
import type {
  HostProcessEntry,
  HostSwitchablePowerMode,
  HostSystemSnapshot
} from '../../src/shared/host-system-types'

type Respond = (response: RpcResponse) => void
type Success = (id: string, result: unknown) => RpcResponse
type ErrorResponse = (id: string, code: string, message: string) => RpcResponse

const GIB = 1024 ** 3
let powerMode: HostSwitchablePowerMode = 'automatic'
// Starts mid-fill so the screen shows the disk warning and its projection.
let availableBytes = 11.4 * GIB
let processes: HostProcessEntry[] = [
  { pid: 4812, name: 'node', cpuPercent: 142.3, memoryBytes: 1.9 * GIB, networkBytesPerSecond: 0 },
  {
    pid: 10518,
    name: 'claude',
    cpuPercent: 38.6,
    memoryBytes: 540 * 1024 ** 2,
    networkBytesPerSecond: 182_000
  },
  {
    pid: 39138,
    name: 'Orca Helper (Renderer)',
    cpuPercent: 12.1,
    memoryBytes: 680 * 1024 ** 2,
    networkBytesPerSecond: 0
  },
  {
    pid: 445,
    name: 'WindowServer',
    cpuPercent: 10.8,
    memoryBytes: 190 * 1024 ** 2,
    networkBytesPerSecond: 0
  },
  {
    pid: 32102,
    name: 'codex',
    cpuPercent: 8.8,
    memoryBytes: 262 * 1024 ** 2,
    networkBytesPerSecond: 64_000
  },
  {
    pid: 5700,
    name: 'com.apple.WebKit.Networking',
    cpuPercent: 2.4,
    memoryBytes: 88 * 1024 ** 2,
    networkBytesPerSecond: 1_240_000
  },
  {
    pid: 88120,
    name: 'docker',
    cpuPercent: 1.2,
    memoryBytes: 2.4 * GIB,
    networkBytesPerSecond: 3_000
  }
]

function snapshot(includeProcesses: boolean): HostSystemSnapshot {
  availableBytes = Math.max(6 * GIB, availableBytes - 0.05 * GIB)
  return {
    platform: 'darwin',
    collectedAt: Date.now(),
    battery: { percent: 64, charging: false },
    thermalState: 'serious',
    powerMode: { current: powerMode, switchable: true },
    disks: [
      {
        label: '/',
        totalBytes: 994 * GIB,
        availableBytes,
        level: 'warning',
        fullInSeconds: 22 * 60
      }
    ],
    processes: includeProcesses ? processes : null
  }
}

export function handleMockHostSystemRequest(
  request: RpcRequest,
  respond: Respond,
  success: Success,
  error: ErrorResponse
): boolean {
  const params = (request.params ?? {}) as Record<string, unknown>
  switch (request.method) {
    case 'hostSystem.snapshot':
      respond(success(request.id, snapshot(params.includeProcesses === true)))
      return true
    case 'hostSystem.setPowerMode':
      if (params.mode !== 'automatic' && params.mode !== 'low-power') {
        respond(error(request.id, 'invalid_argument', 'Unknown power mode'))
        return true
      }
      powerMode = params.mode
      respond(success(request.id, { current: powerMode, switchable: true }))
      return true
    case 'hostSystem.terminateProcess':
      processes = processes.filter((entry) => entry.pid !== params.pid)
      respond(success(request.id, { pid: params.pid, verdict: 'exited' }))
      return true
    default:
      return false
  }
}
