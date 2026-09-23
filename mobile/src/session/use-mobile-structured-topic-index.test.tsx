import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileStructuredTopicIndex } from './use-mobile-structured-topic-index'

function ok(result: unknown) {
  return { ok: true, result, _meta: { runtimeId: 'runtime-1' } }
}

let topic: ReturnType<typeof useMobileStructuredTopicIndex>
function Harness({ client }: { client: RpcClient }) {
  topic = useMobileStructuredTopicIndex({
    client,
    connected: true,
    enabled: true,
    sessionId: 'session-1',
    sourceIdentity: 'host-1:workspace-1',
    epoch: null,
    items: []
  })
  return null
}

describe('mobile structured topic index capability gate', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('does not call topic RPCs on an older host', async () => {
    const sendRequest = vi.fn(async () => ok({ capabilities: [] }))
    await act(async () => {
      renderer = create(createElement(Harness, { client: { sendRequest } as unknown as RpcClient }))
    })
    expect(topic.supported).toBe(false)
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual(['status.get'])
  })

  it('reads and saves with the exact prior revision on a capable host', async () => {
    const sendRequest = vi.fn(async (method: string, params?: unknown) => {
      if (method === 'status.get') {
        return ok({ capabilities: [STRUCTURED_AGENT_SESSION_TOPIC_INDEX_RUNTIME_CAPABILITY] })
      }
      if (method === 'agentSession.topicIndex') {
        return ok({ index: { sessionId: 'session-1', revision: 2, automatic: true, chapters: [] } })
      }
      if (method === 'agentSession.writeTopicIndex') {
        return ok({
          index: { sessionId: 'session-1', revision: 3, automatic: false, chapters: [] }
        })
      }
      throw new Error(`Unexpected ${method}: ${JSON.stringify(params)}`)
    })
    await act(async () => {
      renderer = create(createElement(Harness, { client: { sendRequest } as unknown as RpcClient }))
    })
    expect(topic.ready).toBe(true)
    await act(async () => {
      await topic.save({ ...topic.index, revision: 3, automatic: false })
    })
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.writeTopicIndex',
      {
        sessionId: 'session-1',
        expectedRevision: 2,
        index: { sessionId: 'session-1', revision: 3, automatic: false, chapters: [] }
      },
      expect.any(Object)
    )
    expect(topic.index.automatic).toBe(false)
  })
})
