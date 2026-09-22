import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PortableConversationProposalStore } from './portable-conversation-proposal-store'
import {
  beginPortableConversationProposalNotice,
  completePortableConversationProposalNotice
} from './portable-conversation-proposal-notice'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('portable proposal notice delivery', () => {
  it('fences attempts and persists an explicit terminal-send outcome', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-portable-notice-'))
    roots.push(root)
    const store = await PortableConversationProposalStore.open(root)
    await store.putNotice({
      schemaVersion: 1,
      noticeId: 'notice-1',
      proposalId: 'proposal-1',
      source: {
        executionHostId: 'ssh:builder',
        workspace: { id: 'folder', path: '/srv/folder', kind: 'folder' },
        provider: { agent: 'codex', sessionId: 'provider-1' },
        transcriptPath: '/history/provider-1.jsonl'
      },
      branchIds: ['branch-1'],
      content: 'Scope moved.',
      contentSha256: 'a'.repeat(64),
      delivery: null,
      attemptId: null,
      createdAt: 1,
      updatedAt: 1
    })

    const begun = await beginPortableConversationProposalNotice(
      store,
      { noticeId: 'notice-1', attemptId: 'attempt-1' },
      2
    )
    expect(begun.authorized).toBe(true)
    await expect(
      beginPortableConversationProposalNotice(store, {
        noticeId: 'notice-1',
        attemptId: 'attempt-2'
      })
    ).rejects.toThrow('portable_conversation_proposal_notice_in_flight')
    const completed = await completePortableConversationProposalNotice(
      store,
      { noticeId: 'notice-1', attemptId: 'attempt-1', status: 'accepted' },
      3
    )
    expect(completed.delivery).toMatchObject({ status: 'accepted', resolvedAt: 3 })
  })
})
