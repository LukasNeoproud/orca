import { useState } from 'react'
import { GitBranch, ListTree, Reply } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { structuredAgentSessionLaunchFeasible } from '@/lib/agent-session-launch-plan'
import { workspaceKindForWorktreeId } from '@/lib/agent-launch-route-input'
import {
  conversationBranchReturnDraft,
  returnConversationBranchResult
} from '@/lib/conversation-branch-return'
import {
  listConversationBranches,
  readConversationBranchOutline,
  supportsConversationBranches
} from '@/runtime/conversation-branch-client'
import {
  resolveStructuredAgentSessionOwner,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { useAppStore } from '@/store'
import {
  conversationBranchOf,
  type ConversationBranchRecord
} from '../../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { ConversationBranchFamilyPanel } from '../conversation-branch/ConversationBranchFamilyPanel'
import { ConversationBranchReturnDialog } from '../conversation-branch/ConversationBranchReturnDialog'
import { ConversationBranchTerminalDialog } from '../conversation-branch/ConversationBranchTerminalDialog'
import { conversationBranchErrorText } from '../conversation-branch/conversation-branch-error-text'
import { useConversationBranches } from '../conversation-branch/use-conversation-branches'

type Opened =
  | { kind: 'branch'; target: RuntimeClientTarget; canOpenInChat: boolean }
  | { kind: 'family'; target: RuntimeClientTarget }
  | {
      kind: 'return'
      target: RuntimeClientTarget
      branch: ConversationBranchRecord
      parentName: string
      reply: string
    }

/** The host that serves this workspace's branches, or null where none can. */
async function branchHost(worktreeId: string): Promise<RuntimeClientTarget | null> {
  const target = structuredAgentSessionTargetForHost(
    resolveStructuredAgentSessionOwner(useAppStore.getState(), worktreeId)
  )
  return target && (await supportsConversationBranches(target)) ? target : null
}

function FamilyDialog({
  target,
  worktreeId,
  providerSessionId,
  onClose
}: {
  target: RuntimeClientTarget
  worktreeId: string
  providerSessionId: string
  onClose: () => void
}): React.JSX.Element {
  const { branches } = useConversationBranches(target, worktreeId)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate('conversationBranch.family', 'Conversation family')}</DialogTitle>
          <DialogDescription>
            {translate(
              'conversationBranch.familyDescription',
              'This conversation, the conversation it was branched from, and its branches.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ConversationBranchFamilyPanel
          branches={branches}
          providerSessionId={providerSessionId}
          target={target}
          worktreeId={worktreeId}
          onOpened={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Branching for the Claude conversation in this terminal pane. */
export function TerminalPaneBranchMenu({
  worktreeId,
  providerSessionId
}: {
  worktreeId: string
  providerSessionId: string
}): React.JSX.Element {
  const [opened, setOpened] = useState<Opened | null>(null)
  const label = translate('conversationBranch.terminalMenu', 'Conversation branches')

  const opening = async (kind: Opened['kind']): Promise<Opened> => {
    const target = await branchHost(worktreeId)
    if (!target) {
      throw new Error('conversation_branch_unavailable')
    }
    if (kind === 'family') {
      return { kind, target }
    }
    if (kind === 'return') {
      const branches = await listConversationBranches(target, worktreeId)
      const branch = conversationBranchOf(branches, providerSessionId)
      if (!branch) {
        throw new Error(
          translate('conversationBranch.notABranch', 'This conversation is not a branch.')
        )
      }
      const outline = await readConversationBranchOutline(target, worktreeId, providerSessionId)
      return {
        kind,
        target,
        branch,
        parentName:
          conversationBranchOf(branches, branch.parent.providerSessionId)?.label ??
          translate('conversationBranch.originalInline', 'the original conversation'),
        reply: outline.lastReply ?? outline.turns.at(-1)?.reply ?? ''
      }
    }
    const state = useAppStore.getState()
    return {
      kind,
      target,
      canOpenInChat: structuredAgentSessionLaunchFeasible(state, {
        agent: 'claude',
        workspace: { kind: workspaceKindForWorktreeId(worktreeId), worktreeId },
        settings: state.settings
      })
    }
  }
  const open = (kind: Opened['kind']): void => {
    opening(kind)
      .then(setOpened)
      .catch((error: unknown) => toast.error(conversationBranchErrorText(error)))
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              {/* A plain button: the pane-title class restyles it, which a Button primitive must not take. */}
              <button
                type="button"
                // Same class as split so it shares the hover/active reveal.
                className="pane-title-split-trigger inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={label}
                onClick={(event) => event.stopPropagation()}
              >
                <GitBranch className="size-3" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {label}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open('branch')}>
            <GitBranch />
            {translate('conversationBranch.terminalBranch', 'Branch this conversation…')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('family')}>
            <ListTree />
            {translate('conversationBranch.familyMenu', 'Conversation family…')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('return')}>
            <Reply />
            {translate('conversationBranch.returnResult', 'Return result to the branch point')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {opened?.kind === 'branch' ? (
        <ConversationBranchTerminalDialog
          target={opened.target}
          worktreeId={worktreeId}
          providerSessionId={providerSessionId}
          canOpenInChat={opened.canOpenInChat}
          onClose={() => setOpened(null)}
        />
      ) : null}
      {opened?.kind === 'return' ? (
        <ConversationBranchReturnDialog
          initialContent={conversationBranchReturnDraft(opened.branch.label, opened.reply)}
          parentName={opened.parentName}
          onCancel={() => setOpened(null)}
          onReturn={async (content) => {
            await returnConversationBranchResult({
              target: opened.target,
              worktreeId,
              branch: opened.branch,
              content
            })
            setOpened(null)
          }}
        />
      ) : null}
      {opened?.kind === 'family' ? (
        <FamilyDialog
          target={opened.target}
          worktreeId={worktreeId}
          providerSessionId={providerSessionId}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  )
}
