import { GitBranch } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function NativeChatBranchButton({ onBranch }: { onBranch: () => void }): React.JSX.Element {
  const label = translate('conversationBranch.branchFromHere', 'Branch from here')
  return (
    <button
      type="button"
      onClick={onBranch}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GitBranch className="size-3.5" />
    </button>
  )
}
