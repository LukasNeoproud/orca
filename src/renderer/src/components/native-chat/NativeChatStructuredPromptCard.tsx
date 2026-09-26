import { encodeAgentSessionQuestionAnswers } from '../../../../shared/agent-session-question-answer'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import {
  encodeOrcaInteractionResult,
  ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID,
  OrcaInteractionRequestSchema
} from '../../../../shared/orca-interaction'
import { NativeChatApprovalCard } from './NativeChatApprovalCard'
import { NativeChatInteractionCard } from './NativeChatInteractionCard'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'

function encodeQuestionAnswer(questionId: string, answer: string): string {
  return `${encodeURIComponent(questionId)}:${encodeURIComponent(answer)}`
}

export function NativeChatStructuredPromptCard({
  prompt,
  turnId,
  onRespond,
  onCancel
}: {
  prompt: AgentJournalRenderItem | null
  turnId: string | null
  onRespond: (answer: string) => void
  onCancel: (turnId: string) => void
}): React.JSX.Element | null {
  if (prompt?.body.kind === 'approval') {
    return (
      <NativeChatApprovalCard
        approval={{
          title: prompt.body.title,
          ...(prompt.body.detail ? { detail: prompt.body.detail } : {}),
          options: prompt.body.options.map((option) => ({ label: option.label, send: option.id }))
        }}
        onChoose={onRespond}
      />
    )
  }
  if (!prompt || prompt.body.kind !== 'question') {
    return null
  }
  const questionBody = prompt.body
  const hasInteraction = questionBody.interaction !== undefined
  const interaction = OrcaInteractionRequestSchema.safeParse(questionBody.interaction)
  if (interaction.success) {
    return (
      <NativeChatInteractionCard
        key={`${prompt.itemId}:${prompt.revision}`}
        request={interaction.data}
        onRespond={onRespond}
      />
    )
  }
  const questions = questionBody.questions ?? [
    {
      id: questionBody.freeTextQuestionId ?? 'q1',
      question: questionBody.question,
      options: questionBody.options,
      multiSelect: false,
      ...(questionBody.freeTextQuestionId
        ? { freeTextQuestionId: questionBody.freeTextQuestionId }
        : {})
    }
  ]
  return (
    <NativeChatQuestionCard
      key={`${prompt.itemId}:${prompt.revision}`}
      prompt={{
        questions: questions.map((question) => ({
          question: question.question,
          ...(question.header ? { header: question.header } : {}),
          multiSelect: question.multiSelect,
          options: question.options.map((option) => ({
            label: option.label,
            ...(option.description ? { description: option.description } : {})
          }))
        }))
      }}
      allowOther={questions.map((question) => Boolean(question.freeTextQuestionId))}
      allowSkip={
        hasInteraction
          ? questions.map((question) =>
              question.options.some(
                (option) => option.id === ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID
              )
            )
          : true
      }
      preserveOtherWhitespace={hasInteraction}
      submitEmptyAnswers={hasInteraction}
      onAnswer={(answers) => {
        if (questionBody.questions) {
          const grouped = questions.map((question, questionIndex) => {
            const answer = answers[questionIndex]
            const rawOther = answer?.other
            const other = hasInteraction ? rawOther : rawOther?.trim()
            let optionIds = (answer?.indices ?? []).flatMap((optionIndex) => {
              const optionId = question.options[optionIndex]?.id
              return optionId ? [optionId] : []
            })
            if (
              hasInteraction &&
              optionIds.length === 0 &&
              !other?.trim() &&
              question.options.some(
                (option) => option.id === ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID
              )
            ) {
              optionIds = [ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID]
            }
            return {
              questionId: question.id,
              optionIds: question.multiSelect || !other?.trim() ? optionIds : [],
              ...(other?.trim() ? { other } : {})
            }
          })
          if (grouped.every((answer) => answer.optionIds.length > 0 || answer.other)) {
            onRespond(encodeAgentSessionQuestionAnswers(grouped))
          }
          return
        }
        const index = answers[0]?.indices[0]
        const other = answers[0]?.other?.trim()
        const optionId =
          typeof index === 'number'
            ? questionBody.options[index]?.id
            : questionBody.freeTextQuestionId && other
              ? encodeQuestionAnswer(questionBody.freeTextQuestionId, other)
              : undefined
        if (optionId) {
          onRespond(optionId)
        }
      }}
      onCancel={() => {
        if (hasInteraction) {
          onRespond(encodeOrcaInteractionResult({ status: 'cancelled' }))
        } else if (turnId) {
          onCancel(turnId)
        }
      }}
    />
  )
}
