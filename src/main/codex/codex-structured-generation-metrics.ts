import type { NativeChatGeneration } from '../../shared/native-chat-generation'
import type { CodexThreadItem } from './codex-structured-item-translation'
import {
  readCodexJournalRecord,
  readCodexJournalString
} from './codex-structured-journal-translation-values'

export type CodexTurnGenerationMetadata = Pick<NativeChatGeneration, 'model' | 'serviceTier'>

export function codexTurnGenerationMetadata(host?: {
  options: ReadonlyMap<string, string>
  reportedOptions?: { model?: string; serviceTier?: string | null }
}): CodexTurnGenerationMetadata {
  const model = host?.options.get('model') ?? host?.reportedOptions?.model
  const serviceTier = host?.options.get('serviceTier') ?? host?.reportedOptions?.serviceTier
  return { ...(model ? { model } : {}), ...(serviceTier ? { serviceTier } : {}) }
}

type ResponseWindow = {
  assistantItemId: string | null
  firstTextAt: number | null
  lastTextAt: number | null
  completedItemId: string | null
  containsTool: boolean
  multipleMessages: boolean
}

type TurnGeneration = {
  metadata: CodexTurnGenerationMetadata
  response: ResponseWindow
  lastCompletedItemId: string | null
  pending: CodexGenerationUpdate | null
}

export type CodexGenerationUpdate = {
  itemId: string
  generation: NativeChatGeneration
}

/**
 * Joins one turn-scoped provider usage snapshot to one visible streamed reply.
 * A usage frame is the boundary between model responses, including tool loops.
 */
export class CodexStructuredGenerationMetrics {
  private readonly turns = new Map<string, TurnGeneration>()

  constructor(
    private readonly metadata: () => CodexTurnGenerationMetadata,
    private readonly now: () => number = () => performance.now()
  ) {}

  observeStreamDelta(
    event: { method: string; params: unknown },
    turnId: string | null,
    accepted: boolean
  ): void {
    if (event.method !== 'item/agentMessage/delta') {
      return
    }
    if (accepted) {
      const params = readCodexJournalRecord(event.params)
      this.observeTextDelta(turnId, readCodexJournalString(params, 'itemId'), params.delta)
    } else {
      this.invalidate(turnId)
    }
  }

  start(turnId: string): void {
    this.turns.clear()
    this.turns.set(turnId, {
      metadata: this.metadata(),
      response: responseWindow(),
      lastCompletedItemId: null,
      pending: null
    })
  }

  observeItem(turnId: string | null, method: string, item: CodexThreadItem): void {
    if (!turnId) {
      return
    }
    const turn = this.turns.get(turnId)
    if (!turn) {
      return
    }
    if (item.type === 'agentMessage') {
      const response = turn.response
      if (response.assistantItemId && response.assistantItemId !== item.id) {
        response.multipleMessages = true
      }
      response.assistantItemId ??= item.id
      if (method === 'item/completed') {
        if (response.assistantItemId !== item.id) {
          response.multipleMessages = true
        } else {
          response.completedItemId = item.id
          turn.lastCompletedItemId = item.id
        }
      }
      return
    }
    if (method === 'item/started' && item.type !== 'userMessage' && item.type !== 'reasoning') {
      turn.response.containsTool = true
    }
  }

  observeTextDelta(turnId: string | null, itemId: string | null, delta: unknown): void {
    if (!turnId || !itemId || typeof delta !== 'string' || delta.length === 0) {
      return
    }
    const turn = this.turns.get(turnId)
    if (!turn) {
      return
    }
    const response = turn.response
    if (response.assistantItemId && response.assistantItemId !== itemId) {
      response.multipleMessages = true
      return
    }
    response.assistantItemId ??= itemId
    const timestamp = this.now()
    response.firstTextAt ??= timestamp
    response.lastTextAt = timestamp
  }

  observeUsage(params: unknown): CodexGenerationUpdate | null {
    const root = record(params)
    const turnId = text(root?.turnId)
    if (!turnId) {
      return null
    }
    const turn = this.turns.get(turnId)
    if (!turn) {
      return null
    }
    const update = this.generationFor(turn, visibleOutputTokens(root))
    turn.response = responseWindow()
    if (update) {
      turn.pending = update
    }
    return update
  }

  complete(turnId: string, completed: boolean): CodexGenerationUpdate | null {
    const turn = this.turns.get(turnId)
    if (!turn || !turn.lastCompletedItemId) {
      return null
    }
    if (completed && turn.pending?.itemId === turn.lastCompletedItemId) {
      return turn.pending
    }
    return {
      itemId: turn.lastCompletedItemId,
      generation: unavailableGeneration(
        turn.metadata,
        completed ? 'provider-token-count-unavailable' : 'turn-not-completed'
      )
    }
  }

  settle(turnId: string): void {
    this.turns.delete(turnId)
  }

  clear(): void {
    this.turns.clear()
  }

  invalidate(turnId: string | null): void {
    const turn = turnId ? this.turns.get(turnId) : undefined
    if (turn) {
      turn.response.containsTool = true
    }
  }

  reroute(turnId: string | null, model: unknown): void {
    const turn = turnId ? this.turns.get(turnId) : undefined
    if (turn && typeof model === 'string' && model.length > 0) {
      turn.metadata = { ...turn.metadata, model }
      turn.pending = null
      turn.response.containsTool = true
    }
  }

  private generationFor(
    turn: TurnGeneration,
    outputTokens: number | null
  ): CodexGenerationUpdate | null {
    const response = turn.response
    if (!response.completedItemId) {
      return null
    }
    if (response.containsTool || response.multipleMessages) {
      return {
        itemId: response.completedItemId,
        generation: unavailableGeneration(turn.metadata, 'response-scope-ambiguous')
      }
    }
    if (outputTokens === null || outputTokens <= 0) {
      return {
        itemId: response.completedItemId,
        generation: unavailableGeneration(turn.metadata, 'provider-token-count-unavailable')
      }
    }
    const { firstTextAt, lastTextAt } = response
    if (firstTextAt === null || lastTextAt === null || lastTextAt <= firstTextAt) {
      return {
        itemId: response.completedItemId,
        generation: unavailableGeneration(turn.metadata, 'stream-timing-unavailable')
      }
    }
    return {
      itemId: response.completedItemId,
      generation: {
        ...turn.metadata,
        outputTokens,
        generationDurationMs: lastTextAt - firstTextAt,
        method: 'stream-estimate'
      }
    }
  }
}

function responseWindow(): ResponseWindow {
  return {
    assistantItemId: null,
    firstTextAt: null,
    lastTextAt: null,
    completedItemId: null,
    containsTool: false,
    multipleMessages: false
  }
}

function unavailableGeneration(
  metadata: CodexTurnGenerationMetadata,
  unavailableReason: string
): NativeChatGeneration {
  return { ...metadata, method: 'stream-estimate', unavailableReason }
}

function visibleOutputTokens(root: Record<string, unknown> | null): number | null {
  const usage = record(root?.tokenUsage)
  const last = record(usage?.last)
  const output = nonNegativeInteger(last?.outputTokens)
  const reasoning = nonNegativeInteger(last?.reasoningOutputTokens)
  if (output === null || reasoning === null || reasoning > output) {
    return null
  }
  return output - reasoning
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
