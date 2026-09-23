import { describe, expect, it } from 'vitest'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  readMobileBacklogConversationOptions,
  selectMobileBacklogProjectWorkspaces
} from './mobile-backlog-task-options'

function workspace(
  worktreeId: string,
  repoId: string,
  hostId: Worktree['hostId'] = 'local'
): Worktree {
  return {
    worktreeId,
    repoId,
    hostId,
    repo: repoId,
    branch: worktreeId,
    displayName: worktreeId,
    path: `/repo/${worktreeId}`,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null
  }
}

describe('mobile Backlog task options', () => {
  it('offers only same-project workspaces on the same execution host', () => {
    const source = workspace('wt-1', 'repo-1', 'ssh:one')
    const sibling = workspace('wt-2', 'repo-1', 'ssh:one')
    const otherHost = workspace('wt-3', 'repo-1', 'ssh:two')
    const otherProject = workspace('wt-4', 'repo-2', 'ssh:one')

    expect(
      selectMobileBacklogProjectWorkspaces('wt-1', [source, sibling, otherHost, otherProject]).map(
        (row) => row.worktreeId
      )
    ).toEqual(['wt-1', 'wt-2'])
  })

  it('keeps a folder project scoped to its own workspace identity', () => {
    const source = {
      ...workspace('folder:one', 'folder-workspace:group'),
      workspaceKind: 'folder-workspace' as const
    }
    const sibling = {
      ...workspace('folder:two', 'folder-workspace:group'),
      workspaceKind: 'folder-workspace' as const
    }
    expect(selectMobileBacklogProjectWorkspaces(source.worktreeId, [source, sibling])).toEqual([
      source
    ])
  })

  it('projects supported structured and terminal agent conversations', () => {
    const options = readMobileBacklogConversationOptions({
      tabs: [
        {
          type: 'agent-session',
          id: 'agent-session:s-1',
          title: 'Codex chat',
          sessionId: 's-1',
          agent: 'codex',
          isActive: false
        },
        {
          type: 'terminal',
          id: 'tab-1',
          title: 'Claude',
          terminal: 'term-1',
          launchAgent: 'claude',
          leafId: 'leaf-1',
          agentStatus: {
            agentType: 'claude',
            paneKey: 'tab-1:leaf-1',
            providerSession: { key: 'session_id', id: 'provider-1' }
          },
          isActive: false
        },
        { type: 'terminal', id: 'shell', title: 'Shell', terminal: 'term-2', isActive: false }
      ]
    })

    expect(options.map((option) => option.id)).toEqual(['structured:s-1', 'terminal:tab-1:leaf-1'])
    expect(options[1]).toMatchObject({
      terminalHandle: 'term-1',
      session: { providerSession: { id: 'provider-1' } }
    })
  })
})
