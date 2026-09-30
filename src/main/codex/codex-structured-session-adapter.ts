import * as codexRewind from './codex-structured-rewind'
import { StructuredSessionCompaction } from '../native-chat/agent-session-wire/structured-session-compaction'
import type {
  AgentSessionAcquisition,
  StructuredAgentSessionAcquireInput,
  StructuredAgentSessionAdapter
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { CodexJournalTranslationAdmission } from './codex-structured-journal-translation'
import { answerCodexPrompt } from './codex-structured-prompt-replies'
import { supportsCodexStructuredLocation } from './codex-structured-location-support'
import * as codexClose from './codex-structured-session-close'
import { readLiveCodexSessionOptions } from './codex-structured-session-options'
import {
  CodexAcquisitionRegistry,
  requireLiveCodexSession,
  type CodexAcquisitionAttempt,
  type CodexSession,
  type CodexStructuredSessionAdapterDeps,
  type CodexStructuredSessionEvent
} from './codex-structured-session-state'
import {
  deliverCodexNotification,
  deliverCodexServerRequest,
  deliverCodexUnhandledFrame
} from './codex-structured-provider-events'
import { CodexStructuredTurnCancellation } from './codex-structured-turn-cancellation'
import { createCodexStructuredNotificationRetry } from './codex-structured-notification-retry'
import { acquireCodexStructuredSession } from './codex-structured-session-acquire'
import { CodexStructuredSessionStatusMetadata } from './codex-structured-session-status-metadata'
import { forkCodexStructuredConversation } from './codex-structured-session-fork'
import {
  cancelCodexStructuredAdapterTurn,
  compactCodexStructuredAdapterSession,
  dispatchCodexStructuredAdapterTurn,
  setCodexStructuredAdapterOption
} from './codex-structured-session-operations'
import { readCodexTurnId } from './codex-structured-thread-facts'

export type {
  CodexStructuredLaunch,
  CodexStructuredSessionAdapterDeps,
  CodexStructuredSessionEvent
} from './codex-structured-session-state'

export class CodexStructuredSessionAdapter implements StructuredAgentSessionAdapter {
  private readonly compactions = new StructuredSessionCompaction()
  private readonly sessions = new Map<string, CodexSession>()
  private readonly acquisitions = new CodexAcquisitionRegistry()
  private readonly turnCancellation: CodexStructuredTurnCancellation
  private readonly notificationRetries: ReturnType<typeof createCodexStructuredNotificationRetry>
  private readonly statusMetadata: CodexStructuredSessionStatusMetadata

  constructor(private readonly deps: CodexStructuredSessionAdapterDeps) {
    this.statusMetadata = new CodexStructuredSessionStatusMetadata(this.sessions, deps)
    this.notificationRetries = createCodexStructuredNotificationRetry({
      sessionFor: (sessionId) => this.sessions.get(sessionId),
      translate: (sessionId, session, method, params) =>
        this.translateNotification(sessionId, session, method, params)
    })
    this.turnCancellation = new CodexStructuredTurnCancellation({
      captureTurnProcesses: deps.captureTurnProcesses,
      terminateTurnProcesses: deps.terminateTurnProcesses,
      requestTimeoutMs: deps.requestTimeoutMs,
      emit: (session, event) => {
        const admission = this.emit(session, event)
        if (!admission.accepted && event.type === 'notification') {
          this.notificationRetries.handle(event.sessionId, event.method, event.params)
        }
        return admission
      }
    })
  }

  supportsLocation = (location: Parameters<typeof supportsCodexStructuredLocation>[0]): boolean =>
    supportsCodexStructuredLocation(location, this.deps.isWindowsProcessStartTimeAvailable)

  acquire = async (input: StructuredAgentSessionAcquireInput): Promise<AgentSessionAcquisition> => {
    const acquired = await acquireCodexStructuredSession({
      input,
      deps: this.deps,
      sessions: this.sessions,
      acquisitions: this.acquisitions,
      turnCancellation: this.turnCancellation,
      notificationRetries: this.notificationRetries,
      deliver: (acquisition, sessionId, event, retainedBytes) =>
        this.deliver(acquisition, sessionId, event, retainedBytes),
      handleServerRequest: (sessionId, request) => this.handleServerRequest(sessionId, request),
      handleUnhandledFrame: (sessionId, kind, payload) =>
        this.handleUnhandledFrame(sessionId, kind, payload),
      forceCloseUnexpected: (sessionId, fence, acquisitionGeneration, reason) =>
        codexClose.forceCloseUnexpectedCodexSession(
          this.sessions,
          this.deps.onEvent,
          sessionId,
          fence,
          acquisitionGeneration,
          reason
        )
    })
    const session = this.sessions.get(input.identity.sessionId)
    if (session) {
      void this.statusMetadata.refresh(input.identity.sessionId, session)
    }
    return acquired
  }

  forkConversation: NonNullable<StructuredAgentSessionAdapter['forkConversation']> = async (
    input
  ) =>
    forkCodexStructuredConversation({
      request: input,
      source: this.session(input.sourceSessionId),
      deps: this.deps
    })

  /** Buffers pre-publication events and drops events from superseded children. */
  private deliver(
    acquisition: CodexAcquisitionAttempt['window'],
    sessionId: string,
    event: () => unknown,
    retainedBytes?: number
  ): void {
    if (acquisition.buffer(event, retainedBytes)) {
      return
    }
    if (this.sessions.get(sessionId)?.connection === acquisition.connection) {
      event()
    } else if (acquisition.isOverflowed) {
      // Pre-publication overflow is an acquisition failure, not a dropped
      // notification; tear down the child so callers retry explicitly.
      void acquisition.connection?.close()
    }
  }

  private translateNotification(
    sessionId: string,
    session: CodexSession,
    method: string,
    params: unknown
  ): CodexJournalTranslationAdmission {
    this.statusMetadata.observe(sessionId, session, method, params)
    codexRewind.observeCodexRewindActivity(session, method, params)
    if (this.turnCancellation.handleNotification(sessionId, session, method, params)) {
      return { accepted: true }
    }
    return deliverCodexNotification(sessionId, session, method, params, (current, event) =>
      this.emit(current, event)
    )
  }

  /** Journal first so observers never see an event ahead of its durable row. */
  private emit(
    session: CodexSession,
    event: CodexStructuredSessionEvent
  ): CodexJournalTranslationAdmission {
    const settlements = this.promptSettlements(session, event)
    for (const { journalItemIds } of settlements) {
      for (const itemId of journalItemIds) {
        const cancelled = session.translator?.cancelPrompt(itemId) ?? { accepted: true }
        if (!cancelled.accepted) {
          return cancelled
        }
      }
    }
    const admission = session.translator?.handle(event) ?? { accepted: true }
    if (!admission.accepted) {
      return admission
    }
    for (const { prompt } of settlements) {
      session.prompts.forget(prompt)
    }
    if (event.type === 'notification') {
      this.compactions.codex(event.sessionId, event.method, event.params)
    }
    if (event.type === 'ended') {
      this.compactions.ended(event.sessionId)
    }
    this.deps.onEvent?.(event)
    return admission
  }

  private promptSettlements(session: CodexSession, event: CodexStructuredSessionEvent) {
    if (event.type !== 'notification') {
      return []
    }
    if (event.method === 'serverRequest/resolved') {
      const requestId =
        typeof event.params === 'object' && event.params !== null
          ? (event.params as Record<string, unknown>).requestId
          : null
      return typeof requestId === 'string' || typeof requestId === 'number'
        ? session.prompts.interactionSettlements({ requestId })
        : []
    }
    const turnId = event.method === 'turn/completed' ? readCodexTurnId(event.params) : null
    return turnId
      ? session.prompts.interactionSettlements({ threadId: event.threadId, turnId })
      : []
  }

  private handleServerRequest(
    sessionId: string,
    request: Parameters<typeof deliverCodexServerRequest>[2]
  ): void {
    deliverCodexServerRequest(sessionId, this.sessions.get(sessionId), request, (session, event) =>
      this.emit(session, event)
    )
  }

  private handleUnhandledFrame(sessionId: string, kind: string, params: unknown): void {
    deliverCodexUnhandledFrame(
      sessionId,
      this.sessions.get(sessionId),
      kind,
      params,
      (session, event) => this.emit(session, event)
    )
  }

  bindPromptItemId = (sessionId: string, journalItemId: string, promptKey: string): void =>
    this.sessions
      .get(sessionId)
      ?.prompts.bindJournalItemId(journalItemId, this.session(sessionId).threadId, promptKey)

  dispatch: StructuredAgentSessionAdapter['dispatch'] = async (input) =>
    dispatchCodexStructuredAdapterTurn({
      request: input,
      session: this.session(input.sessionId),
      cancellation: this.turnCancellation,
      requestTimeoutMs: this.deps.requestTimeoutMs
    })

  cancelTurn: StructuredAgentSessionAdapter['cancelTurn'] = async (input) =>
    cancelCodexStructuredAdapterTurn({
      request: input,
      session: this.session(input.sessionId),
      compactions: this.compactions,
      cancellation: this.turnCancellation
    })

  rewindSupport: NonNullable<StructuredAgentSessionAdapter['rewindSupport']> = (sessionId) =>
    this.sessions.get(sessionId)?.historyMode === 'legacy'
      ? { supported: false, reason: 'history-not-paginated' }
      : { supported: true }

  rewind: NonNullable<StructuredAgentSessionAdapter['rewind']> = (input) =>
    codexRewind.rewindCodexSession(this.session(input.sessionId), input, this.deps.requestTimeoutMs)

  recoverRewind: NonNullable<StructuredAgentSessionAdapter['recoverRewind']> = (input) =>
    codexRewind.recoverCodexRewind(this.session(input.sessionId), input, this.deps.requestTimeoutMs)

  compact: NonNullable<StructuredAgentSessionAdapter['compact']> = (input) =>
    compactCodexStructuredAdapterSession({
      request: input,
      session: this.session(input.sessionId),
      compactions: this.compactions,
      cancellation: this.turnCancellation,
      requestTimeoutMs: this.deps.requestTimeoutMs
    })

  async answerPrompt(input: {
    sessionId: string
    itemId: string
    kind: 'approval' | 'question'
    optionId: string
    fence: number
  }): Promise<void> {
    const session = this.session(input.sessionId)
    answerCodexPrompt(session.prompts, session.connection, input.itemId, input.optionId)
    session.translator?.resolvePrompt(input.itemId)
  }

  setOption: StructuredAgentSessionAdapter['setOption'] = (input) =>
    setCodexStructuredAdapterOption({
      request: input,
      session: this.session(input.sessionId),
      statusMetadata: this.statusMetadata,
      requestTimeoutMs: this.deps.requestTimeoutMs
    })

  contextUsage = (sessionId: string) => this.statusMetadata.contextUsage(sessionId)
  codexWeeklyUsage = (sessionId: string) => this.statusMetadata.weeklyUsage(sessionId)

  readOptions = (input: { sessionId: string; fence: number }) =>
    readLiveCodexSessionOptions(this.session(input.sessionId), this.deps.requestTimeoutMs)

  historyFilePath: NonNullable<StructuredAgentSessionAdapter['historyFilePath']> = async (input) =>
    this.sessions.get(input.identity.sessionId)?.historyPath ?? null

  closeSession = async (sessionId: string): Promise<boolean> => {
    const closed = await codexClose.closeCodexSession(
      sessionId,
      this.sessions,
      this.acquisitions,
      this.deps.onEvent
    )
    if (closed) {
      this.notificationRetries.clear(sessionId, null)
    }
    return closed
  }
  forceCloseSession = async (sessionId: string): Promise<boolean> => {
    const closed = await codexClose.closeCodexPublishedSession(
      this.sessions,
      sessionId,
      this.deps.onEvent,
      {
        allowFailedSettlement: true,
        requestedClose: false
      }
    )
    if (closed) {
      this.notificationRetries.clear(sessionId, null)
    }
    return closed
  }

  disposeSession = (sessionId: string): Promise<boolean> => this.closeSession(sessionId)
  closeAll = (): Promise<void> =>
    codexClose.closeAllCodexSessions(this.sessions, this.acquisitions, (sessionId) =>
      this.disposeSession(sessionId)
    )
  releaseAcquisition = (input: { sessionId: string }): Promise<boolean> =>
    this.closeSession(input.sessionId)

  private session(sessionId: string): CodexSession {
    return requireLiveCodexSession(this.sessions, sessionId)
  }
}
