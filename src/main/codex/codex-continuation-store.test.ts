import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationContinuationCandidate } from '../../shared/conversation-continuation'
import { CodexContinuationStore } from './codex-continuation-store'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

function candidate(
  revision: string,
  status: ConversationContinuationCandidate['status'] = 'ready'
): ConversationContinuationCandidate {
  return {
    candidateId: `candidate-${revision}`,
    source: { providerSessionId: 'source-thread', workspaceId: 'workspace' },
    checkpoint: {
      lastTurnId: `turn-${revision}`,
      completedAt: '2026-09-22T10:00:00.000Z',
      revision
    },
    status,
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:00:00.000Z'
  }
}

describe('CodexContinuationStore retention', () => {
  it('prunes confirmed checkpoints across more than 512 advancing turns', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-continuation-store-'))
    directories.push(directory)
    const store = new CodexContinuationStore(directory)
    for (let index = 0; index <= 512; index += 1) {
      const revision = `revision-${index}`
      await store.pruneOtherRevisions('source-thread', 'workspace', revision)
      await store.put(candidate(revision, index % 2 === 0 ? 'ready' : 'used'))
    }
    expect(store.all()).toHaveLength(1)
    expect(store.findCheckpoint('source-thread', 'workspace', 'revision-0')).toBeNull()
    expect(store.findCheckpoint('source-thread', 'workspace', 'revision-512')?.status).toBe('ready')
    await store.settled()
    const persisted = JSON.parse(
      await readFile(join(directory, 'conversation-continuation-candidates.json'), 'utf8')
    ) as { candidates: ConversationContinuationCandidate[] }
    expect(persisted.candidates).toHaveLength(1)
  })

  it('keeps claimed and uncertain records at the current checkpoint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-continuation-store-'))
    directories.push(directory)
    const store = new CodexContinuationStore(directory)
    await store.put(candidate('current', 'used'))
    await store.pruneOtherRevisions('source-thread', 'workspace', 'current')
    expect(store.findCheckpoint('source-thread', 'workspace', 'current')?.status).toBe('used')
    await store.put(candidate('uncertain', 'unconfirmed'))
    await store.pruneOtherRevisions('source-thread', 'workspace', 'uncertain')
    expect(store.get('candidate-current')).toBeNull()
    expect(store.findCheckpoint('source-thread', 'workspace', 'uncertain')?.status).toBe(
      'unconfirmed'
    )
    await store.pruneOtherRevisions('source-thread', 'workspace', 'next')
    expect(store.get('candidate-uncertain')).toBeNull()
  })

  it('rejects an invalid persisted compaction origin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-continuation-store-'))
    directories.push(directory)
    await writeFile(
      join(directory, 'conversation-continuation-candidates.json'),
      JSON.stringify({
        schemaVersion: 1,
        candidates: [{ ...candidate('current'), compactionOrigin: 'scheduled-ish' }]
      })
    )
    expect(() => new CodexContinuationStore(directory)).toThrow('unsupported shape')
  })

  it('reclaims legacy stale records without removing an in-flight preparation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-continuation-store-'))
    directories.push(directory)
    const candidates = Array.from({ length: 512 }, (_, index) => ({
      ...candidate(`old-${index}`, 'stale'),
      source: { providerSessionId: `source-${index}`, workspaceId: 'workspace' }
    }))
    await writeFile(
      join(directory, 'conversation-continuation-candidates.json'),
      JSON.stringify({ schemaVersion: 1, candidates })
    )
    const store = new CodexContinuationStore(directory)
    expect(store.all()).toHaveLength(0)
    await store.settled()
    expect(
      (
        JSON.parse(
          await readFile(join(directory, 'conversation-continuation-candidates.json'), 'utf8')
        ) as { candidates: ConversationContinuationCandidate[] }
      ).candidates
    ).toHaveLength(0)
    await store.put(candidate('running', 'preparing'))
    await store.pruneOtherRevisions('source-thread', 'workspace', 'next')
    expect(store.all()).toHaveLength(1)
    expect(store.get('candidate-running')?.status).toBe('preparing')
    await store.put(candidate('next'))
    await store.update('candidate-running', (current) => ({ ...current, status: 'stale' }))
    await store.pruneOtherRevisions('source-thread', 'workspace', 'next')
    expect(store.get('candidate-running')).toBeNull()
    expect(store.all()).toHaveLength(1)
  })
})
