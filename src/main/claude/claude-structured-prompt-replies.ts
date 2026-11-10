import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import type {
  AgentSessionPromptResponse,
  AgentSessionQuestionAnswer
} from '../../shared/agent-session-question-answer'
import type { StructuredAgentSessionAdapterStop } from '../native-chat/agent-session-wire/structured-agent-session-adapter-stop'
import {
  claudePromptQuestions,
  isClaudePromptRecord,
  readClaudePromptString,
  type ClaudePendingPrompt
} from './claude-prompt-registry'
export {
  ClaudePromptRegistry,
  type ClaudePendingPrompt,
  type ClaudePromptClaim,
  type ClaudePromptPresentation,
  type ClaudePromptRegistration,
  type ClaudePromptSettle
} from './claude-prompt-registry'

/** No card offers `cancel` any more; an older card's "Stop" option answers it as a dismissal. */
export const CLAUDE_APPROVAL_DECISIONS = [
  'allow',
  'allowForSession',
  'allowAcceptEdits',
  'deny',
  'cancel'
] as const
export type ClaudeApprovalDecision = (typeof CLAUDE_APPROVAL_DECISIONS)[number]

/** A card's own Cancel: an approval is dismissed (a tool's with the reply its Deny sends, a plan's
 *  asking Claude to wait for the user), and a question ends the way the chat's Stop does. Nothing
 *  on a card interrupts the turn and leaves the child running. */
export const claudePromptCancelRoute: NonNullable<
  StructuredAgentSessionAdapterStop['routePromptCancel']
> = ({ prompt }) => (prompt.kind === 'question' ? { kind: 'stop' } : { kind: 'dismiss' })

/** Declines a request the user dismissed. A dismissed plan or question waits on the user: Claude is
 *  told to end its turn rather than revise or ask again. */
export function claudePromptDismissal(prompt: ClaudePendingPrompt): PermissionResult {
  return {
    behavior: 'deny',
    message:
      prompt.kind === 'question'
        ? 'The user dismissed these questions without answering. End your turn and wait for them.'
        : prompt.subject?.kind === 'plan'
          ? 'The user dismissed this plan without approving it. End your turn and wait for them to say what to change.'
          : 'User denied this action.',
    toolUseID: prompt.toolUseId
  }
}

function isClaudeApprovalDecision(optionId: string): optionId is ClaudeApprovalDecision {
  return CLAUDE_APPROVAL_DECISIONS.some((decision) => decision === optionId)
}

function questionAnswer(prompt: ClaudePendingPrompt, questionId: string, optionId: string): string {
  const decoded = decodeClaudeQuestionOptionId(optionId)
  if (!decoded) {
    return optionId
  }
  const questionIndex = prompt.questionIds.indexOf(questionId)
  if (questionIndex === -1) {
    return optionId
  }
  const choice = /^choice-([1-9]\d*)$/.exec(decoded.answer)
  const optionIndex = choice ? Number(choice[1]) - 1 : -1
  const question = claudePromptQuestions(prompt.input)[questionIndex]
  const options = Array.isArray(question?.options) ? question.options : []
  const option = options[optionIndex]
  const label = isClaudePromptRecord(option) ? readClaudePromptString(option.label) : null
  if (decoded.questionId === `q${questionIndex + 1}` && label) {
    return label
  }
  if (decoded.questionId === `q${questionIndex + 1}`) {
    return decoded.answer
  }
  const legacyChoice = options.some(
    (candidate) =>
      isClaudePromptRecord(candidate) && readClaudePromptString(candidate.label) === decoded.answer
  )
  return decoded.questionId === questionId && (legacyChoice || decoded.answer.trim().length > 0)
    ? decoded.answer
    : optionId
}

export function encodeClaudeQuestionOptionId(questionId: string, answer: string): string {
  return `${encodeURIComponent(questionId)}:${encodeURIComponent(answer)}`
}

export function decodeClaudeQuestionOptionId(
  optionId: string
): { questionId: string; answer: string } | null {
  const separator = optionId.indexOf(':')
  if (separator <= 0) {
    return null
  }
  try {
    return {
      questionId: decodeURIComponent(optionId.slice(0, separator)),
      answer: decodeURIComponent(optionId.slice(separator + 1))
    }
  } catch {
    return null
  }
}

