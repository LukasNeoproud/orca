import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { CodexContextUsage, CodexWeeklyUsage } from '../../shared/codex-context-usage'
import {
  classifyCodexRateLimitWindows,
  CODEX_WEEKLY_WINDOW_MINUTES,
  type CodexRateLimitWindowsSnapshot
} from '../rate-limits/codex-rate-limit-window-classification'
import { mapCodexRateLimitWindow } from '../rate-limits/codex-rate-limit-window-mapper'
import type { CodexAppServerConnection } from './codex-app-server-connection-types'
import { readConfiguredCodexModelCatalogPath } from './codex-context-config-file'
import { parseTomlSingleLineStringValue } from './config-toml-line-scan'

export type CodexContextConfig = {
  model?: string
  rawContextWindow?: number
  autoCompactThreshold?: number
  compactScope?: CodexContextUsage['compactScope']
  modelCatalogPath?: string
}
export type CodexModelMetadata = {
  slug: string
  contextWindow?: number
  maxContextWindow?: number
  effectiveContextWindowPercent?: number
  autoCompactThreshold?: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readCodexContextConfig(response: unknown): CodexContextConfig {
  const config = record(record(response)?.config)
  const scope = config?.model_auto_compact_token_limit_scope
  return {
    ...(nonEmptyString(config?.model) ? { model: nonEmptyString(config?.model) } : {}),
    ...(positiveInteger(config?.model_context_window)
      ? { rawContextWindow: positiveInteger(config?.model_context_window) }
      : {}),
    ...(positiveInteger(config?.model_auto_compact_token_limit)
      ? { autoCompactThreshold: positiveInteger(config?.model_auto_compact_token_limit) }
      : {}),
    ...(scope === 'total' || scope === 'body_after_prefix' ? { compactScope: scope } : {}),
    ...(nonEmptyString(config?.model_catalog_json)
      ? { modelCatalogPath: nonEmptyString(config?.model_catalog_json) }
      : {})
  }
}

export function readCodexModelMetadata(catalog: unknown, model: string): CodexModelMetadata | null {
  const root = record(catalog)
  const entries = Array.isArray(catalog) ? catalog : Array.isArray(root?.models) ? root.models : []
  for (const value of entries) {
    const entry = record(value)
    const slug =
      nonEmptyString(entry?.slug) ?? nonEmptyString(entry?.id) ?? nonEmptyString(entry?.model)
    if (slug !== model) {
      continue
    }
    return {
      slug,
      ...(positiveInteger(entry?.context_window)
        ? { contextWindow: positiveInteger(entry?.context_window) }
        : {}),
      ...(positiveInteger(entry?.max_context_window)
        ? { maxContextWindow: positiveInteger(entry?.max_context_window) }
        : {}),
      ...(positiveInteger(entry?.effective_context_window_percent)
        ? {
            effectiveContextWindowPercent: positiveInteger(entry?.effective_context_window_percent)
          }
        : {}),
      ...(positiveInteger(entry?.auto_compact_token_limit)
        ? { autoCompactThreshold: positiveInteger(entry?.auto_compact_token_limit) }
        : {})
    }
  }
  return null
}

export function resolveCodexContextLimits(
  config: CodexContextConfig,
  metadata: CodexModelMetadata | null
): Omit<CodexContextUsage, 'usedTokens' | 'stale'> {
  const configuredRaw = config.rawContextWindow
  const rawContextWindow = configuredRaw
    ? Math.min(configuredRaw, metadata?.maxContextWindow ?? configuredRaw)
    : metadata?.contextWindow
  const effectivePercent = metadata?.effectiveContextWindowPercent
  const maxTokens =
    rawContextWindow && effectivePercent
      ? Math.floor((rawContextWindow * Math.min(effectivePercent, 100)) / 100)
      : undefined
  const ninetyPercentCap = rawContextWindow ? Math.floor(rawContextWindow * 0.9) : undefined
  const configuredThreshold = config.autoCompactThreshold
  const thresholdCandidate =
    configuredThreshold ?? metadata?.autoCompactThreshold ?? ninetyPercentCap
  const threshold =
    thresholdCandidate && ninetyPercentCap
      ? Math.min(thresholdCandidate, ninetyPercentCap)
      : thresholdCandidate
  return {
    ...(maxTokens ? { maxTokens } : {}),
    ...(threshold ? { autoCompactThresholdTokens: threshold } : {}),
    ...(threshold
      ? {
          thresholdSource: configuredThreshold ? ('config' as const) : ('model-default' as const),
          thresholdEstimated: true
        }
      : {}),
    ...(config.compactScope ? { compactScope: config.compactScope } : {})
  }
}

function profileFromArgs(args: readonly string[]): string | null {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (args[index].startsWith('--profile=')) {
      return args[index].slice('--profile='.length).trim()
    }
    if ((args[index] === '--profile' || args[index] === '-p') && args[index + 1]) {
      return args[index + 1].trim()
    }
  }
  return null
}
function catalogFromArgs(args: readonly string[]): string | null {
  let result: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    const assignment =
      token === '-c' || token === '--config'
        ? args[++index]
        : token.startsWith('--config=')
          ? token.slice('--config='.length)
          : undefined
    const match = assignment ? /^model_catalog_json\s*=\s*(.*)$/.exec(assignment) : null
    if (match) {
      result = parseTomlSingleLineStringValue(match[1], 0)?.value.trim() || null
    }
  }
  return result
}
async function catalogPath(
  config: CodexContextConfig,
  codexHome: string | null,
  args: readonly string[]
): Promise<string | null> {
  if (!codexHome) {
    return null
  }
  let configured = catalogFromArgs(args) ?? config.modelCatalogPath ?? null
  if (!configured) {
    try {
      configured = readConfiguredCodexModelCatalogPath(
        await readFile(join(codexHome, 'config.toml'), 'utf8'),
        profileFromArgs(args)
      )
    } catch {
      // Missing config is the ordinary default-home case.
    }
  }
  if (!configured) {
    return join(codexHome, 'models_cache.json')
  }
  return isAbsolute(configured) ? configured : resolve(codexHome, configured)
}

