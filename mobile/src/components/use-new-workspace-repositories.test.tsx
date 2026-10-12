import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { useNewWorkspaceRepositories } from './use-new-workspace-repositories'

vi.mock('../worktree/use-last-visited-worktree-repo', () => ({
  useLastVisitedWorktreeRepoId: () => ({ loaded: true, repoId: null })
}))

describe('useNewWorkspaceRepositories', () => {
  it('ignores an initial list that arrives after a refreshed project list', async () => {
    const requests: Array<(response: unknown) => void> = []
    const client = {
      sendRequest: vi.fn(() => new Promise((resolve) => requests.push(resolve)))
    } as unknown as RpcClient
    let current!: ReturnType<typeof useNewWorkspaceRepositories>
    function Harness() {
      current = useNewWorkspaceRepositories({ client, visible: true })
      return null
    }
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(createElement(Harness))
    })
    expect(requests).toHaveLength(1)
    const refresh = current.refreshRepos('new')
    expect(requests).toHaveLength(2)
    await act(async () => {
      requests[1]!({
        ok: true,
        result: { repos: [{ id: 'new', displayName: 'New', path: '/new', kind: 'git' }] }
      })
      await refresh
    })
    await act(async () => {
      requests[0]!({ ok: true, result: { repos: [] } })
    })
    expect(current.repos.map((repo) => repo.id)).toEqual(['new'])
    expect(current.selectedRepo?.id).toBe('new')
    act(() => renderer.unmount())
  })
})
