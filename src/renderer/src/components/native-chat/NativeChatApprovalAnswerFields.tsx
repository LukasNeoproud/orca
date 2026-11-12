import { translate } from '@/i18n/i18n'
import { Textarea } from '@/components/ui/textarea'
import type { AgentJournalApprovalAccepts } from '../../../../shared/agent-session-journal-types'
import type { ChatApprovalAnswerExtras } from './native-chat-interactive-prompt'

/** The fields an approval offers beside its options: the command to rewrite, a note to decline with. */
export function NativeChatApprovalAnswerFields({
  accepts,
  extras,
  disabled,
  onChange,
  isPlan = false
}: {
  accepts: AgentJournalApprovalAccepts
  extras: ChatApprovalAnswerExtras
  disabled: boolean
  onChange: (extras: ChatApprovalAnswerExtras) => void
  /** A plan's note asks what to change; it goes with "Keep planning". */
  isPlan?: boolean
}): React.JSX.Element {
  const stopCardKeys = (event: React.KeyboardEvent): void => {
    // Typing must not reach the card's own shortcuts; Escape still leaves the card.
    if (event.key !== 'Escape') {
      event.stopPropagation()
    }
  }
  const noteLabel = isPlan
    ? translate(
        'components.native-chat.approval.plan.note',
        'What should change in the plan? (sent with Keep planning)'
      )
    : translate(
        'components.native-chat.approval.note',
        'What to do instead (sent when you decline)'
      )
  return (
    <div className="flex shrink-0 flex-col gap-2">
      {accepts.inputField ? (
        <Textarea
          data-native-chat-approval-input="true"
          aria-label={translate(
            'components.native-chat.approval.editInput',
            'Command to run (you can edit it)'
          )}
          variant="code"
          rows={Math.min(6, accepts.inputField.value.split('\n').length)}
          disabled={disabled}
          spellCheck={false}
          value={extras.inputValue ?? accepts.inputField.value}
          onKeyDown={stopCardKeys}
          onChange={(event) => onChange({ ...extras, inputValue: event.target.value })}
        />
      ) : null}
      {accepts.note ? (
        <Textarea
          data-native-chat-approval-note="true"
          aria-label={noteLabel}
          placeholder={noteLabel}
          rows={2}
          disabled={disabled}
          value={extras.note ?? ''}
          onKeyDown={stopCardKeys}
          onChange={(event) => onChange({ ...extras, note: event.target.value })}
        />
      ) : null}
    </div>
  )
}
