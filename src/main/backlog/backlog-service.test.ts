import { afterEach, describe, expect, it, vi } from 'vitest'
import { BacklogJsonStream, parseTaskList } from './backlog-json'
import { createBacklogService, type BacklogChild, type BacklogTarget } from './backlog-service'

class FakeChild implements BacklogChild {
  private stdout = new Set<(chunk: Buffer | string) => void>()
  private stderr = new Set<(chunk: Buffer | string) => void>()
  private exits = new Set<(code: number | null) => void>()
  private errors = new Set<(error: Error) => void>()
  stop = vi.fn(async () => {})
  onStdout(listener: (chunk: Buffer | string) => void): () => void {
    this.stdout.add(listener)
    return () => {
      this.stdout.delete(listener)
    }
  }
  onStderr(listener: (chunk: Buffer | string) => void): () => void {
    this.stderr.add(listener)
    return () => {
      this.stderr.delete(listener)
    }
  }
  onExit(listener: (code: number | null) => void): () => void {
    this.exits.add(listener)
    return () => {
      this.exits.delete(listener)
    }
  }
  onError(listener: (error: Error) => void): () => void {
    this.errors.add(listener)
    return () => {
      this.errors.delete(listener)
    }
  }
  write(value: Buffer | string): void {
    for (const listener of this.stdout) {
      listener(value)
    }
  }
  warn(value: string): void {
    for (const listener of this.stderr) {
      listener(value)
    }
  }
  exit(code: number | null): void {
    for (const listener of this.exits) {
      listener(code)
    }
  }
  error(value: Error): void {
    for (const listener of this.errors) {
      listener(value)
    }
  }
}

function setup() {
  const children: FakeChild[] = []
  const target: BacklogTarget = {
    key: 'local:/project',
    spawn: vi.fn(async () => {
      const child = new FakeChild()
      children.push(child)
      return child
    })
  }
  return { children, target }
}

const list = JSON.stringify({
  schemaVersion: 1,
  kind: 'task-list',
  tasks: [{ id: '1', title: 'Unicode ✓', status: 'todo', priority: null }]
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Backlog JSON stream', () => {
  it('decodes fragmented UTF-8 and successive pretty-printed documents', () => {
    const parser = new BacklogJsonStream()
    const bytes = Buffer.from(`${JSON.stringify(JSON.parse(list), null, 2)}\n${list}`)
    const split = bytes.indexOf(Buffer.from('✓')) + 1
    expect(parser.push(bytes.subarray(0, split))).toEqual([])
    const docs = parser.push(bytes.subarray(split))
    expect(docs).toHaveLength(2)
    expect(parseTaskList(docs[0])[0].title).toBe('Unicode ✓')
    parser.finish()
  })

  it('rejects unknown schema and oversized partial output', () => {
    expect(() => parseTaskList({ schemaVersion: 2, kind: 'task-list', tasks: [] })).toThrow(
      'unsupported'
    )
    expect(() => new BacklogJsonStream().push(`{"value":"${'x'.repeat(2 * 1024 * 1024)}"`)).toThrow(
      'exceeded'
    )
  })

  it('keeps valid ordinals and omits absent or invalid optional ordinals', () => {
    const tasks = [0, 3, null, '4', -1, 1.5, undefined].map((ordinal, index) => ({
      id: `${index}`,
      title: 'Task',
      status: 'todo',
      priority: null,
      ordinal
    }))
    expect(
      parseTaskList({ schemaVersion: 1, kind: 'task-list', tasks }).map((task) => task.ordinal)
    ).toEqual([0, 3, undefined, undefined, undefined, undefined, undefined])
  })
})

