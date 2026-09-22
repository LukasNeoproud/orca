import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { getBacklogTaskWorkspaceOptions } from '@/lib/backlog-task-handoff-options'
import { StructuredTaskProposalEditor } from './StructuredTaskProposalEditor'
import {
  usePortableTaskProposals,
  type PortableTaskProposalPanelProps
} from './use-portable-task-proposals'

export function PortableTaskProposalPanel(
  props: PortableTaskProposalPanelProps
): React.JSX.Element {
  const controller = usePortableTaskProposals(props)
  const workspaces = getBacklogTaskWorkspaceOptions({
    workspaceId: props.source.workspace.id,
    executionHostId: props.source.executionHostId,
    runtimeEnvironmentId: props.target.kind === 'environment' ? props.target.environmentId : null
  }).map((workspace) => ({
    workspaceId: workspace.id,
    name: workspace.displayName,
    detail: workspace.path
  }))
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <Button
        size="xs"
        variant="ghost"
        disabled={controller.busy || !controller.ready}
        onClick={() => void controller.setAutomatic()}
      >
        {controller.enabled
          ? translate('conversations.portableProposal.automatic', 'Auto proposals')
          : translate('conversations.portableProposal.manual', 'Manual proposals')}
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!controller.candidate || controller.busy || !controller.ready}
        onClick={() => void controller.analyze()}
      >
        {translate('conversations.portableProposal.propose', 'Propose tasks')}
      </Button>
      {controller.record ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={controller.busy}
          onClick={() => controller.setOpen(true)}
        >
          {translate('conversations.portableProposal.saved', 'Saved proposal')}
        </Button>
      ) : null}
      {controller.error ? (
        <span role="alert" className="text-xs text-destructive">
          {controller.error}
        </span>
      ) : null}
      {controller.record ? (
        <StructuredTaskProposalEditor
          open={controller.open}
          proposal={controller.record.proposal}
          workspaces={workspaces}
          relatedThreads={[...controller.related].map(([sessionId, source]) => ({
            sessionId,
            title: source.provider.sessionId,
            workspaceId: source.workspace.id
          }))}
          initialResults={controller.record.results}
          onOpenChange={controller.setOpen}
          onPrepareBatch={controller.prepareBatch}
        />
      ) : null}
    </div>
  )
}
