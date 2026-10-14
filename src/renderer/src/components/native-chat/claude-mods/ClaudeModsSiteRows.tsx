import type { ReactNode } from 'react'
import type { AgentJournalQuestion } from '../../../../../shared/agent-session-journal-types'
import { pairNativeChatToolResults } from '../../../../../shared/native-chat-tool-pairing'
import {
  isToolCallBlock,
  type NativeChatBlock,
  type NativeChatToolResultBlock
} from '../../../../../shared/native-chat-types'
import { useClaudeModsController } from './claude-mods-controller-context'
import { isClaudeModsQuestionTree } from './claude-mods-transcript-answer'
import {
  claudeModsAssistantMessageProps,
  claudeModsQuestionProps,
  claudeModsSpinnerProps,
  claudeModsText,
  claudeModsToolGroup,
  claudeModsToolResultProps,
  claudeModsToolUseProps,
  claudeModsUserMessageProps,
  relabelClaudeModsQuestions,
  type ClaudeModsSpinnerMode
} from './claude-mods-transcript-props'
import { useClaudeModsUserMessageId } from './claude-mods-transcript-user-ids'
import { ClaudeModsSite } from './ClaudeModsSite'

/** Props are built only while mods exist, so a chat without them pays nothing per row. */
function useSiteProps<T>(build: () => T): T | null {
  return useClaudeModsController() ? build() : null
}

/** A tool line, asked as `ToolUse` under its call's `tool_use_id`. */
export function ClaudeModsToolUseSite({
  block,
  result,
  activeTurnIsWorking,
  children
}: {
  block: NativeChatBlock
  result: NativeChatToolResultBlock | undefined
  activeTurnIsWorking: boolean | undefined
  children: ReactNode
}): React.JSX.Element {
  const props = useSiteProps(() =>
    isToolCallBlock(block) ? claudeModsToolUseProps(block, result, activeTurnIsWorking) : null
  )
  return (
    <ClaudeModsSite
      component="ToolUse"
      instanceId={claudeModsText(props ?? {}, 'tool_use_id')}
      props={props ?? {}}
    >
      {() => children}
    </ClaudeModsSite>
  )
}

/** An opened line's output, asked as `ToolResult` under the same id as its `ToolUse`. */
export function ClaudeModsToolResultSite({
  block,
  result,
  children
}: {
  block: NativeChatBlock
  result: NativeChatToolResultBlock | undefined
  children: ReactNode
}): React.JSX.Element {
  const props = useSiteProps(() =>
    isToolCallBlock(block) && result ? claudeModsToolResultProps(block, result) : null
  )
  return (
    <ClaudeModsSite
      component="ToolResult"
      instanceId={claudeModsText(props ?? {}, 'tool_use_id')}
      props={props ?? {}}
    >
      {() => children}
    </ClaudeModsSite>
  )
}

/** A run's header, asked as `ToolGroup` under its first call's id. */
export function ClaudeModsToolGroupSite({
  headerBlocks,
  isActive,
  isExpanded,
  activeTurnIsWorking,
  children
}: {
  headerBlocks: readonly NativeChatBlock[]
  isActive: boolean
  isExpanded: boolean
  activeTurnIsWorking: boolean | undefined
  children: ReactNode
}): React.JSX.Element {
  const group = useSiteProps(() => {
    const { resultByCall } = pairNativeChatToolResults(headerBlocks)
    return claudeModsToolGroup(headerBlocks.filter(isToolCallBlock), resultByCall, {
      activeTurnIsWorking,
      isActive,
      isExpanded
    })
  })
  return (
    <ClaudeModsSite component="ToolGroup" instanceId={group?.instanceId} props={group?.props ?? {}}>
      {() => children}
    </ClaudeModsSite>
  )
}

/** Settled assistant prose, asked as `AssistantMessage`; `renderDrawing` gets the text to draw. */
export function ClaudeModsAssistantTextSite({
  messageId,
  text,
  enabled,
  renderDrawing
}: {
  messageId: string
  text: string
  /** False for anything but an assistant row's settled prose: thoughts, notices, a streaming row. */
  enabled: boolean
  renderDrawing: (text: string) => ReactNode
}): React.JSX.Element {
  const props = useSiteProps(() => claudeModsAssistantMessageProps(text))
  return (
    <ClaudeModsSite
      component="AssistantMessage"
      instanceId={enabled ? messageId : null}
      props={props ?? {}}
      settled={enabled}
    >
      {(drawn) => renderDrawing(claudeModsText(drawn, 'text') ?? text)}
    </ClaudeModsSite>
  )
}

/** The person's prompt, asked as `UserMessage`; `renderDrawing` gets the text to draw. */
export function ClaudeModsUserTextSite({
  rowId,
  text,
  enabled,
  renderDrawing
}: {
  rowId: string
  text: string
  /** False for another agent's message, whose origin Orca cannot name. */
  enabled: boolean
  renderDrawing: (text: string) => ReactNode
}): React.JSX.Element {
  const instanceId = useClaudeModsUserMessageId(rowId)
  const props = useSiteProps(() => claudeModsUserMessageProps(text))
  return (
    <ClaudeModsSite
      component="UserMessage"
      instanceId={enabled ? instanceId : null}
      props={props ?? {}}
    >
      {(drawn) => renderDrawing(claudeModsText(drawn, 'text') ?? text)}
    </ClaudeModsSite>
  )
}

/** The live turn's label, asked as `Spinner`; `renderDrawing` gets the label to show. */
export function ClaudeModsSpinnerSite({
  label,
  mode,
  renderDrawing
}: {
  label: string
  mode: ClaudeModsSpinnerMode
  renderDrawing: (label: string) => ReactNode
}): React.JSX.Element {
  const props = useSiteProps(() => claudeModsSpinnerProps(label, mode))
  return (
    <ClaudeModsSite component="Spinner" instanceId="main" props={props ?? {}}>
      {(drawn) => {
        const word = claudeModsText(drawn, 'word')
        const suffix = claudeModsText(drawn, 'suffix') ?? ''
        const sent = props ?? {}
        const unchanged =
          word === claudeModsText(sent, 'word') && suffix === claudeModsText(sent, 'suffix')
        return renderDrawing(word === undefined || unchanged ? label : `${word}${suffix}`)
      }}
    </ClaudeModsSite>
  )
}

/**
 * The pending question card, asked as `AskUserQuestion` under the call's `tool_use_id`. A tree
 * draws only with exactly one engine node and nothing after it; `renderDrawing` gets the questions with
 * any relabelled words, still the ones Orca will take answers for.
 */
export function ClaudeModsQuestionSite({
  toolUseId,
  questions,
  renderDrawing
}: {
  /** Absent on a host that predates it: the card is not asked about. */
  toolUseId: string | undefined
  questions: readonly AgentJournalQuestion[]
  renderDrawing: (questions: readonly AgentJournalQuestion[]) => ReactNode
}): React.JSX.Element {
  const props = useSiteProps(() => claudeModsQuestionProps(questions))
  return (
    <ClaudeModsSite
      component="AskUserQuestion"
      instanceId={toolUseId}
      props={props ?? {}}
      validate={isClaudeModsQuestionTree}
    >
      {(drawn) => renderDrawing(relabelClaudeModsQuestions(questions, drawn.questions))}
    </ClaudeModsSite>
  )
}
