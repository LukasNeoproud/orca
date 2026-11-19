import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateSourceState } from '../../shared/quality-gate-types'
import { createQualityGateChangeFeed } from './quality-gate-change-feed'

const git = { worktreeId: 'repo::/work', source: { path: '/work', git: true } }
const folder = { worktreeId: 'notes::/notes', source: { path: '/notes', git: false } }

describe('quality gate change feed', () => {
  let source: QualityGateSourceState
  const readSource = vi.fn(async () => source)

  function feed() {
    return createQualityGateChangeFeed({
      readSource,
      watchIntervalMs: 1_000,
      backgroundWatchIntervalMs: 10_000
    })
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

  describe('background subscribers', () => {
    it('hear of a run at once and of the tree only at the slow interval', async () => {
      const changes = feed()
      const listener = vi.fn()
      changes.subscribe(git, listener, { background: true })
      await vi.advanceTimersByTimeAsync(0)
      expect(readSource).toHaveBeenCalledTimes(1)

      changes.notify('repo::/work')
      expect(listener).toHaveBeenCalledTimes(1)

      source = { head: 'bbb', clean: true, fingerprint: 'f0' }
      await vi.advanceTimersByTimeAsync(9_000)
      expect(readSource).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(readSource).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('cost one slow read per worktree however many cards subscribe', async () => {
      const changes = feed()
      for (let card = 0; card < 5; card += 1) {
        changes.subscribe(git, vi.fn(), { background: true })
      }
      await vi.advanceTimersByTimeAsync(20_000)

      expect(changes.watchedCount()).toBe(1)
      expect(readSource).toHaveBeenCalledTimes(3)
    })

    it('are read at the fast interval while a foreground subscriber shares the worktree', async () => {
      const changes = feed()
      const card = vi.fn()
      changes.subscribe(git, card, { background: true })
      await vi.advanceTimersByTimeAsync(2_000)
      expect(readSource).toHaveBeenCalledTimes(1)

      const closePanel = changes.subscribe(git, vi.fn())
      await vi.advanceTimersByTimeAsync(1_000)
      expect(readSource).toHaveBeenCalledTimes(2)
      source = { head: 'bbb', clean: true, fingerprint: 'f0' }
      await vi.advanceTimersByTimeAsync(1_000)
      expect(card).toHaveBeenCalledTimes(1)

      // Back to the slow interval once the panel is gone; no second timer chain is left behind.
      closePanel()
      const reads = readSource.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(readSource.mock.calls.length - reads).toBeLessThanOrEqual(2)
      const settled = readSource.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(readSource.mock.calls.length - settled).toBe(1)
    })

    it('do not start a second chain when a foreground subscriber joins during a read', async () => {
      let release: (state: QualityGateSourceState) => void = () => {}
      readSource.mockImplementationOnce(
        () => new Promise<QualityGateSourceState>((resolve) => (release = resolve))
      )
      const changes = feed()
      changes.subscribe(git, vi.fn(), { background: true })
      changes.subscribe(git, vi.fn())
      release(source)
      await vi.advanceTimersByTimeAsync(3_000)

      expect(readSource).toHaveBeenCalledTimes(4)
    })
  })
})
