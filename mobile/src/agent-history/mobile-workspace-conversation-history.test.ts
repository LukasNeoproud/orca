import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { ExecutionHostId } from '../../../src/shared/execution-host'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  buildMobileWorkspaceConversationHistory,
  mobileWorkspaceHistoryIdentity
} from './mobile-workspace-conversation-history'

function worktree(worktreeId: string, path: string, hostId: ExecutionHostId): Worktree {
  return { worktreeId, path, hostId, repoId: 'repo' } as Worktree
}

function session(
  id: string,
  cwd: string,
  hostId: ExecutionHostId,
  updatedAt = '2026-01-01T00:00:00Z'
): AiVaultSession {
  return {
    id,
    cwd,
    executionHostId: hostId,
    updatedAt,
    modifiedAt: updatedAt,
    subagent: null
  } as AiVaultSession
}

describe('mobile workspace conversation history', () => {
  it('keeps same-id workspaces on different hosts apart and assigns nested paths to the nearest workspace', () => {
    const local = worktree('same', '/repo', 'local')
    const child = worktree('child', '/repo/child', 'local')
    const remote = worktree('same', '/repo', 'ssh:remote')
    const result = buildMobileWorkspaceConversationHistory(
      [local, child, remote],
      new Map([
        [
          'local',
          [session('local', '/repo/src', 'local'), session('child', '/repo/child/src', 'local')]
        ],
        ['ssh:remote', [session('remote', '/repo/src', 'ssh:remote')]]
      ])
    )
    expect(result.get(mobileWorkspaceHistoryIdentity(local))?.map((entry) => entry.id)).toEqual([
      'local'
    ])
    expect(result.get(mobileWorkspaceHistoryIdentity(child))?.map((entry) => entry.id)).toEqual([
      'child'
    ])
    expect(result.get(mobileWorkspaceHistoryIdentity(remote))?.map((entry) => entry.id)).toEqual([
      'remote'
    ])
  })

  it('keeps five most recent top-level sessions and excludes live structured owners', () => {
    const folder = worktree('folder', '/folder', 'local')
    folder.workspaceKind = 'folder-workspace'
    const sessions = Array.from({ length: 7 }, (_, index) =>
      session(`session-${index}`, '/folder', 'local', `2026-01-0${index + 1}T00:00:00Z`)
    )
    sessions.push({
      ...session('subagent', '/folder', 'local'),
      subagent: { parentSessionId: 'x' }
    } as AiVaultSession)
    sessions.push({
      ...session('owned', '/folder', 'local'),
      structuredSession: { sessionId: 'x', workspaceId: 'folder', ownerState: 'live' }
    })
    const result = buildMobileWorkspaceConversationHistory([folder], new Map([['local', sessions]]))
    expect(result.get(mobileWorkspaceHistoryIdentity(folder))?.map((entry) => entry.id)).toEqual([
      'session-6',
      'session-5',
      'session-4',
      'session-3',
      'session-2'
    ])
  })
})
