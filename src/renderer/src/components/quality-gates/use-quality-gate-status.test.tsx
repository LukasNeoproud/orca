// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateChangeHandlers } from '@/lib/quality-gate-client'

const client = vi.hoisted(() => ({
  classifyQualityGateCallFailure: vi.fn(() => 'contact-lost'),
  fetchQualityGateStatus: vi.fn(),
  qualityGateBackgroundChangesSupported: vi.fn(),
  qualityGateChangesSupported: vi.fn(),
  qualityGatesSupported: vi.fn(),
  subscribeQualityGateChanges: vi.fn()
}))
vi.mock('@/lib/quality-gate-client', () => client)

import { gateRun, gateStatus, liveGateRun } from './quality-gate-status-test-fixtures'
import { presentQualityGateStatus } from './quality-gate-status-view'
import { useQualityGateStatus } from './use-quality-gate-status'

const remote = { kind: 'environment', environmentId: 'env-ssh' } as const

describe('useQualityGateStatus', () => {
  let stream: QualityGateChangeHandlers | null
  const closeStream = vi.fn()

  function watch(target: typeof remote | { kind: 'local' } = { kind: 'local' }) {
    return renderHook(() => useQualityGateStatus(target, 'repo::/work', 'rev', { watch: true }))
  }
  const reads = (): number => client.fetchQualityGateStatus.mock.calls.length
  const settle = (ms = 0): Promise<void> =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  beforeEach(() => {
    vi.useFakeTimers()
    stream = null
    closeStream.mockReset()
    client.classifyQualityGateCallFailure.mockReturnValue('contact-lost')
    client.qualityGatesSupported.mockReset().mockResolvedValue(true)
    client.qualityGateChangesSupported.mockReset().mockResolvedValue(true)
    client.qualityGateBackgroundChangesSupported.mockReset().mockResolvedValue(true)
    client.fetchQualityGateStatus.mockReset().mockResolvedValue(gateStatus(gateRun()))
    client.subscribeQualityGateChanges
      .mockReset()
      .mockImplementation(async (_target, _worktreeId, handlers) => {
        stream = handlers
        return { close: closeStream }
      })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('follows the host through its change stream and asks nothing on an interval', async () => {
    const hook = watch()
    await settle()
    act(() => stream?.onChanged())
    await settle()
    const afterOpen = reads()

    await settle(60_000)
    expect(reads()).toBe(afterOpen)

    // A gate finished, a commit landed or a file was edited: the host says so, the panel re-reads.
    client.fetchQualityGateStatus.mockResolvedValue(
      gateStatus(gateRun({ freshness: { state: 'stale', reasons: ['tree-changed'] } }))
    )
    act(() => stream?.onChanged())
    await settle()

    expect(reads()).toBe(afterOpen + 1)
    expect(hook.result.current.view.status?.gates[0].latestRun?.freshness).toEqual({
      state: 'stale',
      reasons: ['tree-changed']
    })
  })

  it('asks an older host on an interval instead, and never opens a stream to it', async () => {
    client.qualityGateChangesSupported.mockResolvedValue(false)
    watch(remote)
    await settle()
    expect(reads()).toBe(1)

    await settle(5_000)
    await settle(5_000)

    expect(reads()).toBe(3)
    expect(client.subscribeQualityGateChanges).not.toHaveBeenCalled()
  })

  it('falls back to the interval when the host refuses the stream as unknown', async () => {
    watch(remote)
    await settle()
    act(() => stream?.onLost(true))
    await settle()
    const afterLoss = reads()

    await settle(5_000)

    expect(reads()).toBe(afterLoss + 1)
    expect(client.subscribeQualityGateChanges).toHaveBeenCalledTimes(1)
  })

  it('reopens a dropped stream', async () => {
    watch(remote)
    await settle()
    act(() => stream?.onLost(false))
    await settle(5_000)

    expect(client.subscribeQualityGateChanges).toHaveBeenCalledTimes(2)
  })

  it('shows a run in progress as unverifiable once the SSH host stops answering, then recovers', async () => {
    client.fetchQualityGateStatus.mockResolvedValue(gateStatus(liveGateRun()))
    const hook = watch(remote)
    await settle()
    act(() => stream?.onChanged())
    await settle()
    expect(hook.result.current.view.status?.gates[0].latestRun?.status).toBe('running')

    client.fetchQualityGateStatus.mockRejectedValue(new Error('socket hang up'))
    act(() => stream?.onLost(false))
    await settle()

    const shown = presentQualityGateStatus(hook.result.current.view)
    expect(hook.result.current.view.contactLost).toBe(true)
    expect(shown?.gates[0].latestRun).toMatchObject({
      status: 'unverifiable',
      liveness: 'unverifiable'
    })

    client.fetchQualityGateStatus.mockResolvedValue(gateStatus(gateRun()))
    await settle(5_000)
    expect(hook.result.current.view.contactLost).toBe(false)
    expect(hook.result.current.view.status?.gates[0].latestRun?.status).toBe('passed')
  })

  it('reads once more after a signal that arrived mid-read, not in parallel', async () => {
    let answer: (() => void) | null = null
    watch()
    await settle()
    client.fetchQualityGateStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(gateStatus(gateRun()))
        })
    )
    const before = reads()
    act(() => stream?.onChanged())
    await settle()
    act(() => stream?.onChanged())
    act(() => stream?.onChanged())
    await settle()
    expect(reads()).toBe(before + 1)

    act(() => answer?.())
    await settle()
    expect(reads()).toBe(before + 2)
  })

  it('closes the stream and stops asking when the panel goes away', async () => {
    const hook = watch()
    await settle()
    hook.unmount()
    const afterUnmount = reads()

    await settle(60_000)

    expect(closeStream).toHaveBeenCalledTimes(1)
    expect(reads()).toBe(afterUnmount)
  })

  it('opens no stream for a reader that does not watch, as the settings page', async () => {
    renderHook(() => useQualityGateStatus({ kind: 'local' }, 'repo::/work', 'rev'))
    await settle(60_000)

    expect(client.subscribeQualityGateChanges).not.toHaveBeenCalled()
    expect(reads()).toBe(1)
  })

  describe('in the background, as a sidebar card', () => {
    function card(target: typeof remote | { kind: 'local' } = remote) {
      return renderHook(() =>
        useQualityGateStatus(target, 'repo::/work', 'rev', { watch: true, background: true })
      )
    }

    it('reads once and stops for a workspace whose host has no gates: no stream, no interval', async () => {
      client.fetchQualityGateStatus.mockResolvedValue(gateStatus())
      card()

      await settle(120_000)

      expect(reads()).toBe(1)
      expect(client.subscribeQualityGateChanges).not.toHaveBeenCalled()
    })

    it('opens the stream at the background cadence once the host names a gate', async () => {
      const hook = card()
      await settle()

      expect(client.subscribeQualityGateChanges).toHaveBeenCalledTimes(1)
      expect(client.subscribeQualityGateChanges.mock.calls[0][3]).toEqual({ background: true })
      act(() => stream?.onChanged())
      await settle()
      const afterOpen = reads()
      await settle(120_000)
      expect(reads()).toBe(afterOpen)

      client.fetchQualityGateStatus.mockResolvedValue(
        gateStatus(gateRun({ status: 'failed', exitCode: 1 }))
      )
      act(() => stream?.onChanged())
      await settle()
      expect(hook.result.current.view.status?.gates[0].latestRun?.status).toBe('failed')
    })

    it('does not subscribe to a host that would watch every tree at full speed; it asks seldom', async () => {
      client.qualityGateBackgroundChangesSupported.mockResolvedValue(false)
      card()
      await settle()
      expect(reads()).toBe(1)

      await settle(29_000)
      expect(reads()).toBe(1)
      await settle(1_000)
      expect(reads()).toBe(2)
      expect(client.subscribeQualityGateChanges).not.toHaveBeenCalled()
    })

    it('asks a host from before the stream seldom as well, faster while a gate runs', async () => {
      client.qualityGateChangesSupported.mockResolvedValue(false)
      client.fetchQualityGateStatus.mockResolvedValue(gateStatus(liveGateRun()))
      card()
      await settle()

      await settle(5_000)
      expect(reads()).toBe(2)

      client.fetchQualityGateStatus.mockResolvedValue(gateStatus(gateRun()))
      await settle(5_000)
      expect(reads()).toBe(3)
      await settle(30_000)
      expect(reads()).toBe(4)
      expect(client.subscribeQualityGateChanges).not.toHaveBeenCalled()
    })

    it('keeps the last status when the host stops answering and recovers by itself', async () => {
      const hook = card()
      await settle()
      client.fetchQualityGateStatus.mockRejectedValue(new Error('socket hang up'))
      act(() => stream?.onLost(false))
      await settle()

      expect(hook.result.current.view.contactLost).toBe(true)
      expect(hook.result.current.view.status?.gates[0].latestRun?.status).toBe('passed')

      client.fetchQualityGateStatus.mockResolvedValue(gateStatus(gateRun()))
      await settle(30_000)
      expect(hook.result.current.view.contactLost).toBe(false)
    })

    it('moves to the foreground stream when its workspace becomes the active one', async () => {
      const hook = renderHook(
        ({ background }: { background: boolean }) =>
          useQualityGateStatus(remote, 'repo::/work', 'rev', { watch: true, background }),
        { initialProps: { background: true } }
      )
      await settle()
      hook.rerender({ background: false })
      await settle()

      expect(closeStream).toHaveBeenCalledTimes(1)
      expect(client.subscribeQualityGateChanges.mock.calls.map((call) => call[3])).toEqual([
        { background: true },
        { background: false }
      ])
      // The glyph does not blink while the stream is swapped.
      expect(hook.result.current.view.status?.gates).toHaveLength(1)
    })
  })
})
