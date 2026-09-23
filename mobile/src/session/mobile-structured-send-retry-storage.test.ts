import { afterEach, describe, expect, it, vi } from 'vitest'
import { structuredSessionOperationId } from './mobile-structured-agent-session-rpc'
import {
  loadMobileStructuredSendRetries,
  resetMobileStructuredSendRetryStorageForTests,
  saveMobileStructuredSendRetry,
  type MobileStructuredSendRetryEntry
} from './mobile-structured-send-retry-storage'

const storage = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    })
  }
}))

function entry(
  sessionKey: string,
  operationId = structuredSessionOperationId()
): MobileStructuredSendRetryEntry {
  return {
    sessionKey,
    sessionId: 'session-1',
    operationId,
    fence: 5,
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Review' }] }
  }
}

describe('durable structured send retry storage', () => {
  afterEach(async () => {
    await resetMobileStructuredSendRetryStorageForTests()
    storage.clear()
  })

  it('serializes simultaneous writes and isolates host/session scopes', async () => {
    const first = entry('host-a:session-1')
    const second = entry('host-b:session-1')
    await Promise.all([saveMobileStructuredSendRetry(first), saveMobileStructuredSendRetry(second)])
    expect(
      await loadMobileStructuredSendRetries(first.sessionKey, first.sessionId, new Set())
    ).toEqual([first])
    expect(
      await loadMobileStructuredSendRetries(second.sessionKey, second.sessionId, new Set())
    ).toEqual([second])
  })

  it('preserves the journal and refuses writes when it reaches its bound', async () => {
    const entries = Array.from({ length: 64 }, () => entry('host-a:session-1'))
    for (const item of entries) {
      await saveMobileStructuredSendRetry(item)
    }
    await expect(saveMobileStructuredSendRetry(entry('host-a:session-1'))).rejects.toThrow(
      'Too many'
    )
    expect(
      await loadMobileStructuredSendRetries('host-a:session-1', 'session-1', new Set())
    ).toHaveLength(64)
  })

  it('does not overwrite an unreadable journal', async () => {
    storage.set('orca:structured-send-retry:v1', '{broken')
    await expect(saveMobileStructuredSendRetry(entry('host-a:session-1'))).rejects.toThrow(
      'unreadable'
    )
    expect(storage.get('orca:structured-send-retry:v1')).toBe('{broken')
  })

  it('drops an expired operation before exposing Retry', async () => {
    const expired = entry('host-a:session-1', '1700000000000-11111111111111111111111111111111')
    storage.set('orca:structured-send-retry:v1', JSON.stringify({ v: 1, entries: [expired] }))
    expect(
      await loadMobileStructuredSendRetries(expired.sessionKey, expired.sessionId, new Set())
    ).toEqual([])
  })
})
