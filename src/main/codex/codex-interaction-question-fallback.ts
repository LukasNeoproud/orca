import {
  decodeAgentSessionQuestionAnswers,
  isValidAgentSessionQuestionAnswers,
  type AgentSessionQuestionAnswer
} from '../../shared/agent-session-question-answer'
import type { AgentJournalQuestion } from '../../shared/agent-session-journal-types'
import {
  encodeOrcaInteractionResult,
  isValidOrcaInteractionResult,
  ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID,
  type OrcaInteractionField,
  type OrcaInteractionRequest,
  type OrcaInteractionResult,
  type OrcaInteractionValue
} from '../../shared/orca-interaction'
import { orcaInteractionToolResponse } from './codex-orca-interaction'

const TRUE = '__orca_true__'
const FALSE = '__orca_false__'

function fallbackOptions(field: OrcaInteractionField): AgentJournalQuestion['options'] {
  const skip = field.required
    ? []
    : [{ id: ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID, label: 'Skip' }]
  if (field.type === 'single_choice' || field.type === 'multi_choice') {
    return [
      ...field.options.map(({ id, label, description }) => ({
        id,
        label,
        ...(description ? { description } : {})
      })),
      ...skip
    ]
  }
  if (field.type === 'boolean') {
    return [{ id: TRUE, label: 'Yes' }, { id: FALSE, label: 'No' }, ...skip]
  }
  return skip
}

export function codexInteractionFallbackQuestions(
  request: OrcaInteractionRequest
): AgentJournalQuestion[] {
  return request.fields.map((field) => ({
    id: field.id,
    question: field.label,
    ...(field.description ? { header: field.description } : {}),
    multiSelect: field.type === 'multi_choice',
    options: fallbackOptions(field),
    ...((field.type === 'single_choice' || field.type === 'multi_choice') && field.allowCustom
      ? { freeTextQuestionId: field.id }
      : field.type === 'text' || field.type === 'textarea' || field.type === 'number'
        ? { freeTextQuestionId: field.id }
        : {})
  }))
}

function choiceValue(
  field: Extract<OrcaInteractionField, { type: 'single_choice' | 'multi_choice' }>,
  answer: AgentSessionQuestionAnswer
): OrcaInteractionValue | undefined {
  const optionIds = answer.optionIds.filter((id) => id !== ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID)
  const custom = answer.other?.trim()
  if (field.type === 'multi_choice') {
    return [...optionIds, ...(custom ? [{ type: 'custom' as const, value: custom }] : [])]
  }
  return custom ? { type: 'custom', value: custom } : optionIds[0]
}

function fallbackValue(
  field: OrcaInteractionField,
  answer: AgentSessionQuestionAnswer
): OrcaInteractionValue | undefined {
  if (answer.optionIds.includes(ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID)) {
    const hasOtherAnswer =
      answer.optionIds.some((id) => id !== ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID) ||
      Boolean(answer.other?.trim())
    if (!hasOtherAnswer) {
      return undefined
    }
  }
  if (field.type === 'single_choice' || field.type === 'multi_choice') {
    return choiceValue(field, answer)
  }
  if (field.type === 'boolean') {
    return answer.optionIds[0] === TRUE ? true : answer.optionIds[0] === FALSE ? false : undefined
  }
  const text = answer.other
  if (field.type === 'number') {
    const numericText = text?.trim()
    return numericText ? Number(numericText) : undefined
  }
  return text?.trim() ? text : undefined
}

export function interactionResultFromQuestionAnswers(
  request: OrcaInteractionRequest,
  encoded: string
): OrcaInteractionResult | null {
  const answers = decodeAgentSessionQuestionAnswers(encoded)
  const questions = codexInteractionFallbackQuestions(request)
  if (!answers || !isValidAgentSessionQuestionAnswers(questions, answers)) {
    return null
  }
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]))
  if (byId.size !== answers.length) {
    return null
  }
  const values: Record<string, OrcaInteractionValue> = {}
  for (const field of request.fields) {
    const answer = byId.get(field.id)
    if (!answer) {
      return null
    }
    const value = fallbackValue(field, answer)
    if (value !== undefined) {
      values[field.id] = value
    }
  }
  const result = { status: 'submitted' as const, values }
  return isValidOrcaInteractionResult(request, result) ? result : null
}

export function answerOrcaInteraction(
  request: OrcaInteractionRequest | undefined,
  answer: string
): Record<string, unknown> {
  const fallback = request ? interactionResultFromQuestionAnswers(request, answer) : null
  return orcaInteractionToolResponse(
    request,
    fallback ? encodeOrcaInteractionResult(fallback) : answer
  )
}
