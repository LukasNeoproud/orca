import { useRef, useSyncExternalStore, type ReactNode } from 'react'
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
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites-registry'
import { ClaudeModsSite } from './ClaudeModsSite'

const noopSubscribe = (): (() => void) => () => {}

/**
 * The props a row's site asks with, built only while a mod may hook `component`: once the CLI
 * said none does, a chat without mods pays nothing per row. They are rebuilt only when `deps`
 * change, since a built tool call copies and caps its whole input and output.
 */
function useSiteProps<T>(component: string, build: () => T, deps: readonly unknown[]): T | null {
  const controller = useClaudeModsController()
  const sites = controller ? claudeModsTranscriptSites(controller) : null
  const unhooked = useSyncExternalStore(
    sites ? sites.subscribeHooked : noopSubscribe,
    () => sites?.isUnhooked(component) ?? false
  )
  const skip = !controller || unhooked
  const memo = useRef<{ skip: boolean; deps: readonly unknown[]; value: T | null } | null>(null)
  const last = memo.current
  if (
    !last ||
    last.skip !== skip ||
    last.deps.length !== deps.length ||
    last.deps.some((dep, index) => !Object.is(dep, deps[index]))
  ) {
    memo.current = { skip, deps, value: skip ? null : build() }
  }
  return memo.current?.value ?? null
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
  const props = useSiteProps(
    'ToolUse',
    () =>
      isToolCallBlock(block) ? claudeModsToolUseProps(block, result, activeTurnIsWorking) : null,
    [block, result, activeTurnIsWorking]
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
  const props = useSiteProps(
    'ToolResult',
    () => (isToolCallBlock(block) && result ? claudeModsToolResultProps(block, result) : null),
    [block, result]
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
  const group = useSiteProps(
    'ToolGroup',
    () => {
      const { resultByCall } = pairNativeChatToolResults(headerBlocks)
      return claudeModsToolGroup(headerBlocks.filter(isToolCallBlock), resultByCall, {
        activeTurnIsWorking,
        isActive,
        isExpanded
      })
    },
    [headerBlocks, isActive, isExpanded, activeTurnIsWorking]
  )
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
  const props = useSiteProps('AssistantMessage', () => claudeModsAssistantMessageProps(text), [
    text
  ])
  return (
    <ClaudeModsSite
      component="AssistantMessage"
      instanceId={enabled && props ? messageId : null}
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
  // Orca holds no Claude uuid for a prompt, so the row's own stable id names the instance.
  const props = useSiteProps('UserMessage', () => claudeModsUserMessageProps(text), [text])
  return (
    <ClaudeModsSite
      component="UserMessage"
      instanceId={enabled && props ? rowId : null}
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
  const props = useSiteProps('Spinner', () => claudeModsSpinnerProps(label, mode), [label, mode])
  return (
    <ClaudeModsSite component="Spinner" instanceId={props ? 'main' : null} props={props ?? {}}>
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
  const props = useSiteProps('AskUserQuestion', () => claudeModsQuestionProps(questions), [
    questions
  ])
  return (
    <ClaudeModsSite
      component="AskUserQuestion"
      instanceId={props ? toolUseId : null}
      props={props ?? {}}
      validate={isClaudeModsQuestionTree}
    >
      {(drawn) => renderDrawing(relabelClaudeModsQuestions(questions, drawn.questions))}
    </ClaudeModsSite>
  )
}
