import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { CodexContextUsage } from '../../shared/codex-context-usage'
import { readCodexContextConfigFile } from './codex-context-config-file'
import {
  readCodexModelMetadata,
  resolveCodexContextLimits,
  type CodexContextConfig,
  type CodexModelMetadata
} from './codex-context-usage'

type CodexContextLimitResolverOptions = {
  maxEntries?: number
  readTextFile?: (path: string, signal?: AbortSignal) => Promise<string>
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: string }).code === 'ENOENT'
  )
}

export function codexHomeFromRolloutPath(rolloutPath: string): string | null {
  let current = dirname(rolloutPath)
  for (let depth = 0; depth < 8; depth += 1) {
    if (basename(current) === 'sessions' || basename(current) === 'archived_sessions') {
      return dirname(current)
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return null
}

export class CodexContextLimitResolver {
  private readonly cached = new Map<string, Omit<CodexContextUsage, 'usedTokens' | 'stale'>>()
  private readonly maxEntries: number
  private readonly readTextFile: NonNullable<CodexContextLimitResolverOptions['readTextFile']>

  constructor(options: CodexContextLimitResolverOptions = {}) {
    this.maxEntries = options.maxEntries ?? 64
    this.readTextFile =
      options.readTextFile ??
      ((path, signal) => readFile(path, { encoding: 'utf8', ...(signal ? { signal } : {}) }))
  }

  async resolve(input: {
    rolloutPath: string
    model: string
    profile?: string | null
    reportedMaxTokens?: number
    signal?: AbortSignal
  }): Promise<Omit<CodexContextUsage, 'usedTokens' | 'stale'>> {
    const codexHome = codexHomeFromRolloutPath(input.rolloutPath)
    if (!codexHome) {
      return input.reportedMaxTokens ? { maxTokens: input.reportedMaxTokens } : {}
    }
    const key = JSON.stringify([codexHome, input.rolloutPath, input.profile ?? null, input.model])
    input.signal?.throwIfAborted()
    let limits = this.cached.get(key)
    if (!limits) {
      limits = await this.resolveUncached(
        codexHome,
        input.model,
        input.profile ?? null,
        input.signal
      )
      input.signal?.throwIfAborted()
      this.cached.set(key, limits)
      while (this.cached.size > this.maxEntries) {
        this.cached.delete(this.cached.keys().next().value!)
      }
    }
    return input.reportedMaxTokens ? { ...limits, maxTokens: input.reportedMaxTokens } : limits
  }

  clear(): void {
    this.cached.clear()
  }

  private async resolveUncached(
    codexHome: string,
    model: string,
    profile: string | null,
    signal?: AbortSignal
  ): Promise<Omit<CodexContextUsage, 'usedTokens' | 'stale'>> {
    let config: CodexContextConfig = {}
    try {
      config = readCodexContextConfigFile(
        await this.readTextFile(join(codexHome, 'config.toml'), signal),
        profile
      )
    } catch (error) {
      signal?.throwIfAborted()
      if (!isMissingFile(error)) {
        throw error
      }
    }
    const configuredCatalog = config.modelCatalogPath
    const catalogPath = configuredCatalog
      ? isAbsolute(configuredCatalog)
        ? configuredCatalog
        : resolve(codexHome, configuredCatalog)
      : join(codexHome, 'models_cache.json')
    let metadata: CodexModelMetadata | null = null
    try {
      metadata = readCodexModelMetadata(
        JSON.parse(await this.readTextFile(catalogPath, signal)),
        model
      )
    } catch (error) {
      signal?.throwIfAborted()
      if (!isMissingFile(error)) {
        throw error
      }
    }
    return resolveCodexContextLimits(config, metadata)
  }
}