describe('Backlog service', () => {
  it('publishes tasks before configured priority order and caches it for later watch updates', async () => {
    const { children, target } = setup()
    const service = createBacklogService()
    const listener = vi.fn()
    const release = service.subscribe(target, listener)
    await Promise.resolve()
    children[0].write(list)
    expect(listener.mock.lastCall?.[0]).toMatchObject({ state: 'ready', tasks: [{ id: '1' }] })
    expect(listener.mock.lastCall?.[0].priorities).toBeUndefined()
    await Promise.resolve()
    expect(vi.mocked(target.spawn).mock.calls[1][0]).toEqual(['config', 'get', 'priorities'])
    const config = Buffer.from('Urgent, Vysoká, Medium, Low\n')
    const split = config.indexOf(Buffer.from('á')) + 1
    children[1].write(config.subarray(0, split))
    children[1].write(config.subarray(split))
    children[1].exit(0)
    await vi.waitFor(() => {
      expect(listener.mock.lastCall?.[0].priorities).toEqual(['Urgent', 'Vysoká', 'Medium', 'Low'])
    })
    children[0].write(list)
    expect(listener.mock.lastCall?.[0].priorities).toEqual(['Urgent', 'Vysoká', 'Medium', 'Low'])
    expect(vi.mocked(target.spawn).mock.calls).toHaveLength(2)
    release()
    await service.dispose()
  })

  it('omits priorities on config failure and rereads for a new watch lifecycle', async () => {
    const { children, target } = setup()
    const service = createBacklogService()
    const first = vi.fn()
    const releaseFirst = service.subscribe(target, first)
    await Promise.resolve()
    children[0].write(list)
    await Promise.resolve()
    children[1].exit(1)
    expect(first.mock.lastCall?.[0]).toMatchObject({ state: 'ready' })
    expect(first.mock.lastCall?.[0].priorities).toBeUndefined()
    releaseFirst()
    const second = vi.fn()
    const releaseSecond = service.subscribe(target, second)
    await Promise.resolve()
    children[2].write(list)
    await Promise.resolve()
    expect(vi.mocked(target.spawn).mock.calls[3][0]).toEqual(['config', 'get', 'priorities'])
    children[3].write('Critical, Normal\n')
    children[3].exit(0)
    await vi.waitFor(() => {
      expect(second.mock.lastCall?.[0].priorities).toEqual(['Critical', 'Normal'])
    })
    releaseSecond()
    await service.dispose()
  })

  it('stops a pending priority read and ignores its late output after disposal', async () => {
    const { children, target } = setup()
    const service = createBacklogService()
    const listener = vi.fn()
    service.subscribe(target, listener)
    await Promise.resolve()
    children[0].write(list)
    await Promise.resolve()
    const calls = listener.mock.calls.length
    await service.dispose()
    expect(children[1].stop).toHaveBeenCalledOnce()
    children[1].write('High, Low\n')
    children[1].exit(0)
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('shares a watch and falls back to polling only for unsupported --watch', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService({ pollIntervalMs: 5_000 })
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe1 = service.subscribe(target, first)
    const unsubscribe2 = service.subscribe(target, second)
    await Promise.resolve()
    expect(children).toHaveLength(1)
    children[0].warn('unknown option --watch')
    children[0].exit(2)
    await Promise.resolve()
    expect(children).toHaveLength(2)
    for (let index = 0; index < 10; index++) {
      await Promise.resolve()
    }
    children[1].write(list)
    children[1].exit(0)
    for (let index = 0; index < 10; index++) {
      await Promise.resolve()
    }
    expect(first.mock.lastCall?.[0].state).toBe('ready')
    expect(second.mock.lastCall?.[0].tasks[0].id).toBe('1')
    unsubscribe1()
    unsubscribe2()
    await service.dispose()
  })

  it('keeps the last good snapshot on a watch error', async () => {
    const { children, target } = setup()
    const service = createBacklogService()
    const listener = vi.fn()
    const unsubscribe = service.subscribe(target, listener)
    await Promise.resolve()
    expect(children).toHaveLength(1)
    children[0].write(list)
    children[0].error(new Error('connection lost'))
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      state: 'error',
      stale: true,
      tasks: [{ id: '1' }]
    })
    unsubscribe()
    await service.dispose()
  })

  it('deduplicates board start, renews leases, and stops after the last lease idles', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService({ boardIdleMs: 60_000, leaseTtlMs: 90_000 })
    const a = service.acquireBoard(target, 'a')
    const b = service.acquireBoard(target, 'b')
    await Promise.resolve()
    expect(children).toHaveLength(1)
    const spawn = vi.mocked(target.spawn)
    const port = Number(spawn.mock.calls[0][0][3])
    children[0].write(`Ready at http://127.0.0.1:${port}\n`)
    expect(await a).toEqual(await b)
    await service.acquireBoard(target, 'a')
    await service.releaseBoard(target, 'a')
    await service.releaseBoard(target, 'b')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(children[0].stop).toHaveBeenCalledOnce()
    await service.dispose()
  })

  it('does not start another board after an unverifiable stop', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService({ boardIdleMs: 1 })
    const first = service.acquireBoard(target, 'a')
    await Promise.resolve()
    expect(children).toHaveLength(1)
    const port = Number(vi.mocked(target.spawn).mock.calls[0][0][3])
    children[0].write(`Listening at http://localhost:${port}\n`)
    await first
    children[0].stop.mockRejectedValue(new Error('SSH unreachable'))
    await service.releaseBoard(target, 'a')
    await vi.advanceTimersByTimeAsync(1)
    await expect(service.acquireBoard(target, 'b')).rejects.toThrow('unverifiable')
    expect(children).toHaveLength(1)
    await expect(service.dispose()).rejects.toThrow('could not be verified')
  })

  it('waits for an in-flight stop before starting a replacement board', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService({ boardIdleMs: 1 })
    const first = service.acquireBoard(target, 'a')
    await Promise.resolve()
    children[0].write(`Ready at http://127.0.0.1:${vi.mocked(target.spawn).mock.calls[0][0][3]}\n`)
    await first
    let finishStop!: () => void
    children[0].stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve
        })
    )
    await service.releaseBoard(target, 'a')
    await vi.advanceTimersByTimeAsync(1)
    const replacement = service.acquireBoard(target, 'b')
    expect(children).toHaveLength(1)
    finishStop()
    await vi.advanceTimersByTimeAsync(0)
    expect(children).toHaveLength(2)
    children[1].write(`Ready at http://127.0.0.1:${vi.mocked(target.spawn).mock.calls[1][0][3]}\n`)
    expect((await replacement).instanceId).not.toBe((await first).instanceId)
    await service.dispose()
  })

  it('retries a busy port reported by the real CLI diagnostic', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService()
    const board = service.acquireBoard(target, 'a')
    await Promise.resolve()
    children[0].warn(
      `Error: Port ${vi.mocked(target.spawn).mock.calls[0][0][3]} is already in use. Use --port to specify a different port.`
    )
    children[0].exit(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(children).toHaveLength(2)
    children[1].write(`Ready at http://127.0.0.1:${vi.mocked(target.spawn).mock.calls[1][0][3]}\n`)
    await board
    await service.dispose()
  })

  it('reports a silent watch timeout instead of loading forever', async () => {
    vi.useFakeTimers()
    const { children, target } = setup()
    const service = createBacklogService({ startupTimeoutMs: 20 })
    const listener = vi.fn()
    const release = service.subscribe(target, listener)
    await vi.advanceTimersByTimeAsync(20)
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      state: 'error',
      error: expect.stringContaining('in time')
    })
    expect(children[0].stop).toHaveBeenCalledOnce()
    release()
    await service.dispose()
  })

  it('joins pending process creation before shutdown completes', async () => {
    let finishSpawn!: (child: BacklogChild) => void
    const child = new FakeChild()
    const target: BacklogTarget = {
      key: 'pending',
      spawn: () =>
        new Promise((resolve) => {
          finishSpawn = resolve
        })
    }
    const service = createBacklogService()
    const opening = service.acquireBoard(target, 'a').catch((error: unknown) => error)
    let disposed = false
    const shutdown = service.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    finishSpawn(child)
    await shutdown
    expect(child.stop).toHaveBeenCalledOnce()
    expect(await opening).toBeInstanceOf(Error)
  })
})
