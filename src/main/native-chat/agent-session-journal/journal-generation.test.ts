import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { projectStructuredItemToNativeChat } from '../../../shared/structured-agent-session-projection'
import { createTrackedJournalOpener } from './journal-store-test-open'

it('keeps response generation metadata after journal close and reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-generation-'))
  const journals = createTrackedJournalOpener()
  const options = {
    journalDir: root,
    identity: {
      sessionId: 'generation-session',
      workspaceId: 'folder-workspace',
      hostId: 'execution-host',
      agent: 'codex' as const,
      providerHandle: { kind: 'codex' as const, threadId: 'thread' }
    }
  }
  const generation = {
    model: 'turn-model',
    serviceTier: 'priority',
    method: 'stream-estimate' as const,
    outputTokens: 150,
    generationDurationMs: 3_000
  }
  try {
    const journal = await journals.open(options)
    await journal.appendItem(
      { provider: 'codex', threadId: 'thread', turnId: 'turn', ordinal: 1 },
      {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Finished' }],
        generation
      },
      { fence: 1 }
    )
    await journal.close()
    const reopened = await journals.open(options)
    await reopened.appendItem(
      { provider: 'codex', threadId: 'thread', turnId: 'turn', ordinal: 1 },
      { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Finished' }] },
      { fence: 2 }
    )
    const message = projectStructuredItemToNativeChat(reopened.snapshot().items[0])
    expect(message?.generation).toEqual(generation)
    expect(message?.blocks).toEqual([{ type: 'text', text: 'Finished' }])
    await reopened.close()
    const restored = await journals.open(options)
    expect(projectStructuredItemToNativeChat(restored.snapshot().items[0])?.generation).toEqual(
      generation
    )
    await restored.replaceEpochItems('handle_forked', 2, [
      {
        identity: { provider: 'codex', threadId: 'thread', turnId: 'turn', ordinal: 1 },
        body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Finished' }] }
      }
    ])
    expect(projectStructuredItemToNativeChat(restored.snapshot().items[0])?.generation).toEqual(
      generation
    )
    await restored.appendLifecycleBatch({
      settlementId: 'restore-final-response',
      fence: 2,
      mutations: [
        {
          kind: 'item',
          identity: { provider: 'codex', threadId: 'thread', turnId: 'turn', ordinal: 1 },
          body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Finished' }] }
        }
      ]
    })
    expect(projectStructuredItemToNativeChat(restored.snapshot().items[0])?.generation).toEqual(
      generation
    )
    await restored.appendItem(
      { provider: 'codex', threadId: 'thread', turnId: 'turn', ordinal: 1 },
      {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Different response' }]
      },
      { fence: 2 }
    )
    expect(
      projectStructuredItemToNativeChat(restored.snapshot().items[0])?.generation
    ).toBeUndefined()
  } finally {
    await journals.closeAll()
    await rm(root, { recursive: true, force: true })
  }
})
