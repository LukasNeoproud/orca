import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import {
  isCodexConversationContinuationBusy,
  prepareCodexConversationContinuationSource
} from './codex-conversation-continuation-source'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const state = {
  agentStatusByPaneKey: {} as Record<string, unknown>,
  runtimePaneTitlesByTabId: {} as Record<string, Record<number, string>>,
  tabsByWorktree: {},
  repos: [],
  worktreesByRepo: {},
  detectedWorktreesByRepo: {},
  folderWorkspaces: []
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/lib/connection-context', () => ({
  getConnectionIdFromState: vi.fn(() => null)
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: vi.fn(() => null)
}))

function pane(): ManagedPane {
  return { id: 4, leafId: LEAF_ID } as ManagedPane
}

describe('prepareCodexConversationContinuationSource', () => {
  beforeEach(() => {
    state.agentStatusByPaneKey = {
      [`tab-1:${LEAF_ID}`]: {
        agentType: 'codex',
        providerSession: {
          key: 'session_id',
          id: 'thread-1',
          transcriptPath: '/home/u/.codex/rollout.jsonl'
        }
      }
    }
    state.runtimePaneTitlesByTabId = {}
  })

  it('uses the local target for a locally owned Codex pane', () => {
    expect(
      prepareCodexConversationContinuationSource({
        pane: pane(),
        tabId: 'tab-1',
        worktreeId: 'wt-1'
      })
    ).toEqual({
      paneId: 4,
      paneKey: `tab-1:${LEAF_ID}`,
      providerSessionId: 'thread-1',
      transcriptPath: '/home/u/.codex/rollout.jsonl',
      workspaceId: 'wt-1',
      target: { kind: 'local' }
    })
  })

  it('does not turn an SSH pane into a local app-server call', async () => {
    const { getConnectionIdFromState } = await import('@/lib/connection-context')
    ;(getConnectionIdFromState as ReturnType<typeof vi.fn>).mockReturnValueOnce('ssh-target')

    expect(
      prepareCodexConversationContinuationSource({
        pane: pane(),
        tabId: 'tab-1',
        worktreeId: 'wt-1'
      })
    ).toBeNull()
  })

  it('uses the execution runtime when one owns the pane', async () => {
    const { getRuntimeEnvironmentIdForWorktree } = await import('@/lib/worktree-runtime-owner')
    ;(getRuntimeEnvironmentIdForWorktree as ReturnType<typeof vi.fn>).mockReturnValueOnce('env-1')

    expect(
      prepareCodexConversationContinuationSource({
        pane: pane(),
        tabId: 'tab-1',
        worktreeId: 'wt-1'
      })?.target
    ).toEqual({ kind: 'environment', environmentId: 'env-1' })
  })

  it('blocks switching for either a live hook turn or a live TUI title', () => {
    expect(
      isCodexConversationContinuationBusy(state as never, { pane: pane(), tabId: 'tab-1' })
    ).toBe(false)

    state.agentStatusByPaneKey[`tab-1:${LEAF_ID}`] = {
      agentType: 'codex',
      state: 'working'
    }
    expect(
      isCodexConversationContinuationBusy(state as never, { pane: pane(), tabId: 'tab-1' })
    ).toBe(true)

    state.agentStatusByPaneKey[`tab-1:${LEAF_ID}`] = { agentType: 'codex', state: 'done' }
    state.runtimePaneTitlesByTabId = { 'tab-1': { 4: 'Codex working' } }
    expect(
      isCodexConversationContinuationBusy(state as never, { pane: pane(), tabId: 'tab-1' })
    ).toBe(true)
  })
})
