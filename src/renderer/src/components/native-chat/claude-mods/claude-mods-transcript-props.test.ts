import { describe, expect, it } from 'vitest'
import type { AgentJournalSubmission } from '../../../../../shared/agent-session-journal-types'
import {
  agentJournalItemKey,
  agentJournalSubmissionKey
} from '../../../../../shared/agent-session-journal-item-key'
import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../../shared/native-chat-types'
import {
  capClaudeModsSiteValue,
  claudeModsSpinnerProps,
  claudeModsToolGroup,
  claudeModsToolUseProps
} from './claude-mods-transcript-props'
import {
  claudeModsQuestionToolUseId,
  claudeModsUserMessageIds
} from './claude-mods-transcript-user-ids'

const call = (callId: string | undefined, over: Partial<NativeChatToolCallBlock> = {}) =>
  ({ type: 'tool-call', name: 'Bash', input: { command: 'ls' }, callId, ...over }) as const

const result: NativeChatToolResultBlock = { type: 'tool-result', output: 'a\nb', callId: 'toolu_1' }

describe('transcript site props', () => {
  it('caps long strings and wide structures', () => {
    const capped = capClaudeModsSiteValue({
      stdout: 'x'.repeat(40_000),
      lines: Array.from({ length: 500 }, (_, index) => index)
    })
    expect(capped).toMatchObject({ stdout: 'x'.repeat(16 * 1024) })
    expect(Reflect.get(Object(capped), 'lines')).toHaveLength(100)
  })

  it('never cuts a surrogate pair in half', () => {
    const capped = capClaudeModsSiteValue(`${'x'.repeat(16 * 1024 - 1)}😀`)
    expect(capped).toBe('x'.repeat(16 * 1024 - 1))
  })

  it('describes a ToolUse from the call and its result text', () => {
    expect(claudeModsToolUseProps(call('toolu_1', { state: 'completed' }), result, false)).toEqual({
      tool_use_id: 'toolu_1',
      tool: 'Bash',
      input: { command: 'ls' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: 'a\nb'
    })
  })

  it('marks running, errored and interrupted calls', () => {
    expect(claudeModsToolUseProps(call('t', { state: 'running' }), undefined, true)).toMatchObject({
      isRunning: true
    })
    expect(
      claudeModsToolUseProps(
        call('t', { state: 'failed', endedAs: 'interrupted' }),
        undefined,
        false
      )
    ).toMatchObject({ isInterrupted: true, isErrored: false })
    expect(claudeModsToolUseProps(call('t'), { ...result, isError: true }, false)).toMatchObject({
      isErrored: true
    })
  })

  it('has no site for a call without a provider id', () => {
    expect(claudeModsToolUseProps(call(undefined), undefined, false)).toBeNull()
  })

  it('draws a group under its first call, only when every call names itself', () => {
    const first = call('toolu_1')
    const second = call('toolu_2')
    const group = claudeModsToolGroup([first, second], new Map([[first, result]]), {
      activeTurnIsWorking: false,
      isActive: false,
      isExpanded: true
    })
    expect(group?.instanceId).toBe('toolu_1')
    expect(group?.props).toMatchObject({ isActive: false, isExpanded: true })
    expect(Reflect.get(Object(group?.props), 'calls')).toHaveLength(2)
    expect(
      claudeModsToolGroup([first, call(undefined)], new Map(), {
        activeTurnIsWorking: false,
        isActive: false,
        isExpanded: false
      })
    ).toBeNull()
  })

  it('splits a spinner label into word and ellipsis suffix', () => {
    expect(claudeModsSpinnerProps('Working…', 'requesting')).toEqual({
      word: 'Working',
      message: null,
      suffix: '…',
      mode: 'requesting'
    })
  })
})

describe('user message ids', () => {
  it('maps a prompt row to the uuid the CLI named it by', () => {
    const submission = (providerItemId: string | null): AgentJournalSubmission => ({
      clientMessageId: 'client-1',
      fence: 1,
      payloadFingerprint: 'f',
      dispatchState: 'accepted',
      providerItemId,
      reason: null,
      submittedAt: 1,
      resolvedAt: 2
    })
    const key = agentJournalItemKey({ provider: 'claude', sessionId: 's1', uuid: 'uuid-9' })
    expect(
      claudeModsUserMessageIds([submission(key)]).get(agentJournalSubmissionKey('client-1'))
    ).toBe('uuid-9')
    expect(claudeModsUserMessageIds([submission(null)]).size).toBe(0)
  })

  it('reads a question item tool_use_id only when it is a non-empty string', () => {
    expect(claudeModsQuestionToolUseId({ toolUseId: 'toolu_q' })).toBe('toolu_q')
    expect(claudeModsQuestionToolUseId({ toolUseId: '' })).toBeUndefined()
    expect(claudeModsQuestionToolUseId({})).toBeUndefined()
    expect(claudeModsQuestionToolUseId(null)).toBeUndefined()
  })
})
