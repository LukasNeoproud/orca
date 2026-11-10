import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import {
  realClaudeAuthenticated,
  realClaudeCliGate,
  realClaudeCommand,
  realClaudeLaunchHome
} from './claude-real-cli-availability-test-support'
import { runClaudeSessionControl } from './claude-session-controls'
import { CLAUDE_STRUCTURED_BASE_OPTIONS } from './claude-structured-launch-resolution'
import { claudeApprovalItem } from './claude-structured-prompt-items'
import {
  ClaudeStructuredSessionAdapter,
  type ClaudeStructuredSessionEvent
} from './claude-structured-session-adapter'
import { claudeStartupSettled } from './claude-structured-session-test-support'

const SESSION_ID = 'real-cli-controls'
const suiteTitle = `Claude chat controls against the real CLI${realClaudeCliGate.skipReason ? ` (skipped: ${realClaudeCliGate.skipReason})` : ''}`

async function until<T>(read: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined || Date.now() >= deadline) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

describe(suiteTitle, () => {
  it.skipIf(!realClaudeAuthenticated)(
    'lists MCP servers and permission rules, answers a side question, and declines with a note',
    async () => {
      const providerSessionId = randomUUID()
      const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
      const cwd = await mkdtemp(join(tmpdir(), 'orca-claude-controls-real-'))
      const events: ClaudeStructuredSessionEvent[] = []
      const adapter = new ClaudeStructuredSessionAdapter({
        resolveLaunch: async () => ({
          pathToClaudeCodeExecutable: realClaudeCommand,
          options: {
            ...CLAUDE_STRUCTURED_BASE_OPTIONS,
            sessionId: providerSessionId,
            model: 'haiku',
            permissionMode: 'default'
          },
          cwd,
          env: realClaudeLaunchHome().env,
          claudeConfigDir,
          providerSessionId,
          resumeLeafUuid: null,
          resumesTranscript: false,
          continuesChain: false
        }),
        onEvent: (event) => events.push(event),
        readProcessStartTime: async () => 1,
        now: () => 2
      })
      try {
        await adapter.acquire({
          identity: {
            sessionId: SESSION_ID,
            workspaceId: 'real-cli-workspace',
            hostId: 'local',
            agent: 'claude',
            providerHandle: claudeProviderHandle(providerSessionId, null)
          },
          fence: 1,
          spawnToken: 'real-cli-controls'
        })
        await claudeStartupSettled(adapter, SESSION_ID)

        const { servers } = await runClaudeSessionControl(SESSION_ID, { kind: 'mcp-status' })
        expect(Array.isArray(servers)).toBe(true)
        for (const server of servers) {
          expect(server.name).toEqual(expect.any(String))
        }
        const rules = await runClaudeSessionControl(SESSION_ID, { kind: 'permission-rules' })
        expect(rules.originalCwd).toContain('orca-claude-controls-real-')
        expect(Array.isArray(rules.rules)).toBe(true)

        const usage = await runClaudeSessionControl(SESSION_ID, { kind: 'usage' })
        expect(usage.costUsd).toEqual(expect.any(Number))
        expect(Array.isArray(usage.limits)).toBe(true)

        const side = await runClaudeSessionControl(SESSION_ID, {
          kind: 'side-question',
          question: 'Reply with exactly the word: pong'
        })
        expect(side.response?.toLowerCase()).toContain('pong')

        await adapter.dispatch({
          sessionId: SESSION_ID,
          clientMessageId: 'real-cli-controls-1',
          body: {
            kind: 'message',
            role: 'user',
            blocks: [
              {
                type: 'text',
                text: 'Run exactly this with the Bash tool and nothing else: touch orca-probe.txt'
              }
            ]
          },
          fence: 1
        })
        const prompt = await until(
          () => events.flatMap((event) => (event.type === 'prompt' ? [event.prompt] : []))[0],
          90_000
        )
        expect(prompt).toMatchObject({ kind: 'approval', toolName: 'Bash' })
        expect(claudeApprovalItem(prompt!).accepts).toMatchObject({
          note: true,
          inputField: { name: 'command', value: expect.stringContaining('touch orca-probe.txt') }
        })
        adapter.bindPromptItemId(SESSION_ID, 'journal-approval', prompt!.promptKey)
        await adapter.answerPrompt({
          sessionId: SESSION_ID,
          itemId: 'journal-approval',
          kind: 'approval',
          response: {
            kind: 'option',
            optionId: 'deny',
            note: 'Do not create files. Reply with the single word NOTE-SEEN and stop.'
          },
          fence: 1,
          commit: async () => undefined
        })
        const reply = await until(
          () =>
            events
              .flatMap((event) =>
                event.type === 'message' && event.message.type === 'assistant'
                  ? [JSON.stringify(event.message.message)]
                  : []
              )
              .find((text) => text.includes('NOTE-SEEN')),
          90_000
        )
        expect(reply).toBeDefined()
        expect(existsSync(join(cwd, 'orca-probe.txt'))).toBe(false)
      } finally {
        await adapter.closeAll()
        await rm(cwd, { recursive: true, force: true })
      }
    },
    240_000
  )

  it.skipIf(!realClaudeAuthenticated)(
    'stops a subagent by the task id its roster entry carries',
    async () => {
      const providerSessionId = randomUUID()
      const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
      const cwd = await mkdtemp(join(tmpdir(), 'orca-claude-controls-real-'))
      const events: ClaudeStructuredSessionEvent[] = []
      const adapter = new ClaudeStructuredSessionAdapter({
        resolveLaunch: async () => ({
          pathToClaudeCodeExecutable: realClaudeCommand,
          options: {
            ...CLAUDE_STRUCTURED_BASE_OPTIONS,
            sessionId: providerSessionId,
            model: 'haiku',
            permissionMode: 'default'
          },
          cwd,
          env: realClaudeLaunchHome().env,
          claudeConfigDir,
          providerSessionId,
          resumeLeafUuid: null,
          resumesTranscript: false,
          continuesChain: false
        }),
        onEvent: (event) => events.push(event),
        readProcessStartTime: async () => 1,
        now: () => 2
      })
      const frames = (subtype: string): Record<string, unknown>[] =>
        events.flatMap((event) =>
          event.type === 'message' &&
          event.message.type === 'system' &&
          event.message.subtype === subtype
            ? [event.message]
            : []
        )
      try {
        await adapter.acquire({
          identity: {
            sessionId: SESSION_ID,
            workspaceId: 'real-cli-workspace',
            hostId: 'local',
            agent: 'claude',
            providerHandle: claudeProviderHandle(providerSessionId, null)
          },
          fence: 1,
          spawnToken: 'real-cli-controls-stop'
        })
        await claudeStartupSettled(adapter, SESSION_ID)
        await adapter.dispatch({
          sessionId: SESSION_ID,
          clientMessageId: 'real-cli-controls-stop-1',
          body: {
            kind: 'message',
            role: 'user',
            blocks: [
              {
                type: 'text',
                text: 'Use the Agent tool once to start a general-purpose subagent whose only job is to run the bash command `sleep 120`. Do not run it yourself.'
              }
            ]
          },
          fence: 1
        })
        // The subagent is running once it asks to run its command.
        const started = await until(() => frames('task_started')[0], 120_000)
        const taskId = typeof started?.task_id === 'string' ? started.task_id : ''
        expect(taskId).not.toBe('')
        const stopped = await adapter.stopBackgroundTasks({
          sessionId: SESSION_ID,
          fence: 1,
          taskIds: [taskId]
        })
        expect(stopped.cancelled).toBe(true)
        const ended = await until(
          () => frames('task_notification').find((frame) => frame.task_id === taskId),
          60_000
        )
        expect(ended).toBeDefined()
      } finally {
        await adapter.closeAll()
        await rm(cwd, { recursive: true, force: true })
      }
    },
    300_000
  )
})
