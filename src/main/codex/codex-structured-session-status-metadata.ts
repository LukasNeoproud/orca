import { isCodexCompactionComplete } from '../native-chat/agent-session-wire/structured-session-compaction'
import {
  codexContextUsageEqual,
  codexWeeklyUsageEqual,
  readCodexContextUsageUpdate,
  type CodexContextUsage,
  type CodexWeeklyUsage
} from '../../shared/codex-context-usage'
import { readCodexContextLimits, readCodexWeeklyUsage } from './codex-context-usage'
import type {
  CodexSession,
  CodexStructuredSessionAdapterDeps
} from './codex-structured-session-state'

export class CodexStructuredSessionStatusMetadata {
  constructor(
    private readonly sessions: ReadonlyMap<string, CodexSession>,
    private readonly deps: Pick<
      CodexStructuredSessionAdapterDeps,
      'onStatusMetadataChanged' | 'requestTimeoutMs'
    >
  ) {}

  contextUsage = (sessionId: string): CodexContextUsage | undefined =>
    this.sessions.get(sessionId)?.contextUsage

  weeklyUsage = (sessionId: string): CodexWeeklyUsage | undefined =>
    this.sessions.get(sessionId)?.codexWeeklyUsage

  observe(sessionId: string, session: CodexSession, method: string, params: unknown): void {
    const payload =
      params && typeof params === 'object' ? (params as Record<string, unknown>) : undefined
    const isRoot = payload?.threadId === session.threadId
    if (method === 'thread/tokenUsage/updated') {
      const update = readCodexContextUsageUpdate(params)
      if (update?.threadId === session.threadId) {
        const {
          usedTokens: _used,
          maxTokens: _max,
          stale: _stale,
          ...knownLimits
        } = session.contextUsage ?? {}
        this.setContext(sessionId, session, {
          ...knownLimits,
          ...session.contextLimits,
          ...update.usage,
          stale: false
        })
      }
      return
    }
    if (method === 'account/rateLimits/updated') {
      const weekly = readCodexWeeklyUsage(params)
      if (weekly) {
        session.weeklyUsageRevision = (session.weeklyUsageRevision ?? 0) + 1
        this.setWeekly(sessionId, session, weekly)
      }
      return
    }
    if (!isRoot) {
      return
    }
    if (isCodexCompactionComplete(method, params)) {
      const { usedTokens: _used, stale: _stale, ...knownLimits } = session.contextUsage ?? {}
      this.setContext(sessionId, session, {
        ...knownLimits,
        ...session.contextLimits,
        stale: true
      })
      return
    }
    if (method === 'thread/settings/updated') {
      const settings =
        payload?.threadSettings && typeof payload.threadSettings === 'object'
          ? (payload.threadSettings as Record<string, unknown>)
          : undefined
      if (typeof settings?.model === 'string' && settings.model !== session.contextModel) {
        this.modelChanged(sessionId, session, settings.model)
      }
      return
    }
    if (
      method === 'model/rerouted' &&
      typeof payload?.toModel === 'string' &&
      payload.toModel !== session.contextModel
    ) {
      this.modelChanged(sessionId, session, payload.toModel)
    }
  }

  modelChanged(sessionId: string, session: CodexSession, model: string): void {
    session.contextModel = model
    session.contextLimits = undefined
    this.setContext(sessionId, session, undefined)
    void this.refreshContextLimits(sessionId, session, model)
  }

  async refresh(sessionId: string, session: CodexSession): Promise<void> {
    const weeklyRevision = session.weeklyUsageRevision ?? 0
    await Promise.all([
      this.refreshContextLimits(
        sessionId,
        session,
        session.options.get('model') ?? session.reportedOptions.model
      ),
      session.connection
        .request('account/rateLimits/read', undefined, { timeoutMs: this.deps.requestTimeoutMs })
        .then((result) => {
          const usage = readCodexWeeklyUsage(result)
          if (
            usage &&
            this.isCurrent(sessionId, session) &&
            (session.weeklyUsageRevision ?? 0) === weeklyRevision
          ) {
            this.setWeekly(sessionId, session, usage)
          }
        })
        .catch(() => {})
    ])
  }

  private async refreshContextLimits(
    sessionId: string,
    session: CodexSession,
    model?: string
  ): Promise<void> {
    if (!session.contextLaunch) {
      return
    }
    const generation = (session.contextResolutionGeneration ?? 0) + 1
    session.contextResolutionGeneration = generation
    try {
      const limits = await readCodexContextLimits({
        connection: session.connection,
        ...session.contextLaunch,
        ...(model ? { model } : {}),
        ...(this.deps.requestTimeoutMs ? { timeoutMs: this.deps.requestTimeoutMs } : {})
      })
      if (
        this.isCurrent(sessionId, session) &&
        session.contextResolutionGeneration === generation
      ) {
        if (model) {
          session.contextModel = model
        }
        session.contextLimits = limits
        const usage = { ...limits, ...session.contextUsage }
        this.setContext(sessionId, session, Object.keys(usage).length > 0 ? usage : undefined)
      }
    } catch {
      // Older app-server builds can lack config/read; token snapshots still publish usage.
    }
  }

  private isCurrent(sessionId: string, session: CodexSession): boolean {
    return this.sessions.get(sessionId) === session && !session.ended
  }

  private setContext(
    sessionId: string,
    session: CodexSession,
    usage: CodexContextUsage | undefined
  ): void {
    if (codexContextUsageEqual(session.contextUsage, usage)) {
      return
    }
    session.contextUsage = usage
    this.deps.onStatusMetadataChanged?.(sessionId)
  }

  private setWeekly(
    sessionId: string,
    session: CodexSession,
    usage: CodexWeeklyUsage | undefined
  ): void {
    if (codexWeeklyUsageEqual(session.codexWeeklyUsage, usage)) {
      return
    }
    session.codexWeeklyUsage = usage
    this.deps.onStatusMetadataChanged?.(sessionId)
  }
}
