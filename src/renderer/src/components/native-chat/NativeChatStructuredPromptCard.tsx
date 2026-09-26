import { encodeAgentSessionQuestionAnswers } from '../../../../shared/agent-session-question-answer'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
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
  if (questionBody.interaction) {
    return (
      <NativeChatInteractionCard
        key={`${prompt.itemId}:${prompt.revision}`}
        request={questionBody.interaction}
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
      onAnswer={(answers) => {
        if (questionBody.questions) {
          const grouped = questions.map((question, questionIndex) => {
            const answer = answers[questionIndex]
            const other = answer?.other?.trim()
            const optionIds = (answer?.indices ?? []).flatMap((optionIndex) => {
              const optionId = question.options[optionIndex]?.id
              return optionId ? [optionId] : []
            })
            return {
              questionId: question.id,
              optionIds: question.multiSelect || !other ? optionIds : [],
              ...(other ? { other } : {})
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
        if (turnId) {
          onCancel(turnId)
        }
      }}
    />
  )
}
