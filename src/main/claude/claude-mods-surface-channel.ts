import {
  CLAUDE_MODS_CLIENT_ID,
  CLAUDE_MODS_SURFACE,
  EMPTY_CLAUDE_MODS_PANE_ROSTER,
  type ClaudeModsPaneRoster,
  type ClaudeModsRequestSubtype,
  type ClaudeModsSurfaceEvent,
  type ClaudeModsUnavailableReason
} from '../../shared/claude-mods-surface'
import { CLAUDE_MODS_ASK_SUBTYPES } from '../../shared/claude-mods-prompt-answers'
import {
  ClaudeControlRequestError,
  type ClaudeControlSurface
} from './claude-agent-sdk-control-requests'
import {
  claudeModsPushEvent,
  claudeModsPushSubtype,
  readClaudeModsPaneRoster
} from './claude-mods-surface-push'
import type { ClaudeModsAskInterceptor } from './claude-mods-surface-ask-intercept'
import { ClaudeModsAskRouter, type ClaudeModsAskListener } from './claude-mods-surface-asks'

/** A press or render that takes longer than this is a stuck mod, not a slow one. */
const CLAUDE_MODS_REQUEST_TIMEOUT_MS = 10_000

export type ClaudeModsConnection = Pick<ClaudeControlSurface, 'uiRequest'> & {
  /** Absent when the SDK cannot answer the CLI's asks; `answers` is then never named. */
  answerUiAsks?: ClaudeModsAskInterceptor
}

type Listener = (event: ClaudeModsSurfaceEvent) => void

function isUnsupportedSubtype(error: unknown): boolean {
  return (
    error instanceof ClaudeControlRequestError &&
    /unsupported control request subtype/i.test(error.message)
  )
}

/** Only a CLI naming the field it refused; a timeout must not cost the session its answers. */
function refusesAnswersField(error: unknown): boolean {
  return (
    error instanceof ClaudeControlRequestError &&
    !isUnsupportedSubtype(error) &&
    /\banswers\b/i.test(error.message)
  )
}

/** `answers` is named when non-empty, or `[]` to withdraw a list sent before (`withdraw`). */
function attachBody(answers: readonly string[], withdraw = false): Record<string, unknown> {
  return {
    subtype: 'ui_attach',
    surface: CLAUDE_MODS_SURFACE,
    client_id: CLAUDE_MODS_CLIENT_ID,
    ...(answers.length > 0 || withdraw ? { answers: [...answers] } : {})
  }
}

// ui_close names the pane and the Client requests name plugin/component/instance themselves
// (the CLI ignores surface/client_id there); every other request says whose surface asks.
const ADDRESSLESS: ReadonlySet<ClaudeModsRequestSubtype> = new Set([
  'ui_close',
  'ui_client_module',
  'ui_client_press',
  'ui_message',
  'ui_client_fault'
])

/**
 * One structured Claude session's mods surface. Outlives the session's children: a restart
 * rebinds the connection and the renderer's subscribers stay. Attaches only while someone
 * subscribes, so a chat whose renderer has mods off never joins the CLI's surface roster.
 */
export class ClaudeModsSessionChannel {
  private connection: ClaudeModsConnection | null = null
  private generation = 0
  private attached: Promise<ClaudeModsUnavailableReason | null> | null = null
  private roster: ClaudeModsPaneRoster = EMPTY_CLAUDE_MODS_PANE_ROSTER
  private readonly statuses = new Map<string, string>()
  private readonly listeners = new Set<Listener>()
  private readonly asks = new ClaudeModsAskRouter(() => this.syncAnswers())
  private releaseAsks: (() => void) | null = null
  /** The `answers` the CLI holds for this attach. */
  private advertised: readonly string[] = []

  constructor(private readonly onIdle: (channel: ClaudeModsSessionChannel) => void) {}

  get idle(): boolean {
    return this.connection === null && this.listeners.size === 0 && !this.asks.listening
  }

  /** The session's current child; the returned unbind is a no-op once another child bound. */
  bind(connection: ClaudeModsConnection): () => void {
    const generation = ++this.generation
    this.connection = connection
    this.reset()
    this.releaseAsks = connection.answerUiAsks?.(this.asks.route) ?? null
    if (this.listeners.size > 0) {
      void this.publishState()
    }
    return () => {
      if (generation !== this.generation) {
        return
      }
      this.connection = null
      this.reset()
      void this.publishState()
      this.releaseIfIdle()
    }
  }

  /** True when the frame was a mods push: it belongs to this channel, never the transcript. */
  routePush(message: Record<string, unknown>): boolean {
    const subtype = claudeModsPushSubtype(message)
    if (!subtype) {
      return false
    }
    const event = claudeModsPushEvent(subtype, message)
    if (event?.type === 'panes') {
      this.roster = event.roster
    } else if (event?.type === 'status') {
      if (event.text === null) {
        this.statuses.delete(event.plugin)
      } else {
        this.statuses.set(event.plugin, event.text)
      }
    }
    if (event) {
      this.emit(event)
    }
    return true
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    void this.ensureAttached().then((reason) => {
      if (this.listeners.has(listener)) {
        listener(this.stateEvent(reason))
      }
    })
    return () => {
      if (!this.listeners.delete(listener) || this.listeners.size > 0) {
        return
      }
      const connection = this.connection
      if (connection && this.attached) {
        this.attached = null
        void connection
          .uiRequest?.({ subtype: 'ui_detach', client_id: CLAUDE_MODS_CLIENT_ID })
          .catch(() => {})
      }
      this.releaseIfIdle()
    }
  }

