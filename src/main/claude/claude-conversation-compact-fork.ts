// A compacted branch in one headless Claude run: fork the parent at the turn boundary into a
// pre-chosen session id and compact it with a focus before anyone writes to it. Claude writes a
// fork only once a message arrives, so the `/compact` is what materializes the branch.

import { randomUUID } from 'node:crypto'
import { CLAUDE_STRUCTURED_BASE_OPTIONS } from './claude-structured-launch-resolution'
import { openClaudeStreamJsonConnection } from './claude-stream-json-connection'

const INIT_TIMEOUT_MS = 60_000
const COMPACT_TIMEOUT_MS = 300_000

export type ClaudeCompactForkInput = {
  command: string
  env: Record<string, string>
  cwd: string
  sourceSessionId: string
  boundaryUuid: string
  targetSessionId: string
  focus: string
  openConnection?: typeof openClaudeStreamJsonConnection
}

function within<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`conversation_branch_fork_unverified: ${what} timed out`)),
      timeoutMs
    )
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}

export async function forkClaudeConversationCompacted(
  input: ClaudeCompactForkInput
): Promise<void> {
  let settle: ((message: Record<string, unknown>) => void) | null = null
  const result = new Promise<Record<string, unknown>>((resolve) => {
    settle = resolve
  })
  let compacted = false
  const connection = await (input.openConnection ?? openClaudeStreamJsonConnection)(
    {
      pathToClaudeCodeExecutable: input.command,
      options: {
        ...CLAUDE_STRUCTURED_BASE_OPTIONS,
        resume: input.sourceSessionId,
        forkSession: true,
        resumeSessionAt: input.boundaryUuid,
        sessionId: input.targetSessionId
      },
      cwd: input.cwd,
      env: input.env
    },
    {
      onMessage: (message) => {
        if (message.type === 'system' && message.subtype === 'compact_boundary') {
          compacted = true
        }
        if (message.type === 'result') {
          settle?.(message)
        }
      }
    }
  )
  try {
    await within(connection.initializationResult(), INIT_TIMEOUT_MS, 'Claude start')
    const text = input.focus.trim() ? `/compact ${input.focus.trim()}` : '/compact'
    await connection.send({
      type: 'user',
      uuid: randomUUID(),
      message: { role: 'user', content: [{ type: 'text', text }] },
      parent_tool_use_id: null,
      session_id: input.targetSessionId
    })
    const outcome = await within(result, COMPACT_TIMEOUT_MS, 'compaction')
    if (outcome.is_error === true || !compacted) {
      throw new Error(
        `conversation_branch_fork_unverified: compaction ended ${String(outcome.subtype ?? 'without a boundary')}`
      )
    }
  } finally {
    await connection.close()
  }
}
