import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalSubmission } from '../../../src/shared/agent-session-journal-types'
import type { RpcClient } from '../transport/rpc-client'
import { structuredSessionOperationId } from './mobile-structured-agent-session-rpc'
import { resetMobileStructuredSendRetryStorageForTests } from './mobile-structured-send-retry-storage'
import { useMobileStructuredSendRetry } from './use-mobile-structured-send-retry'

const storage = vi.hoisted(() => new Map<string, string>())
const storageFails = vi.hoisted(() => ({ write: false }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      if (storageFails.write) {
        throw new Error('Storage unavailable')
      }
      storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    })
  }
}))

const body = { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Review' }] } as const
const SESSION_KEY = 'host-1:session-1'
const NO_SUBMISSIONS: AgentJournalSubmission[] = []
let retry: ReturnType<typeof useMobileStructuredSendRetry>

function Harness(props: {
  client: RpcClient
  ready: boolean
  submissions?: AgentJournalSubmission[]
  sessionKey?: string
}) {
  retry = useMobileStructuredSendRetry({
    client: props.client,
    connected: true,
    enabled: true,
    ready: props.ready,
    sessionId: 'session-1',
    sessionKey: props.sessionKey ?? SESSION_KEY,
    submissions: props.submissions ?? NO_SUBMISSIONS
  })
  return null
}

describe('mobile structured send retry', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(async () => {
    act(() => renderer?.unmount())
    renderer = null
    await resetMobileStructuredSendRetryStorageForTests()
    storage.clear()
    storageFails.write = false
  })

  it('survives remount and retries only the original body, operation ID, and fence', async () => {
    const sendRequest = vi.fn(async () => ({
      ok: true,
      result: { ok: true, value: { accepted: true }, fence: 8 },
      _meta: { runtimeId: 'runtime-1' }
    }))
    const client = { sendRequest } as unknown as RpcClient
    const operationId = structuredSessionOperationId()
    await act(async () => {
      renderer = create(createElement(Harness, { client, ready: true }))
    })
    await act(async () => {
      await retry.rememberUnknown({
        sessionKey: SESSION_KEY,
        sessionId: 'session-1',
        operationId,
        fence: 7,
        body
      })
    })
    expect(retry.retryable).toHaveLength(1)
    act(() => renderer?.unmount())
    await act(async () => {
      renderer = create(createElement(Harness, { client, ready: false }))
    })
    expect(retry.retryable).toHaveLength(0)
    await act(async () => {
      renderer!.update(createElement(Harness, { client, ready: true }))
    })
    expect(retry.retryable).toHaveLength(1)
    await act(async () => {
      expect(await retry.retry(operationId)).toBe(true)
    })
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSession.send',
      expect.objectContaining({
        retryUnknown: true,
        body,
        envelope: expect.objectContaining({
          clientOperationId: operationId,
          expectedRuntimeFence: 7
        })
      }),
      expect.any(Object)
    )
    expect(retry.retryable).toHaveLength(0)
    act(() => renderer?.unmount())
    await act(async () => {
      renderer = create(createElement(Harness, { client, ready: true }))
    })
    expect(retry.retryable).toHaveLength(0)
  })

  it('removes an accepted submission before offering a persisted Retry', async () => {
    const client = { sendRequest: vi.fn() } as unknown as RpcClient
    const operationId = structuredSessionOperationId()
    await act(async () => {
      renderer = create(createElement(Harness, { client, ready: true }))
    })
    await act(async () => {
      await retry.rememberUnknown({
        sessionKey: SESSION_KEY,
        sessionId: 'session-1',
        operationId,
        fence: 7,
        body
      })
    })
    act(() => renderer?.unmount())
    const accepted: AgentJournalSubmission = {
      clientMessageId: operationId,
      fence: 7,
      payloadFingerprint: 'fingerprint',
      dispatchState: 'accepted',
      providerItemId: 'message-1',
      reason: null,
      submittedAt: Date.now(),
      resolvedAt: Date.now()
    }
    await act(async () => {
      renderer = create(
        createElement(Harness, {
          client,
          ready: true,
          submissions: [accepted]
        })
      )
    })
    expect(retry.retryable).toHaveLength(0)
    expect(storage.size).toBe(0)
  })

  it('does not offer a non-durable Retry when storage rejects the write', async () => {
    const client = { sendRequest: vi.fn() } as unknown as RpcClient
    await act(async () => {
      renderer = create(createElement(Harness, { client, ready: true }))
    })
    storageFails.write = true
    await act(async () => {
      await retry.rememberUnknown({
        sessionKey: SESSION_KEY,
        sessionId: 'session-1',
        operationId: structuredSessionOperationId(),
        fence: 7,
        body
      })
    })
    expect(retry.retryable).toHaveLength(0)
    expect(retry.error).toContain('Storage unavailable')
  })
})
