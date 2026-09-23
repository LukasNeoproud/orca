import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionHandoffStatus } from '../../../src/shared/agent-session-wire'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  type StructuredAgentSessionState
} from '../../../src/shared/structured-agent-session-reducer'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileStructuredSessionHandoff } from './use-mobile-structured-session-handoff'

const terminal: AgentSessionHandoffStatus = {
  owner: 'tui',
  direction: null,
  phase: 'idle',
  stage: null,
  operationId: null
}
const chat: AgentSessionHandoffStatus = {
  owner: 'native',
  direction: null,
  phase: 'idle',
  stage: null,
  operationId: null
}
const state: StructuredAgentSessionState = {
  ...EMPTY_STRUCTURED_AGENT_SESSION,
  fence: 4,
  handoff: terminal
}
let handoff: ReturnType<typeof useMobileStructuredSessionHandoff>

function Harness({ client }: { client: RpcClient }) {
  handoff = useMobileStructuredSessionHandoff({
    client,
    connected: true,
    enabled: true,
    sessionId: 'session-1',
    sessionKey: 'host-1:session-1',
    state,
    stateRef: { current: state }
  })
  return null
}

describe('mobile structured handoff', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('sends a fenced return request and blocks sends while the returned status settles', async () => {
    const sendRequest = vi.fn(async () => ({
      ok: true,
      result: { ok: true, value: { status: chat }, fence: 5 },
      _meta: { runtimeId: 'runtime-1' }
    }))
    await act(async () => {
      renderer = create(createElement(Harness, { client: { sendRequest } as unknown as RpcClient }))
    })
    let accepted = false
    await act(async () => {
      accepted = await handoff.request('to-native', 'after-turn')
    })
    expect(accepted).toBe(true)
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.requestHandoff',
      expect.objectContaining({
        envelope: expect.objectContaining({ sessionId: 'session-1', expectedRuntimeFence: 4 }),
        direction: 'to-native',
        mode: 'after-turn',
        action: 'start'
      }),
      expect.any(Object)
    )
    expect(handoff.status?.owner).toBe('native')
    expect(handoff.canSend).toBe(false)
  })

  it('does not repeat an unconfirmed request when status proof still shows the old owner', async () => {
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'agentSession.requestHandoff') {
        throw markRpcDeliveryUnknown(new Error('lost ack'))
      }
      return { ok: true, result: terminal, _meta: { runtimeId: 'runtime-1' } }
    })
    await act(async () => {
      renderer = create(createElement(Harness, { client: { sendRequest } as unknown as RpcClient }))
    })
    await act(async () => {
      await handoff.request('to-native', 'after-turn')
    })
    expect(handoff.uncertain).toBe(true)
    expect(handoff.canSend).toBe(false)
    expect(await handoff.request('to-native', 'after-turn')).toBe(false)
    expect(
      sendRequest.mock.calls.filter(([method]) => method === 'agentSession.requestHandoff')
    ).toHaveLength(1)
  })
})
