import { useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import { isAiVaultSessionResumableContent } from '../../../../shared/ai-vault-types'
import { agentLabel } from '../../../../shared/ai-vault-session-filters'
import { isAgentSessionHandleProvider } from '../../../../shared/agent-session-provider-handle'
import type { AgentType } from '../../../../shared/agent-status-types'
import { ResumeInNewCliTooltipText } from '../right-sidebar/ai-vault-session-cli-fork-copy'
import { useAiVaultSessionLaunchActions } from '../right-sidebar/ai-vault-session-launch-actions'
import {
  lookupTabSessionHistoryRow,
  resolveTabSessionHistorySubject,
  resolveTabSessionSwitch
} from '../tab-bar/tab-session-history-switch'

function notifyCliUnavailable(): void {
  toast.error(
    translate(
      'auto.components.right.sidebar.AiVaultPanel.resumeInNewCliUnavailable',
      'This session cannot be opened in the CLI.'
    )
  )
}

/** The chat tab menu's "Resume in New CLI", on the chat itself. The history lookup runs on click. */
export function NativeChatResumeInCliButton({
  tabId,
  sessionId,
  agent,
  worktreeId
}: {
  tabId: string
  sessionId: string
  agent: AgentType
  /** Null hides the button: no owning workspace, or the find bar holds the corner. */
  worktreeId: string | null
}): React.JSX.Element | null {
  const [pending, setPending] = useState(false)
  const targetState = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      settings: state.settings,
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo
    }))
  )
  const launchActions = useAiVaultSessionLaunchActions({
    activeWorktree: null,
    activeWorktreeId: worktreeId,
    targetState,
    agentCmdOverrides: targetState.settings?.agentCmdOverrides
  })
  // Only these providers have history rows the fork can act on.
  if (!isAgentSessionHandleProvider(agent) || !worktreeId) {
    return null
  }
  const provider = agent
  const ownerWorktreeId = worktreeId
  const label = translate(
    'auto.components.right.sidebar.AiVaultSessionRow.resumeInNewCli',
    'Resume in New CLI'
  )

  const resume = async (): Promise<void> => {
    const subject = resolveTabSessionHistorySubject(useAppStore.getState(), {
      tab: { id: tabId, worktreeId: ownerWorktreeId, launchAgent: provider },
      structuredSessionId: sessionId
    })
    if (!subject) {
      notifyCliUnavailable()
      return
    }
    const row = await lookupTabSessionHistoryRow(
      subject,
      (args) => window.api.aiVault.listSessions(args),
      { requestToken: createBrowserUuid(), isCancelled: () => false, userRequested: true }
    )
    if (row === undefined) {
      return
    }
    if (!row || !isAiVaultSessionResumableContent(row)) {
      toast.error(
        translate(
          'components.native-chat.resumeInNewChat.notSavedYet',
          "{{agent}} hasn't saved this conversation yet. Try again after it replies.",
          { agent: agentLabel(provider) }
        )
      )
      return
    }
    const move = resolveTabSessionSwitch(useAppStore.getState(), row, subject)
    if (move?.action !== 'resume-in-new-cli') {
      notifyCliUnavailable()
      return
    }
    launchActions.handleResumeInNewCli(row, move.worktreeId)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={pending}
          onClick={() => {
            setPending(true)
            void resume()
              .catch(notifyCliUnavailable)
              .finally(() => setPending(false))
          }}
          className="absolute top-2 right-3 z-10 text-chat-foreground-faint"
        >
          <SquareTerminal className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <span className="block font-medium">{label}</span>
        <ResumeInNewCliTooltipText />
      </TooltipContent>
    </Tooltip>
  )
}
