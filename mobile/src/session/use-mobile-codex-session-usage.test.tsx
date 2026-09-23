import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { MobileCodexSessionUsage } from './mobile-codex-session-usage'
import { useMobileCodexSessionUsage } from './use-mobile-codex-session-usage'

type Harness = {
  client: RpcClient
  emit: (event: unknown, index?: number) => void
  setConnection: (state: ConnectionState) => void
  subscribe: ReturnType<typeof vi.fn>
}

function harness(capabilities: string[]): Harness {
  const streams: ((event: unknown) => void)[] = []
  let connection: (state: ConnectionState) => void = () => undefined
  const subscribe = vi.fn(
    (_method: string, _params: unknown, listener: (event: unknown) => void) => {
      streams.push(listener)
      return vi.fn()
    }
  )
  const client = {
    sendRequest: vi.fn(async () => ({
      ok: true,
      result: { capabilities },
      _meta: { runtimeId: 'runtime-1' }
    })),
    subscribe,
    onStateChange: vi.fn((listener: typeof connection) => {
      connection = listener
      return vi.fn()
    })
  } as unknown as RpcClient
  return {
    client,
    subscribe,
    emit: (event, index = streams.length - 1) => streams[index]?.(event),
    setConnection: (state) => connection(state)
  }
}

describe('useMobileCodexSessionUsage', () => {
  let renderer: ReactTestRenderer | null = null
  let usage: MobileCodexSessionUsage | null = null

  function Probe({ client, sessionId }: { client: RpcClient; sessionId: string }): null {
    usage = useMobileCodexSessionUsage({ agent: 'codex', client, enabled: true, sessionId })
    return null
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    usage = null
  })

  function render(client: RpcClient, sessionId: string): void {
    act(() => {
      if (renderer) {
        renderer.update(createElement(Probe, { client, sessionId }))
      } else {
        renderer = create(createElement(Probe, { client, sessionId }))
      }
    })
  }

  it('does not subscribe or show usage from an older host', async () => {
    const host = harness([])
    render(host.client, 'session-1')
    await act(async () => undefined)

    expect(host.subscribe).not.toHaveBeenCalled()
    expect(usage).toBeNull()
  })

  it('clears usage across reconnect until a fresh snapshot arrives', async () => {
    const host = harness([AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY])
    render(host.client, 'session-1')
    await act(async () => undefined)
    act(() =>
      host.emit({
        type: 'snapshot',
        sessions: [
          {
            sessionId: 'session-1',
            contextUsage: { usedTokens: 40, maxTokens: 100 },
            codexWeeklyUsage: { usedPercent: 59 }
          }
        ]
      })
    )
    expect(usage).toEqual({
      contextUsage: { usedTokens: 40, maxTokens: 100 },
      codexWeeklyUsage: { usedPercent: 59 }
    })
    act(() =>
      host.emit({
        type: 'status',
        session: { sessionId: 'another-session', contextUsage: { usedTokens: 99, maxTokens: 100 } }
      })
    )
    expect(usage?.contextUsage).toEqual({ usedTokens: 40, maxTokens: 100 })

    act(() => host.setConnection('reconnecting'))
    expect(usage).toBeNull()
    act(() => host.emit({ type: 'snapshot', sessions: [] }))
    expect(usage).toBeNull()
  })

  it('ignores the old session stream after the active session changes', async () => {
    const host = harness([AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY])
    render(host.client, 'session-1')
    await act(async () => undefined)
    render(host.client, 'session-2')
    await act(async () => undefined)

    act(() =>
      host.emit(
        {
          type: 'status',
          session: {
            sessionId: 'session-1',
            contextUsage: { usedTokens: 90, maxTokens: 100 }
          }
        },
        0
      )
    )
    expect(usage).toBeNull()
  })
})
