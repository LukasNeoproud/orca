import type {
  SnapshotDiffRequest,
  SnapshotDiffResult,
  SnapshotDiffWorkerRequest,
  SnapshotDiffWorkerResponse
} from './snapshot-diff-worker-protocol'

type PendingComparison = {
  id: number
  resolve: (result: SnapshotDiffResult) => void
  reject: (error: Error) => void
}

export class SnapshotDiffCanceledError extends Error {
  constructor() {
    super('Snapshot comparison was canceled')
    this.name = 'SnapshotDiffCanceledError'
  }
}

/**
 * Runs one pixel comparison at a time off the UI thread. A new request replaces
 * the running one, so flipping through snapshots never queues stale work.
 */
export class SnapshotDiffWorkerClient {
  private worker: Worker | null = null
  private pending: PendingComparison | null = null
  private nextId = 0

  compare(request: SnapshotDiffRequest): Promise<SnapshotDiffResult> {
    this.cancel()
    const worker = this.startWorker()
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject }
      const message: SnapshotDiffWorkerRequest = { id, request }
      try {
        worker.postMessage(message)
      } catch (error) {
        this.pending = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /** Stops the running comparison, if any; its promise rejects as canceled. */
  cancel(): void {
    const pending = this.pending
    if (!pending) {
      return
    }
    this.pending = null
    // Why terminate: a comparison cannot be interrupted, only abandoned with its worker.
    this.worker?.terminate()
    this.worker = null
    pending.reject(new SnapshotDiffCanceledError())
  }

  dispose(): void {
    this.cancel()
    this.worker?.terminate()
    this.worker = null
  }

  private startWorker(): Worker {
    if (this.worker) {
      return this.worker
    }
    const worker = new Worker(new URL('./snapshot-diff.worker.ts', import.meta.url), {
      type: 'module'
    })
    worker.onmessage = (event: MessageEvent<SnapshotDiffWorkerResponse>) => {
      const response = event.data
      const pending = this.pending
      if (!pending || pending.id !== response.id) {
        return
      }
      this.pending = null
      if (response.ok) {
        pending.resolve(response.result)
      } else {
        pending.reject(new Error(response.error))
      }
    }
    const fail = (): void => {
      const pending = this.pending
      this.pending = null
      this.worker?.terminate()
      this.worker = null
      pending?.reject(new Error('Snapshot comparison worker failed.'))
    }
    worker.onerror = fail
    worker.onmessageerror = fail
    this.worker = worker
    return worker
  }
}
