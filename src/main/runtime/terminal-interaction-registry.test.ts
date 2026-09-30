import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaInteractionRequest } from '../../shared/orca-interaction'
import type { TerminalInteractionCaller } from '../../shared/terminal-interaction'
import {
  TerminalInteractionRegistry,
  type TerminalInteractionBinding
} from './terminal-interaction-registry'

const caller: TerminalInteractionCaller = {
  terminalHandle: 'term-a',
  paneKey: 'tab-a:11111111-1111-4111-8111-111111111111'
}

const binding: TerminalInteractionBinding = {
  ...caller,
  ptyId: 'pty-a',
  incarnationId: 'incarnation-a',
  terminalTitle: 'Agent A'
}

const request: OrcaInteractionRequest = {
  title: 'Choose',
  fields: [
    {
      id: 'choice',
      label: 'Choice',
      type: 'single_choice',
      required: true,
      options: [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' }
      ]
    }
  ]
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TerminalInteractionRegistry', () => {
  it('routes concurrent requests and releases their waiters independently', async () => {
    const registry = new TerminalInteractionRegistry()
    registry.request({ caller, requestId: 'request-1', request }, binding)
    registry.request({ caller, requestId: 'request-2', request }, binding)

    const first = registry.wait(caller, 'request-1', binding, { timeoutMs: 25_000 })
    const second = registry.wait(caller, 'request-2', binding, { timeoutMs: 25_000 })
    expect(registry.pending().map((entry) => entry.requestId)).toEqual(['request-1', 'request-2'])

    expect(
      registry.respond('request-1', { status: 'submitted', values: { choice: 'two' } }, binding)
    ).toEqual({ accepted: true })
    registry.cancel(caller, 'request-2', binding)

    await expect(first).resolves.toEqual({
      requestId: 'request-1',
      status: 'completed',
      result: { status: 'submitted', values: { choice: 'two' } }
    })
    await expect(second).resolves.toEqual({
      requestId: 'request-2',
      status: 'completed',
      result: { status: 'cancelled' }
    })
  })

  it('makes retried requests idempotent but rejects request id reuse with changed input', () => {
    const registry = new TerminalInteractionRegistry()
    const input = { caller, requestId: 'request-1', request }

    expect(registry.request(input, binding)).toEqual({ requestId: 'request-1', status: 'pending' })
    expect(registry.request(input, binding)).toEqual({ requestId: 'request-1', status: 'pending' })
    expect(() =>
      registry.request({ ...input, request: { ...request, title: 'A different request' } }, binding)
    ).toThrow('terminal_interaction_request_conflict')
  })

  it('rejects new work at capacity without cancelling an unanswered request', async () => {
    const registry = new TerminalInteractionRegistry({ maxPending: 1 })
    registry.request({ caller, requestId: 'request-1', request }, binding)

    expect(() => registry.request({ caller, requestId: 'request-2', request }, binding)).toThrow(
      'terminal_interaction_capacity_reached'
    )
    expect(registry.pending().map((entry) => entry.requestId)).toEqual(['request-1'])
    await expect(registry.wait(caller, 'request-1', binding, { timeoutMs: 0 })).resolves.toEqual({
      requestId: 'request-1',
      status: 'pending'
    })
  })

  it('rejects cross-terminal reads and invalid responses', async () => {
    const registry = new TerminalInteractionRegistry()
    registry.request({ caller, requestId: 'request-1', request }, binding)
    const otherCaller = {
      terminalHandle: 'term-b',
      paneKey: 'tab-b:22222222-2222-4222-8222-222222222222'
    }

    await expect(
      registry.wait(otherCaller, 'request-1', { ...binding, ...otherCaller }, { timeoutMs: 0 })
    ).rejects.toThrow('terminal_interaction_caller_mismatch')
    expect(() =>
      registry.respond(
        'request-1',
        { status: 'submitted', values: { choice: 'not-an-option' } },
        binding
      )
    ).toThrow('terminal_interaction_result_invalid')
    expect(registry.pending()).toHaveLength(1)
  })

  it('invalidates a request when the terminal incarnation changes', async () => {
    const registry = new TerminalInteractionRegistry()
    registry.request({ caller, requestId: 'request-1', request }, binding)
    const waiting = registry.wait(caller, 'request-1', binding, { timeoutMs: 25_000 })

    expect(() =>
      registry.respond(
        'request-1',
        { status: 'cancelled' },
        {
          ...binding,
          incarnationId: 'replacement-incarnation'
        }
      )
    ).toThrow('terminal_interaction_caller_stale')
    await expect(waiting).resolves.toEqual({
      requestId: 'request-1',
      status: 'completed',
      result: { status: 'cancelled' }
    })
    expect(registry.pending()).toEqual([])
  })

  it('renews a caller lease on polling and cancels the request after abandonment', async () => {
    vi.useFakeTimers()
    const registry = new TerminalInteractionRegistry({ callerLeaseMs: 1_000 })
    registry.request({ caller, requestId: 'request-1', request }, binding)

    await vi.advanceTimersByTimeAsync(750)
    await expect(registry.wait(caller, 'request-1', binding, { timeoutMs: 0 })).resolves.toEqual({
      requestId: 'request-1',
      status: 'pending'
    })
    await vi.advanceTimersByTimeAsync(750)
    expect(registry.pending()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(251)
    await expect(registry.wait(caller, 'request-1', binding, { timeoutMs: 0 })).resolves.toEqual({
      requestId: 'request-1',
      status: 'completed',
      result: { status: 'cancelled' }
    })
  })

  it('drops completed results after the bounded replay window', async () => {
    vi.useFakeTimers()
    const registry = new TerminalInteractionRegistry({ completedRetentionMs: 100 })
    registry.request({ caller, requestId: 'request-1', request }, binding)
    registry.respond('request-1', { status: 'cancelled' }, binding)

    await vi.advanceTimersByTimeAsync(101)
    await expect(registry.wait(caller, 'request-1', binding, { timeoutMs: 0 })).rejects.toThrow(
      'terminal_interaction_request_not_found'
    )
  })

  it('detaches an aborted long poll without cancelling the request', async () => {
    const registry = new TerminalInteractionRegistry()
    registry.request({ caller, requestId: 'request-1', request }, binding)
    const controller = new AbortController()
    const waiting = registry.wait(caller, 'request-1', binding, {
      timeoutMs: 25_000,
      signal: controller.signal
    })

    controller.abort()
    await expect(waiting).resolves.toEqual({ requestId: 'request-1', status: 'pending' })
    expect(registry.pending()).toHaveLength(1)
    expect(registry.respond('request-1', { status: 'cancelled' }, binding)).toEqual({
      accepted: true
    })
  })
})
