// @vitest-environment happy-dom

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../../shared/code-search-types'
import {
  TODO_COMMENT_QUERY,
  TODO_OVERVIEW_MAX_RESULTS
} from '../../../../shared/todo-comment-search'
import { useTodoOverviewSearch } from './use-todo-overview-search'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  searchRuntimeFiles: vi.fn()
}))

vi.mock('@/runtime/runtime-file-search-client', () => ({
  searchRuntimeFiles: mocks.searchRuntimeFiles
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    vi.fn((selector: (state: ReturnType<typeof mocks.getState>) => unknown) =>
      selector(mocks.getState())
    ),
    { getState: mocks.getState }
  )
}))

const WORKTREE_ID = 'repo-a::/repo'
const FOUND: SearchResult = {
  files: [
    {
      filePath: '/repo/a.ts',
      relativePath: 'a.ts',
      matches: [{ line: 3, column: 1, matchLength: 7, lineContent: '// TODO: x' }]
    }
  ],
  totalMatches: 1,
  truncated: false
}

function stateFor(hostId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    settings: { activeRuntimeEnvironmentId: 'ambient-runtime' },
    repos: [{ id: 'repo-a' }],
    worktreesByRepo: { 'repo-a': [{ id: WORKTREE_ID, repoId: 'repo-a', hostId }] },
    gitStatusByWorktree: {},
    gitBranchCompareSummaryByWorktree: {},
    gitBranchChangesByWorktree: {},
    ...extra
  }
}

function render(state: Record<string, unknown>, changedOnly = false, active = true) {
  let current = state
  mocks.getState.mockImplementation(() => current)
  mocks.searchRuntimeFiles.mockResolvedValue(FOUND)
  const hook = renderHook(() =>
    useTodoOverviewSearch({
      worktreeId: WORKTREE_ID,
      worktreePath: '/repo',
      supportsGit: true,
      changedOnly,
      active
    })
  )
  return {
    ...hook,
    switchTo: (next: Record<string, unknown>) => {
      current = next
      hook.rerender()
    }
  }
}

describe('useTodoOverviewSearch', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches the workspace on the runtime host that owns it, with the TODO query and cap', async () => {
    const hook = render(stateFor('runtime:ssh-host-runtime'))
    await waitFor(() => expect(hook.result.current.state.results?.totalMatches).toBe(1))
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'environment', environmentId: 'ssh-host-runtime' },
        worktreeId: WORKTREE_ID,
        worktreePath: '/repo'
      }),
      {
        query: TODO_COMMENT_QUERY,
        rootPath: '/repo',
        caseSensitive: true,
        useRegex: true,
        includePattern: undefined,
        maxResults: TODO_OVERVIEW_MAX_RESULTS
      },
      expect.any(AbortSignal)
    )
    expect(hook.result.current.state.owner).toMatchObject({
      runtimeEnvironmentId: 'ssh-host-runtime',
      executionHostId: 'runtime:ssh-host-runtime'
    })
  })

  it('names the changed files as an anchored include pattern', async () => {
    const hook = render(
      stateFor('local', {
        gitStatusByWorktree: {
          [WORKTREE_ID]: [{ path: 'a.ts', status: 'modified', area: 'unstaged' }]
        }
      }),
      true
    )
    await waitFor(() => expect(hook.result.current.state.results?.files).toHaveLength(1))
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: 'local' } }),
      expect.objectContaining({ includePattern: '/a.ts' }),
      expect.any(AbortSignal)
    )
  })

  it('does not search with no changed files, and not while hidden', async () => {
    const hook = render(stateFor('local'), true)
    await waitFor(() =>
      expect(hook.result.current.state.results).toEqual({
        files: [],
        totalMatches: 0,
        truncated: false
      })
    )
    render(stateFor('local'), false, false)
    expect(mocks.searchRuntimeFiles).not.toHaveBeenCalled()
  })

  it('keeps searching the workspace it was opened for after the focus moves elsewhere', async () => {
    const opened = stateFor('runtime:owner-runtime', {
      activeWorktreeId: WORKTREE_ID,
      activeWorkspaceExecutionHostId: 'runtime:owner-runtime'
    })
    const hook = render(opened)
    await waitFor(() => expect(hook.result.current.state.results?.totalMatches).toBe(1))
    const ownerBefore = hook.result.current.state.owner

    hook.switchTo({
      ...opened,
      settings: { activeRuntimeEnvironmentId: 'other-runtime' },
      activeWorktreeId: 'repo-b::/other',
      activeWorkspaceExecutionHostId: 'runtime:other-runtime'
    })

    expect(mocks.searchRuntimeFiles).toHaveBeenCalledTimes(1)
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'environment', environmentId: 'owner-runtime' },
        worktreeId: WORKTREE_ID
      }),
      expect.anything(),
      expect.any(AbortSignal)
    )
    expect(hook.result.current.state.owner).toBe(ownerBefore)
    expect(hook.result.current.state.results?.totalMatches).toBe(1)
  })

  it('searches an SSH workspace through its own connection', async () => {
    const hook = render(
      stateFor('ssh:target-a', {
        repos: [{ id: 'repo-a', connectionId: 'target-a', executionHostId: 'ssh:target-a' }]
      })
    )
    await waitFor(() => expect(hook.result.current.state.results?.totalMatches).toBe(1))
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: 'local' }, connectionId: 'target-a' }),
      expect.anything(),
      expect.any(AbortSignal)
    )
    expect(hook.result.current.state.owner).toMatchObject({
      runtimeEnvironmentId: null,
      executionHostId: 'ssh:target-a'
    })
  })

  it('does not fall back to the focused server when no row names the owner', async () => {
    const hook = render(stateFor('local', { repos: [], worktreesByRepo: {} }))
    await waitFor(() => expect(hook.result.current.state.error).toBeTruthy())
    expect(mocks.searchRuntimeFiles).not.toHaveBeenCalled()
  })
})
