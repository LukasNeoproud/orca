import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateSourceState } from '../../shared/quality-gate-types'
import { createQualityGateChangeFeed } from './quality-gate-change-feed'

const git = { worktreeId: 'repo::/work', source: { path: '/work', git: true } }
const folder = { worktreeId: 'notes::/notes', source: { path: '/notes', git: false } }

describe('quality gate change feed', () => {
  let source: QualityGateSourceState
  const readSource = vi.fn(async () => source)

  function feed() {
    return createQualityGateChangeFeed({ readSource, watchIntervalMs: 1_000 })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    readSource.mockClear()
    source = { head: 'aaa', clean: true, fingerprint: 'f0' }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tells the subscribers of the worktree whose run changed, and nobody else', () => {
    const changes = feed()
    const mine = vi.fn()
    const other = vi.fn()
    changes.subscribe(git, mine)
    changes.subscribe(folder, other)

    changes.notify('repo::/work')

    expect(mine).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('signals a commit and an edit of an already changed file, and stays quiet otherwise', async () => {
    const changes = feed()
    const listener = vi.fn()
    changes.subscribe(git, listener)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(listener).not.toHaveBeenCalled()

    source = { head: 'bbb', clean: true, fingerprint: 'f0' }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(listener).toHaveBeenCalledTimes(1)

    // Same status listing, another size and mtime: only the fingerprint moves.
    source = { head: 'bbb', clean: false, fingerprint: 'f1' }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(listener).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not take a tree that could not be read for a change', async () => {
    const changes = feed()
    const listener = vi.fn()
    changes.subscribe(git, listener)
    await vi.advanceTimersByTimeAsync(0)

    readSource.mockRejectedValueOnce(new Error('git is busy'))
    await vi.advanceTimersByTimeAsync(2_000)

    expect(listener).not.toHaveBeenCalled()
  })

  it('reads the tree only while somebody is subscribed', async () => {
    const changes = feed()
    const first = changes.subscribe(git, vi.fn())
    const second = changes.subscribe(git, vi.fn())
    await vi.advanceTimersByTimeAsync(1_000)
    // One watch for both subscribers.
    expect(readSource).toHaveBeenCalledTimes(2)

    first()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(readSource).toHaveBeenCalledTimes(3)

    second()
    expect(changes.watchedCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(readSource).toHaveBeenCalledTimes(3)
  })

  it('never polls a folder without git: only its runs change', async () => {
    const changes = feed()
    const listener = vi.fn()
    changes.subscribe(folder, listener)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(readSource).toHaveBeenCalledTimes(1)
    changes.notify('notes::/notes')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
