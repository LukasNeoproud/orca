import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { BacklogBoard, BacklogSnapshot, BacklogTask } from '../../shared/backlog-types'
import { createBacklogService } from '../backlog/backlog-service'
import { resolveBacklogTarget, type ResolvedBacklogTarget } from './backlog-target'
import {
  beginBacklogWorkspaceRetirement,
  trackBacklogOperation
} from './backlog-workspace-operations'

const SNAPSHOT_LEASE_MS = 30_000
const service = createBacklogService()

type SnapshotLease = {
  snapshot: BacklogSnapshot
  release: () => void
  expires?: ReturnType<typeof setTimeout>
}

const snapshotLeases = new Map<string, SnapshotLease>()
const snapshotLeaseTargets = new Map<string, ResolvedBacklogTarget>()
const activeTargets = new Map<string, ResolvedBacklogTarget>()
const boardTargets = new Map<
  string,
  { target: ResolvedBacklogTarget; timer: ReturnType<typeof setTimeout> }
>()

function leaseKey(workspaceId: string, executionHostId: string, leaseId: string): string {
  return `${workspaceId}\0${executionHostId}\0${leaseId}`
}

function requestLeaseKey(
  workspaceId: string,
  executionHostId: string | undefined,
  leaseId: string
): string {
  return leaseKey(workspaceId, executionHostId ?? 'local', leaseId)
}

function rememberTarget(target: ResolvedBacklogTarget): ResolvedBacklogTarget {
  activeTargets.set(
    JSON.stringify([target.workspaceId, target.executionHostId, target.target.key]),
    target
  )
  return target
}

function rememberBoardTarget(key: string, target: ResolvedBacklogTarget): void {
  const old = boardTargets.get(key)
  if (old) {
    clearTimeout(old.timer)
  }
  const timer = setTimeout(() => boardTargets.delete(key), 90_000)
  timer.unref?.()
  boardTargets.set(key, { target, timer })
}

function renewLease(key: string, lease: SnapshotLease): void {
  clearTimeout(lease.expires)
  lease.expires = setTimeout(() => releaseSnapshotLease(key), SNAPSHOT_LEASE_MS)
  lease.expires.unref?.()
}

function releaseSnapshotLease(key: string): void {
  const lease = snapshotLeases.get(key)
  if (!lease) {
    return
  }
  snapshotLeases.delete(key)
  clearTimeout(lease.expires)
  lease.release()
  snapshotLeaseTargets.delete(key)
}

export async function getBacklogSnapshot(
  runtime: OrcaRuntimeService,
  workspaceId: string,
  leaseId: string,
  executionHostId?: string
): Promise<BacklogSnapshot> {
  return trackBacklogOperation(workspaceId, async () => {
    const key = requestLeaseKey(workspaceId, executionHostId, leaseId)
    const existing = snapshotLeases.get(key)
    if (existing) {
      renewLease(key, existing)
      return existing.snapshot
    }
    const resolved = rememberTarget(
      await resolveBacklogTarget(runtime, workspaceId, executionHostId)
    )
    let lease = snapshotLeases.get(key)
    if (!lease) {
      lease = {
        snapshot: { state: 'loading', tasks: [] },
        release: () => {},
        expires: undefined
      }
      const current = lease
      snapshotLeases.set(key, current)
      snapshotLeaseTargets.set(key, resolved)
      current.release = service.subscribe(resolved.target, (snapshot) => {
        current.snapshot = snapshot
      })
    }
    renewLease(key, lease)
    return lease.snapshot
  })
}

export async function releaseBacklogSnapshot(
  _runtime: OrcaRuntimeService,
  workspaceId: string,
  leaseId: string,
  executionHostId?: string
): Promise<void> {
  return trackBacklogOperation(workspaceId, async () => {
    releaseSnapshotLease(requestLeaseKey(workspaceId, executionHostId, leaseId))
  })
}

export async function getBacklogTask(
  runtime: OrcaRuntimeService,
  workspaceId: string,
  taskId: string,
  executionHostId?: string
): Promise<BacklogTask> {
  return trackBacklogOperation(workspaceId, async () => {
    const resolved = rememberTarget(
      await resolveBacklogTarget(runtime, workspaceId, executionHostId)
    )
    return service.getTaskDetail(resolved.target, taskId)
  })
}

export async function acquireBacklogBoard(
  runtime: OrcaRuntimeService,
  workspaceId: string,
  leaseId: string,
  executionHostId?: string
): Promise<BacklogBoard> {
  return trackBacklogOperation(workspaceId, async () => {
    const key = requestLeaseKey(workspaceId, executionHostId, leaseId)
    const resolved =
      boardTargets.get(key)?.target ??
      rememberTarget(await resolveBacklogTarget(runtime, workspaceId, executionHostId))
    const board = await service.acquireBoard(resolved.target, leaseId)
    rememberBoardTarget(key, resolved)
    return board
  })
}

export async function releaseBacklogBoard(
  _runtime: OrcaRuntimeService,
  workspaceId: string,
  leaseId: string,
  executionHostId?: string
): Promise<void> {
  return trackBacklogOperation(workspaceId, async () => {
    const key = requestLeaseKey(workspaceId, executionHostId, leaseId)
    const record = boardTargets.get(key)
    if (!record) {
      return
    }
    clearTimeout(record.timer)
    boardTargets.delete(key)
    await service.releaseBoard(record.target.target, leaseId)
  })
}

export async function releaseBacklogWorkspace(
  workspaceId: string,
  executionHostId?: string
): Promise<void> {
  const finishRetirement = await beginBacklogWorkspaceRetirement(workspaceId)
  try {
    const matches = (target: ResolvedBacklogTarget): boolean =>
      target.workspaceId === workspaceId &&
      (!executionHostId || target.executionHostId === executionHostId)
    const releases: Promise<void>[] = []
    for (const target of activeTargets.values()) {
      if (!matches(target)) {
        continue
      }
      releases.push(service.releaseTarget(target.target))
    }
    const settled = await Promise.allSettled(releases)
    const failure = settled.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
    for (const [key, target] of snapshotLeaseTargets) {
      if (matches(target)) {
        releaseSnapshotLease(key)
      }
    }
    for (const [key, record] of boardTargets) {
      if (matches(record.target)) {
        clearTimeout(record.timer)
        boardTargets.delete(key)
      }
    }
    for (const [key, target] of activeTargets) {
      if (matches(target)) {
        activeTargets.delete(key)
      }
    }
  } finally {
    finishRetirement()
  }
}

export async function disposeBacklogRuntimeService(): Promise<void> {
  for (const key of snapshotLeases.keys()) {
    releaseSnapshotLease(key)
  }
  for (const record of boardTargets.values()) {
    clearTimeout(record.timer)
  }
  boardTargets.clear()
  activeTargets.clear()
  await service.dispose()
}

export function disposeBacklogRuntimeServiceForShutdown(): Promise<void> {
  return disposeBacklogRuntimeService().catch((error: unknown) => {
    console.warn('[backlog] shutdown could not be verified:', error)
  })
}
