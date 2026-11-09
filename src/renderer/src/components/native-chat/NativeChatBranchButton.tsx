import { GitBranch, GitFork, Reply } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export type NativeChatBranchAction = 'branch' | 'per-finding' | 'return'

function actionLabel(action: NativeChatBranchAction): string {
  if (action === 'per-finding') {
    return translate('conversationBranch.branchPerFinding', 'Branch per finding')
  }
  if (action === 'return') {
    return translate('conversationBranch.returnResult', 'Return result to the branch point')
  }
  return translate('conversationBranch.branchFromHere', 'Branch from here')
}

const ICONS = { branch: GitBranch, 'per-finding': GitFork, return: Reply }

export function NativeChatBranchButton({
  action,
  onClick
}: {
  action: NativeChatBranchAction
  onClick: () => void
}): React.JSX.Element {
  const label = actionLabel(action)
  const Icon = ICONS[action]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-3.5" />
    </button>
  )
}
