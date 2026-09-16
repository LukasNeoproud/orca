import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import type { BrowserBackend } from '../browser/browser-backend'
import {
  collectHeadlessBacklogBoardWorktreeIds,
  forgetHeadlessBacklogBoardPage,
  getHeadlessBacklogBoardBinding,
  rememberHeadlessBacklogBoardPage,
  restoreHeadlessBacklogBoardPages
} from './headless-backlog-board-pages'

const binding = {
  workspaceId: 'repo::folder',
  executionHostId: 'local' as const,
  runtimeEnvironmentId: null
}

function session(): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {}
  }
}

describe('headless Backlog board pages', () => {
  it('finds board-only folder rows without terminal tabs', () => {
    const stored = session()
    stored.headlessBacklogBoardPagesByWorktree = {
      'folder:board-only': [{ browserPageId: 'board-a', backlogBoardBinding: binding }]
    }
    expect([...collectHeadlessBacklogBoardWorktreeIds([stored])]).toEqual(['folder:board-only'])
  })

  it('persists only binding and identity, restores blank, and retires the record', async () => {
    const owner = {}
    let stored = session()
    const getSession = () => stored
    const setSession = (_id: string, value: WorkspaceSessionState): void => {
      stored = value
    }
    rememberHeadlessBacklogBoardPage(
      owner,
      'repo::folder',
      {
        browserPageId: 'board-a',
        browserProfileId: 'profile-a',
        backlogBoardBinding: binding
      },
      getSession,
      setSession
    )
    expect(stored.headlessBacklogBoardPagesByWorktree?.['repo::folder']).toEqual([
      {
        browserPageId: 'board-a',
        browserProfileId: 'profile-a',
        backlogBoardBinding: binding
      }
    ])

    const nextOwner = {}
    const createTab = vi.fn(async () => ({ browserPageId: 'board-a' }))
    const notify = vi.fn()
    await restoreHeadlessBacklogBoardPages(
      nextOwner,
      { createTab, closeTab: vi.fn() } satisfies BrowserBackend,
      ['repo::folder'],
      getSession,
      notify
    )
    expect(createTab).toHaveBeenCalledWith({
      browserPageId: 'board-a',
      worktreeId: 'repo::folder',
      profileId: 'profile-a',
      url: 'about:blank'
    })
    expect(getHeadlessBacklogBoardBinding(nextOwner, 'board-a')).toEqual(binding)
    expect(notify).toHaveBeenCalledWith('repo::folder')

    forgetHeadlessBacklogBoardPage(nextOwner, 'repo::folder', 'board-a', getSession, setSession)
    expect(stored.headlessBacklogBoardPagesByWorktree).toEqual({})
    expect(getHeadlessBacklogBoardBinding(nextOwner, 'board-a')).toBeUndefined()
  })
})
