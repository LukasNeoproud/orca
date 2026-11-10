import { translate } from '@/i18n/i18n'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AgentJournalApprovalAccepts } from '../../../../shared/agent-session-journal-types'
import type { ChatApprovalAnswerExtras } from './native-chat-interactive-prompt'

/** The fields an approval offers beside its options: the command to rewrite, a note to decline with. */
export function NativeChatApprovalAnswerFields({
  accepts,
  extras,
  disabled,
  onChange
}: {
  accepts: AgentJournalApprovalAccepts
  extras: ChatApprovalAnswerExtras
  disabled: boolean
  onChange: (extras: ChatApprovalAnswerExtras) => void
}): React.JSX.Element {
  const stopCardKeys = (event: React.KeyboardEvent): void => {
    // Typing must not reach the card's own shortcuts; Escape still leaves the card.
    if (event.key !== 'Escape') {
      event.stopPropagation()
    }
  }
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
        <Input
          data-native-chat-approval-note="true"
          aria-label={translate(
            'components.native-chat.approval.note',
            'What to do instead (sent when you decline)'
          )}
          placeholder={translate(
            'components.native-chat.approval.note',
            'What to do instead (sent when you decline)'
          )}
          disabled={disabled}
          value={extras.note ?? ''}
          onKeyDown={stopCardKeys}
          onChange={(event) => onChange({ ...extras, note: event.target.value })}
        />
      ) : null}
    </div>
  )
}
