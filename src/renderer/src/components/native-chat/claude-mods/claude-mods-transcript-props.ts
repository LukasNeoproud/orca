import { agentJournalToolCallLifecycle } from '../../../../../shared/agent-journal-tool-call-lifecycle'
import type { AgentJournalQuestion } from '../../../../../shared/agent-session-journal-types'
import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../../shared/native-chat-types'
import { selectActiveToolCall } from '../../../../../shared/native-chat-tool-activity'
import { cutClaudeModsString } from './claude-mods-transcript-ask-bounds'

export type ClaudeModsSiteProps = Record<string, unknown>

/** Tool inputs and outputs can be huge; a mod draws a row, not the whole file. */
const MAX_STRING_CHARS = 16 * 1024
const MAX_ENTRIES = 100
const MAX_DEPTH = 6

/** `value` with every string cut to the cap and every list and record bounded. */
export function capClaudeModsSiteValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return cutClaudeModsString(value, MAX_STRING_CHARS)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  if (depth >= MAX_DEPTH) {
    return null
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ENTRIES).map((entry) => capClaudeModsSiteValue(entry, depth + 1))
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_ENTRIES)
      .map(([key, entry]) => [key, capClaudeModsSiteValue(entry, depth + 1)])
  )
}

type CallState = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

function callState(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock | undefined,
  activeTurnIsWorking: boolean | undefined
): CallState {
  const lifecycle = agentJournalToolCallLifecycle(call)
  return {
    isRunning:
      result === undefined && selectActiveToolCall([call], { activeTurnIsWorking }) !== null,
    isErrored: lifecycle === 'failed' || (lifecycle !== 'interrupted' && result?.isError === true),
    isInterrupted: lifecycle === 'interrupted'
  }
}

/** Orca holds the result text the model read, not the structured result object. */
export function claudeModsToolUseProps(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock | undefined,
  activeTurnIsWorking: boolean | undefined
): ClaudeModsSiteProps | null {
  if (!call.callId) {
    return null
  }
  return {
    tool_use_id: call.callId,
    tool: call.name,
    input: capClaudeModsSiteValue(call.input),
    ...callState(call, result, activeTurnIsWorking),
    ...(result ? { output: capClaudeModsSiteValue(result.output) } : {})
  }
}

export function claudeModsToolResultProps(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock
): ClaudeModsSiteProps | null {
  return call.callId
    ? {
        tool_use_id: call.callId,
        tool: call.name,
        output: capClaudeModsSiteValue(result.output),
        isErrored: result.isError === true
      }
    : null
}

/** The group's id is its first call's, and a group needs every call to name itself. */
export function claudeModsToolGroup(
  calls: readonly NativeChatToolCallBlock[],
  resultByCall: ReadonlyMap<NativeChatToolCallBlock, NativeChatToolResultBlock>,
  state: { activeTurnIsWorking: boolean | undefined; isActive: boolean; isExpanded: boolean }
): { instanceId: string; props: ClaudeModsSiteProps } | null {
  const first = calls[0]?.callId
  if (!first || calls.some((call) => !call.callId)) {
    return null
  }
  return {
    instanceId: first,
    props: {
      calls: calls.map((call) => {
        const result = resultByCall.get(call)
        return {
          tool_use_id: call.callId,
          tool: call.name,
          input: capClaudeModsSiteValue(call.input),
          ...callState(call, result, state.activeTurnIsWorking),
          ...(result ? { output: capClaudeModsSiteValue(result.output) } : {})
        }
      }),
      isActive: state.isActive,
      isExpanded: state.isExpanded
    }
  }
}

export function claudeModsAssistantMessageProps(text: string): ClaudeModsSiteProps {
  // Each Orca prose row starts its own bullet, whatever the CLI would group.
  return { text, isFirstOfReply: true, isSummary: false }
}

export function claudeModsUserMessageProps(text: string): ClaudeModsSiteProps {
  return { text, origin: { kind: 'sdk' }, isExpanded: true }
}

/** The tool's `questions` input shape, as the dialog draws it. */
export function claudeModsQuestionProps(
  questions: readonly AgentJournalQuestion[]
): ClaudeModsSiteProps {
  return {
    tool: 'AskUserQuestion',
    questions: questions.map((question) => ({
      question: question.question,
      header: question.header ?? '',
      multiSelect: question.multiSelect,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description ?? ''
      }))
    }))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `questions` with the words a mod relabelled, matched one to one by position; whatever does
 * not line up keeps its original words, so answers still name the options Orca offered.
 */
export function relabelClaudeModsQuestions(
  questions: readonly AgentJournalQuestion[],
  rewritten: unknown
): readonly AgentJournalQuestion[] {
  if (!Array.isArray(rewritten) || rewritten.length !== questions.length) {
    return questions
  }
  return questions.map((question, index) => {
    const next: unknown = rewritten[index]
    if (!isRecord(next)) {
      return question
    }
    const options: unknown = next.options
    const relabelled = Array.isArray(options) && options.length === question.options.length
    return {
      ...question,
      question: typeof next.question === 'string' ? next.question : question.question,
      ...(typeof next.header === 'string' && next.header ? { header: next.header } : {}),
      options: question.options.map((option, optionIndex) => {
        const entry: unknown = relabelled ? options[optionIndex] : undefined
        return isRecord(entry) && typeof entry.label === 'string'
          ? {
              ...option,
              label: entry.label,
              ...(typeof entry.description === 'string' ? { description: entry.description } : {})
            }
          : option
      })
    }
  })
}

export type ClaudeModsSpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-use'

/** A spinner label as the engine's `word` and `suffix`: its trailing ellipsis is the suffix. */
export function claudeModsSpinnerProps(
  label: string,
  mode: ClaudeModsSpinnerMode
): ClaudeModsSiteProps {
  const word = label.replace(/(…|\.\.\.)$/, '')
  return { word, message: null, suffix: '…', mode }
}

export function claudeModsText(props: ClaudeModsSiteProps, name: string): string | undefined {
  const value = props[name]
  return typeof value === 'string' ? value : undefined
}

/** The AskUserQuestion `tool_use_id` a pending question item carries, when its host sends one. */
export function claudeModsQuestionToolUseId(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) {
    return undefined
  }
  const id: unknown = Reflect.get(item, 'toolUseId')
  return typeof id === 'string' && id.length > 0 ? id : undefined
}
