// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionHandoffStatus } from '../../../../shared/agent-session-wire'
import { structuredAgentSessionPayloadFingerprint } from '../../../../shared/structured-agent-session-mutation'
const mocks = vi.hoisted(() => ({ call: vi.fn(), publish: vi.fn() }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))
vi.mock('@/runtime/structured-agent-session-handoff-store', () => ({
  publishStructuredHandoff: mocks.publish
}))
vi.mock('./use-structured-agent-session-outbox', () => ({
  structuredSessionOperationId: () => 'operation-id'
}))
import { useStructuredAgentSessionHandoff } from './use-structured-agent-session-handoff'
const target = { kind: 'local' } as const
const native: AgentSessionHandoffStatus = {
  owner: 'native',
  phase: 'idle',
  direction: null,
  stage: null,
  operationId: null
}
const tui: AgentSessionHandoffStatus = { ...native, owner: 'tui' }
const args = { sessionId: 'one', target, isVisible: true }
beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('structured session handoff controller', () => {
  it('blocks sending in TUI, requests the fenced handoff and follows stream completion', async () => {
    mocks.call.mockResolvedValue({
      ok: true,
      fence: 4,
      value: { status: { ...tui, phase: 'queued', direction: 'to-native' } }
    })
    const { result, rerender } = renderHook(
      ({ handoff, fence }) => useStructuredAgentSessionHandoff(args, { handoff, fence }),
      {
        initialProps: { handoff: tui, fence: 3 }
      }
    )
    expect(result.current.canSend).toBe(false)
    await act(async () => {
      expect(await result.current.requestHandoff('to-native')).toBe(true)
    })
    const fields = { direction: 'to-native', mode: 'after-turn', action: 'start' }
    expect(mocks.call).toHaveBeenCalledWith(target, 'agentSession.requestHandoff', {
      envelope: {
        sessionId: 'one',
        expectedRuntimeFence: 3,
        clientOperationId: 'operation-id',
        payloadFingerprint: structuredAgentSessionPayloadFingerprint({
          method: 'agentSession.requestHandoff',
          sessionId: 'one',
          fields
        })
      },
      ...fields
    })
    expect(result.current.handoff?.phase).toBe('queued')
    expect(result.current.canSend).toBe(false)
    rerender({ handoff: native, fence: 4 })
    expect(result.current.canSend).toBe(true)
    expect(mocks.publish).toHaveBeenLastCalledWith({ sessionId: 'one', fence: 4, status: native })
  })

  it('blocks duplicate requests and sending before the host replies', async () => {
    let resolve!: (result: unknown) => void
    mocks.call.mockImplementation(
      () =>
        new Promise((settle) => {
          resolve = settle
        })
    )
    const { result } = renderHook(() =>
      useStructuredAgentSessionHandoff(args, { handoff: native, fence: 3 })
    )
    let request!: Promise<boolean>
    act(() => {
      request = result.current.requestHandoff('to-tui')
    })
    expect(result.current.canSend).toBe(false)
    await act(async () => {
      expect(await result.current.requestHandoff('to-tui')).toBe(false)
    })
    await act(async () => {
      resolve({ ok: true, fence: 4, value: { status: tui } })
      await request
    })
    expect(mocks.call).toHaveBeenCalledTimes(1)
    expect(result.current.canSend).toBe(false)
  })

  it('does not overwrite a newer event with a late request response', async () => {
    let resolve!: (result: unknown) => void
    mocks.call.mockImplementation(
      () =>
        new Promise((settle) => {
          resolve = settle
        })
    )
    const { result, rerender } = renderHook(
      ({ handoff, fence }) => useStructuredAgentSessionHandoff(args, { handoff, fence }),
      {
        initialProps: { handoff: tui, fence: 3 }
      }
    )
    let request!: Promise<boolean>
    act(() => {
      request = result.current.requestHandoff('to-native')
    })
    rerender({ handoff: native, fence: 5 })
    await act(async () => {
      resolve({ ok: true, fence: 4, value: { status: { ...tui, phase: 'queued' } } })
      await request
    })
    expect(result.current.handoff).toBe(native)
    expect(result.current.canSend).toBe(true)
  })

  it('keeps sends blocked after an unverifiable request until a fresh owner event arrives', async () => {
    mocks.call.mockRejectedValue(new Error('Disconnected'))
    const { result, rerender } = renderHook(
      ({ handoff }) => useStructuredAgentSessionHandoff(args, { handoff, fence: 3 }),
      {
        initialProps: { handoff: native }
      }
    )
    await act(async () => {
      expect(await result.current.requestHandoff('to-tui')).toBe(false)
    })
    expect(result.current.canSend).toBe(false)
    expect(result.current.error).toBe('Disconnected')
    rerender({ handoff: { ...native } })
    expect(result.current.canSend).toBe(true)
  })

  it('ignores a pre-request status read that arrives after handoff succeeds', async () => {
    let resolveRead!: (value: AgentSessionHandoffStatus) => void
    const read = new Promise<AgentSessionHandoffStatus>((resolve) => {
      resolveRead = resolve
    })
    mocks.call.mockImplementation((_target, method) =>
      method === 'agentSession.handoffStatus'
        ? read
        : Promise.resolve({ ok: true, fence: 4, value: { status: tui } })
    )
    const { result } = renderHook(() =>
      useStructuredAgentSessionHandoff(args, { handoff: null, fence: 3 })
    )
    await act(async () => {
      await result.current.requestHandoff('to-tui')
    })
    await act(async () => {
      resolveRead(native)
    })
    expect(result.current.handoff).toBe(tui)
    expect(result.current.canSend).toBe(false)
  })

  it('reuses the failed handoff operation id when retrying its transition', async () => {
    const failed: AgentSessionHandoffStatus = {
      ...tui,
      phase: 'failed',
      direction: 'to-native',
      operationId: 'failed-operation',
      error: { message: 'Try again', recoverableOwner: 'tui' }
    }
    mocks.call.mockResolvedValue({ ok: true, fence: 5, value: { status: native } })
    const { result } = renderHook(() =>
      useStructuredAgentSessionHandoff(args, { handoff: failed, fence: 4 })
    )
    await act(async () => {
      await result.current.requestHandoff('to-native', 'now', 'retry')
    })
    expect(mocks.call.mock.calls[0][2].envelope.clientOperationId).toBe('failed-operation')
    expect(result.current.canSend).toBe(false)
  })

  it('ignores unavailable status on older hosts and surfaces mutation refusal', async () => {
    mocks.call.mockRejectedValue(new Error('method_not_found'))
    const { result } = renderHook(() =>
      useStructuredAgentSessionHandoff(args, { handoff: null, fence: 3 })
    )
    await waitFor(() => expect(mocks.call).toHaveBeenCalled())
    expect(result.current.handoff).toBeNull()
    expect(result.current.canSend).toBe(true)
    mocks.call.mockResolvedValue({
      ok: false,
      refusal: { code: 'agent_session_conflict', message: 'Owner busy' }
    })
    await act(async () => {
      expect(await result.current.requestHandoff('to-tui')).toBe(false)
    })
    expect(result.current.error).toBe('Owner busy')
  })
})
