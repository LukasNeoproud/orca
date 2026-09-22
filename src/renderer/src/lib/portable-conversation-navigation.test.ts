import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationBranchRecord } from '../../../shared/portable-conversation-branch'
import { toAppSshPtyId } from '../../../shared/ssh-pty-id'
import { toRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  read: vi.fn(),
  history: vi.fn(),
  complete: vi.fn(),
  resolve: vi.fn(),
  state: {
    terminalLayoutsByTabId: {} as Record<string, { ptyIdsByLeafId: Record<string, string> }>,
    agentStatusByPaneKey: {} as Record<string, { providerSession: { id: string } }>
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('./workspace-conversation-activation', () => ({
  activateConversationTerminal: mocks.activate
}))
vi.mock('./workspace-conversation-history', () => ({
  openWorkspaceConversationHistory: mocks.history
}))
vi.mock('./portable-conversation-source-client', () => ({
  readPortableConversationSession: mocks.read
}))
vi.mock('./portable-conversation-branch-client', () => ({
  branchCompleteStartPortableConversation: mocks.complete,
  resolvePortableConversationBranchTarget: mocks.resolve
}))
import {
  openPortableConversationBranch,
  portableConversationBranchTargetSource
} from './portable-conversation-navigation'
function fixture(ptyId = toAppSshPtyId('host', 'pty')): PortableConversationBranchRecord {
  return {
    branchId: 'branch',
    target: {
      agent: 'claude',
      terminal: {
        workspace: {
          workspaceId: 'folder:one',
          path: '/work',
          kind: 'folder',
          executionHostId: 'ssh:host'
        },
        launch: {
          attemptId: 'original',
          receipt: {
            tabId: 'tab',
            leafId: 'leaf',
            ptyId,
            providerSession: { id: 'provider', transcriptPath: '/history/session.jsonl' }
          }
        }
      }
    }
  } as unknown as PortableConversationBranchRecord
}
describe('portable conversation navigation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.terminalLayoutsByTabId = {}
    mocks.state.agentStatusByPaneKey = {}
    mocks.activate.mockReturnValue(true)
    mocks.read.mockResolvedValue({ sessionId: 'provider' })
    mocks.history.mockResolvedValue('restored')
  })
  it('activates the exact existing pane without reading history or launching', async () => {
    const branch = fixture()
    mocks.state.terminalLayoutsByTabId.tab = {
      ptyIdsByLeafId: { leaf: toAppSshPtyId('host', 'pty') }
    }
    mocks.state.agentStatusByPaneKey['tab:leaf'] = { providerSession: { id: 'provider' } }
    expect(await openPortableConversationBranch({ kind: 'local' }, branch)).toBe('activated')
    expect(mocks.history).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('uses verified owning-host metadata and the established safe history workflow', async () => {
    const branch = fixture()
    expect(await openPortableConversationBranch({ kind: 'local' }, branch)).toBe('restored')
    expect(mocks.read).toHaveBeenCalledWith(
      { kind: 'local' },
      portableConversationBranchTargetSource(branch)
    )
    const options = mocks.history.mock.calls[0][2]
    await options.onRestored(
      { kind: 'terminal', tabId: 'restored' },
      { tabId: 'restored', leafId: 'new-leaf' }
    )
    expect(mocks.complete).toHaveBeenCalledWith(
      { kind: 'local' },
      expect.objectContaining({
        branchId: 'branch',
        attemptId: 'original',
        outcome: expect.objectContaining({
          receipt: expect.objectContaining({
            tabId: 'restored',
            providerSession: { id: 'provider', transcriptPath: '/history/session.jsonl' }
          })
        })
      })
    )
  })
  it('resolves a missing transcript path on the owning runtime before restoring history', async () => {
    const branch = fixture()
    delete branch.target.terminal.launch!.receipt!.providerSession!.transcriptPath
    mocks.resolve.mockResolvedValue({ branch: fixture() })
    expect(await openPortableConversationBranch({ kind: 'local' }, branch)).toBe('restored')
    expect(mocks.resolve).toHaveBeenCalledWith({ kind: 'local' }, 'branch')
    expect(mocks.read).toHaveBeenCalledWith(
      { kind: 'local' },
      portableConversationBranchTargetSource(fixture())
    )
  })
  it('does not restore or launch when transcript identity resolution fails', async () => {
    const branch = fixture()
    delete branch.target.terminal.launch!.receipt!.providerSession!.transcriptPath
    mocks.resolve.mockRejectedValue(new Error('ambiguous history'))
    expect(await openPortableConversationBranch({ kind: 'local' }, branch)).toBe('unverifiable')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it('does not interpret disconnected SSH as absence or open a replacement', async () => {
    mocks.read.mockRejectedValue(new Error('disconnected'))
    expect(await openPortableConversationBranch({ kind: 'local' }, fixture())).toBe('unverifiable')
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it('never resolves a peer nested-SSH identity in the desktop namespace', async () => {
    const branch = fixture(toRemoteRuntimePtyId('terminal', 'other-peer'))
    mocks.state.terminalLayoutsByTabId.tab = {
      ptyIdsByLeafId: { leaf: branch.target.terminal.launch!.receipt!.ptyId! }
    }
    mocks.state.agentStatusByPaneKey['tab:leaf'] = { providerSession: { id: 'provider' } }
    expect(
      await openPortableConversationBranch({ kind: 'environment', environmentId: 'peer' }, branch)
    ).toBe('unverifiable')
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it('uses the verified existing source for an attached conversation without inventing a new session', () => {
    const branch = fixture()
    const existing = {
      executionHostId: 'ssh:host' as const,
      workspace: { id: 'folder:one', path: '/work', kind: 'folder' as const },
      provider: { agent: 'claude' as const, sessionId: 'existing' },
      transcriptPath: '/existing.jsonl'
    }
    branch.target.terminal.existingSource = existing
    branch.target.terminal.launch = null
    expect(portableConversationBranchTargetSource(branch)).toBe(existing)
  })
  it('refuses navigation-only terminal ids when no durable provider identity is available', async () => {
    const branch = fixture()
    delete branch.target.terminal.launch!.receipt!.providerSession
    expect(portableConversationBranchTargetSource(branch)).toBeNull()
    expect(await openPortableConversationBranch({ kind: 'local' }, branch)).toBe('unverifiable')
    expect(mocks.history).not.toHaveBeenCalled()
  })
})
