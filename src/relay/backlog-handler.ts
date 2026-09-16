import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { createBacklogService, type BacklogTarget } from '../main/backlog/backlog-service'
import { spawnBacklogProcess } from '../main/backlog-runtime/backlog-process'
import { BACKLOG_RUNTIME_CAPABILITY, type BacklogSnapshot } from '../shared/backlog-types'
import type { RelayDispatcher, RequestContext } from './dispatcher'

type SnapshotLease = {
  snapshot: BacklogSnapshot
  release: () => void
  timer?: ReturnType<typeof setTimeout>
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || value.length > 8_192) {
    throw new Error(`Invalid Backlog.md ${key}.`)
  }
  return value
}

export class BacklogHandler {
  private readonly service = createBacklogService()
  private readonly snapshots = new Map<string, SnapshotLease>()

  constructor(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
    dispatcher.onRequest('backlog.capabilities', async () => ({
      capabilities: [BACKLOG_RUNTIME_CAPABILITY]
    }))
    dispatcher.onRequest('backlog.snapshot', async (params, context) => {
      const target = await this.target(params)
      const key = this.leaseKey(target, params, context)
      let lease = this.snapshots.get(key)
      if (!lease) {
        lease = { snapshot: { state: 'loading', tasks: [] }, release: () => {} }
        const current = lease
        this.snapshots.set(key, current)
        current.release = this.service.subscribe(target, (snapshot) => {
          current.snapshot = snapshot
        })
      }
      clearTimeout(lease.timer)
      lease.timer = setTimeout(() => this.releaseSnapshot(key), 30_000)
      lease.timer.unref?.()
      return lease.snapshot
    })
    dispatcher.onRequest('backlog.releaseSnapshot', async (params, context) => {
      const target = await this.target(params)
      this.releaseSnapshot(this.leaseKey(target, params, context))
      return { released: true }
    })
    dispatcher.onRequest('backlog.task', async (params) =>
      this.service.getTaskDetail(await this.target(params), requiredString(params, 'taskId'))
    )
    dispatcher.onRequest('backlog.acquireBoard', async (params, context) => {
      const target = await this.target(params)
      return this.service.acquireBoard(target, this.leaseKey(target, params, context))
    })
    dispatcher.onRequest('backlog.releaseBoard', async (params, context) => {
      const target = await this.target(params)
      await this.service.releaseBoard(target, this.leaseKey(target, params, context))
      return { released: true }
    })
    dispatcher.onRequest('backlog.releaseWorkspace', async (params) => {
      const target = await this.target(params)
      for (const [key, lease] of this.snapshots) {
        if (JSON.parse(key)[1] === target.key) {
          clearTimeout(lease.timer)
          this.snapshots.delete(key)
          lease.release()
        }
      }
      await this.service.releaseTarget(target)
      return { released: true }
    })
  }

  private async target(params: Record<string, unknown>): Promise<BacklogTarget> {
    const path = requiredString(params, 'cwd')
    if (!isAbsolute(path)) {
      throw new Error('Backlog.md requires an absolute workspace path.')
    }
    const cwd = await realpath(path)
    return { key: cwd, spawn: (args) => spawnBacklogProcess({ kind: 'native', cwd }, args) }
  }

  private leaseKey(
    target: BacklogTarget,
    params: Record<string, unknown>,
    context: RequestContext
  ): string {
    return JSON.stringify([
      context.sessionIdentity?.principal ?? 'ssh',
      target.key,
      requiredString(params, 'leaseId')
    ])
  }

  private releaseSnapshot(key: string): void {
    const lease = this.snapshots.get(key)
    if (!lease) {
      return
    }
    this.snapshots.delete(key)
    clearTimeout(lease.timer)
    lease.release()
  }

  async dispose(): Promise<void> {
    for (const key of this.snapshots.keys()) {
      this.releaseSnapshot(key)
    }
    await this.service.dispose()
  }
}
