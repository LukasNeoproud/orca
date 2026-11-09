import { GitBranch, GitFork } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function NativeChatBranchButton({
  onBranch,
  perFinding = false
}: {
  onBranch: () => void
  /** One branch per finding the reply lists. */
  perFinding?: boolean
}): React.JSX.Element {
  const label = perFinding
    ? translate('conversationBranch.branchPerFinding', 'Branch per finding')
    : translate('conversationBranch.branchFromHere', 'Branch from here')
  const Icon = perFinding ? GitFork : GitBranch
  return (
    <button
      type="button"
      onClick={onBranch}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-3.5" />
    </button>
  )
}
