import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateSourceState } from '../../shared/quality-gate-types'
import { createQualityGateSourceReader } from './quality-gate-source-reader'

const work = { path: '/work', git: true } as const

describe('quality gate source reader', () => {
  let finish: ((state: QualityGateSourceState) => void)[]
  let fail: ((error: Error) => void)[]
  let read: ReturnType<typeof vi.fn<() => Promise<QualityGateSourceState>>>
  const state = (fingerprint: string): QualityGateSourceState => ({
    head: 'aaa',
    clean: false,
    fingerprint
  })

  beforeEach(() => {
    vi.useFakeTimers()
    finish = []
    fail = []
    read = vi.fn(
      () =>
        new Promise<QualityGateSourceState>((resolve, reject) => {
          finish.push(resolve)
          fail.push(reject)
        })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the tree once for everybody who asks during the read and just after it', async () => {
    const reader = createQualityGateSourceReader({ read, reuseMs: 250 })
    const during = [reader(work), reader(work), reader({ ...work })]
    finish[0](state('f1'))
    expect(await Promise.all(during)).toEqual([state('f1'), state('f1'), state('f1')])

    await vi.advanceTimersByTimeAsync(249)
    expect(await reader(work)).toEqual(state('f1'))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('reads again once the answer is older than the reuse window', async () => {
    const reader = createQualityGateSourceReader({ read, reuseMs: 250 })
    const first = reader(work)
    finish[0](state('f1'))
    await first
    await vi.advanceTimersByTimeAsync(250)

    const second = reader(work)
    finish[1](state('f2'))

    expect(await second).toEqual(state('f2'))
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('starts a read of its own for a run, and shares that newer read with the others', async () => {
    const reader = createQualityGateSourceReader({ read, reuseMs: 250 })
    const before = reader(work)
    const forRun = reader(work, { fresh: true })
    const after = reader(work)
    expect(read).toHaveBeenCalledTimes(2)
    finish[0](state('before-the-edit'))
    finish[1](state('after-the-edit'))

    expect(await before).toEqual(state('before-the-edit'))
    expect(await forRun).toEqual(state('after-the-edit'))
    expect(await after).toEqual(state('after-the-edit'))
  })

  it('keeps worktrees, distros and folders apart', async () => {
    const reader = createQualityGateSourceReader({ read, reuseMs: 250 })
    void reader(work)
    void reader({ path: '/other', git: true })
    void reader({ ...work, wslDistro: 'Ubuntu' })
    void reader({ path: '/work', git: false })
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('does not hand a failed read to the next caller', async () => {
    const reader = createQualityGateSourceReader({ read, reuseMs: 250 })
    const failing = reader(work)
    fail[0](new Error('git is gone'))
    await expect(failing).rejects.toThrow('git is gone')

    const next = reader(work)
    finish[1](state('f2'))
    expect(await next).toEqual(state('f2'))
  })
})
