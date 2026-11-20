import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapshotDiffCanceledError, SnapshotDiffWorkerClient } from './snapshot-diff-worker-client'
import type {
  SnapshotDiffRequest,
  SnapshotDiffResult,
  SnapshotDiffWorkerRequest,
  SnapshotDiffWorkerResponse
} from './snapshot-diff-worker-protocol'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<SnapshotDiffWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: SnapshotDiffWorkerRequest[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: SnapshotDiffWorkerRequest): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: SnapshotDiffWorkerResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: response }))
  }
}

const REQUEST: SnapshotDiffRequest = {
  mimeType: 'image/png',
  originalContent: 'AAAA',
  modifiedContent: 'BBBB',
  removedRgba: [173, 7, 7, 255],
  addedRgba: [88, 124, 12, 255],
  maxPixels: 1_000
}
const TOO_LARGE: SnapshotDiffResult = { kind: 'too-large', width: 100, height: 100 }

describe('SnapshotDiffWorkerClient', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('resolves with the result of its own request and reuses an idle worker', async () => {
    const client = new SnapshotDiffWorkerClient()
    const first = client.compare(REQUEST)
    const worker = FakeWorker.instances[0]
    worker.reply({ id: worker.posted[0].id, ok: true, result: TOO_LARGE })
    await expect(first).resolves.toEqual(TOO_LARGE)

    const second = client.compare(REQUEST)
    expect(FakeWorker.instances).toHaveLength(1)
    worker.reply({ id: worker.posted[1].id, ok: false, error: 'decode failed' })
    await expect(second).rejects.toThrow('decode failed')
  })

  it('abandons a running comparison when a new one starts', async () => {
    const client = new SnapshotDiffWorkerClient()
    const first = client.compare(REQUEST)
    const second = client.compare(REQUEST)

    await expect(first).rejects.toBeInstanceOf(SnapshotDiffCanceledError)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances[0].terminated).toBe(true)

    const worker = FakeWorker.instances[1]
    worker.reply({ id: worker.posted[0].id, ok: true, result: TOO_LARGE })
    await expect(second).resolves.toEqual(TOO_LARGE)
  })

  it('rejects when the worker dies, and when the client is disposed mid-run', async () => {
    const client = new SnapshotDiffWorkerClient()
    const crashed = client.compare(REQUEST)
    FakeWorker.instances[0].onerror?.()
    await expect(crashed).rejects.toThrow('worker failed')

    const disposed = client.compare(REQUEST)
    client.dispose()
    await expect(disposed).rejects.toBeInstanceOf(SnapshotDiffCanceledError)
    expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true)
  })
})
