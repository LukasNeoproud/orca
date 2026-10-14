// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitLabProviderSelection } from './gitlab-provider-selection'
import type { GitLabWorkItem } from '../../../../shared/gitlab-types'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), toast: vi.fn() }))
vi.mock('@/lib/repo-runtime-owner', () => ({
  runtimeTargetForRepoOwner: () => ({ kind: 'local' })
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: mocks.toast } }))
vi.mock('@/components/sidebar/folder-workspace-composer-helpers', () => ({
  toGitLabLinkedWorkItem: vi.fn(),
  getLinkedItemDisplayName: vi.fn()
}))

function input() {
  return {
    applyLinkedGitLabWorkItem: vi.fn(),
    branchAutoNameRef: { current: '' },
    eligibleRepos: [],
    handleBaseBranchMrSelect: vi.fn(),
    isProjectGroupTarget: false,
    lastAutoNameRef: { current: '' },
    name: 'edited',
    selectedRepo: { id: 'repo' },
    setBaseBranch: vi.fn(),
    setBranchNameOverride: vi.fn(),
    setBranchNameOverridePreservesNameEdits: vi.fn(),
    setCompareBaseRef: vi.fn(),
    setForkPushWarning: vi.fn(),
    setLinkedGitLabIssue: vi.fn(),
    setLinkedGitLabMR: vi.fn(),
    setLinkedIssue: vi.fn(),
    setLinkedPR: vi.fn(),
    setLinkedTaskSourceContext: vi.fn(),
    setLinkedWorkItem: vi.fn(),
    setName: vi.fn(),
    setPushTarget: vi.fn(),
    setStartFromResetHint: vi.fn(),
    settings: null,
    smartSourceSelectionRef: { current: null }
  } as unknown as Parameters<typeof useGitLabProviderSelection>[0]
}
function item(number: number, type: 'mr' | 'issue' = 'mr'): GitLabWorkItem {
  return {
    number,
    type,
    repoId: 'repo',
    title: 'Review',
    url: 'https://gitlab.com/repo'
  } as GitLabWorkItem
}
function pending() {
  let resolve!: (value: { baseBranch: string } | { error: string }) => void
  let reject!: (error: Error) => void
  const promise = new Promise<{ baseBranch: string } | { error: string }>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('api', undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { worktrees: { resolveMrBase: mocks.resolve } }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('GitLab review selection', () => {
  it('clears a resolved review head before resolving the next selection', async () => {
    const next = pending()
    mocks.resolve
      .mockResolvedValueOnce({ baseBranch: 'first-head' })
      .mockReturnValueOnce(next.promise)
    const state = input()
    const { result } = renderHook(() => useGitLabProviderSelection(state))
    await act(async () => result.current.handleSmartGitLabItemSelect(item(1)))
    expect(state.handleBaseBranchMrSelect).toHaveBeenCalledWith(
      'first-head',
      item(1),
      undefined,
      undefined,
      { sourceAlreadyLinked: true }
    )
    vi.mocked(state.setBaseBranch).mockClear()
    act(() => result.current.handleSmartGitLabItemSelect(item(2)))
    expect(state.setBaseBranch).toHaveBeenCalledWith(undefined)
    expect(state.setCompareBaseRef).toHaveBeenLastCalledWith(undefined)
    expect(state.setPushTarget).toHaveBeenLastCalledWith(undefined)
    await act(async () => next.resolve({ baseBranch: 'second-head' }))
    expect(state.handleBaseBranchMrSelect).toHaveBeenLastCalledWith(
      'second-head',
      item(2),
      undefined,
      undefined,
      { sourceAlreadyLinked: true }
    )
  })

  it.each(['success', 'error', 'rejection'] as const)(
    'ignores a stale MR %s after a newer MR resolves',
    async (outcome) => {
      const old = pending()
      mocks.resolve
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({ baseBranch: 'new-head' })
      const state = input()
      const { result } = renderHook(() => useGitLabProviderSelection(state))
      act(() => result.current.handleSmartGitLabItemSelect(item(1)))
      await act(async () => result.current.handleSmartGitLabItemSelect(item(2)))
      vi.mocked(state.setBaseBranch).mockClear()
      await act(async () => {
        if (outcome === 'rejection') {
          old.reject(new Error('old failure'))
        } else {
          old.resolve(outcome === 'success' ? { baseBranch: 'old-head' } : { error: 'old failure' })
        }
      })
      expect(state.handleBaseBranchMrSelect).toHaveBeenCalledOnce()
      expect(state.setBaseBranch).not.toHaveBeenCalled()
      expect(mocks.toast).not.toHaveBeenCalled()
    }
  )

  it('invalidates pending MR resolution when selecting an issue', async () => {
    const old = pending()
    mocks.resolve.mockReturnValueOnce(old.promise)
    const state = input()
    const { result } = renderHook(() => useGitLabProviderSelection(state))
    act(() => result.current.handleSmartGitLabItemSelect(item(1)))
    act(() => result.current.handleSmartGitLabItemSelect(item(2, 'issue')))
    await act(async () => old.resolve({ baseBranch: 'old-head' }))
    expect(state.handleBaseBranchMrSelect).not.toHaveBeenCalled()
  })
})
