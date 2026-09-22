import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toAppSshPtyId } from '../../../shared/ssh-pty-id'
import { toRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
const state = vi.hoisted(() => ({
  agentStatusByPaneKey: {} as Record<
    string,
    {
      agentType: string
      worktreeId: string
      providerSession: { id: string; transcriptPath?: string }
    }
  >,
  tabsByWorktree: {} as Record<string, { id: string }[]>,
  terminalLayoutsByTabId: {} as Record<string, { ptyIdsByLeafId: Record<string, string> }>
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
import { findPortableConversationTerminalTarget } from './portable-conversation-terminal-target'
const source: PortableConversationSource = {
  executionHostId: 'ssh:host',
  workspace: { id: 'folder:one', path: '/work', kind: 'folder' },
  provider: { agent: 'codex', sessionId: 'provider' },
  transcriptPath: '/history.jsonl'
}
describe('portable result terminal identity', () => {
  beforeEach(() => {
    state.agentStatusByPaneKey = {
      'tab:00000000-0000-4000-8000-000000000001': {
        agentType: 'codex',
        worktreeId: 'folder:one',
        providerSession: { id: 'provider', transcriptPath: '/history.jsonl' }
      }
    }
    state.tabsByWorktree = { 'folder:one': [{ id: 'tab' }] }
    state.terminalLayoutsByTabId = {
      tab: {
        ptyIdsByLeafId: { '00000000-0000-4000-8000-000000000001': toAppSshPtyId('host', 'pty') }
      }
    }
  })
  it('selects the exact source provider on its SSH execution host', () => {
    expect(findPortableConversationTerminalTarget({ kind: 'local' }, source)).toEqual({
      tabId: 'tab',
      leafId: '00000000-0000-4000-8000-000000000001'
    })
  })
  it.each(['other', 'local'])('rejects a reused pane with the same provider ID on %s', (host) => {
    state.terminalLayoutsByTabId.tab.ptyIdsByLeafId['00000000-0000-4000-8000-000000000001'] =
      host === 'local' ? 'local-pty' : toAppSshPtyId(host, 'pty')
    expect(findPortableConversationTerminalTarget({ kind: 'local' }, source)).toBeNull()
  })
  it('does not borrow a paired terminal from another runtime', () => {
    state.terminalLayoutsByTabId.tab.ptyIdsByLeafId['00000000-0000-4000-8000-000000000001'] =
      toRemoteRuntimePtyId('handle', 'peer')
    expect(
      findPortableConversationTerminalTarget(
        { kind: 'environment', environmentId: 'other' },
        source
      )
    ).toBeNull()
    expect(findPortableConversationTerminalTarget({ kind: 'local' }, source)).toBeNull()
    expect(
      findPortableConversationTerminalTarget({ kind: 'environment', environmentId: 'peer' }, source)
    ).toEqual({ tabId: 'tab', leafId: '00000000-0000-4000-8000-000000000001' })
  })
  it.each(['path', 'provider', 'agent', 'workspace', 'tab'])(
    'rejects mismatching %s evidence',
    (field) => {
      const status = state.agentStatusByPaneKey['tab:00000000-0000-4000-8000-000000000001']
      if (field === 'path') {
        status.providerSession.transcriptPath = '/different.jsonl'
      }
      if (field === 'provider') {
        status.providerSession.id = 'different'
      }
      if (field === 'agent') {
        status.agentType = 'claude'
      }
      if (field === 'workspace') {
        status.worktreeId = 'folder:other'
      }
      if (field === 'tab') {
        state.tabsByWorktree = {}
      }
      expect(findPortableConversationTerminalTarget({ kind: 'local' }, source)).toBeNull()
    }
  )
})
