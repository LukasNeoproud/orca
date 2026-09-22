import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationDeliveryEnvelope } from './conversation-branch-delivery'
import { structuredAgentSessionPayloadFingerprint } from '../../../shared/structured-agent-session-mutation'
import { structuredAgentSessionSendBody } from '../../../shared/structured-agent-session-outbox'

const call = vi.hoisted(() => vi.fn())
vi.mock('./structured-conversation-branch-client', () => ({ callConversationBranch: call }))

describe('conversation handoff delivery checkpoint', () => {
  beforeEach(() => {
    call.mockReset()
  })
  it('pins the owning runtime and fingerprints the exact normal message without interrupting', async () => {
    call.mockResolvedValue({ ok: true, page: { fence: 42 } })
    const target = { kind: 'environment' as const, environmentId: 'paired-host' }
    const content = '## Result\n\n- [x] checked\n\n```ts\nconst value = 1\n```\n'
    const envelope = await conversationDeliveryEnvelope(target, 'parent', 'stable-id', content)
    expect(call).toHaveBeenCalledExactlyOnceWith(target, 'agentSession.history', {
      sessionId: 'parent',
      direction: 'tail',
      limit: 1
    })
    expect(envelope).toEqual({
      sessionId: 'parent',
      clientOperationId: 'stable-id',
      expectedRuntimeFence: 42,
      payloadFingerprint: structuredAgentSessionPayloadFingerprint({
        method: 'agentSession.send',
        sessionId: 'parent',
        fields: { body: structuredAgentSessionSendBody(content, []) }
      })
    })
  })
  it('refuses to guess a fence after a disconnected or incomplete read', async () => {
    call.mockResolvedValue({ ok: true, page: {} })
    await expect(
      conversationDeliveryEnvelope({ kind: 'local' }, 'child', 'id', 'body')
    ).rejects.toThrow('checkpoint')
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('uses the authoritative replacement fence after a journal reset', async () => {
    call.mockResolvedValue({ ok: false, page: {}, fence: 9 })
    expect(
      await conversationDeliveryEnvelope({ kind: 'local' }, 'child', 'id', 'body')
    ).toMatchObject({ expectedRuntimeFence: 9 })
  })
})
