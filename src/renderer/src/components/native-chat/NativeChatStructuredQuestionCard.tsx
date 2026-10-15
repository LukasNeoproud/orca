import type { RefObject } from 'react'
import type { AgentJournalQuestion } from '../../../../shared/agent-session-journal-types'
import type { AgentSessionPromptResponse } from '../../../../shared/agent-session-question-answer'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'
import {
  ClaudeModsControllerContext,
  useClaudeModsAttachedController
} from './claude-mods/claude-mods-controller-context'
import { ClaudeModsQuestionSite } from './claude-mods/ClaudeModsSiteRows'

export function NativeChatStructuredQuestionCard({
  questions,
  onAnswer,
  onCancel,
  isSubmitting,
  shouldFocus,
  answerInputRef,
  toolUseId,
  paneKey
}: {
  questions: readonly AgentJournalQuestion[]
  onAnswer: (response: AgentSessionPromptResponse) => void
  onCancel: () => void
  isSubmitting?: boolean
  shouldFocus?: boolean
  answerInputRef?: RefObject<HTMLInputElement | null>
  /** The AskUserQuestion call's `tool_use_id`, which a Claude Code mod knows the dialog by. */
  toolUseId?: string
  /** The chat pane: the card sits outside the transcript's mods provider, so it finds it by this. */
  paneKey?: string
}): React.JSX.Element {
  const modsController = useClaudeModsAttachedController(paneKey)
  // `display` carries any words a mod relabelled; answers still name the questions Orca offered.
  const drawCard = (display: readonly AgentJournalQuestion[]): React.JSX.Element => (
    <NativeChatQuestionCard
      prompt={{
        questions: display.map((question) => ({
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
      freeTextInputs={questions.map((question) => question.freeTextInput)}
      onAnswer={(answers) => {
        const chosen = questions.map((question, index) => {
          const answer = answers[index]
          const other = question.freeTextInput?.allowEmpty ? answer?.other : answer?.other?.trim()
          return {
            questionId: question.id,
            optionIds: (answer?.indices ?? []).flatMap((optionIndex) => {
              const id = question.options[optionIndex]?.id
              return id ? [id] : []
            }),
            ...(other !== undefined && (other.length > 0 || question.freeTextInput?.allowEmpty)
              ? { other }
              : {})
          }
        })
        if (chosen.every((answer) => answer.optionIds.length > 0 || answer.other !== undefined)) {
          onAnswer({ kind: 'answers', answers: chosen })
        }
      }}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      shouldFocus={shouldFocus}
      answerInputRef={answerInputRef}
    />
  )
  return (
    <ClaudeModsControllerContext.Provider value={modsController}>
      <ClaudeModsQuestionSite
        toolUseId={toolUseId}
        questions={questions}
        renderDrawing={drawCard}
      />
    </ClaudeModsControllerContext.Provider>
  )
}
