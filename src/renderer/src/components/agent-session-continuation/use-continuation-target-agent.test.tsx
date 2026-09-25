// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { useContinuationTargetAgent } from './use-continuation-target-agent'

const detect = vi.hoisted(() => vi.fn())
const launch = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  settings: { disabledTuiAgents: [] as string[] },
  worktrees: [{ id: 'wt-1', path: '/repo/one' }],
  folderWorkspaces: [] as FolderWorkspace[],
  allWorktrees: vi.fn(() => state.worktrees)
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (current: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
}))
vi.mock('@/lib/launch-agent-session-continuation', () => ({
  detectAgentSessionContinuationAgents: detect,
  launchAgentSessionContinuation: launch
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.settings.disabledTuiAgents = []
  state.worktrees = [{ id: 'wt-1', path: '/repo/one' }]
  state.folderWorkspaces = []
  detect.mockResolvedValue(['codex', 'claude'])
  launch.mockResolvedValue(true)
})

afterEach(cleanup)

describe('useContinuationTargetAgent', () => {
  it('starts with Codex and exposes detected enabled agents on the workspace host', async () => {
    state.settings.disabledTuiAgents = ['claude']
    const hook = renderHook(() =>
      useContinuationTargetAgent({ workspaceId: 'wt-1', enabled: true, identity: 'session-1' })
    )

    expect(hook.result.current.selectedAgent).toBe('codex')
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))
    expect(detect).toHaveBeenCalledWith('wt-1')
    expect(hook.result.current.agents).toEqual(['codex'])
  })

  it('launches in a folder workspace with its path and literal reference', async () => {
    state.folderWorkspaces = [
      {
        id: 'folder-1',
        projectGroupId: 'group-1',
        name: 'Folder',
        folderPath: '/remote/project',
        connectionId: 'ssh-1',
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ]
    const hook = renderHook(() =>
      useContinuationTargetAgent({ workspaceId: 'folder:folder-1', enabled: true, identity: 's1' })
    )
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))

    await act(async () => {
      await hook.result.current.launch('claude', '  reference text\n')
    })

    expect(detect).toHaveBeenCalledWith('folder:folder-1')
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        prompt: '  reference text\n',
        worktreeId: 'folder:folder-1',
        workspacePath: '/remote/project',
        initialCwd: '/remote/project'
      })
    )
  })

  it('throws when the workspace disappears before launch', async () => {
    const hook = renderHook(() =>
      useContinuationTargetAgent({ workspaceId: 'wt-1', enabled: true, identity: 's1' })
    )
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))
    state.worktrees = []

    await expect(hook.result.current.launch('codex')).rejects.toThrow(
      'The target workspace is no longer available.'
    )
    expect(launch).not.toHaveBeenCalled()
  })

  it('rejects a launch after the active conversation changes during availability checks', async () => {
    const hook = renderHook(
      ({ identity }) =>
        useContinuationTargetAgent({ workspaceId: 'wt-1', enabled: true, identity }),
      { initialProps: { identity: 's1' } }
    )
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))
    launch.mockImplementation(async ({ assertCurrent }: { assertCurrent: () => void }) => {
      hook.rerender({ identity: 's2' })
      assertCurrent()
      return true
    })

    await expect(hook.result.current.launch('codex')).rejects.toThrow(
      'The active conversation changed.'
    )
  })

  it('rejects a launch when the workspace moves to another path during availability checks', async () => {
    const hook = renderHook(() =>
      useContinuationTargetAgent({ workspaceId: 'wt-1', enabled: true, identity: 's1' })
    )
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))
    launch.mockImplementation(async ({ assertCurrent }: { assertCurrent: () => void }) => {
      state.worktrees = [{ id: 'wt-1', path: '/repo/other' }]
      assertCurrent()
      return true
    })

    await expect(hook.result.current.launch('codex')).rejects.toThrow(
      'The target workspace changed.'
    )
  })

  it('passes no prompt for an empty reference and reports launch refusal', async () => {
    const hook = renderHook(() =>
      useContinuationTargetAgent({ workspaceId: 'wt-1', enabled: true, identity: 's1' })
    )
    await waitFor(() => expect(hook.result.current.detecting).toBe(false))
    launch.mockResolvedValue(false)

    await expect(hook.result.current.launch('codex', '')).rejects.toThrow(
      'Could not start a new agent session'
    )
    expect(launch.mock.calls[0]?.[0]).not.toHaveProperty('prompt')
  })
})
