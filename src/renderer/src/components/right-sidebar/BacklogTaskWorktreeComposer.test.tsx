// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseComposerStateOptions } from '@/hooks/useComposerState'

const mock = vi.hoisted(() => ({
  composerOptions: null as UseComposerStateOptions | null,
  submitQuick: vi.fn(),
  retry: vi.fn()
}))

const sourceRepo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'Pinned project',
  badgeColor: 'gray',
  addedAt: 1,
  kind: 'git' as const,
  executionHostId: 'ssh:build' as const
}
const sourceWorktree = {
  id: 'workspace-1',
  repoId: 'repo-1',
  projectId: 'project-1',
  projectHostSetupId: 'setup-1',
  hostId: 'ssh:build' as const,
  path: '/repo/source'
}
const state = {
  worktreesByRepo: { 'repo-1': [sourceWorktree] },
  detectedWorktreesByRepo: { 'repo-1': { worktrees: [] as (typeof sourceWorktree)[] } },
  folderWorkspaces: [],
  repos: [sourceRepo],
  settings: null,
  projectHostSetups: [
    {
      id: 'setup-1',
      projectId: 'project-1',
      repoId: 'repo-1',
      hostId: 'ssh:build' as const,
      setupState: 'ready' as const,
      path: '/repo'
    }
  ]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/hooks/useComposerState', () => ({
  useComposerState: (options: UseComposerStateOptions) => {
    mock.composerOptions = options
    return {
      cardProps: {
        creating: false,
        createError: null,
        selectedRepoExecutionHostId: 'ssh:build'
      },
      composerRef: { current: null },
      onComposerNodeChange: vi.fn(),
      nameInputRef: { current: null },
      submitQuick: mock.submitQuick,
      createDisabled: false
    }
  }
}))
vi.mock('@/lib/worktree-creation-flow', () => ({
  retryBackgroundWorktreeCreation: mock.retry
}))
vi.mock('@/components/NewWorkspaceComposerCard', () => ({
  default: (props: {
    eligibleRepos: typeof state.repos
    repoId: string
    selectedRepoExecutionHostId?: string | null
    hideProjectSection?: boolean
    hideAgentSection?: boolean
    createError?: { message: string } | null
    onCreate: () => void
    cancelAction?: { onClick: () => void; disabled?: boolean }
  }) => (
    <div>
      <span data-testid="repo">{props.eligibleRepos.map((repo) => repo.id).join(',')}</span>
      <span data-testid="repo-id">{props.repoId}</span>
      <span data-testid="host">{props.selectedRepoExecutionHostId}</span>
      <span data-testid="locked">{String(props.hideProjectSection && props.hideAgentSection)}</span>
      {props.createError ? <p role="alert">{props.createError.message}</p> : null}
      <button onClick={props.onCreate}>Create</button>
      <button disabled={props.cancelAction?.disabled} onClick={props.cancelAction?.onClick}>
        Cancel
      </button>
    </div>
  )
}))

import { BacklogTaskWorktreeComposer } from './BacklogTaskWorktreeComposer'

const sourceRoute = {
  workspaceId: 'workspace-1',
  executionHostId: 'ssh:build' as const,
  runtimeEnvironmentId: null
}

describe('BacklogTaskWorktreeComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.composerOptions = null
    state.worktreesByRepo = { 'repo-1': [sourceWorktree] }
    state.detectedWorktreesByRepo = { 'repo-1': { worktrees: [] } }
  })
  afterEach(cleanup)

  it('uses a detected source checkout on the pinned host', () => {
    state.worktreesByRepo = { 'repo-1': [] }
    state.detectedWorktreesByRepo = { 'repo-1': { worktrees: [sourceWorktree] } }
    render(
      <BacklogTaskWorktreeComposer
        sourceRoute={sourceRoute}
        taskTitle="Fix the parser"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mock.composerOptions?.initialWorkspaceRunContext).toMatchObject({
      repoId: 'repo-1',
      hostId: 'ssh:build'
    })
  })

  it('pins the source target and creates without launching an agent', async () => {
    const onCreated = vi.fn()
    mock.submitQuick.mockImplementation(async () => {
      mock.composerOptions?.backgroundCreationCallbacks?.onQueued?.('creation-1')
    })

    render(
      <BacklogTaskWorktreeComposer
        sourceRoute={sourceRoute}
        taskTitle="Fix the parser"
        onCreated={onCreated}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByTestId('repo').textContent).toBe('repo-1')
    expect(screen.getByTestId('repo-id').textContent).toBe('repo-1')
    expect(screen.getByTestId('host').textContent).toBe('ssh:build')
    expect(screen.getByTestId('locked').textContent).toBe('true')
    expect(mock.composerOptions).toMatchObject({
      initialName: 'Fix the parser',
      initialRepoId: 'repo-1',
      repoIdOverride: 'repo-1',
      initialWorkspaceRunContext: {
        projectId: 'project-1',
        hostId: 'ssh:build',
        projectHostSetupId: 'setup-1',
        repoId: 'repo-1',
        path: '/repo'
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await act(async () => {})

    expect(mock.submitQuick).toHaveBeenCalledTimes(1)
    expect(mock.submitQuick).toHaveBeenCalledWith(null)
    expect(onCreated).not.toHaveBeenCalled()

    act(() => mock.composerOptions?.backgroundCreationCallbacks?.onCreated?.('workspace-created'))
    expect(onCreated).toHaveBeenCalledWith('workspace-created')
  })

  it('shows a failure and retries the queued creation once', async () => {
    const onCreated = vi.fn()
    const onFailed = vi.fn()
    mock.submitQuick.mockImplementation(async () => {
      mock.composerOptions?.backgroundCreationCallbacks?.onQueued?.('creation-1')
    })
    render(
      <BacklogTaskWorktreeComposer
        sourceRoute={sourceRoute}
        taskTitle="Fix the parser"
        onCreated={onCreated}
        onCancel={vi.fn()}
        onFailed={onFailed}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await act(async () => {})
    act(() => mock.composerOptions?.backgroundCreationCallbacks?.onFailed?.('create failed'))

    expect(screen.getByRole('alert').textContent).toBe('create failed')
    expect(onFailed).toHaveBeenCalledWith('create failed')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(mock.submitQuick).toHaveBeenCalledTimes(1)
    expect(mock.retry).toHaveBeenCalledTimes(1)
    expect(mock.retry).toHaveBeenCalledWith('creation-1', expect.any(Object))
    const retryCallbacks = mock.retry.mock.calls[0]?.[1]
    act(() => retryCallbacks?.onCreated?.('workspace-retried'))
    expect(onCreated).toHaveBeenCalledWith('workspace-retried')
  })
})
