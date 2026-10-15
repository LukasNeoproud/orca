import { randomUUID } from 'node:crypto'
import {
  claudeModsAskDefaultAnswer,
  readClaudeModsAsk,
  readClaudeModsAskAnswer,
  type ClaudeModsAsk,
  type ClaudeModsAskAnswer,
  type ClaudeModsAskSubtype
} from '../../shared/claude-mods-prompt-answers'
import type { ClaudeModsAskHandler } from './claude-mods-surface-ask-intercept'

export type ClaudeModsAskListener = (ask: ClaudeModsAsk) => void

/** Desktop's staleness rule: an ask unanswered this long is answered "no" (the CLI waits 5 s). */
export const CLAUDE_MODS_ASK_DEADLINE_MS = 4_000

type PendingAsk = {
  subtype: ClaudeModsAskSubtype
  listener: ClaudeModsAskListener
  settle: (answer: ClaudeModsAskAnswer) => void
}

/**
 * Routes the CLI's asks to the composer that subscribed last, as Desktop answers from its most
 * recently registered composer, and settles each ask exactly once: the composer's checked answer,
 * or the default on the deadline, a cancel, or the composer leaving.
 */
export class ClaudeModsAskRouter {
  private readonly listeners: ClaudeModsAskListener[] = []
  private readonly pending = new Map<string, PendingAsk>()

  constructor(
    private readonly onListeningChange: () => void,
    private readonly deadlineMs = CLAUDE_MODS_ASK_DEADLINE_MS
  ) {}

  get listening(): boolean {
    return this.listeners.length > 0
  }

  subscribe(listener: ClaudeModsAskListener): () => void {
    this.listeners.push(listener)
    if (this.listeners.length === 1) {
      this.onListeningChange()
    }
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index === -1) {
        return
      }
      this.listeners.splice(index, 1)
      for (const entry of this.pending.values()) {
        if (entry.listener === listener) {
          entry.settle(claudeModsAskDefaultAnswer(entry.subtype))
        }
      }
      if (this.listeners.length === 0) {
        this.onListeningChange()
      }
    }
  }

  readonly route: ClaudeModsAskHandler = (inbound, signal) => {
    const fallback = claudeModsAskDefaultAnswer(inbound.subtype)
    const listener = this.listeners.at(-1)
    const ask = readClaudeModsAsk(randomUUID(), inbound.request)
    if (!listener || !ask || signal.aborted) {
      return Promise.resolve(fallback)
    }
    return new Promise((resolve) => {
      const onAbort = (): void => settle(fallback)
      const timer = setTimeout(onAbort, this.deadlineMs)
      timer.unref?.()
      const settle = (answer: ClaudeModsAskAnswer): void => {
        if (!this.pending.delete(ask.id)) {
          return
        }
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        resolve(answer)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(ask.id, { subtype: ask.subtype, listener, settle })
      try {
        listener(ask)
      } catch {
        settle(fallback)
      }
    })
  }

  /** False when the ask is unknown or already settled (a late answer past the deadline). */
  answer(id: string, value: unknown): boolean {
    const entry = this.pending.get(id)
    if (!entry) {
      return false
    }
    entry.settle(readClaudeModsAskAnswer(entry.subtype, value))
    return true
  }

  /** The child went away: nothing pending can be answered to it any more. */
  settleAll(): void {
    for (const entry of this.pending.values()) {
      entry.settle(claudeModsAskDefaultAnswer(entry.subtype))
    }
  }
}
