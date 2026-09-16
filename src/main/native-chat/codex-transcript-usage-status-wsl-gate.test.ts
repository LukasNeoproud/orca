import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const gatedReadFile = vi.hoisted(() => vi.fn())

vi.mock('./wsl-transcript-fs-access', () => ({
  wslGatedReadFile: gatedReadFile
}))

import {
  CodexTranscriptUsageStatusAccumulator,
  enrichCodexTranscriptUsageStatus
} from './codex-transcript-usage-status'

describe('Codex transcript context-limit reads', () => {
  it('keeps transcript usage usable when optional metadata fails and retries later', async () => {
    const rolloutPath = join('/runtime', 'retry-home', 'sessions', 'rollout.jsonl')
    const usage = new CodexTranscriptUsageStatusAccumulator()
    usage.observe(JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-test' } }))
    usage.observe(
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { total_tokens: 12000 }, model_context_window: 200000 }
        }
      })
    )
    gatedReadFile.mockRejectedValueOnce(new Error('temporarily unavailable'))
    await expect(enrichCodexTranscriptUsageStatus(rolloutPath, usage)).resolves.toBeUndefined()
    expect(usage.snapshot().contextUsage?.usedTokens).toBe(12000)
    gatedReadFile.mockImplementation(async (path: string) =>
      path.endsWith('config.toml')
        ? 'model_context_window = 200000\n'
        : JSON.stringify({
            models: [
              { slug: 'gpt-test', context_window: 200000, effective_context_window_percent: 100 }
            ]
          })
    )
    await enrichCodexTranscriptUsageStatus(rolloutPath, usage)
    expect(usage.snapshot().contextUsage?.autoCompactThresholdTokens).toBe(180000)
  })

  it('still cancels enrichment when the watcher is torn down', async () => {
    const controller = new AbortController()
    const usage = new CodexTranscriptUsageStatusAccumulator()
    usage.observe(JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-test' } }))
    gatedReadFile.mockImplementationOnce(async () => {
      controller.abort(new Error('watcher closed'))
      throw controller.signal.reason
    })
    await expect(
      enrichCodexTranscriptUsageStatus(
        join('/runtime', 'cancel-home', 'sessions', 'rollout.jsonl'),
        usage,
        controller.signal
      )
    ).rejects.toThrow('watcher closed')
  })

  it('routes config and catalog reads through the cancellable transcript gate', async () => {
    const root = join('/runtime', 'codex-home')
    const rolloutPath = join(root, 'sessions', '2026', '09', '11', 'rollout.jsonl')
    const signal = new AbortController().signal
    gatedReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith('config.toml')) {
        return 'model_context_window = 200000\n'
      }
      return JSON.stringify({
        models: [
          { slug: 'gpt-test', context_window: 200_000, effective_context_window_percent: 100 }
        ]
      })
    })
    const usage = new CodexTranscriptUsageStatusAccumulator()
    usage.observe(JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-test' } }))

    await enrichCodexTranscriptUsageStatus(rolloutPath, usage, signal)

    expect(gatedReadFile).toHaveBeenCalledWith(join(root, 'config.toml'), 'utf8', 'exact', signal)
    expect(gatedReadFile).toHaveBeenCalledWith(
      join(root, 'models_cache.json'),
      'utf8',
      'exact',
      signal
    )
    expect(usage.snapshot().contextUsage).toMatchObject({
      maxTokens: 200_000,
      autoCompactThresholdTokens: 180_000
    })
  })
})
