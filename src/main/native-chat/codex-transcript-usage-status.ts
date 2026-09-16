import type { NativeChatUsageStatus } from '../../shared/native-chat-usage-status'
import {
  classifyCodexRateLimitWindows,
  CODEX_WEEKLY_WINDOW_MINUTES,
  type CodexRateWindowSnapshot
} from '../rate-limits/codex-rate-limit-window-classification'
import { mapCodexRateLimitWindow } from '../rate-limits/codex-rate-limit-window-mapper'
import { asRecord, extractString, parseJsonObject } from '../ai-vault/session-scanner-values'
import { CodexContextLimitResolver } from '../codex/codex-context-limit-resolver'
import { wslGatedReadFile } from './wsl-transcript-fs-access'

const contextLimitResolver = new CodexContextLimitResolver({
  readTextFile: (path, signal) => wslGatedReadFile(path, 'utf8', 'exact', signal)
})

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function rateWindow(value: unknown): CodexRateWindowSnapshot | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  return {
    usedPercent: record.used_percent,
    windowDurationMins: record.window_minutes,
    resetsAt: record.resets_at
  }
}

function weeklyUsage(value: unknown): NativeChatUsageStatus['codexWeeklyUsage'] | undefined {
  const rateLimits = asRecord(value)
  if (!rateLimits) {
    return undefined
  }
  const weekly = mapCodexRateLimitWindow(
    classifyCodexRateLimitWindows({
      primary: rateWindow(rateLimits.primary),
      secondary: rateWindow(rateLimits.secondary)
    }).weekly,
    CODEX_WEEKLY_WINDOW_MINUTES
  )
  if (!weekly || !Number.isFinite(weekly.usedPercent)) {
    return undefined
  }
  return {
    usedPercent: weekly.usedPercent,
    ...(weekly.resetsAt !== null ? { resetsAt: weekly.resetsAt } : {})
  }
}

export function isCodexTranscriptUsageStatusLine(line: string): boolean {
  const record = parseJsonObject(line)
  const payload = asRecord(record?.payload)
  return (
    record?.type === 'turn_context' ||
    record?.type === 'compacted' ||
    (record?.type === 'event_msg' && payload?.type === 'token_count')
  )
}

function turnModel(payload: Record<string, unknown>): string | undefined {
  return extractString(payload.model) ?? extractString(payload.model_name) ?? undefined
}

export class CodexTranscriptUsageStatusAccumulator {
  private status: NativeChatUsageStatus = {}
  private model: string | undefined

  reset(): void {
    this.status = {}
    this.model = undefined
  }

  snapshot(): NativeChatUsageStatus {
    return {
      ...(this.status.contextUsage ? { contextUsage: { ...this.status.contextUsage } } : {}),
      ...(this.status.codexWeeklyUsage
        ? { codexWeeklyUsage: { ...this.status.codexWeeklyUsage } }
        : {})
    }
  }

  currentModel(): string | undefined {
    return this.model
  }

  mergeContextLimits(
    limits: Omit<NonNullable<NativeChatUsageStatus['contextUsage']>, 'usedTokens' | 'stale'>
  ): void {
    if (Object.keys(limits).length === 0) {
      return
    }
    this.status.contextUsage = { ...this.status.contextUsage, ...limits }
  }

  observe(line: string): void {
    const record = parseJsonObject(line)
    if (!record) {
      return
    }
    const payload = asRecord(record.payload)
    if (record.type === 'turn_context' && payload) {
      const nextModel = turnModel(payload)
      if (nextModel && this.model && nextModel !== this.model && this.status.contextUsage) {
        this.status.contextUsage = { stale: true }
      }
      this.model = nextModel ?? this.model
      return
    }
    if (record.type === 'compacted') {
      if (this.status.contextUsage) {
        this.status.contextUsage = { ...this.status.contextUsage, stale: true }
      }
      return
    }
    if (record.type !== 'event_msg' || payload?.type !== 'token_count') {
      return
    }

    const info = asRecord(payload.info)
    const lastUsage = asRecord(info?.last_token_usage)
    const usedTokens = finiteNonNegative(lastUsage?.total_tokens)
    const maxTokens = finiteNonNegative(info?.model_context_window)
    if (usedTokens !== undefined || maxTokens !== undefined) {
      const previous = this.status.contextUsage
      this.status.contextUsage = {
        ...previous,
        ...(usedTokens !== undefined ? { usedTokens } : {}),
        ...(maxTokens !== undefined && maxTokens > 0 ? { maxTokens } : {}),
        stale: false
      }
    }

    const weekly = weeklyUsage(payload.rate_limits)
    if (weekly) {
      this.status.codexWeeklyUsage = weekly
    }
  }
}

export async function enrichCodexTranscriptUsageStatus(
  rolloutPath: string,
  usage: CodexTranscriptUsageStatusAccumulator,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  const model = usage.currentModel()
  if (!model) {
    return
  }
  try {
    const limits = await contextLimitResolver.resolve({
      rolloutPath,
      model,
      reportedMaxTokens: usage.snapshot().contextUsage?.maxTokens,
      signal
    })
    signal?.throwIfAborted()
    usage.mergeContextLimits(limits)
  } catch {
    // Optional limit metadata must never prevent transcript delivery.
    signal?.throwIfAborted()
  }
}
