import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  AgentSessionBranchRecord,
  AgentSessionReturnArtifact
} from '../../../../shared/agent-session-branch'
import type { useConversationFamily } from './use-conversation-family'
import { ConversationFamilyGraph } from './ConversationFamilyGraph'
import { ConversationBranchDialog } from './ConversationBranchDialog'
import { ConversationResultDialog } from './ConversationResultDialog'
import { conversationViewKey } from '@/lib/conversation-family-navigation'
import { useConversationFamilyViewState } from './conversation-family-view-state'
import { conversationBranchError } from '@/lib/conversation-branch-error'

export function ConversationFamilyPanel({
  controller,
  sessionId,
  target,
  latestResponse
}: {
  controller: ReturnType<typeof useConversationFamily>
  sessionId: string
  target: RuntimeClientTarget
  latestResponse: string
}): React.JSX.Element {
  const { expanded, selectedId, openDetails, setDetailOpen, update } =
    useConversationFamilyViewState(conversationViewKey(target, sessionId))
  const setExpanded = (value: boolean): void => update({ expanded: value })
  const setSelectedId = (value: string): void => update({ selectedId: value })
  const [result, setResult] = useState<{
    branch: AgentSessionBranchRecord
    existing?: AgentSessionReturnArtifact
  } | null>(null)
  const parent = controller.family.branches.find((branch) => branch.target.sessionId === sessionId)
  const selected =
    controller.family.branches.find((branch) => branch.branchId === selectedId) ?? parent
  return (
    <>
      <div className="border-b border-border px-3 py-1 text-xs">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <GitBranch className="size-3" />
            {translate('conversations.family.title', 'Related conversations')}
            {controller.family.branches.length > 0 ? (
              <span className="tabular-nums text-muted-foreground">
                {controller.family.branches.length}
              </span>
            ) : null}
          </Button>
          {parent ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={controller.busy}
              onClick={() => controller.navigate(parent, true)}
            >
              {translate('conversations.family.origin', 'Source response')}
            </Button>
          ) : null}
          {parent ? (
            <Button size="xs" variant="ghost" onClick={() => setResult({ branch: parent })}>
              {translate('conversations.family.return', 'Return result')}
            </Button>
          ) : null}
        </div>
        {expanded ? (
          <div className="space-y-2 py-2">
            {controller.error ? (
              <p role="alert" className="text-destructive">
                {controller.error}
              </p>
            ) : null}
            <ConversationFamilyGraph
              branches={controller.family.branches}
              sessionId={sessionId}
              onSource={(branch) => controller.navigate(branch, true)}
              onOpen={(branch) => {
                setSelectedId(branch.branchId)
                controller.navigate(branch, false)
              }}
            />
            {!controller.family.branches.length ? (
              <p className="text-muted-foreground">
                {translate(
                  'conversations.family.empty',
                  'Create a related conversation from a completed response.'
                )}
              </p>
            ) : null}
            {selected ? (
              <div className="space-y-2 border-t border-border pt-2">
                <p className="font-medium">{selected.title}</p>
                <p className="break-all text-muted-foreground">
                  {selected.target.location.workspaceId} · {selected.target.agent} ·{' '}
                  {selected.target.location.executionHostId}
                </p>
                <p className="text-muted-foreground">
                  {selected.handoff.mechanism === 'relationship-only'
                    ? translate(
                        'conversations.family.relationshipOnly',
                        'Linked conversation; no context was sent by this link.'
                      )
                    : selected.handoff.mode === 'preserve-history'
                      ? translate(
                          'conversations.family.historicalContext',
                          'Historical context through the source response'
                        )
                      : translate(
                          'conversations.family.targetedContext',
                          'Targeted handoff; the parent link does not add context.'
                        )}
                </p>
                <details
                  key={selected.branchId}
                  open={openDetails.includes(`handoff:${selected.branchId}`)}
                  onToggle={(event) =>
                    setDetailOpen(`handoff:${selected.branchId}`, event.currentTarget.open)
                  }
                >
                  <summary>{translate('conversations.family.handoff', 'Saved handoff')}</summary>
                  <pre className="max-h-48 overflow-auto scrollbar-sleek whitespace-pre-wrap break-words font-mono text-xs">
                    {selected.handoff.content}
                  </pre>
                  {selected.handoff.historyPreview ? (
                    <pre className="mt-2 max-h-48 overflow-auto scrollbar-sleek whitespace-pre-wrap break-words font-mono text-xs">
                      {selected.handoff.historyPreview}
                    </pre>
                  ) : null}
                </details>
                <p className="text-muted-foreground">
                  {selected.state === 'prepared'
                    ? translate('conversations.family.prepared', 'Prepared; work has not started.')
                    : selected.delivery?.status === 'accepted'
                      ? translate(
                          'conversations.family.started',
                          'The conversation accepted the instruction.'
                        )
                      : selected.error
                        ? conversationBranchError(selected.error)
                        : translate(
                            'conversations.family.unverified',
                            'Preparation or delivery is not confirmed. Check the conversation before retrying.'
                          )}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={controller.busy}
                    onClick={() => controller.navigate(selected, true)}
                  >
                    {translate('conversations.family.origin', 'Source response')}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={controller.busy}
                    onClick={() => controller.navigate(selected, false)}
                  >
                    {translate('conversations.family.open', 'Open conversation')}
                  </Button>
                  {selected.handoff.mechanism !== 'relationship-only' &&
                  (selected.state === 'prepared' ||
                    selected.state === 'delivery-unverified' ||
                    selected.delivery?.status === 'rejected') ? (
                    <Button
                      size="xs"
                      disabled={controller.busy}
                      onClick={() => controller.start(selected)}
                    >
                      {selected.state === 'prepared'
                        ? translate('conversations.family.start', 'Start work')
                        : translate('conversations.family.retry', 'Check and retry delivery')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {controller.family.returns.map((artifact) => (
              <details
                key={artifact.returnId}
                open={openDetails.includes(`result:${artifact.returnId}`)}
                onToggle={(event) =>
                  setDetailOpen(`result:${artifact.returnId}`, event.currentTarget.open)
                }
              >
                <summary>
                  {translate('conversations.family.result', 'Saved result')} ·{' '}
                  {artifact.delivery?.status === 'accepted'
                    ? translate('conversations.family.delivered', 'Delivered')
                    : translate('conversations.family.notConfirmed', 'Delivery unconfirmed')}
                </summary>
                <p className="my-1 break-all text-muted-foreground">
                  {artifact.sourceSessionId} → {artifact.targetSessionId}
                </p>
                <p className="mb-1 text-muted-foreground">
                  {artifact.integrationState === 'integrated'
                    ? translate('conversations.family.integrated', 'Marked as integrated')
                    : translate(
                        'conversations.family.reportOnly',
                        'Reported result; integration has not been recorded.'
                      )}
                </p>
                <pre className="max-h-48 overflow-auto scrollbar-sleek whitespace-pre-wrap break-words font-mono text-xs">
                  {artifact.content}
                </pre>
                {artifact.sourceSessionId === sessionId &&
                artifact.delivery?.status !== 'accepted' ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      const branch = controller.family.branches.find(
                        (entry) => entry.branchId === artifact.branchId
                      )
                      if (branch) {
                        setResult({ branch, existing: artifact })
                      }
                    }}
                  >
                    {translate('conversations.family.resumeResult', 'Review delivery')}
                  </Button>
                ) : null}
              </details>
            ))}
            <Button
              size="xs"
              variant="ghost"
              disabled={controller.busy}
              onClick={controller.refresh}
            >
              {translate('conversations.family.refresh', 'Refresh')}
            </Button>
          </div>
        ) : null}
        {!expanded && controller.actionError ? (
          <p role="alert" className="text-destructive">
            {controller.actionError}
          </p>
        ) : null}
      </div>
      {controller.selection ? (
        <ConversationBranchDialog
          selection={controller.selection}
          onClose={controller.closeSelection}
          onPrepared={(branch) => {
            setSelectedId(branch.branchId)
            setExpanded(true)
            controller.refresh()
          }}
        />
      ) : null}
      {result ? (
        <ConversationResultDialog
          branch={result.branch}
          target={target}
          text={latestResponse}
          existing={result.existing}
          onClose={() => setResult(null)}
          onChanged={controller.refresh}
        />
      ) : null}
    </>
  )
}
