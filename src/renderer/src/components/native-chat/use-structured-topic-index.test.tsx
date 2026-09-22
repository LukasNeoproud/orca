// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendAutomaticTopicTurn,
  emptyStructuredTopicIndex
} from '../../../../shared/structured-topic-index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))

import { useStructuredTopicIndex } from './use-structured-topic-index'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useStructuredTopicIndex', () => {
  beforeEach(() => mocks.call.mockReset())

  it('fails closed after the initial read fails and never writes an empty default', async () => {
    mocks.call.mockRejectedValueOnce(new Error('journal unavailable'))
    const { result } = renderHook(() => useStructuredTopicIndex('session', { kind: 'local' }, true))
    await waitFor(() => expect(result.current.error).toBe('journal unavailable'))
    expect(result.current.ready).toBe(false)

    await act(async () => {
      await expect(
        result.current.save({
          ...emptyStructuredTopicIndex('session'),
          revision: 1,
          automatic: false
        })
      ).rejects.toThrow('agent_session_topic_index_not_ready')
    })
    expect(mocks.call).toHaveBeenCalledTimes(1)
  })

  it('retains the last read index but disables writes after a save failure', async () => {
    const stored = appendAutomaticTopicTurn(emptyStructuredTopicIndex('session'), {
      start: { epoch: 'epoch', itemId: 'user', sequence: 1 },
      end: { epoch: 'epoch', itemId: 'assistant', sequence: 2 },
      prompt: 'Login retry'
    })
    mocks.call.mockResolvedValueOnce({ index: stored })
    mocks.call.mockRejectedValueOnce(new Error('write disconnected'))
    const { result } = renderHook(() => useStructuredTopicIndex('session', { kind: 'local' }, true))
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => {
      await expect(
        result.current.save({ ...stored, revision: stored.revision + 1, automatic: false })
      ).rejects.toThrow('write disconnected')
    })
    expect(result.current.index).toEqual(stored)
    expect(result.current.ready).toBe(false)
  })

  it('ignores a late read from the previous session scope', async () => {
    const first = deferred<{ index: ReturnType<typeof emptyStructuredTopicIndex> }>()
    const second = deferred<{ index: ReturnType<typeof emptyStructuredTopicIndex> }>()
    mocks.call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(
      ({ sessionId }) => useStructuredTopicIndex(sessionId, { kind: 'local' }, true),
      { initialProps: { sessionId: 'session-a' } }
    )
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1))
    const previousRefresh = result.current.refresh
    rerender({ sessionId: 'session-b' })
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2))

    await act(async () => {
      first.resolve({ index: emptyStructuredTopicIndex('session-a') })
      second.resolve({
        index: { ...emptyStructuredTopicIndex('session-b'), revision: 3, automatic: false }
      })
      await Promise.all([first.promise, second.promise])
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.index).toMatchObject({ sessionId: 'session-b', revision: 3 })
    await act(() => previousRefresh())
    expect(mocks.call).toHaveBeenCalledTimes(2)
  })
  it('does not overwrite the new scope with a late save result', async () => {
    const saved = deferred<{ index: ReturnType<typeof emptyStructuredTopicIndex> }>()
    mocks.call
      .mockResolvedValueOnce({ index: emptyStructuredTopicIndex('a') })
      .mockReturnValueOnce(saved.promise)
      .mockResolvedValueOnce({ index: { ...emptyStructuredTopicIndex('b'), automatic: false } })
    const hook = renderHook(({ id }) => useStructuredTopicIndex(id, { kind: 'local' }, true), {
      initialProps: { id: 'a' }
    })
    await waitFor(() => expect(hook.result.current.ready).toBe(true))
    let saving!: Promise<unknown>
    act(() => {
      saving = hook.result.current.save({ ...hook.result.current.index, revision: 1 })
    })
    hook.rerender({ id: 'b' })
    await waitFor(() => expect(hook.result.current.index.sessionId).toBe('b'))
    await act(async () => {
      saved.resolve({ index: { ...emptyStructuredTopicIndex('a'), revision: 1 } })
      await saving
    })
    expect(hook.result.current.index).toMatchObject({ sessionId: 'b', automatic: false })
  })
})