  /** A composer answering the CLI's asks; the latest one answers, as on Desktop. */
  subscribeAsks(listener: ClaudeModsAskListener): () => void {
    const unsubscribe = this.asks.subscribe(listener)
    return () => {
      unsubscribe()
      this.releaseIfIdle()
    }
  }

  /** False when the ask already settled (its deadline passed) or was never this channel's. */
  answerAsk(id: string, answer: unknown): boolean {
    return this.asks.answer(id, answer)
  }

  async request(
    subtype: ClaudeModsRequestSubtype,
    fields: Record<string, unknown>
  ): Promise<unknown> {
    const reason = await this.ensureAttached()
    const send = this.connection?.uiRequest
    if (reason || !send) {
      throw new Error(`Claude mods are unavailable: ${reason ?? 'no-connection'}`)
    }
    const address = ADDRESSLESS.has(subtype)
      ? {}
      : { surface: CLAUDE_MODS_SURFACE, client_id: CLAUDE_MODS_CLIENT_ID }
    const answer = await send(
      { ...fields, ...address, subtype },
      { timeoutMs: CLAUDE_MODS_REQUEST_TIMEOUT_MS }
    )
    if (subtype === 'ui_panes') {
      this.roster = readClaudeModsPaneRoster(answer) ?? this.roster
    }
    return answer
  }

  private ensureAttached(): Promise<ClaudeModsUnavailableReason | null> {
    const connection = this.connection
    const send = connection?.uiRequest
    if (!connection) {
      return Promise.resolve('no-connection')
    }
    if (!send) {
      return Promise.resolve('unsupported-cli')
    }
    const generation = this.generation
    this.attached ??= (async () => {
      try {
        let answers = this.answerList()
        try {
          await send(attachBody(answers))
        } catch (error) {
          if (answers.length === 0 || !refusesAnswersField(error)) {
            throw error
          }
          // A CLI that predates `answers` refuses the field: attach without answering.
          answers = []
          await send(attachBody(answers))
        }
        if (generation === this.generation) {
          this.advertised = answers
        }
        // A pane opened before the attach pushes nothing; the roster read on mount covers it.
        const roster = readClaudeModsPaneRoster(
          await send({ subtype: 'ui_panes', client_id: CLAUDE_MODS_CLIENT_ID })
        )
        if (roster && generation === this.generation) {
          this.roster = roster
        }
        return null
      } catch (error) {
        // An older CLI rejects the subtype outright; anything else may pass on a later attach.
        if (generation === this.generation) {
          this.attached = null
        }
        return isUnsupportedSubtype(error) ? 'unsupported-cli' : 'attach-failed'
      }
    })()
    return this.attached
  }

  private answerList(): string[] {
    return this.connection?.answerUiAsks && this.asks.listening ? [...CLAUDE_MODS_ASK_SUBTYPES] : []
  }

  /** A composer came or went while attached: a repeated ui_attach replaces the `answers`. */
  private syncAnswers(): void {
    const attached = this.attached
    const send = this.connection?.uiRequest
    if (!attached || !send) {
      return
    }
    const generation = this.generation
    void attached.then((reason) => {
      const answers = this.answerList()
      if (
        reason ||
        generation !== this.generation ||
        this.attached !== attached ||
        answers.join() === this.advertised.join()
      ) {
        return
      }
      this.advertised = answers
      void send(attachBody(answers, true)).catch(() => {
        this.advertised = []
      })
    })
  }

  private reset(): void {
    this.releaseAsks?.()
    this.releaseAsks = null
    this.asks.settleAll()
    this.advertised = []
    this.attached = null
    this.roster = EMPTY_CLAUDE_MODS_PANE_ROSTER
    this.statuses.clear()
  }

  private async publishState(): Promise<void> {
    const reason = this.listeners.size > 0 ? await this.ensureAttached() : 'no-connection'
    this.emit(this.stateEvent(reason))
  }

  private stateEvent(reason: ClaudeModsUnavailableReason | null): ClaudeModsSurfaceEvent {
    return {
      type: 'state',
      available: reason === null,
      ...(reason ? { reason } : {}),
      roster: this.roster,
      statuses: Object.fromEntries(this.statuses)
    }
  }

  private emit(event: ClaudeModsSurfaceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.warn('[claude-mods] a surface listener threw:', error)
      }
    }
  }

  private releaseIfIdle(): void {
    if (this.idle) {
      this.onIdle(this)
    }
  }
}

const channels = new Map<string, ClaudeModsSessionChannel>()

/** The channel for a structured Claude session, created on first use. */
export function claudeModsSessionChannel(sessionId: string): ClaudeModsSessionChannel {
  let channel = channels.get(sessionId)
  if (!channel) {
    channel = new ClaudeModsSessionChannel((idle) => {
      if (channels.get(sessionId) === idle) {
        channels.delete(sessionId)
      }
    })
    channels.set(sessionId, channel)
  }
  return channel
}

/** The channel only if the session has one: a request for an unknown session creates nothing. */
export function existingClaudeModsSessionChannel(
  sessionId: string
): ClaudeModsSessionChannel | null {
  return channels.get(sessionId) ?? null
}
