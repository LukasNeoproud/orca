import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConversationContinuationScheduler } from './conversation-continuation-scheduler'
import type { CodexContinuationService } from '../codex/codex-continuation-service'
import type { ConversationContinuationCandidate } from '../../shared/conversation-continuation'

const source = { providerSessionId: 'thread-1', workspaceId: 'folder-1' }
const checkpoint = {
  lastTurnId: 'turn-1',
  completedAt: new Date(1_000).toISOString(),
  revision: 'revision-1'
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'orca-continuation-'))
  let now = 100_000
  const settings = {
    conversationContinuationAutoCompact: false,
    conversationContinuationCompactAfterMs: 60_000
  }
  const candidate: ConversationContinuationCandidate = {
    candidateId: 'candidate-1',
    source,
    checkpoint,
    status: 'preparing',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  }
  const service = {
    inspect: vi.fn(async () => ({ source, checkpoint: { ...checkpoint } })),
    status: vi.fn(() => candidate),
    prepareInBackground: vi.fn(async () => candidate)
  }
  const busy = vi.fn(() => false)
  const deps = {
    directory,
    service: service as unknown as CodexContinuationService,
    settings: () => settings,
    busy,
    now: () => now
  }
  const scheduler = new ConversationContinuationScheduler(deps)
  cleanups.push(async () => {
    scheduler.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  return {
    scheduler,
    deps,
    settings,
    service,
    busy,
    candidate,
    setNow: (value: number) => {
      now = value
    }
  }
}

describe('conversation continuation schedule', () => {
  it('never invokes a model for inspection or when automatic compaction is disabled', async () => {
    const { scheduler, service } = await setup()
    await scheduler.inspect(source)
    await scheduler.tick()
    expect(service.prepareInBackground).not.toHaveBeenCalled()
  })

  it('uses the completed timestamp, waits for idle, and prepares each checkpoint only once', async () => {
    const { scheduler, settings, service, setNow, busy } = await setup()
    settings.conversationContinuationAutoCompact = true
    await scheduler.inspect(source)
    setNow(50_000)
    await scheduler.tick()
    expect(service.prepareInBackground).not.toHaveBeenCalled()
    setNow(100_000)
    busy.mockReturnValue(true)
    await scheduler.tick()
    expect(service.prepareInBackground).not.toHaveBeenCalled()
    busy.mockReturnValue(false)
    await scheduler.tick()
    await scheduler.tick()
    expect(service.prepareInBackground).toHaveBeenCalledTimes(1)
    expect(service.prepareInBackground).toHaveBeenCalledWith({
      source,
      expectedRevision: checkpoint.revision
    })
  })

  it('restores registration and does not retry unconfirmed preparation after restart', async () => {
    const { scheduler, deps, settings, candidate, service } = await setup()
    settings.conversationContinuationAutoCompact = true
    await scheduler.inspect(source)
    await scheduler.tick()
    scheduler.dispose()
    candidate.status = 'unconfirmed'
    const restored = new ConversationContinuationScheduler(deps)
    try {
      await restored.tick()
      expect(service.prepareInBackground).toHaveBeenCalledTimes(1)
      expect((await restored.inspect(source)).candidate?.status).toBe('unconfirmed')
    } finally {
      restored.dispose()
    }
  })

  it('rejects stale manual preparation and hides a candidate when its source advances', async () => {
    const { scheduler, service } = await setup()
    await scheduler.prepare(source, checkpoint.revision)
    service.inspect.mockResolvedValue({
      source,
      checkpoint: { ...checkpoint, revision: 'revision-2' }
    })
    expect((await scheduler.inspect(source)).candidate?.status).toBe('stale')
    await expect(scheduler.prepare(source, checkpoint.revision)).rejects.toThrow(
      'conversation changed'
    )
    expect(service.prepareInBackground).toHaveBeenCalledTimes(1)
  })
})
