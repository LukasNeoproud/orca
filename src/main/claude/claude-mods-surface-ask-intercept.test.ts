import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeQueryUiAskInterceptor } from './claude-mods-surface-ask-intercept'

const FAKE_CLI = join(__dirname, '__fixtures__', 'claude-agent-sdk-scripted-cli.mjs')
const SESSION_ID = '5348c19f-6a54-4c2e-9c68-9c2b1a3d4e5f'

type FakeQuery = {
  processControlRequest: (message: unknown, signal: AbortSignal) => Promise<unknown>
}

function fakeQuery(): { query: Query; target: FakeQuery; original: ReturnType<typeof vi.fn> } {
  const original = vi.fn(async () => {
    throw new Error('Unsupported control request subtype')
  })
  const target: FakeQuery = { processControlRequest: original }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the interceptor reads only `processControlRequest`.
  return { query: target as unknown as Query, target, original }
}

function askMessage(subtype: string, fields: Record<string, unknown> = {}) {
  return { type: 'control_request', request_id: `id-${subtype}`, request: { subtype, ...fields } }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('claudeQueryUiAskInterceptor', () => {
  it('answers the asks through the installed handler and passes everything else on', async () => {
    const { query: q, target, original } = fakeQuery()
    const { answerUiAsks } = claudeQueryUiAskInterceptor(q)
    const handler = vi.fn(async () => ({ text: 'draft', cursor: 1 }))
    answerUiAsks?.(handler)
    const signal = new AbortController().signal
    await expect(
      target.processControlRequest(askMessage('ui_prompt_read'), signal)
    ).resolves.toEqual({
      text: 'draft',
      cursor: 1
    })
    expect(handler).toHaveBeenCalledWith(
      {
        requestId: 'id-ui_prompt_read',
        subtype: 'ui_prompt_read',
        request: { subtype: 'ui_prompt_read' }
      },
      signal
    )
    await expect(
      target.processControlRequest(askMessage('ui_read_selection'), signal)
    ).rejects.toThrow()
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('answers the default once released, and a stale release keeps the newer handler', async () => {
    const { query: q, target } = fakeQuery()
    const { answerUiAsks } = claudeQueryUiAskInterceptor(q)
    const signal = new AbortController().signal
    const releaseOld = answerUiAsks!(async () => ({ copied: true }))
    answerUiAsks!(async () => ({ copied: true }))
    releaseOld()
    await expect(
      target.processControlRequest(askMessage('ui_copy', { text: 'x' }), signal)
    ).resolves.toEqual({ copied: true })
  })

  it('is absent on an SDK without the dispatcher', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the interceptor reads only `processControlRequest`.
    expect(claudeQueryUiAskInterceptor({} as unknown as Query).answerUiAsks).toBeUndefined()
  })

  // Pins the real SDK: its Query must still route inbound control requests through the method.
  it('answers a real SDK query on the wire under the CLI request id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-mods-asks-'))
    dirs.push(dir)
    const scenarioPath = join(dir, 'scenario.json')
    const reportPath = join(dir, 'report.json')
    const result = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 1,
      result: 'ok',
      session_id: SESSION_ID,
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 },
      uuid: 'uuid-result-1'
    }
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        steps: [
          { awaitUserMessage: true },
          {
            emit: askMessage('ui_prompt_fill', {
              surface: 'desktop',
              client_id: 'orca',
              text: 'x',
              mode: 'append'
            })
          },
          { awaitControlResponse: 'id-ui_prompt_fill' },
          { emit: result }
        ]
      })
    )
    async function* prompt(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        message: { role: 'user', content: 'hi' },
        parent_tool_use_id: null,
        session_id: SESSION_ID
      }
      // Input stays open until the scripted CLI exits.
      await new Promise<void>(() => {})
    }
    const q = query({
      prompt: prompt(),
      options: {
        pathToClaudeCodeExecutable: FAKE_CLI,
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          ORCA_SDK_CONTRACT_SCENARIO_PATH: scenarioPath,
          ORCA_SDK_CONTRACT_REPORT_PATH: reportPath
        }
      }
    })
    claudeQueryUiAskInterceptor(q).answerUiAsks?.(async () => ({ filled: true }))
    for await (const _message of q) {
      // Drained to the result.
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the scripted CLI writes this report shape.
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      controlResponses: { response: { subtype: string; request_id: string; response?: unknown } }[]
    }
    expect(
      report.controlResponses.find((frame) => frame.response.request_id === 'id-ui_prompt_fill')
        ?.response
    ).toEqual({ subtype: 'success', request_id: 'id-ui_prompt_fill', response: { filled: true } })
  })
})
