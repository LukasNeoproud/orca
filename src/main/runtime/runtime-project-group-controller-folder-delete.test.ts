import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeProjectGroupController } from './runtime-project-group-controller'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import { releaseBacklogWorkspace } from '../backlog-runtime/backlog-runtime-service'

vi.mock('../backlog-runtime/backlog-runtime-service', () => ({
  releaseBacklogWorkspace: vi.fn(async () => undefined)
}))

const workspace = {
  id: 'ws-1',
  projectGroupId: 'group-1',
  folderPath: '/tmp/ws'
} as FolderWorkspace

function createController(
  resolveFolderConnectionId: (workspace: FolderWorkspace) => string | null
) {
  const removeFolderWorkspace = vi.fn(() => true)
  const teardownFolderWorkspacePtys = vi.fn(async () => undefined)
  const cleanupRemovedFolderWorkspaceState = vi.fn()
  const notifyReposChanged = vi.fn()
  const controller = new RuntimeProjectGroupController({
    getStore: () => ({ getFolderWorkspaces: () => [workspace], removeFolderWorkspace }) as never,
    resolveRepo: async () => {
      throw new Error('unused')
    },
    notifyReposChanged,
    resolveFolderConnectionId,
    teardownFolderWorkspacePtys,
    cleanupRemovedFolderWorkspaceState
  })
  return {
    controller,
    removeFolderWorkspace,
    teardownFolderWorkspacePtys,
    cleanupRemovedFolderWorkspaceState,
    notifyReposChanged
  }
}

describe('RuntimeProjectGroupController.deleteFolderWorkspace', () => {
  it('tears down PTYs and runtime state before removing the catalog row', async () => {
    const deps = createController(() => 'ssh-1')

    await expect(deps.controller.deleteFolderWorkspace('ws-1')).resolves.toEqual({ deleted: true })

    expect(deps.teardownFolderWorkspacePtys).toHaveBeenCalledWith('folder:ws-1', 'ssh-1')
    expect(deps.cleanupRemovedFolderWorkspaceState).toHaveBeenCalledWith('folder:ws-1')
    expect(deps.teardownFolderWorkspacePtys.mock.invocationCallOrder[0]).toBeLessThan(
      deps.removeFolderWorkspace.mock.invocationCallOrder[0]!
    )
    expect(deps.notifyReposChanged).toHaveBeenCalledTimes(1)
  })

  it('still deletes when the folder host is ambiguous, skipping only the PTY sweep', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const deps = createController(() => {
      throw new Error('folder_workspace_connection_ambiguous')
    })

    await expect(deps.controller.deleteFolderWorkspace('ws-1')).resolves.toEqual({ deleted: true })

    expect(deps.teardownFolderWorkspacePtys).not.toHaveBeenCalled()
    expect(deps.cleanupRemovedFolderWorkspaceState).toHaveBeenCalledWith('folder:ws-1')
    expect(deps.removeFolderWorkspace).toHaveBeenCalledWith('ws-1')
    warn.mockRestore()
  })
})

describe('RuntimeProjectGroupController.updateFolderWorkspace', () => {
  it('stops Backlog for the old folder path before changing the catalog row', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'orca-backlog-folder-'))
    const nextPath = await mkdtemp(join(parent, 'next-'))
    const old = { ...workspace, folderPath: parent }
    const updateFolderWorkspace = vi.fn(() => ({ ...old, folderPath: nextPath }))
    const controller = new RuntimeProjectGroupController({
      getStore: () =>
        ({
          getFolderWorkspaces: () => [old],
          getProjectGroups: () => [],
          getRepos: () => [],
          updateFolderWorkspace
        }) as never,
      resolveRepo: async () => {
        throw new Error('unused')
      },
      notifyReposChanged: vi.fn(),
      resolveFolderConnectionId: () => null,
      teardownFolderWorkspacePtys: vi.fn(),
      cleanupRemovedFolderWorkspaceState: vi.fn()
    })
    try {
      await controller.updateFolderWorkspace(old.id, { folderPath: nextPath })
      expect(releaseBacklogWorkspace).toHaveBeenCalledWith('folder:ws-1')
      expect(vi.mocked(releaseBacklogWorkspace).mock.invocationCallOrder.at(-1)).toBeLessThan(
        updateFolderWorkspace.mock.invocationCallOrder[0]!
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('keeps the old path when stopping its remote Backlog service is unverifiable', async () => {
    const nextPath = await mkdtemp(join(tmpdir(), 'orca-backlog-next-'))
    const updateFolderWorkspace = vi.fn()
    const controller = new RuntimeProjectGroupController({
      getStore: () =>
        ({
          getFolderWorkspaces: () => [workspace],
          getProjectGroups: () => [],
          getRepos: () => [],
          updateFolderWorkspace
        }) as never,
      resolveRepo: async () => {
        throw new Error('unused')
      },
      notifyReposChanged: vi.fn(),
      resolveFolderConnectionId: () => null,
      teardownFolderWorkspacePtys: vi.fn(),
      cleanupRemovedFolderWorkspaceState: vi.fn()
    })
    vi.mocked(releaseBacklogWorkspace).mockRejectedValueOnce(
      new Error('backlog_ssh_connection_unverifiable')
    )
    try {
      await expect(
        controller.updateFolderWorkspace(workspace.id, { folderPath: nextPath })
      ).rejects.toThrow('backlog_ssh_connection_unverifiable')
      expect(updateFolderWorkspace).not.toHaveBeenCalled()
    } finally {
      await rm(nextPath, { recursive: true, force: true })
    }
  })
})
