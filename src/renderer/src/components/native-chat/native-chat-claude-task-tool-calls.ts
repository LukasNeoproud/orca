import type { NativeChatTask } from '../../../../shared/native-chat-task-list'
import { pairToolBlocks } from '../../../../shared/native-chat-tool-pairs'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'

// Claude keeps its task list one call at a time: `TaskCreate` adds a task, `TaskUpdate` changes
// one. Each such call is redrawn as the whole list after it (a `TodoWrite`), which is the shape
// the task card, its change summary and the side panel already read.

type TaskEntries = readonly (readonly [string, NativeChatTask])[]

const projected = new WeakMap<
  NativeChatMessage,
  { before: string; after: TaskEntries; message: NativeChatMessage }
>()

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a non-null, non-array object is checked on the line above.
      (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isTaskCall(block: NativeChatBlock): boolean {
  return block.type === 'tool-call' && (block.name === 'TaskCreate' || block.name === 'TaskUpdate')
}

/** The next id the CLI will hand out: it numbers tasks from 1 in creation order. */
function nextTaskId(tasks: ReadonlyMap<string, NativeChatTask>): string {
  let highest = 0
  for (const id of tasks.keys()) {
    highest = Math.max(highest, Number(id) || 0)
  }
  return String(highest + 1)
}

function applyTaskCall(
  tasks: Map<string, NativeChatTask>,
  name: string,
  input: Record<string, unknown>,
  output: string | undefined
): void {
  if (name === 'TaskCreate') {
    const content = text(input.subject) ?? text(input.description)
    if (!content) {
      return
    }
    // The result names the id; a call still running gets the one the CLI will give it.
    const id = /#(\d+)/.exec(output ?? '')?.[1] ?? nextTaskId(tasks)
    const activeForm = text(input.activeForm)
    tasks.set(id, { content, status: 'pending', ...(activeForm ? { activeForm } : {}) })
    return
  }
  const id = text(input.taskId)
  if (!id) {
    return
  }
  if (input.status === 'deleted') {
    tasks.delete(id)
    return
  }
  // A task created before the loaded page is known only by its number.
  const known = tasks.get(id) ?? { content: `#${id}`, status: 'pending' as const }
  const status =
    input.status === 'pending' || input.status === 'in_progress' || input.status === 'completed'
      ? input.status
      : known.status
  const activeForm = text(input.activeForm) ?? known.activeForm
  tasks.set(id, {
    content: text(input.subject) ?? known.content,
    status,
    ...(activeForm ? { activeForm } : {})
  })
}

/** Messages in transcript order. A message keeps its projected identity while it and the list
 *  before it are unchanged, so settled rows stay memoized. */
export function projectClaudeTaskToolCalls(
  messages: readonly NativeChatMessage[]
): NativeChatMessage[] {
  const tasks = new Map<string, NativeChatTask>()
  return messages.map((message) => {
    if (message.role === 'user' || !message.blocks.some(isTaskCall)) {
      return message
    }
    const before = JSON.stringify([...tasks])
    const cached = projected.get(message)
    if (cached?.before === before) {
      tasks.clear()
      for (const [id, task] of cached.after) {
        tasks.set(id, task)
      }
      return cached.message
    }
    const results = new Map(pairToolBlocks(message.blocks).map((pair) => [pair.call, pair.result]))
    const blocks = message.blocks.map((block): NativeChatBlock => {
      if (block.type !== 'tool-call' || !isTaskCall(block)) {
        return block
      }
      const result = results.get(block)
      const input = record(block.input)
      if (input && block.state !== 'failed' && !result?.isError) {
        applyTaskCall(tasks, block.name, input, result?.output)
      }
      return { ...block, name: 'TodoWrite', input: { todos: [...tasks.values()] } }
    })
    const next = { ...message, blocks }
    projected.set(message, { before, after: [...tasks], message: next })
    return next
  })
}
