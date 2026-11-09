import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import {
  realClaudeAuthenticated,
  realClaudeAvailable,
  realClaudeCliGate,
  realClaudeCommand,
  realClaudeLaunchHome
} from './claude-real-cli-availability-test-support'
import { forkClaudeConversationCompacted } from './claude-conversation-compact-fork'
import { openClaudeStreamJsonConnection } from './claude-stream-json-connection'
import { CLAUDE_STRUCTURED_BASE_OPTIONS } from './claude-structured-launch-resolution'
import { readClaudeTranscriptTurns } from './claude-transcript-turns'

const suiteTitle = `Claude conversation branch on the real CLI${realClaudeCliGate.skipReason ? ` (skipped: ${realClaudeCliGate.skipReason})` : ''}`

async function twoTurnConversation(cwd: string, sessionId: string): Promise<void> {
  let settle: (() => void) | null = null
  const connection = await openClaudeStreamJsonConnection(
    {
      pathToClaudeCodeExecutable: realClaudeCommand,
      options: { ...CLAUDE_STRUCTURED_BASE_OPTIONS, sessionId, model: 'haiku' },
      cwd,
      env: realClaudeLaunchHome().env
    },
    { onMessage: (message) => message.type === 'result' && settle?.() }
  )
  try {
    for (const word of ['one', 'two']) {
      const done = new Promise<void>((resolve) => {
        settle = resolve
      })
      await connection.send({
        type: 'user',
        uuid: randomUUID(),
        message: {
          role: 'user',
          content: [{ type: 'text', text: `Reply with exactly the word: ${word}` }]
        },
        parent_tool_use_id: null,
        session_id: sessionId
      })
      await done
    }
  } finally {
    await connection.close()
  }
}

async function transcriptOf(sessionId: string): Promise<string | null> {
  return resolveSessionFilePath('claude', sessionId, {
    claudeProjectsDir: join(realClaudeLaunchHome().claudeConfigDir, 'projects')
  })
}

describe.skipIf(!realClaudeAvailable)(suiteTitle, () => {
  it.skipIf(!realClaudeAuthenticated)(
    'compacts a branch forked after the first turn without touching the parent',
    async () => {
      const cwd = realpathSync(await mkdtemp(join(tmpdir(), 'orca-branch-real-cli-')))
      const parent = randomUUID()
      const child = randomUUID()
      try {
        await twoTurnConversation(cwd, parent)
        const parentPath = await transcriptOf(parent)
        expect(parentPath).not.toBeNull()
        const { turns } = await readClaudeTranscriptTurns(parentPath!)
        expect(turns.map((turn) => turn.reply)).toEqual(['one', 'two'])
        const before = await readFile(parentPath!, 'utf8')

        await forkClaudeConversationCompacted({
          command: realClaudeCommand,
          env: realClaudeLaunchHome().env,
          cwd,
          sourceSessionId: parent,
          boundaryUuid: turns[0].boundaryUuid,
          targetSessionId: child,
          focus: 'Focus only on the word one'
        })

        const childPath = await transcriptOf(child)
        expect(childPath).not.toBeNull()
        const forked = await readFile(childPath!, 'utf8')
        expect(forked).toContain('compact_boundary')
        expect(forked).not.toContain('Reply with exactly the word: two')
        expect(await readFile(parentPath!, 'utf8')).toBe(before)
      } finally {
        await rm(cwd, { recursive: true, force: true })
      }
    },
    240_000
  )
})
