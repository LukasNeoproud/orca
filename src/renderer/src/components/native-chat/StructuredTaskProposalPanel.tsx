import { useMemo } from 'react'
import { ListTree, Sparkles, X } from 'lucide-react'
import type { AgentSessionBranchesResult } from '../../../../shared/agent-session-branch'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { getBacklogTaskWorkspaceOptions } from '@/lib/backlog-task-handoff-options'
import { StructuredTaskProposalEditor } from './StructuredTaskProposalEditor'
import { useStructuredTaskProposals } from './use-structured-task-proposals'
import { structuredTaskProposalWorkspaceRoute } from './structured-task-proposal-view'

type Props = {
  target: RuntimeClientTarget
  sessionId: string
  workspaceId: string
  agent: 'claude' | 'codex'
  epoch: string | null | undefined
  items: readonly AgentJournalRenderItem[] | undefined
  isWorking: boolean
  visible: boolean
  family: AgentSessionBranchesResult
  refreshFamily: () => void
}

export function StructuredTaskProposalPanel(props: Props): React.JSX.Element {
  const controller = useStructuredTaskProposals(props)
  const workspaces = useMemo(() => {
    const location = controller.sourceLocation
    if (!location) {
      return [{ workspaceId: props.workspaceId, name: props.workspaceId }]
    }
    try {
      return getBacklogTaskWorkspaceOptions(
        structuredTaskProposalWorkspaceRoute(location, props.target)
      ).map((workspace) => ({
        workspaceId: workspace.id,
        name: workspace.displayName,
        detail: workspace.path
      }))
    } catch {
      return [{ workspaceId: props.workspaceId, name: props.workspaceId }]
    }
  }, [controller.sourceLocation, props.target, props.workspaceId])
  const offered = controller.proposalState === 'offered' && controller.proposal?.shouldOffer
  const confirmed = controller.proposalState === 'confirmed'
  return (
    <>
      <div className="flex min-h-9 items-center gap-2 border-b border-border px-3 py-1.5">
        {offered ? (
          <>
            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">
              {translate(
                'components.native-chat.taskProposal.suggestedCount',
                '{{value0}} independently verifiable parts suggested',
                { value0: controller.proposal!.items.length }
              )}
            </span>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={controller.busy}
              onClick={() => controller.setEditorOpen(true)}
            >
              {translate('components.native-chat.taskProposal.review', 'Review')}
            </Button>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{translate('components.native-chat.taskProposal.automatic', 'Automatic')}</span>
              <Switch
                aria-label={translate(
                  'components.native-chat.taskProposal.automaticSuggestions',
                  'Automatic related thread suggestions'
                )}
                checked={controller.automatic}
                disabled={controller.busy}
                onCheckedChange={(enabled) => void controller.setAutomaticEnabled(enabled)}
              />
            </label>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={controller.busy}
              aria-label={translate(
                'components.native-chat.taskProposal.dismiss',
                'Dismiss suggestion'
              )}
              onClick={() => void controller.dismiss()}
            >
              <X className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={controller.busy}
              onClick={() => void controller.analyze()}
            >
              <ListTree className="size-3.5" />
              {confirmed
                ? translate('components.native-chat.taskProposal.view', 'View related scope')
                : translate(
                    'components.native-chat.taskProposal.manual',
                    'Suggest related threads'
                  )}
            </Button>
            <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{translate('components.native-chat.taskProposal.automatic', 'Automatic')}</span>
              <Switch
                aria-label={translate(
                  'components.native-chat.taskProposal.automaticSuggestions',
                  'Automatic related thread suggestions'
                )}
                checked={controller.automatic}
                disabled={controller.busy}
                onCheckedChange={(enabled) => void controller.setAutomaticEnabled(enabled)}
              />
            </label>
          </>
        )}
      </div>
      {controller.error ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-destructive" role="alert">
          {controller.error}
        </p>
      ) : null}
      {controller.editorOpen && controller.proposal ? (
        <StructuredTaskProposalEditor
          open
          proposal={controller.proposal}
          workspaces={workspaces}
          relatedThreads={controller.relatedThreads}
          initialResults={controller.initialResults}
          initialSourceNotice={controller.initialSourceNotice}
          onOpenChange={controller.setEditorOpen}
          onPrepareBatch={controller.prepareBatch}
        />
      ) : null}
    </>
  )
}
