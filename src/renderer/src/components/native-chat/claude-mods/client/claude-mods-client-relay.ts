// The requests a Client sends on to its plugin: a press, typing or pick inside the module's
// drawing (`ui_client_press`), the module's own `surface.post` (`ui_message`, one per frame at
// most), and a fault (`ui_client_fault`). Every one carries the Client's address.

import type { ClaudeModsRequestSubtype } from '../../../../../../shared/claude-mods-surface'
import { scrubClaudeModsClientReason } from './claude-mods-client-events'

/** Where a Client sits: its plugin, the render site, the site's instance, its key and module. */
export type ClaudeModsClientAddress = {
  plugin: string
  component: string
  instance_id: string
  client: string
  module: string
}

export type ClaudeModsClientPhase = 'load' | 'render' | 'run'

export type ClaudeModsClientPressEvent =
  | { type: 'press' }
  | { type: 'input'; kind: 'change' | 'submit'; value: string }
  | { type: 'select'; value: string }

export type ClaudeModsClientRequest = (
  subtype: ClaudeModsRequestSubtype,
  fields: Record<string, unknown>
) => Promise<unknown>

/** What a press answered: run the closure with `reached`, redraw a stale site, or nothing. */
export type ClaudeModsClientPressOutcome =
  | { kind: 'reached'; reached: Record<string, unknown> }
  | { kind: 'stale' }
  | { kind: 'withheld' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readClaudeModsClientPressAnswer(answer: unknown): ClaudeModsClientPressOutcome {
  if (!isRecord(answer)) {
    return { kind: 'withheld' }
  }
  if (answer.handled === false) {
    return { kind: 'stale' }
  }
  return answer.handled === true && isRecord(answer.reached)
    ? { kind: 'reached', reached: answer.reached }
    : { kind: 'withheld' }
}

/** One Client's requests, sent in order so typing arrives as typed. */
export class ClaudeModsClientRelay {
  private queue: Promise<unknown> = Promise.resolve()
  private postPending: { data: unknown } | null = null
  private postTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly request: ClaudeModsClientRequest,
    private readonly address: () => ClaudeModsClientAddress,
    private readonly onProps: (props: unknown) => void,
    private readonly frameMs = 16
  ) {}

  press(element: string, event: ClaudeModsClientPressEvent): Promise<ClaudeModsClientPressOutcome> {
    const next = this.queue.then(() =>
      this.request('ui_client_press', { ...this.address(), element, event })
    )
    this.queue = next.catch(() => undefined)
    return next.then(readClaudeModsClientPressAnswer, () => ({ kind: 'withheld' as const }))
  }

  /** A later post in the same frame replaces an undelivered one. */
  post(data: unknown): void {
    this.postPending = { data }
    this.postTimer ??= setTimeout(() => this.flushPost(), this.frameMs)
  }

  fault(phase: ClaudeModsClientPhase, reason: string): void {
    // A CLI without the request answers an error the transport already logged.
    void this.request('ui_client_fault', {
      ...this.address(),
      phase,
      reason: scrubClaudeModsClientReason(reason)
    })
  }

  /** Drops an undelivered post; answers still in flight are the caller's to ignore. */
  cancel(): void {
    if (this.postTimer) {
      clearTimeout(this.postTimer)
      this.postTimer = null
    }
    this.postPending = null
  }

  private flushPost(): void {
    this.postTimer = null
    const pending = this.postPending
    this.postPending = null
    if (!pending) {
      return
    }
    void this.request('ui_message', { ...this.address(), data: pending.data }).then((answer) => {
      if (isRecord(answer) && answer.handled === true && 'props' in answer) {
        this.onProps(answer.props)
      }
    })
  }
}
