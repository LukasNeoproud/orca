import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePortableConversationWorkspace } from './portable-conversation-workspace'

const runtime = { showManagedTerminalWorkspace: vi.fn(), listRepos: vi.fn() }
describe('portable SSH conversation workspace ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('resolves a folder by its workspace identity without consulting Git metadata', async () => {
    runtime.showManagedTerminalWorkspace.mockResolvedValue({
      id: 'folder:one',
      path: '/srv/project',
      hostId: 'ssh:host',
      repoId: ''
    })
    const result = await resolvePortableConversationWorkspace(runtime, 'folder:one', 'ssh:host')
    expect(result).toEqual({
      workspaceId: 'folder:one',
      path: '/srv/project',
      kind: 'folder',
      executionHostId: 'ssh:host',
      connectionId: 'host',
      projectId: 'folder:one'
    })
    expect(runtime.listRepos).not.toHaveBeenCalled()
    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('id:folder:one')
  })
  it('does not alias separate folder projects at the same path', async () => {
    runtime.showManagedTerminalWorkspace.mockImplementation(async (selector: string) => ({
      id: selector.slice(3),
      path: '/srv/project',
      hostId: 'ssh:host',
      repoId: ''
    }))
    const first = await resolvePortableConversationWorkspace(runtime, 'folder:one', 'ssh:host')
    const second = await resolvePortableConversationWorkspace(runtime, 'folder:two', 'ssh:host')
    expect(first.projectId).not.toBe(second.projectId)
  })
  it('uses the existing host-qualified repository lookup for a git worktree', async () => {
    runtime.showManagedTerminalWorkspace.mockResolvedValue({
      id: 'repo::/srv/work',
      path: '/srv/work',
      hostId: 'ssh:remote',
      repoId: 'repo'
    })
    runtime.listRepos.mockReturnValue([
      { id: 'repo', executionHostId: 'local' },
      { id: 'repo', executionHostId: 'ssh:remote' }
    ])
    expect(
      await resolvePortableConversationWorkspace(runtime, 'repo::/srv/work', 'ssh:remote')
    ).toMatchObject({
      executionHostId: 'ssh:remote',
      connectionId: 'remote',
      kind: 'git-worktree',
      projectId: 'repo:repo'
    })
  })
  it('refuses a local or paired host instead of interpreting it as a direct SSH target', async () => {
    for (const host of ['local', 'runtime:peer']) {
      await expect(
        resolvePortableConversationWorkspace(runtime, 'folder:one', host)
      ).rejects.toThrow('requires_ssh_owner')
    }
    expect(runtime.showManagedTerminalWorkspace).not.toHaveBeenCalled()
  })
  it('refuses a same-named folder belonging to another host', async () => {
    runtime.showManagedTerminalWorkspace.mockResolvedValue({
      id: 'folder:one',
      path: '/srv/project',
      hostId: 'ssh:other',
      repoId: ''
    })
    await expect(
      resolvePortableConversationWorkspace(runtime, 'folder:one', 'ssh:host')
    ).rejects.toThrow('execution_owner_mismatch')
  })
  it('never guesses the owner of a worktree whose repository disappeared', async () => {
    runtime.showManagedTerminalWorkspace.mockResolvedValue({
      id: 'repo::/srv/work',
      path: '/srv/work',
      repoId: 'repo'
    })
    runtime.listRepos.mockReturnValue([])
    await expect(
      resolvePortableConversationWorkspace(runtime, 'repo::/srv/work', 'ssh:host')
    ).rejects.toThrow('execution_owner_mismatch')
  })
})
