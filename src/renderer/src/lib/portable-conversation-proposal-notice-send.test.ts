import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationProposalNotice } from '../../../shared/portable-conversation-proposal'
const mocks = vi.hoisted(() => ({ call: vi.fn(), deliver: vi.fn() }))
vi.mock('./portable-conversation-source-client', () => ({ callPortableConversation: mocks.call }))
vi.mock('./portable-conversation-text-delivery', () => ({
  deliverPortableConversationText: mocks.deliver
}))
import { sendPortableConversationProposalNotice } from './portable-conversation-proposal-notice-send'
const target = { kind: 'environment' as const, environmentId: 'peer' }
const notice = {
  noticeId: 'notice',
  attemptId: null,
  source: { executionHostId: 'ssh:host' },
  content: 'Saved scope',
  delivery: null
} as unknown as PortableConversationProposalNotice

describe('portable source scope notice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.deliver.mockResolvedValue({ status: 'unknown', reason: 'Terminal write unverified' })
  })
  it('claims the durable notice before sending its server-saved source and text', async () => {
    const saved = { ...notice, content: 'Exact **saved** scope' }
    mocks.call
      .mockResolvedValueOnce({ notice: saved, authorized: true })
      .mockResolvedValueOnce({ notice: { ...saved, delivery: { status: 'unknown' } } })
    const result = await sendPortableConversationProposalNotice(target, notice)
    expect(mocks.call).toHaveBeenNthCalledWith(
      1,
      target,
      'portableConversation.proposalNoticeBegin',
      { noticeId: 'notice', attemptId: 'notice' }
    )
    expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith(target, saved.source, saved.content)
    expect(mocks.call).toHaveBeenNthCalledWith(
      2,
      target,
      'portableConversation.proposalNoticeComplete',
      {
        noticeId: 'notice',
        attemptId: 'notice',
        status: 'unknown',
        reason: 'Terminal write unverified'
      }
    )
    expect(result.delivery?.status).toBe('unknown')
  })
  it('observes an unknown existing notice without attempting another write', async () => {
    mocks.call.mockResolvedValue({
      notice: { ...notice, attemptId: 'notice', delivery: { status: 'unknown' } },
      authorized: false
    })
    await sendPortableConversationProposalNotice(target, notice)
    expect(mocks.deliver).not.toHaveBeenCalled()
    expect(mocks.call).toHaveBeenCalledTimes(1)
  })
  it('uses the same notice identity after losing a completion response', async () => {
    mocks.call
      .mockResolvedValueOnce({ notice, authorized: true })
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValueOnce({
        notice: { ...notice, delivery: { status: 'unknown' } },
        authorized: false
      })
    await expect(sendPortableConversationProposalNotice(target, notice)).rejects.toThrow(
      'reply lost'
    )
    await sendPortableConversationProposalNotice(target, notice)
    expect(
      mocks.call.mock.calls
        .filter(([, method]) => method.endsWith('Begin'))
        .map(([, , params]) => params.attemptId)
    ).toEqual(['notice', 'notice'])
    expect(mocks.deliver).toHaveBeenCalledTimes(1)
  })
})
