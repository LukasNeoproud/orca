import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import {
  classifyRememberedAiVaultTerminalOwner,
  findQueuedAiVaultSessionTerminal
} from './ai-vault-session-terminal-owner'

function state(): AppState {
  return {
    tabsByWorktree: {
      local: [{ id: 'local-tab' }],
      remote: [{ id: 'remote-tab' }],
      claimed: [{ id: 'claimed-tab' }]
    },
    pendingStartupByTabId: {
      'local-tab': {
        command: 'codex resume shared-id',
        launchAgent: 'codex',
        resumeProviderSession: { key: 'session_id', id: 'shared-id' }
      },
      'remote-tab': {
        command: 'codex resume shared-id',
        launchAgent: 'codex',
        resumeProviderSession: { key: 'session_id', id: 'shared-id' }
      }
    },
    automaticAgentResumeClaimsByTabId: {
      'claimed-tab': {
        worktreeId: 'claimed',
        launchAgent: 'claude',
        providerSession: { key: 'session_id', id: 'claimed-id' }
      }
    },
    terminalLayoutsByTabId: {},
    sshConnectionStates: new Map(),
    worktreesByRepo: {
      repo: [
        { id: 'local', repoId: 'repo', path: '/local', hostId: 'local' },
        { id: 'remote', repoId: 'repo', path: '/remote', hostId: 'ssh:remote' },
        { id: 'claimed', repoId: 'repo', path: '/claimed', hostId: 'local' }
      ]
    },
    detectedWorktreesByRepo: {},
    repos: [{ id: 'repo', path: '/repo' }],
    folderWorkspaces: [],
    projectGroups: [],
    activeWorktreeId: null,
    activeWorkspaceExecutionHostId: null
  } as unknown as AppState
}

describe('findQueuedAiVaultSessionTerminal', () => {
  it('finds a pending provider resume only on the session execution host', () => {
    expect(
      findQueuedAiVaultSessionTerminal(state(), {
        agent: 'codex',
        executionHostId: 'ssh:remote',
        sessionId: 'shared-id'
      })
    ).toEqual({ workspaceId: 'remote', tabId: 'remote-tab' })
  })

  it('finds an automatic resume claim after its pending startup was consumed', () => {
    expect(
      findQueuedAiVaultSessionTerminal(state(), {
        agent: 'claude',
        executionHostId: 'local',
        sessionId: 'claimed-id'
      })
    ).toEqual({ workspaceId: 'claimed', tabId: 'claimed-tab' })
  })
})

describe('classifyRememberedAiVaultTerminalOwner', () => {
  it('treats an authoritative shell return as exited', () => {
    const current = state()
    current.terminalLayoutsByTabId = {
      'local-tab': {
        root: { type: 'leaf', leafId: '11111111-1111-4111-8111-111111111111' },
        activeLeafId: '11111111-1111-4111-8111-111111111111',
        expandedLeafId: null
      }
    }
    current.paneForegroundAgentByPaneKey = {
      'local-tab:11111111-1111-4111-8111-111111111111': {
        agent: null,
        shellForeground: true
      }
    }
    current.ptyIdsByTabId = { 'local-tab': ['pty-1'] }

    expect(
      classifyRememberedAiVaultTerminalOwner(current, 'local', {
        workspaceId: 'local',
        tabId: 'local-tab'
      })
    ).toBe('exited')
  })

  it('keeps an existing startup tab with an empty PTY binding unverifiable', () => {
    const current = state()
    current.paneForegroundAgentByPaneKey = {}
    current.ptyIdsByTabId = { 'local-tab': [] }

    expect(
      classifyRememberedAiVaultTerminalOwner(current, 'local', {
        workspaceId: 'local',
        tabId: 'local-tab'
      })
    ).toBe('unverifiable')
  })

  it('keeps stale remote shell evidence unverifiable while disconnected', () => {
    const current = state()
    const leafId = '11111111-1111-4111-8111-111111111111'
    current.terminalLayoutsByTabId = {
      'remote-tab': {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null
      }
    }
    current.paneForegroundAgentByPaneKey = {
      [`remote-tab:${leafId}`]: { agent: null, shellForeground: true }
    }
    current.ptyIdsByTabId = { 'remote-tab': [] }
    current.sshConnectionStates = new Map([['remote', { status: 'disconnected' } as never]])

    expect(
      classifyRememberedAiVaultTerminalOwner(current, 'ssh:remote', {
        workspaceId: 'remote',
        tabId: 'remote-tab'
      })
    ).toBe('unverifiable')
  })

  it('does not use one sibling shell pane as proof that the target agent exited', () => {
    const current = state()
    const shellLeaf = '11111111-1111-4111-8111-111111111111'
    const unknownLeaf = '22222222-2222-4222-8222-222222222222'
    current.terminalLayoutsByTabId = {
      'local-tab': {
        root: {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', leafId: shellLeaf },
          second: { type: 'leaf', leafId: unknownLeaf },
          ratio: 0.5
        },
        activeLeafId: unknownLeaf,
        expandedLeafId: null
      }
    }
    current.paneForegroundAgentByPaneKey = {
      [`local-tab:${shellLeaf}`]: { agent: null, shellForeground: true }
    }

    expect(
      classifyRememberedAiVaultTerminalOwner(current, 'local', {
        workspaceId: 'local',
        tabId: 'local-tab'
      })
    ).toBe('unverifiable')
  })
})
