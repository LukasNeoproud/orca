// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSimplifiedWorktreeForm } from './use-simplified-worktree-form'
import type { WorktreeCreationPreview } from '../../../../shared/worktree/explicit-creation'

const mocks = vi.hoisted(() => ({
  state: {
    repos: [
      {
        id: 'repo',
        executionHostId: 'local',
        worktreeBaseRef: 'configured',
        worktreeBasePath: undefined,
        simplifiedWorktreeLayout: undefined
      },
      {
        id: 'other',
        executionHostId: 'local',
        worktreeBaseRef: 'other-base',
        worktreeBasePath: '/custom',
        simplifiedWorktreeLayout: 'flat',
        simplifiedWorktreeLocation: 'orca-default'
      },
      {
        id: 'default',
        executionHostId: 'local',
        worktreeBasePath: undefined,
        simplifiedWorktreeLocation: 'orca-default'
      }
    ],
    settings: null
  },
  preview: vi.fn(),
  search: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/store/slices/worktrees/listing/worktree-owner-settings', () => ({
  settingsForRepoOwner: () => null
}))
vi.mock('@/runtime/runtime-repo-client', () => ({ searchRuntimeRepoBaseRefDetails: mocks.search }))
vi.mock('@/lib/simplified-worktree-preview', () => ({
  previewSimplifiedWorktree: mocks.preview,
  ignoreSimplifiedWorktreeLocally: vi.fn()
}))
const preview: WorktreeCreationPreview = {
  branch: { kind: 'new', name: 'feature/123' },
  baseBranch: 'refs/heads/master',
  path: '/repo/.worktrees/feature/123',
  destinationExists: false,
  needsLocalIgnore: false
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
}

describe('simplified worktree form', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.preview.mockReset().mockResolvedValue(preview)
    mocks.search.mockReset().mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('keeps naming links independent and resets each link', async () => {
    const { result } = renderHook(() =>
      useSimplifiedWorktreeForm({ enabled: true, repoId: 'repo', initialName: 'feature/123' })
    )
    expect(result.current.name).toBe('feature/123')
    act(() => result.current.setCustomName('worktree'))
    act(() => result.current.setBranch('feature/456'))
    expect(result.current.name).toBe('worktree')
    expect(result.current.displayName).toBe('worktree')
    act(() => result.current.setCustomLabel('My task'))
    act(() => result.current.setCustomName(null))
    expect(result.current.name).toBe('feature/456')
    expect(result.current.displayName).toBe('My task')
    act(() => result.current.setCustomLabel(null))
    expect(result.current.displayName).toBe('feature/456')
    await settle()
  })
  it('flattens only the destination and preserves explicit base/name edits', async () => {
    const { result } = renderHook(() =>
      useSimplifiedWorktreeForm({
        enabled: true,
        repoId: 'repo',
        initialName: 'feature/123',
        initialBaseBranch: 'explicit-base'
      })
    )
    expect(result.current.baseBranch).toBe('explicit-base')
    act(() => {
      result.current.setLayout('flat')
      result.current.setBase('other-base')
    })
    await settle()
    expect(mocks.preview).toHaveBeenLastCalledWith(
      'repo',
      {
        branch: { kind: 'new', name: 'feature/123' },
        destination: { root: '.worktrees', relativeDirectory: 'feature-123' }
      },
      'other-base',
      undefined
    )
    expect(result.current.name).toBe('feature/123')
    expect(result.current.displayName).toBe('feature/123')
  })
  it('takes project defaults when the project changes until customized', async () => {
    const { result, rerender } = renderHook(
      ({ repoId }) =>
        useSimplifiedWorktreeForm({ enabled: true, repoId, initialName: 'feature/123' }),
      { initialProps: { repoId: 'repo' } }
    )
    rerender({ repoId: 'other' })
    expect(result.current.root).toBe('/custom')
    expect(result.current.layout).toBe('flat')
    act(() => result.current.setLayout('nested'))
    rerender({ repoId: 'repo' })
    expect(result.current.layout).toBe('nested')
    await settle()
  })
  it('ignores stale preview responses and revalidates occupied branches at submission', async () => {
    let resolveOld!: (value: WorktreeCreationPreview) => void
    mocks.preview.mockImplementationOnce(
      () =>
        new Promise<WorktreeCreationPreview>((resolve) => {
          resolveOld = resolve
        })
    )
    const { result } = renderHook(() =>
      useSimplifiedWorktreeForm({ enabled: true, repoId: 'repo', initialName: 'old' })
    )
    await settle()
    act(() => result.current.setBranch('new'))
    await settle()
    await act(async () => resolveOld({ ...preview, path: '/stale' }))
    expect(result.current.preview?.path).toBe(preview.path)
    mocks.preview.mockResolvedValueOnce({
      ...preview,
      occupyingWorktree: { path: '/main', branch: 'new' }
    })
    let submitted: unknown
    await act(async () => {
      submitted = await result.current.validate()
    })
    expect(submitted).toBeNull()
    expect(result.current.disabled).toBe(true)
  })
  it('accepts late review bases until edited and submits the host-resolved local intent', async () => {
    const { result, rerender } = renderHook(
      ({ initialBaseBranch }) =>
        useSimplifiedWorktreeForm({
          enabled: true,
          repoId: 'repo',
          initialName: 'review-branch',
          initialBaseBranch
        }),
      { initialProps: { initialBaseBranch: undefined as string | undefined } }
    )
    rerender({ initialBaseBranch: 'refs/remotes/origin/review-branch' })
    expect(result.current.baseBranch).toBe('refs/remotes/origin/review-branch')
    act(() => {
      result.current.setBase('my-base')
      result.current.setBranch('my-name')
    })
    rerender({ initialBaseBranch: 'refs/remotes/origin/updated-review' })
    expect(result.current.baseBranch).toBe('my-base')
    expect(result.current.branch).toBe('my-name')
    await settle()
    mocks.preview.mockResolvedValueOnce({ ...preview, branch: { kind: 'local', name: 'my-name' } })
    let submission: Awaited<ReturnType<typeof result.current.validate>> = null
    await act(async () => {
      submission = await result.current.validate()
    })
    expect(submission).toMatchObject({
      explicitCreation: { branch: { kind: 'local', name: 'my-name' } }
    })
  })

  it('reopens a saved Orca default without adding the in-repository preset', async () => {
    const { result } = renderHook(() =>
      useSimplifiedWorktreeForm({ enabled: true, repoId: 'default', initialName: 'feature/123' })
    )
    expect(result.current.root).toBe('')
    await settle()
    expect(mocks.preview).toHaveBeenLastCalledWith(
      'default',
      {
        branch: { kind: 'new', name: 'feature/123' },
        destination: { relativeDirectory: 'feature/123' }
      },
      undefined,
      undefined
    )
  })

  it('does no preview work while the original form is selected', async () => {
    renderHook(() =>
      useSimplifiedWorktreeForm({ enabled: false, repoId: 'repo', initialName: 'feature/123' })
    )
    await settle()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
