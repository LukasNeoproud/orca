// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSmartWorkspaceGithubSearch } from './use-smart-workspace-github-search'

type Foundation = Parameters<typeof useSmartWorkspaceGithubSearch>[0]['foundation']

function foundation(
  query: string,
  fetchWorkItems: ReturnType<typeof vi.fn>,
  onLookupError: ReturnType<typeof vi.fn>
): Foundation {
  return {
    debouncedQuery: query,
    disabled: false,
    handledCrossRepoUrlRef: { current: null },
    repoSlugCacheRef: { current: new Map() },
    repoBackedSearchTargets: [{ repo: { id: 'repo', path: '/repo' }, githubSourceContext: null }],
    repos: [],
    getCachedWorkItems: () => null,
    fetchWorkItems,
    fetchWorkItemsAcrossRepos: vi.fn(),
    setGithubItems: vi.fn(),
    setGithubLoading: vi.fn(),
    setOpen: vi.fn(),
    setCrossRepoPrompt: vi.fn(),
    onLookupError
  } as unknown as Foundation
}

describe('issue lookup error delivery', () => {
  it('reports lookup errors without changing the typed field', async () => {
    const error = vi.fn()
    const fetch = vi.fn().mockRejectedValue(new Error('Provider unavailable'))
    const input = foundation('issue text', fetch, error)
    renderHook(() =>
      useSmartWorkspaceGithubSearch({
        foundation: input,
        sourceQueryWithinLimit: true,
        shouldQueryGithub: true
      })
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(error).toHaveBeenCalledWith('Provider unavailable')
    expect(input.debouncedQuery).toBe('issue text')
  })
  it('does not publish errors from a superseded issue lookup', async () => {
    const error = vi.fn()
    let rejectOld!: (reason: Error) => void
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject
          })
      )
      .mockResolvedValue([])
    const { rerender } = renderHook(
      ({ input }) =>
        useSmartWorkspaceGithubSearch({
          foundation: input,
          sourceQueryWithinLimit: true,
          shouldQueryGithub: true
        }),
      { initialProps: { input: foundation('old', fetch, error) } }
    )
    rerender({ input: foundation('new', fetch, error) })
    await act(async () => {
      rejectOld(new Error('Old provider failure'))
      await Promise.resolve()
    })
    expect(error).not.toHaveBeenCalled()
  })
})
