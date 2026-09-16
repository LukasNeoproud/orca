import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCodexContextUsageUpdate } from '../../shared/codex-context-usage'
import { readConfiguredCodexModelCatalogPath } from './codex-context-config-file'
import { CodexContextLimitResolver } from './codex-context-limit-resolver'
import {
  readCodexContextConfig,
  readCodexModelMetadata,
  readCodexWeeklyUsage,
  resolveCodexContextLimits
} from './codex-context-usage'

describe('Codex context usage', () => {
  it('reads the active last context instead of cumulative session usage', () => {
    expect(
      readCodexContextUsageUpdate({
        threadId: 'root-thread',
        tokenUsage: {
          last: { totalTokens: 42_000 },
          total: { totalTokens: 900_000 },
          modelContextWindow: 190_000
        }
      })
    ).toEqual({
      threadId: 'root-thread',
      usage: { usedTokens: 42_000, maxTokens: 190_000 }
    })
  })

  it('rejects a cumulative-only payload', () => {
    expect(
      readCodexContextUsageUpdate({
        threadId: 'root-thread',
        tokenUsage: { total: { totalTokens: 900_000 }, modelContextWindow: 190_000 }
      })
    ).toBeNull()
  })

  it('derives usable context and caps the default threshold from raw model metadata', () => {
    const config = readCodexContextConfig({
      config: { model: 'gpt-test', model_auto_compact_token_limit_scope: 'total' }
    })
    const metadata = readCodexModelMetadata(
      {
        models: [
          {
            slug: 'gpt-test',
            context_window: 200_000,
            effective_context_window_percent: 95,
            auto_compact_token_limit: 190_000
          }
        ]
      },
      'gpt-test'
    )

    expect(resolveCodexContextLimits(config, metadata)).toEqual({
      maxTokens: 190_000,
      autoCompactThresholdTokens: 180_000,
      thresholdSource: 'model-default',
      thresholdEstimated: true,
      compactScope: 'total'
    })
  })

  it('uses the effective config threshold and preserves body-after-prefix scope', () => {
    const config = readCodexContextConfig({
      config: {
        model_context_window: 200_000,
        model_auto_compact_token_limit: 170_000,
        model_auto_compact_token_limit_scope: 'body_after_prefix'
      }
    })
    const metadata = readCodexModelMetadata(
      { models: [{ slug: 'gpt-test', effective_context_window_percent: 95 }] },
      'gpt-test'
    )

    expect(resolveCodexContextLimits(config, metadata)).toEqual({
      maxTokens: 190_000,
      autoCompactThresholdTokens: 170_000,
      thresholdSource: 'config',
      thresholdEstimated: true,
      compactScope: 'body_after_prefix'
    })
  })

  it('clamps a manual raw window to the model maximum before deriving limits', () => {
    const config = readCodexContextConfig({ config: { model_context_window: 900_000 } })
    const metadata = readCodexModelMetadata(
      {
        models: [
          {
            slug: 'gpt-test',
            context_window: 200_000,
            max_context_window: 300_000,
            effective_context_window_percent: 95
          }
        ]
      },
      'gpt-test'
    )

    expect(resolveCodexContextLimits(config, metadata)).toMatchObject({
      maxTokens: 285_000,
      autoCompactThresholdTokens: 270_000
    })
  })

  it('does not claim a usable maximum when catalog effective percent is unavailable', () => {
    const config = readCodexContextConfig({ config: { model_context_window: 200_000 } })
    expect(resolveCodexContextLimits(config, null)).not.toHaveProperty('maxTokens')
  })

  it('finds the selected profile catalog while retaining the top-level fallback', () => {
    const source = [
      'model_catalog_json = "catalogs/default.json"',
      '[profiles.fast]',
      'model_catalog_json = "catalogs/fast.json"',
      '[profiles.other]',
      'model_catalog_json = "catalogs/other.json"'
    ].join('\n')

    expect(readConfiguredCodexModelCatalogPath(source, 'fast')).toBe('catalogs/fast.json')
    expect(readConfiguredCodexModelCatalogPath(source, 'missing')).toBe('catalogs/default.json')
  })

  it('maps the same connection weekly bucket into the wire shape', () => {
    expect(
      readCodexWeeklyUsage({
        rateLimits: {
          primary: { usedPercent: 12, windowDurationMins: 300 },
          secondary: { usedPercent: 34, windowDurationMins: 10_080, resetsAt: 1_800_000_000 }
        }
      })
    ).toEqual({ usedPercent: 34, resetsAt: 1_800_000_000_000 })
    expect(
      readCodexWeeklyUsage({
        rateLimits: {
          limitId: 'codex_other',
          secondary: { usedPercent: 99, windowDurationMins: 10_080 }
        }
      })
    ).toBeNull()
    expect(
      readCodexWeeklyUsage({
        rateLimits: { limitId: 'codex_other' },
        rateLimitsByLimitId: {
          codex: { secondary: { usedPercent: 45, windowDurationMins: 10_080 } }
        }
      })
    ).toEqual({ usedPercent: 45 })
  })

  it('captures config per rollout while reusing repeated reads of that session', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orca-context-limits-'))
    const sessions = join(home, 'sessions', '2026', '09', '11')
    const firstRollout = join(sessions, 'rollout-first.jsonl')
    const secondRollout = join(sessions, 'rollout-second.jsonl')
    await mkdir(sessions, { recursive: true })
    await writeFile(
      join(home, 'models_cache.json'),
      JSON.stringify({
        models: [
          {
            slug: 'gpt-test',
            context_window: 100_000,
            effective_context_window_percent: 95
          }
        ]
      })
    )
    const resolver = new CodexContextLimitResolver()
    try {
      await writeFile(join(home, 'config.toml'), 'model_auto_compact_token_limit = 80_000\n')
      expect(
        await resolver.resolve({ rolloutPath: firstRollout, model: 'gpt-test' })
      ).toMatchObject({ autoCompactThresholdTokens: 80_000 })
      await writeFile(join(home, 'config.toml'), 'model_auto_compact_token_limit = 70_000\n')
      expect(
        await resolver.resolve({ rolloutPath: firstRollout, model: 'gpt-test' })
      ).toMatchObject({ autoCompactThresholdTokens: 80_000 })
      expect(
        await resolver.resolve({ rolloutPath: secondRollout, model: 'gpt-test' })
      ).toMatchObject({ autoCompactThresholdTokens: 70_000 })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('does not cache an unavailable filesystem read', async () => {
    let reads = 0
    const resolver = new CodexContextLimitResolver({
      readTextFile: async () => {
        reads += 1
        throw Object.assign(new Error('host unavailable'), { code: 'EIO' })
      }
    })
    const input = {
      rolloutPath: join('/codex', 'sessions', '2026', '09', '11', 'rollout.jsonl'),
      model: 'gpt-test'
    }
    await expect(resolver.resolve(input)).rejects.toThrow('host unavailable')
    await expect(resolver.resolve(input)).rejects.toThrow('host unavailable')
    expect(reads).toBe(2)
  })
})
