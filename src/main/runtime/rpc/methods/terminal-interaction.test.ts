import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { classifyRuntimeLongPoll } from '../../runtime-rpc/runtime-rpc-long-poll'
import { RpcDispatcher } from '../dispatcher'
import { ALL_RPC_METHODS } from './index'
import { TERMINAL_INTERACTION_METHODS } from './terminal-interaction'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `tab-a:${LEAF_ID}`
const request = {
  title: 'Confirm change',
  fields: [{ id: 'confirm', label: 'Confirm', type: 'boolean' as const, required: true }]
}
const caller = { terminalHandle: 'term-a', paneKey: PANE_KEY }

function makeRuntime() {
  let incarnationId = 'incarnation-a'
  let connected = true
  let lookupFailure: Error | null = null
  const showTerminal = vi.fn(async (terminalHandle: string) => {
    if (lookupFailure) {
      throw lookupFailure
    }
    return {
      handle: terminalHandle,
      tabId: terminalHandle === 'term-a' ? 'tab-a' : 'tab-b',
      leafId: terminalHandle === 'term-a' ? LEAF_ID : '22222222-2222-4222-8222-222222222222',
      ptyId: terminalHandle === 'term-a' ? 'pty-a' : 'pty-b',
      incarnationId: terminalHandle === 'term-a' ? incarnationId : 'incarnation-b',
      connected,
      title: terminalHandle === 'term-a' ? 'Agent A' : 'Agent B'
    }
  })
  const runtime = {
    getRuntimeId: () => 'runtime-a',
    showTerminal
  } as unknown as OrcaRuntimeService
  return {
    runtime,
    showTerminal,
    replaceIncarnation: () => {
      incarnationId = 'incarnation-replacement'
    },
    disconnect: () => {
      connected = false
    },
    failLookup: (message: string) => {
      lookupFailure = new Error(message)
    },
    restoreLookup: () => {
      lookupFailure = null
    }
  }
}

function rpcRequest(id: string, method: string, params?: unknown) {
  return { id, authToken: 'test', method, ...(params === undefined ? {} : { params }) }
}

