import type {
  AgentJournalApprovalItem,
  AgentJournalItemIdentity,
  AgentJournalPromptOption,
  AgentJournalQuestion,
  AgentJournalQuestionItem
} from '../../shared/agent-session-journal-types'
import { formatToolInput, truncateToolDetail } from '../../shared/native-chat-tool-summary'
import { isPlanApprovalSubject } from '../../shared/agent-session-approval-subject'
import { boundJournalPromptBody } from '../native-chat/agent-session-journal/journal-prompt-body-bounds'
import { AGENT_SESSION_APPROVAL_INPUT_MAX_LENGTH } from '../../shared/agent-session-question-answer'
import { claudeRememberedAllowOption } from './claude-permission-suggestion-summary'
import { claudeRecord, claudeText } from './claude-structured-item-translation'
import {
  encodeClaudeQuestionOptionId,
  type ClaudePendingPrompt
} from './claude-structured-prompt-replies'

const PLAN_APPROVAL_OPTIONS: readonly AgentJournalPromptOption[] = [
  { id: 'allowAcceptEdits', label: 'Approve and accept edits' },
  { id: 'allow', label: 'Approve, ask before edits' },
  { id: 'deny', label: 'Keep planning' }
]

function approvalOptions(prompt: ClaudePendingPrompt): AgentJournalPromptOption[] {
  const remembered = claudeRememberedAllowOption(prompt.suggestions)
  return [
    { id: 'allow', label: 'Allow' },
    ...(remembered ? [remembered] : []),
    { id: 'deny', label: 'Deny' }
  ]
}

/** The one input field worth rewriting before allowing: a shell command. */
function editableInputField(prompt: ClaudePendingPrompt): { name: string; value: string } | null {
  const command = prompt.toolName === 'Bash' ? prompt.input.command : null
  return typeof command === 'string' && command.length <= AGENT_SESSION_APPROVAL_INPUT_MAX_LENGTH
    ? { name: 'command', value: command }
    : null
}

const PENDING = {
  state: 'pending',
  selectedOptionId: null,
  resolvedBy: null,
  resolvedAt: null
} as const

export function claudePromptIdentity(input: {
  sessionId: string
  promptKey: string
  questionId?: string
}): AgentJournalItemIdentity {
  const suffix = input.questionId ? `:${input.questionId}` : ''
  return {
    provider: 'orca',
    clientMessageId: `claude-prompt:${input.sessionId}:${input.promptKey}${suffix}`
  }
}

export function claudeApprovalItem(prompt: ClaudePendingPrompt): AgentJournalApprovalItem {
  const planSubject = isPlanApprovalSubject(prompt.subject) ? prompt.subject : null
  const detail = truncateToolDetail(planSubject?.text ?? formatToolInput(prompt.input))
  const inputField = planSubject ? null : editableInputField(prompt)
  return boundJournalPromptBody({
    kind: 'approval',
    accepts: { note: true, ...(inputField ? { inputField } : {}) },
    title: prompt.title ?? (planSubject ? 'Review proposed plan' : `Allow ${prompt.toolName}?`),
    ...(prompt.displayName ? { displayName: prompt.displayName } : {}),
    ...(prompt.description ? { description: prompt.description } : {}),
    ...(prompt.decisionReason ? { decisionReason: prompt.decisionReason } : {}),
    ...(prompt.blockedPath ? { blockedPath: prompt.blockedPath } : {}),
    ...(prompt.matchedAskRule ? { matchedAskRule: prompt.matchedAskRule } : {}),
    ...(prompt.subject ? { subject: prompt.subject } : {}),
    detail: detail || null,
    options: planSubject
      ? PLAN_APPROVAL_OPTIONS.map((option) => ({ ...option }))
      : approvalOptions(prompt),
    resolution: { ...PENDING }
  })
}

export type ClaudeQuestionItem = {
  identity: AgentJournalItemIdentity
  body: AgentJournalQuestionItem
}

function questionOptions(
  question: Record<string, unknown>,
  questionAddress: string
): AgentJournalPromptOption[] {
  if (!Array.isArray(question.options)) {
    return []
  }
  return question.options.flatMap((value, index) => {
    const option = claudeRecord(value)
    const label = claudeText(option?.label)
    const description = claudeText(option?.description)
    return label
      ? [
          {
            id: encodeClaudeQuestionOptionId(questionAddress, `choice-${index + 1}`),
            label,
            ...(description ? { description } : {})
          }
        ]
      : []
  })
}

export function claudeQuestionItems(input: {
  sessionId: string
  prompt: ClaudePendingPrompt
}): ClaudeQuestionItem[] {
  const values = Array.isArray(input.prompt.input.questions) ? input.prompt.input.questions : []
  const questions = values.flatMap((value, index): AgentJournalQuestion[] => {
    const question = claudeRecord(value)
    const questionAddress = `q${index + 1}`
    const text = claudeText(question?.question) ?? claudeText(question?.header)
    const header = claudeText(question?.header)
    return question && input.prompt.questionIds[index] && text
      ? [
          {
            id: questionAddress,
            question: text,
            ...(header ? { header } : {}),
            options: questionOptions(question, questionAddress),
            multiSelect: question.multiSelect === true,
            freeTextQuestionId: questionAddress
          }
        ]
      : []
  })
  if (questions.length === 0) {
    return []
  }
  const legacyCompatible = questions.length === 1 && questions[0]?.multiSelect === false
  const first = questions[0]!
  return [
    {
      identity: claudePromptIdentity({
        sessionId: input.sessionId,
        promptKey: input.prompt.promptKey
      }),
      body: boundJournalPromptBody({
        kind: 'question',
        question: legacyCompatible
          ? first.question
          : `${questions.length} grouped question${questions.length === 1 ? '' : 's'} from Claude`,
        options: legacyCompatible ? first.options : [],
        ...(legacyCompatible ? { freeTextQuestionId: first.freeTextQuestionId } : {}),
        questions,
        ...(input.prompt.toolUseId ? { toolUseId: input.prompt.toolUseId } : {}),
        resolution: { ...PENDING }
      })
    }
  ]
}
