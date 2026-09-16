// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAiVaultSessionResultCacheForTest } from '../right-sidebar/ai-vault-session-result-cache'
import {
  resetConversationHistoryCatalogForTests,
  useConversationHistoryCatalog
} from './conversation-history-catalog'

const EMPTY_RESULT = {
  sessions: [],
  issues: [],
  scannedAt: '2026-09-15T10:00:00.000Z'
}

describe('useConversationHistoryCatalog', () => {
  const listSessions = vi.fn()

  beforeEach(() => {
    resetConversationHistoryCatalogForTests()
    resetAiVaultSessionResultCacheForTest()
    listSessions.mockReset().mockResolvedValue(EMPTY_RESULT)
    ;(window as unknown as { api: unknown }).api = {
      aiVault: { listSessions, onWindowFocused: () => () => undefined }
    }
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('does not scan while the history section is collapsed', async () => {
    const hook = renderHook(() => useConversationHistoryCatalog('local', false, ''))
    await Promise.resolve()

    expect(hook.result.current.status).toBe('idle')
    expect(listSessions).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('coalesces expanded workspace cards into one exact host catalog scan', async () => {
    const first = renderHook(() => useConversationHistoryCatalog('local', true, ''))
    const second = renderHook(() => useConversationHistoryCatalog('local', true, ''))

    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(listSessions).toHaveBeenCalledOnce()
    expect(listSessions).toHaveBeenCalledWith({
      executionHostScope: 'local',
      scopePaths: [],
      unlimited: true,
      force: false
    })
    first.unmount()
    second.unmount()
  })

  it('keeps catalogs isolated by execution host', async () => {
    const local = renderHook(() => useConversationHistoryCatalog('local', true, ''))
    const remote = renderHook(() =>
      useConversationHistoryCatalog('runtime:environment-1', true, '')
    )

    await waitFor(() => expect(local.result.current.status).toBe('ready'))
    await waitFor(() => expect(remote.result.current.status).toBe('ready'))

    expect(listSessions).toHaveBeenCalledTimes(2)
    expect(listSessions.mock.calls.map(([args]) => args.executionHostScope).sort()).toEqual([
      'local',
      'runtime:environment-1'
    ])
    local.unmount()
    remote.unmount()
  })

  it('forces one revalidation after every fully collapsed interval', async () => {
    const first = renderHook(() => useConversationHistoryCatalog('local', true, ''))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    const reopened = renderHook(() => useConversationHistoryCatalog('local', true, ''))
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))

    expect(listSessions.mock.calls[1]?.[0]).toMatchObject({ force: true, unlimited: true })
    reopened.unmount()
  })

  it('queues a forced refresh when a provider session appears during a scan', async () => {
    let resolveFirst: ((value: typeof EMPTY_RESULT) => void) | undefined
    listSessions
      .mockImplementationOnce(
        () =>
          new Promise<typeof EMPTY_RESULT>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ ...EMPTY_RESULT, scannedAt: '2026-09-15T10:01:00.000Z' })
    let refreshKey = ''
    const hook = renderHook(() => useConversationHistoryCatalog('local', true, refreshKey))
    await waitFor(() => expect(listSessions).toHaveBeenCalledOnce())

    refreshKey = 'provider-session-1'
    hook.rerender()
    await act(async () => resolveFirst?.(EMPTY_RESULT))
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))

    expect(listSessions.mock.calls[1]?.[0]).toMatchObject({ force: true, unlimited: true })
    hook.unmount()
  })
})