describe('terminal interaction RPC methods', () => {
  it('registers the complete capability surface in production', () => {
    const expected = [
      'terminalInteraction.request',
      'terminalInteraction.wait',
      'terminalInteraction.cancel',
      'terminalInteraction.pending',
      'terminalInteraction.respond'
    ]
    expect(TERMINAL_INTERACTION_METHODS.map((method) => method.name)).toEqual(expected)
    expect(expected.every((name) => ALL_RPC_METHODS.some((method) => method.name === name))).toBe(
      true
    )
    expect(
      classifyRuntimeLongPoll(
        rpcRequest('rpc-wait', 'terminalInteraction.wait', {
          caller,
          requestId: 'interaction-1',
          timeoutMs: 25_000
        })
      )
    ).toBe('wait')
  })

  it('routes a validated request through pending, respond, and terminal-scoped wait', async () => {
    const { runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_INTERACTION_METHODS })

    await expect(
      dispatcher.dispatch(
        rpcRequest('rpc-1', 'terminalInteraction.request', {
          caller,
          requestId: 'interaction-1',
          request
        })
      )
    ).resolves.toMatchObject({
      ok: true,
      result: { requestId: 'interaction-1', status: 'pending' }
    })
    await expect(
      dispatcher.dispatch(rpcRequest('rpc-2', 'terminalInteraction.pending'))
    ).resolves.toMatchObject({
      ok: true,
      result: [
        {
          requestId: 'interaction-1',
          terminalHandle: 'term-a',
          paneKey: PANE_KEY,
          terminalTitle: 'Agent A',
          request
        }
      ]
    })
    await expect(
      dispatcher.dispatch(
        rpcRequest('rpc-3', 'terminalInteraction.respond', {
          requestId: 'interaction-1',
          result: { status: 'submitted', values: { confirm: true } }
        })
      )
    ).resolves.toMatchObject({ ok: true, result: { accepted: true } })
    await expect(
      dispatcher.dispatch(
        rpcRequest('rpc-4', 'terminalInteraction.wait', {
          caller,
          requestId: 'interaction-1',
          timeoutMs: 25_000
        })
      )
    ).resolves.toMatchObject({
      ok: true,
      result: {
        requestId: 'interaction-1',
        status: 'completed',
        result: { status: 'submitted', values: { confirm: true } }
      }
    })
  })

  it('rejects disconnected or mismatched pane callers before queueing', async () => {
    const harness = makeRuntime()
    const dispatcher = new RpcDispatcher({
      runtime: harness.runtime,
      methods: TERMINAL_INTERACTION_METHODS
    })

    const mismatched = await dispatcher.dispatch(
      rpcRequest('rpc-1', 'terminalInteraction.request', {
        caller: { ...caller, paneKey: `tab-a:22222222-2222-4222-8222-222222222222` },
        requestId: 'interaction-1',
        request
      })
    )
    expect(mismatched).toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_terminal_unavailable' }
    })

    harness.disconnect()
    const disconnected = await dispatcher.dispatch(
      rpcRequest('rpc-2', 'terminalInteraction.request', {
        caller,
        requestId: 'interaction-2',
        request
      })
    )
    expect(disconnected).toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_terminal_unavailable' }
    })
  })

  it('rejects cross-terminal result reads and overlong polling', async () => {
    const { runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_INTERACTION_METHODS })
    await dispatcher.dispatch(
      rpcRequest('rpc-1', 'terminalInteraction.request', {
        caller,
        requestId: 'interaction-1',
        request
      })
    )

    const crossed = await dispatcher.dispatch(
      rpcRequest('rpc-2', 'terminalInteraction.wait', {
        caller: {
          terminalHandle: 'term-b',
          paneKey: 'tab-b:22222222-2222-4222-8222-222222222222'
        },
        requestId: 'interaction-1',
        timeoutMs: 0
      })
    )
    expect(crossed).toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_caller_mismatch' }
    })

    const tooLong = await dispatcher.dispatch(
      rpcRequest('rpc-3', 'terminalInteraction.wait', {
        caller,
        requestId: 'interaction-1',
        timeoutMs: 25_001
      })
    )
    expect(tooLong).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })

  it('validates responses against the originating request', async () => {
    const { runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_INTERACTION_METHODS })
    await dispatcher.dispatch(
      rpcRequest('rpc-1', 'terminalInteraction.request', {
        caller,
        requestId: 'interaction-1',
        request
      })
    )

    const response = await dispatcher.dispatch(
      rpcRequest('rpc-2', 'terminalInteraction.respond', {
        requestId: 'interaction-1',
        result: { status: 'submitted', values: { confirm: 'yes' } }
      })
    )
    expect(response).toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_result_invalid' }
    })
    await expect(
      dispatcher.dispatch(rpcRequest('rpc-3', 'terminalInteraction.pending'))
    ).resolves.toMatchObject({
      ok: true,
      result: [expect.objectContaining({ requestId: 'interaction-1' })]
    })
  })

  it('cancels stale pending requests before accepting a response', async () => {
    const harness = makeRuntime()
    const dispatcher = new RpcDispatcher({
      runtime: harness.runtime,
      methods: TERMINAL_INTERACTION_METHODS
    })
    await dispatcher.dispatch(
      rpcRequest('rpc-1', 'terminalInteraction.request', {
        caller,
        requestId: 'interaction-1',
        request
      })
    )
    harness.replaceIncarnation()

    const response = await dispatcher.dispatch(
      rpcRequest('rpc-2', 'terminalInteraction.respond', {
        requestId: 'interaction-1',
        result: { status: 'submitted', values: { confirm: true } }
      })
    )
    expect(response).toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_caller_stale' }
    })
    await expect(
      dispatcher.dispatch(rpcRequest('rpc-3', 'terminalInteraction.pending'))
    ).resolves.toMatchObject({ ok: true, result: [] })
  })

  it('preserves pending requests through unverifiable terminal lookup failures', async () => {
    const harness = makeRuntime()
    const dispatcher = new RpcDispatcher({
      runtime: harness.runtime,
      methods: TERMINAL_INTERACTION_METHODS
    })
    await dispatcher.dispatch(
      rpcRequest('rpc-1', 'terminalInteraction.request', {
        caller,
        requestId: 'interaction-1',
        request
      })
    )
    harness.failLookup('remote_runtime_unavailable')

    await expect(
      dispatcher.dispatch(rpcRequest('rpc-2', 'terminalInteraction.pending'))
    ).resolves.toMatchObject({
      ok: true,
      result: [expect.objectContaining({ requestId: 'interaction-1' })]
    })
    await expect(
      dispatcher.dispatch(
        rpcRequest('rpc-3', 'terminalInteraction.respond', {
          requestId: 'interaction-1',
          result: { status: 'submitted', values: { confirm: true } }
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { message: 'terminal_interaction_terminal_unavailable' }
    })

    harness.restoreLookup()
    await expect(
      dispatcher.dispatch(
        rpcRequest('rpc-4', 'terminalInteraction.respond', {
          requestId: 'interaction-1',
          result: { status: 'submitted', values: { confirm: true } }
        })
      )
    ).resolves.toMatchObject({ ok: true, result: { accepted: true } })
  })
})
