import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileJiraSource } from './use-mobile-jira-source'

const site = {
  id: 'site-1',
  siteUrl: 'https://acme.atlassian.net',
  email: 'ada@acme.test',
  displayName: 'Acme',
  accountId: 'ada'
}
const issue = {
  id: 'issue-1',
  key: 'ORCA-7',
  siteId: 'site-1',
  title: 'Fix setup',
  url: 'https://acme.atlassian.net/browse/ORCA-7',
  project: { key: 'ORCA' }
}

afterEach(() => vi.useRealTimers())

describe('useMobileJiraSource', () => {
  it('resolves a pasted URL only through its connected matching site', async () => {
    vi.useFakeTimers()
    const sendRequest = vi.fn().mockImplementation(async (method: string) => ({
      ok: true,
      result:
        method === 'jira.readStatus'
          ? { connected: true, sites: [site], selectedSiteId: 'site-1' }
          : issue
    }))
    const client = { sendRequest } as unknown as RpcClient
    let current!: ReturnType<typeof useMobileJiraSource>
    function Harness() {
      current = useMobileJiraSource({
        client,
        enabled: true,
        mode: 'smart',
        query: issue.url
      })
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })
    expect(sendRequest).toHaveBeenCalledWith('jira.getIssue', {
      key: 'ORCA-7',
      siteId: 'site-1'
    })
    expect(current.issue?.key).toBe('ORCA-7')
    act(() => renderer.unmount())
  })

  it('reports unsupported older hosts instead of offering a plain-name Jira URL', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method' }
    })
    const client = { sendRequest } as unknown as RpcClient
    let current!: ReturnType<typeof useMobileJiraSource>
    function Harness() {
      current = useMobileJiraSource({
        client,
        enabled: true,
        mode: 'smart',
        query: issue.url
      })
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    expect(current.intent).toBe(true)
    expect(current.issue).toBeNull()
    expect(current.error).toContain('Update Orca')
    act(() => renderer.unmount())
  })
})
