import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { RpcClient } from '../transport/rpc-client'
import type { Worktree } from '../worktree/workspace-list-types'
import type { ActionSheetAction } from '../components/ActionSheetModal'

let sheetProps: { actions: ActionSheetAction[]; message?: string } | null = null
vi.mock('lucide-react-native', () => ({
  FileText: () => null,
  Link: () => null,
  Minimize2: () => null,
  RotateCcw: () => null
}))
vi.mock('../components/ActionSheetModal', () => ({
  ActionSheetModal: (props: { actions: ActionSheetAction[]; message?: string }) => {
    sheetProps = props
    return null
  }
}))

import { MobileAgentHistoryContinuationSheet } from './MobileAgentHistoryContinuationSheet'

const SESSION: AiVaultSession = {
  id: 'codex:source-thread',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'source-thread',
  title: 'History',
  cwd: '/repo',
  branch: 'main',
  model: null,
  filePath: '/home/ada/.codex/sessions/source-thread.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-09-23T00:00:00.000Z',
  messageCount: 1,
  totalTokens: 1,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: '',
  subagent: null
}

const WORKTREE = {
  repoId: 'repo-1',
  worktreeId: 'workspace-1',
  path: '/repo',
  hostId: 'local',
  terminalPlatform: 'linux'
} as Worktree

describe('MobileAgentHistoryContinuationSheet', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    sheetProps = null
  })

  it('clearly presents original, compacted, reference, and clean continuation choices', async () => {
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'repo.list') {
        return { ok: true, result: { repos: [{ id: 'repo-1', executionHostId: 'local' }] } }
      }
      if (method === 'worktree.ps') {
        return { ok: true, result: { worktrees: [WORKTREE] } }
      }
      if (method === 'conversationContinuation.inspect') {
        return {
          ok: true,
          result: {
            source: { providerSessionId: 'source-thread', workspaceId: 'workspace-1' },
            checkpoint: {
              lastTurnId: 'turn-1',
              completedAt: '2026-09-23T00:00:00.000Z',
              revision: 'revision-1'
            },
            candidate: null,
            autoCompact: false
          }
        }
      }
      return { ok: true, result: {} }
    })

    await act(async () => {
      renderer = create(
        createElement(MobileAgentHistoryContinuationSheet, {
          session: SESSION,
          client: { sendRequest } as unknown as RpcClient,
          hostId: 'host-a',
          hostCapabilities: [],
          hostPlatform: 'linux',
          hostTerminalWindowsShell: null,
          activeWorktreeId: 'workspace-1',
          worktrees: [WORKTREE],
          terminalMutationRegistry: { claim: () => 'id', releaseOnSuccess: () => undefined },
          onClose: vi.fn(),
          onOpened: vi.fn(),
          onUnavailable: vi.fn()
        })
      )
    })
    await vi.waitFor(() => expect(sheetProps?.actions[0]?.disabled).toBe(false))

    expect(sheetProps?.actions.map(({ label, hint }) => ({ label, hint }))).toEqual([
      {
        label: 'Continue Original',
        hint: 'Open the existing conversation with its full context.'
      },
      {
        label: 'Compact a Copy',
        hint: 'Continue from a prepared compact context. The original stays in history.'
      },
      {
        label: 'New with Reference',
        hint: 'Start clean with a reference to the original conversation.'
      },
      {
        label: 'New Conversation',
        hint: 'Start without prior context. The original stays in history.'
      }
    ])
  })
})
