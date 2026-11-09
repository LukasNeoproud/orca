import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  isConversationBranchMode,
  type ConversationBranchMode
} from '../../../../shared/conversation-branch'

function modeDescription(mode: ConversationBranchMode): string {
  if (mode === 'compact') {
    return translate(
      'conversationBranch.modeCompactDescription',
      'The branch keeps the conversation up to this reply, summarized with a focus. Claude summarizes it before the branch opens, which can take a minute.'
    )
  }
  if (mode === 'clean') {
    return translate(
      'conversationBranch.modeCleanDescription',
      'A new conversation without the history. Its prompt quotes this reply; edit it to say what the branch is for.'
    )
  }
  return translate(
    'conversationBranch.modeFullDescription',
    'The branch keeps the whole conversation up to and including this reply.'
  )
}

/** How much of the conversation a branch keeps. */
export function ConversationBranchModeField({
  mode,
  disabled = false,
  onChange
}: {
  mode: ConversationBranchMode
  disabled?: boolean
  onChange: (mode: ConversationBranchMode) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label htmlFor="conversation-branch-mode">
        {translate('conversationBranch.mode', 'Context')}
      </Label>
      <Select
        value={mode}
        disabled={disabled}
        onValueChange={(value) => isConversationBranchMode(value) && onChange(value)}
      >
        <SelectTrigger id="conversation-branch-mode" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="full">
            {translate('conversationBranch.modeFull', 'Whole conversation')}
          </SelectItem>
          <SelectItem value="compact">
            {translate('conversationBranch.modeCompact', 'Summarized conversation')}
          </SelectItem>
          <SelectItem value="clean">
            {translate('conversationBranch.modeClean', 'New conversation')}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{modeDescription(mode)}</p>
    </div>
  )
}
