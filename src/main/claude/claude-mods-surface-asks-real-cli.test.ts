// The CLI's asks (copy, read, fill, suggest) against the real CLI: the prompt-asks fixture mod
// asks the attached surface from slash commands it answers itself, so no model turn is spent.
// Opt-in like every real-CLI suite (ORCA_REAL_CLAUDE_CLI_TEST=1).

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import type { ClaudeModsAsk } from '../../shared/claude-mods-prompt-answers'
import type { ClaudeModsSurfaceEvent } from '../../shared/claude-mods-surface'
import { claudeQueryRawRequester } from './claude-agent-sdk-control-requests'
import { claudeQueryUiAskInterceptor } from './claude-mods-surface-ask-intercept'
import { ClaudeModsSessionChannel } from './claude-mods-surface-channel'
import {
  realClaudeAuthenticated,
  realClaudeAvailable,
  realClaudeCliGate,
  realClaudeCommand,
  realClaudeLaunchHome
} from './claude-real-cli-availability-test-support'

const FIXTURE = resolve(import.meta.dirname, '../../../tests/fixtures/claude-mods/prompt-asks')
const suiteTitle = `Claude mods asks against the real CLI${realClaudeCliGate.skipReason ? ` (skipped: ${realClaudeCliGate.skipReason})` : ''}`

function userInput(): { prompts: AsyncGenerator<SDKUserMessage>; send: (text: string) => void } {
  const queue: string[] = []
  let wake: (() => void) | null = null
  async function* prompts(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const text = queue.shift()
      if (text === undefined) {
        await new Promise<void>((next) => (wake = next))
        continue
      }
      yield {
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text }] },
        parent_tool_use_id: null,
        session_id: ''
      }
    }
  }
  return {
    prompts: prompts(),
    send: (text) => {
      queue.push(text)
      wake?.()
    }
  }
}

function nextLog(events: ClaudeModsSurfaceEvent[], prefix: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now()
    const poll = (): void => {
      const hit = events.find((event) => event.type === 'log' && event.text.startsWith(prefix))
      if (hit?.type === 'log') {
        resolvePromise(hit.text)
      } else if (Date.now() - started > 15_000) {
        reject(new Error(`timed out waiting for "${prefix}"`))
      } else {
        setTimeout(poll, 25)
      }
    }
    poll()
  })
}

describe.skipIf(!realClaudeAvailable)(suiteTitle, () => {
  it.skipIf(!realClaudeAuthenticated)(
    'answers the asks from the listening composer, and the empty box once it leaves',
    async () => {
      const input = userInput()
      const q = query({
        prompt: input.prompts,
        options: {
          pathToClaudeCodeExecutable: realClaudeCommand,
          cwd: mkdtempSync(join(tmpdir(), 'mods-asks-')),
          env: { ...process.env, ...realClaudeLaunchHome().env },
          plugins: [{ type: 'local', path: FIXTURE }],
          settingSources: ['user'],
          canUseTool: async () => ({ behavior: 'deny', message: 'no tools in this test' })
        }
      })
      const raw = claudeQueryRawRequester(q)
      const channel = new ClaudeModsSessionChannel(() => {})
      channel.bind({
        ...(raw ? { uiRequest: (body: Record<string, unknown>) => raw(body) } : {}),
        ...claudeQueryUiAskInterceptor(q)
      })
      const draft = { text: 'draft', cursor: 2 }
      const asks: ClaudeModsAsk[] = []
      const leave = channel.subscribeAsks((ask) => {
        asks.push(ask)
        const answer =
          ask.subtype === 'ui_prompt_read'
            ? draft
            : ask.subtype === 'ui_copy'
              ? { copied: true }
              : ask.subtype === 'ui_prompt_fill'
                ? { filled: true }
                : { shown: true }
        channel.answerAsk(ask.id, answer)
      })
      const events: ClaudeModsSurfaceEvent[] = []
      const unsubscribe = channel.subscribe((event) => events.push(event))
      const drain = (async () => {
        // The session's own reader hands pushes to the channel; here the suite does.
        for await (const message of q) {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SDK messages are plain objects; routePush checks every field it reads.
          channel.routePush(message as unknown as Record<string, unknown>)
        }
      })()
      try {
        await q.initializationResult()
        input.send('/ask-copy')
        expect(await nextLog(events, 'copy:')).toBe('copy: {"isCopied":true}')
        input.send('/ask-append')
        expect(await nextLog(events, 'fill append:')).toBe(
          'fill append: {"isFilled":true,"text":"draft","cursor":2}'
        )
        input.send('/ask-suggest')
        expect(await nextLog(events, 'suggest:')).toBe('suggest: {"isShown":true}')
        expect(asks.map((ask) => ask.subtype)).toEqual([
          'ui_copy',
          'ui_prompt_fill',
          'ui_prompt_read',
          'ui_prompt_suggest'
        ])

        leave()
        const started = Date.now()
        input.send('/ask-read')
        expect(await nextLog(events, 'read:')).toBe('read: {"text":"","cursor":0}')
        // Withdrawn, the CLI answers at once instead of waiting out its 5 s.
        expect(Date.now() - started).toBeLessThan(4_000)
      } finally {
        unsubscribe()
        q.close()
        await drain.catch(() => {})
      }
    },
    60_000
  )
})
