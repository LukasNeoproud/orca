import { useContext, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { ConversationBranchFamilyPanel } from '../conversation-branch/ConversationBranchFamilyPanel'
import { NativeChatBranchContext } from './native-chat-branch-context'

/** "2 branches" under a reply branches were made from; opens the conversation's family. */
export function NativeChatBranchPointChip({
  messageId
}: {
  messageId: string
}): React.JSX.Element | null {
  const surface = useContext(NativeChatBranchContext)
  const [open, setOpen] = useState(false)
  const count = surface?.branchesAt(messageId).length ?? 0
  const providerSessionId = surface?.family.providerSessionId
  if (!surface || count === 0 || !providerSessionId) {
    return null
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-native-chat-find-skip
          className="mt-1 flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-chat-foreground-faint hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GitBranch className="size-3.5" />
          {count === 1
            ? translate('conversationBranch.pointOne', '1 branch')
            : translate('conversationBranch.pointMany', '{{value0}} branches', { value0: count })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <ConversationBranchFamilyPanel
          branches={surface.family.branches}
          providerSessionId={providerSessionId}
          target={surface.family.target}
          worktreeId={surface.family.worktreeId}
          onOpened={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
