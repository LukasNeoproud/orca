import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import type { AgentSessionTopicIndexResult } from '../../../shared/agent-session-wire'
import {
  appendAutomaticTopicTurn,
  type StructuredTopicIndex,
  type StructuredTopicTurn
} from '../../../shared/structured-topic-index'
import type { StructuredAgentSessionHostSession } from './structured-agent-session-host-types'

const MAX_TURNS_PER_READ = 64
const MAX_PROMPT_CHARACTERS = 1_000

/** Reconciles a bounded completed-turn suffix from the host-owned durable journal. */
export async function readStructuredTopicIndex(
  session: StructuredAgentSessionHostSession
): Promise<AgentSessionTopicIndexResult> {
  const stored = session.journal.readTopicIndex()
  if (!stored.automatic) {
    return { index: stored }
  }
  const snapshot = session.journal.snapshot()
  const after = stored.chapters.at(-1)?.end
  const epochReset = Boolean(after && after.epoch !== snapshot.cursor.epoch)
  const base = epochReset ? { ...stored, chapters: [] } : stored
  const afterSequence = epochReset ? 0 : (after?.sequence ?? 0)
  const turns = completedTurnsAfter(snapshot.items, snapshot.cursor.epoch, afterSequence)
  if (turns.length === 0 && !epochReset) {
    return { index: stored }
  }
  let reconciled = base
  for (const turn of turns.slice(0, MAX_TURNS_PER_READ)) {
    reconciled = appendAutomaticTopicTurn(reconciled, turn)
  }
  if (reconciled === stored) {
    return { index: stored }
  }
  const durable = { ...reconciled, revision: stored.revision + 1 }
  return { index: await session.journal.writeTopicIndex(durable, stored.revision) }
}

export async function writeStructuredTopicIndex(
  session: StructuredAgentSessionHostSession,
  index: StructuredTopicIndex,
  expectedRevision: number
): Promise<AgentSessionTopicIndexResult> {
  return { index: await session.journal.writeTopicIndex(index, expectedRevision) }
}

function completedTurnsAfter(
  items: readonly AgentJournalRenderItem[],
  epoch: string,
  afterSequence: number
): StructuredTopicTurn[] {
  const turns: StructuredTopicTurn[] = []
  let pending: PendingTurn | null = null
  for (
    let position = firstAfterSequence(items, afterSequence);
    position < items.length;
    position += 1
  ) {
    const item = items[position]!
    if (item.body.kind === 'message' && item.body.role === 'user') {
      appendCompletedTurn(turns, pending, epoch, true)
      if (turns.length >= MAX_TURNS_PER_READ) {
        break
      }
      pending = {
        user: item,
        prompt: messageText(item).slice(0, MAX_PROMPT_CHARACTERS),
        assistant: null,
        sawLifecycle: false,
        running: false
      }
      continue
    }
    if (!pending) {
      continue
    }
    if (item.body.kind === 'message' && item.body.role === 'assistant') {
      pending.assistant = item
      continue
    }
    if (item.body.kind === 'status' && item.body.turnLifecycle) {
      pending.sawLifecycle = true
      pending.running = item.body.turnLifecycle.state === 'running'
    }
  }
  appendCompletedTurn(turns, pending, epoch, false)
  return turns.slice(0, MAX_TURNS_PER_READ)
}

function firstAfterSequence(items: readonly AgentJournalRenderItem[], sequence: number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (items[middle]!.sequence <= sequence) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

type PendingTurn = {
  user: AgentJournalRenderItem
  prompt: string
  assistant: AgentJournalRenderItem | null
  sawLifecycle: boolean
  running: boolean
}

function appendCompletedTurn(
  turns: StructuredTopicTurn[],
  pending: PendingTurn | null,
  epoch: string,
  nextUserProvesCompletion: boolean
): void {
  if (
    !pending?.prompt ||
    !pending.assistant ||
    (!nextUserProvesCompletion && pending.sawLifecycle && pending.running)
  ) {
    return
  }
  turns.push({
    start: anchor(epoch, pending.user),
    end: anchor(epoch, pending.assistant),
    prompt: pending.prompt,
    reply: messageText(pending.assistant).slice(0, MAX_PROMPT_CHARACTERS)
  })
}

function anchor(epoch: string, item: AgentJournalRenderItem) {
  return { epoch, itemId: item.itemId, sequence: item.sequence }
}

function messageText(item: AgentJournalRenderItem): string {
  return item.body.kind === 'message'
    ? item.body.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
        .trim()
    : ''
}
