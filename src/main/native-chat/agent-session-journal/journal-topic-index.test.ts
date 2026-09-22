import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyStructuredTopicIndex } from '../../../shared/structured-topic-index'
import type { openAgentSessionJournal } from './journal-store-factory'
import { createTrackedJournalOpener } from './journal-store-test-open'

let root: string
const journals = createTrackedJournalOpener()

async function open() {
  return journals.open({
    identity: {
      sessionId: 'session',
      workspaceId: 'workspace',
      hostId: 'host',
      agent: 'codex',
      providerHandle: { kind: 'codex', threadId: 'thread' }
    },
    journalDir: root,
    now: () => 1,
    mintEpoch: () => 'epoch'
  } satisfies Parameters<typeof openAgentSessionJournal>[0])
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-topic-index-'))
})
afterEach(async () => {
  await journals.closeAll()
  await rm(root, { recursive: true, force: true })
})

describe('journal topic index', () => {
  it('keeps a manual boundary and its exact anchor after reopen', async () => {
    const first = await open()
    const index = emptyStructuredTopicIndex('session')
    index.revision = 1
    index.chapters = [
      {
        id: 'chapter',
        title: 'Manual topic',
        titleSource: 'manual',
        boundaryAfterManual: true,
        start: { epoch: 'epoch', itemId: 'user-10', sequence: 10 },
        end: { epoch: 'epoch', itemId: 'assistant-11', sequence: 11 }
      }
    ]
    await first.writeTopicIndex(index, 0)
    await first.close()

    const reopened = await open()
    expect(reopened.readTopicIndex()).toEqual(index)
  })

  it('rejects a stale write instead of replacing a persisted edit', async () => {
    const journal = await open()
    const saved = { ...emptyStructuredTopicIndex('session'), revision: 1, automatic: false }
    await journal.writeTopicIndex(saved, 0)
    await expect(journal.writeTopicIndex({ ...saved, revision: 2 }, 0)).rejects.toThrow(
      'agent_session_topic_index_stale'
    )
    expect(journal.readTopicIndex()).toEqual(saved)
  })
})