/** The permission change an allowing decision carries beside the allow itself. */
function allowedPermissionUpdates(
  prompt: ClaudePendingPrompt,
  decision: ClaudeApprovalDecision
): PermissionUpdate[] {
  const isPlan = prompt.subject?.kind === 'plan'
  if (decision === 'allowAcceptEdits' && isPlan) {
    return [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
  }
  return decision === 'allowForSession' && !isPlan ? prompt.suggestions : []
}

function denialMessage(prompt: ClaudePendingPrompt, note: string | undefined): string {
  if (prompt.subject?.kind === 'plan') {
    return note
      ? `The user asked you to keep planning and said:\n${note}\nRevise the plan and call ExitPlanMode again.`
      : 'The user asked you to keep planning. Revise the plan and call ExitPlanMode again.'
  }
  return note
    ? `The user denied this action. To tell you how to proceed, the user said:\n${note}`
    : 'User denied this action.'
}

function approvalResponse(
  prompt: ClaudePendingPrompt,
  response: Extract<AgentSessionPromptResponse, { kind: 'option' }>
): PermissionResult {
  const decision = response.optionId
  if (!isClaudeApprovalDecision(decision)) {
    throw new Error(`${decision} is not a Claude approval decision`)
  }
  if (decision === 'cancel') {
    return claudePromptDismissal(prompt)
  }
  if (decision === 'deny') {
    return {
      behavior: 'deny',
      message: denialMessage(prompt, response.note),
      toolUseID: prompt.toolUseId
    }
  }
  const updates = allowedPermissionUpdates(prompt, decision)
  // Only the field the card offered for rewriting; nothing else of the input is the client's.
  const rewritten =
    response.inputValue !== undefined &&
    prompt.toolName === 'Bash' &&
    typeof prompt.input.command === 'string' &&
    response.inputValue.trim().length > 0
      ? { ...prompt.input, command: response.inputValue }
      : prompt.input
  return {
    behavior: 'allow',
    updatedInput: rewritten,
    ...(updates.length > 0 ? { updatedPermissions: updates } : {}),
    toolUseID: prompt.toolUseId
  }
}

function questionResponse(
  prompt: ClaudePendingPrompt,
  grouped: readonly AgentSessionQuestionAnswer[]
): PermissionResult {
  const questions = claudePromptQuestions(prompt.input)
  if (grouped.length !== prompt.questionIds.length) {
    throw new Error(`Grouped answer does not match Claude prompt ${prompt.promptKey}`)
  }
  const answers: Record<string, string | readonly string[]> = {}
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]
    const providerQuestionId = prompt.questionIds[index]
    const answer = grouped.find((entry) => entry.questionId === `q${index + 1}`)
    if (!question || !providerQuestionId || !answer) {
      throw new Error(`Grouped answer does not name question ${index + 1}`)
    }
    const selected = answer.optionIds.map((selectedId) =>
      questionAnswer(prompt, providerQuestionId, selectedId)
    )
    const other = answer.other?.trim()
    if (question.multiSelect === true) {
      const values = [...selected, ...(other ? [other] : [])]
      if (values.length === 0) {
        throw new Error(`Grouped answer leaves question ${index + 1} empty`)
      }
      answers[providerQuestionId] = values
    } else {
      const value = other || selected[0]
      if (!value || selected.length > 1) {
        throw new Error(`Grouped answer is invalid for question ${index + 1}`)
      }
      answers[providerQuestionId] = value
    }
  }
  return {
    behavior: 'allow',
    updatedInput: { ...prompt.input, answers },
    toolUseID: prompt.toolUseId
  }
}

/** Builds Claude's reply without touching the prompt, so a reply that cannot be built refuses the
 *  answer before anything is recorded. */
export function buildClaudePromptReply(
  prompt: ClaudePendingPrompt,
  response: AgentSessionPromptResponse
): PermissionResult {
  if (prompt.kind === 'approval') {
    if (response.kind !== 'option') {
      throw new Error(`Claude prompt ${prompt.promptKey} takes a decision, not answers`)
    }
    return approvalResponse(prompt, response)
  }
  if (response.kind !== 'answers') {
    throw new Error(`Claude prompt ${prompt.promptKey} takes answers, not a decision`)
  }
  return questionResponse(prompt, response.answers)
}
