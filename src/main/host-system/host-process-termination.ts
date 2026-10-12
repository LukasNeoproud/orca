import { getAppEnvironment } from '../../shared/app-environment'
import {
  HOST_SYSTEM_ERROR_CODES,
  type HostProcessTerminationResult,
  type HostSystemErrorCode
} from '../../shared/host-system-types'
import { parsePsOutput } from './host-process-list'
import { runProcess } from '@orca/process-host'

const EXIT_POLL_INTERVAL_MS = 100
const EXIT_WAIT_MS = 3_000

export class HostProcessTerminationError extends Error {
  constructor(
    readonly code: HostSystemErrorCode,
    message: string
  ) {
    super(message)
  }
}

function protectedPids(): Set<number> {
  const pids = new Set<number>([0, 1, process.pid, process.ppid])
  try {
    for (const metric of getAppEnvironment().getAppMetrics()) {
      pids.add(metric.pid)
    }
  } catch {
    // A host without app metrics still protects its own process.
  }
  return pids
}

async function readProcessName(pid: number): Promise<string | null> {
  const result = await runProcess({
    program: 'ps',
    args: ['-p', String(pid), '-o', 'pid=,pcpu=,rss=,comm='],
    timeoutMs: 2_000
  })
  return result.code === 0 ? (parsePsOutput(result.stdout)[0]?.name ?? null) : null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Signals a host process the user picked from the paired-client list.
 * `expectedName` guards against PID reuse between the list read and the tap.
 */
export async function terminateHostProcess(input: {
  platform: NodeJS.Platform
  pid: number
  expectedName: string
  force: boolean
}): Promise<HostProcessTerminationResult> {
  const { pid } = input
  if (input.platform !== 'darwin' && input.platform !== 'linux') {
    throw new HostProcessTerminationError(
      HOST_SYSTEM_ERROR_CODES.unsupported,
      'Not supported on this host'
    )
  }
  if (!Number.isInteger(pid) || pid <= 1 || protectedPids().has(pid)) {
    throw new HostProcessTerminationError(
      HOST_SYSTEM_ERROR_CODES.processProtected,
      'This process cannot be stopped'
    )
  }
  const currentName = await readProcessName(pid)
  if (currentName === null) {
    return { pid, verdict: 'exited' }
  }
  if (currentName !== input.expectedName) {
    throw new HostProcessTerminationError(
      HOST_SYSTEM_ERROR_CODES.processChanged,
      'The process changed since the list was loaded'
    )
  }
  try {
    process.kill(pid, input.force ? 'SIGKILL' : 'SIGTERM')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') {
      return { pid, verdict: 'exited' }
    }
    if (code === 'EPERM') {
      throw new HostProcessTerminationError(
        HOST_SYSTEM_ERROR_CODES.processPermissionDenied,
        'Permission denied'
      )
    }
    throw error
  }
  const deadline = Date.now() + EXIT_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, EXIT_POLL_INTERVAL_MS))
    if (!isAlive(pid)) {
      return { pid, verdict: 'exited' }
    }
  }
  return { pid, verdict: 'live' }
}
