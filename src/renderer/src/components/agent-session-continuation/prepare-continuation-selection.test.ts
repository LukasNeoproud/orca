import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ConversationContinuationCandidate,
  ConversationContinuationCheckpoint
} from '../../../../shared/conversation-continuation'
import type { ConversationContinuationView } from '../../../../shared/conversation-continuation-view'
import { waitForContinuationSelection } from './prepare-continuation-selection'

const checkpoint: ConversationContinuationCheckpoint = {
  lastTurnId: 'turn-1',
  completedAt: '2026-09-25T12:00:00Z',
  revision: 'revision-1'
}

function candidate(
  status: ConversationContinuationCandidate['status'],
  mode?: ConversationContinuationCandidate['mode']
): ConversationContinuationCandidate {
  return {
    candidateId: 'copy-1',
    source: { providerSessionId: 'session-1', workspaceId: 'wt-1' },
    checkpoint,
    status,
    ...(mode ? { mode } : {}),
    createdAt: '2026-09-25T12:01:00Z',
    updatedAt: '2026-09-25T12:01:00Z',
    ...(status === 'ready'
      ? { providerSessionId: 'copy-session-1', transcriptPath: '/tmp/copy.jsonl' }
      : {})
  }
}

function view(
  current: ConversationContinuationCandidate | null,
  revision = checkpoint.revision
): ConversationContinuationView {
  return {
    source: { providerSessionId: 'session-1', workspaceId: 'wt-1' },
    checkpoint: { ...checkpoint, revision },
    candidate: current,
    autoCompact: false
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForContinuationSelection', () => {
  it('waits for a preparing copy to become ready', async () => {
    vi.useFakeTimers()
    const prepared = candidate('preparing')
    const ready = candidate('ready')
    const refresh = vi.fn().mockResolvedValueOnce(view(prepared)).mockResolvedValueOnce(view(ready))
    const assertCurrent = vi.fn()

    const result = waitForContinuationSelection({
      candidate: prepared,
      revision: checkpoint.revision,
      refresh,
      assertCurrent
    })
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(result).resolves.toEqual(ready)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(assertCurrent).toHaveBeenCalledTimes(4)
  })

  it('rejects when the source checkpoint revision changes', async () => {
    const refresh = vi.fn().mockResolvedValue(view(candidate('ready'), 'revision-2'))

    await expect(
      waitForContinuationSelection({
        candidate: candidate('ready'),
        revision: checkpoint.revision,
        refresh,
        assertCurrent: vi.fn()
      })
    ).rejects.toThrow('The conversation changed.')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('stops polling when the action guard cancels during preparation', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockResolvedValue(view(candidate('preparing')))
    let current = true
    const assertCurrent = vi.fn(() => {
      if (!current) {
        throw new Error('selection cancelled')
      }
    })
    const result = waitForContinuationSelection({
      candidate: candidate('preparing'),
      revision: checkpoint.revision,
      refresh,
      assertCurrent
    })
    const rejection = expect(result).rejects.toThrow('selection cancelled')
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledOnce()
    current = false
    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('rejects a fresh candidate returned after preparation', async () => {
    const fresh = candidate('ready', 'fresh')
    const refresh = vi.fn().mockResolvedValue(view(fresh))

    await expect(
      waitForContinuationSelection({
        candidate: candidate('preparing'),
        revision: checkpoint.revision,
        refresh,
        assertCurrent: vi.fn()
      })
    ).rejects.toThrow('The conversation changed.')
  })
})