export async function readCodexContextLimits(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  cwd: string
  codexHome: string | null
  args: readonly string[]
  model?: string
  timeoutMs?: number
}): Promise<Omit<CodexContextUsage, 'usedTokens' | 'stale'>> {
  const response = await input.connection.request(
    'config/read',
    { cwd: input.cwd, includeLayers: false },
    { timeoutMs: input.timeoutMs }
  )
  const config = readCodexContextConfig(response)
  const model = input.model ?? config.model
  if (!model) {
    return resolveCodexContextLimits(config, null)
  }
  const path = await catalogPath(config, input.codexHome, input.args)
  let metadata: CodexModelMetadata | null = null
  if (path) {
    try {
      metadata = readCodexModelMetadata(JSON.parse(await readFile(path, 'utf8')), model)
    } catch {
      // Token snapshots still provide current usage when metadata is unavailable.
    }
  }
  return resolveCodexContextLimits(config, metadata)
}

export function readCodexWeeklyUsage(value: unknown): CodexWeeklyUsage | null {
  const root = record(value)
  const byLimitId = record(root?.rateLimitsByLimitId)
  const selected = byLimitId?.codex ?? root?.rateLimits
  const selectedRecord = record(selected)
  if (typeof selectedRecord?.limitId === 'string' && selectedRecord.limitId !== 'codex') {
    return null
  }
  const limits = selected as CodexRateLimitWindowsSnapshot | undefined
  const weekly = mapCodexRateLimitWindow(
    classifyCodexRateLimitWindows(limits).weekly,
    CODEX_WEEKLY_WINDOW_MINUTES
  )
  return weekly
    ? {
        usedPercent: weekly.usedPercent,
        ...(weekly.resetsAt !== null ? { resetsAt: weekly.resetsAt } : {})
      }
    : null
}
