import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  assertCapability: vi.fn(),
  refresh: vi.fn(),
  capabilities: [] as string[]
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mock.call,
  assertRuntimeEnvironmentCapability: mock.assertCapability
}))
vi.mock('@/runtime/local-runtime-capabilities', () => ({
  readLocalRuntimeCapabilitiesOrUnknown: () => mock.capabilities,
  refreshLocalRuntimeCapabilities: mock.refresh
}))
import {
  readPortableConversationPage,
  readPortableConversationContext
} from './portable-conversation-source-client'

const source: PortableConversationSource = {
  executionHostId: 'ssh:remote',
  workspace: { id: 'folder:project', path: '/work', kind: 'folder' },
  provider: { agent: 'claude', sessionId: 'provider-session' },
  transcriptPath: '/history/file.jsonl'
}
describe('portable SSH source client wire compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.capabilities = []
    mock.assertCapability.mockResolvedValue(undefined)
    mock.call.mockResolvedValue({})
  })
  it('refuses older controlling runtimes before attempting the new reader method', async () => {
    await expect(readPortableConversationPage({ kind: 'local' }, source)).rejects.toThrow(
      'Update the controlling Orca runtime'
    )
    expect(mock.call).not.toHaveBeenCalled()
  })
  it('keeps a paired controlling runtime and its nested SSH namespace pinned', async () => {
    const target = { kind: 'environment' as const, environmentId: 'peer' }
    const anchor = {
      messageId: 'selected',
      cursor: { offset: 100, boundaryCheckpoint: 'checkpoint', fileFingerprint: 'fingerprint' },
      identity: { fingerprint: 'fingerprint', size: 200, mtimeMs: 12 }
    }
    await readPortableConversationContext(target, source, anchor, 'history')
    expect(mock.assertCapability).toHaveBeenCalledWith(
      'peer',
      'conversation.portable-ssh.v1',
      expect.any(String),
      15_000
    )
    expect(mock.call).toHaveBeenCalledExactlyOnceWith(
      target,
      'portableConversation.sourceContext',
      { source, anchor, mode: 'history' },
      { timeoutMs: 120_000 }
    )
  })
  it('never falls back to local when capability verification on the owning runtime fails', async () => {
    mock.assertCapability.mockRejectedValue(new Error('Peer disconnected'))
    await expect(
      readPortableConversationPage({ kind: 'environment', environmentId: 'peer' }, source)
    ).rejects.toThrow('Peer disconnected')
    expect(mock.call).not.toHaveBeenCalled()
    expect(mock.refresh).not.toHaveBeenCalled()
  })
})
