import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { PortableConversationRequest } from '@/lib/portable-conversation-request'
import { portableConversationBranchTargetSource } from '@/lib/portable-conversation-navigation'
import {
  portableConversationSourceSessionId,
  type PortableConversationBranchRecord,
  type PortableConversationReturnArtifact
} from '../../../../shared/portable-conversation-branch'
import {
  PortableConversationSourceDialog,
  type PortableConversationSourceSelection
} from './PortableConversationSourceDialog'
import { PortableConversationBranchDialog } from './PortableConversationBranchDialog'
import { PortableConversationBranchDetails } from './PortableConversationBranchDetails'
import { PortableConversationResultDialog } from './PortableConversationResultDialog'
import { ConversationFamilyGraph } from './ConversationFamilyGraph'
import { usePortableConversationFamily } from './use-portable-conversation-family'
import { useConversationFamilyViewState } from './conversation-family-view-state'

export function PortableConversationFlow({
  request,
  onClose
}: {
  request: PortableConversationRequest
  onClose: () => void
}): React.JSX.Element {
  const [view, setView] = useState(request)
  const [selection, setSelection] = useState<PortableConversationSourceSelection | null>(null)
  const [pendingDetail, setPendingDetail] = useState<{
    scope: string
    branch: PortableConversationBranchRecord
  } | null>(null)
  const [returning, setReturning] = useState<{
    branch: PortableConversationBranchRecord
    artifact?: PortableConversationReturnArtifact
  } | null>(null)
  const family = usePortableConversationFamily(view.target, view.source)
  const familyView = useConversationFamilyViewState(
    JSON.stringify(['portable', view.target, family.sessionId])
  )
  const detailScope = JSON.stringify([view.target, family.sessionId])
  const selected =
    family.family.branches.find((branch) => branch.branchId === familyView.selectedId) ??
    (pendingDetail?.scope === detailScope && pendingDetail.branch.branchId === familyView.selectedId
      ? pendingDetail.branch
      : null)
  const setSelected = (branch: PortableConversationBranchRecord | null): void => {
    setPendingDetail(branch ? { scope: detailScope, branch } : null)
    familyView.update({ selectedId: branch?.branchId ?? null })
  }
  const currentBranch = family.family.branches.find((branch) => {
    const source = portableConversationBranchTargetSource(branch)
    return source && portableConversationSourceSessionId(source) === family.sessionId
  })
  const openSource = (branch: PortableConversationBranchRecord): void => {
    setSelected(null)
    setSelection(null)
    setView({
      target: view.target,
      source: branch.source.portable.source,
      initialAnchor: branch.source.portable.anchor
    })
  }
  const inspectTarget = (branch: PortableConversationBranchRecord): void => {
    const source = portableConversationBranchTargetSource(branch)
    if (!source) {
      setSelected(branch)
      return
    }
    setSelected(null)
    setSelection(null)
    setView({ target: view.target, source })
  }
  const updated = (branch: PortableConversationBranchRecord): void => {
    family.update(branch)
    setSelected(branch)
    setSelection(null)
  }
  return (
    <>
      <PortableConversationSourceDialog
        target={view.target}
        source={view.source}
        initialAnchor={view.initialAnchor}
        open={!selection && !selected && !returning}
        onClose={onClose}
        onFamilyChanged={family.reload}
        onSelect={setSelection}
      >
        {family.error ? (
          <p role="alert" className="text-xs text-destructive">
            {family.error}
          </p>
        ) : null}
        {family.family.branches.length ? (
          <div className="space-y-2 border-b border-border pb-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="xs"
                aria-expanded={familyView.expanded}
                onClick={() => familyView.update({ expanded: !familyView.expanded })}
              >
                {translate('conversations.portableBranch.related', 'Related conversations')} ·{' '}
                {family.family.branches.length}
              </Button>
              {currentBranch ? (
                <Button variant="outline" size="xs" onClick={() => setSelected(currentBranch)}>
                  {translate('conversations.portableBranch.savedHandoff', 'Saved handoff')}
                </Button>
              ) : null}
              {currentBranch ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setReturning({ branch: currentBranch })}
                >
                  {translate(
                    'conversations.portableBranch.returnResult',
                    'Return result to parent'
                  )}
                </Button>
              ) : null}
            </div>
            {familyView.expanded ? (
              <ConversationFamilyGraph
                branches={family.family.branches}
                targetAliases={
                  new Map(
                    family.family.branches.map((branch) => {
                      const source = portableConversationBranchTargetSource(branch)
                      return [
                        branch.branchId,
                        source ? [portableConversationSourceSessionId(source)] : []
                      ]
                    })
                  )
                }
                sessionId={currentBranch?.target.sessionId ?? family.sessionId}
                onSource={(branch) => {
                  const owned = family.family.branches.find(
                    (item) => item.branchId === branch.branchId
                  )
                  if (owned) {
                    openSource(owned)
                  }
                }}
                onOpen={(branch) => {
                  const owned = family.family.branches.find(
                    (item) => item.branchId === branch.branchId
                  )
                  if (owned) {
                    inspectTarget(owned)
                  }
                }}
              />
            ) : null}
            {family.family.returns.map((artifact) => (
              <Button
                key={artifact.returnId}
                variant="ghost"
                size="xs"
                onClick={() => {
                  const branch = family.family.branches.find(
                    (item) => item.branchId === artifact.branchId
                  )
                  if (branch) {
                    setReturning({ branch, artifact })
                  }
                }}
              >
                {translate('conversations.portableBranch.savedResult', 'Saved result for parent')} ·{' '}
                {artifact.delivery?.status ??
                  translate('conversations.portableBranch.notSent', 'Not sent')}
              </Button>
            ))}
          </div>
        ) : null}
      </PortableConversationSourceDialog>
      {selection ? (
        <PortableConversationBranchDialog
          selection={selection}
          target={view.target}
          sourceRoute={{
            workspaceId: selection.source.workspace.id,
            executionHostId: selection.source.executionHostId,
            runtimeEnvironmentId:
              view.target.kind === 'environment' ? view.target.environmentId : null
          }}
          onClose={() => setSelection(null)}
          onPrepared={updated}
        />
      ) : null}
      {selected && !returning ? (
        <PortableConversationBranchDetails
          key={selected.branchId}
          branch={selected}
          target={view.target}
          results={family.family.returns.filter((result) => result.branchId === selected.branchId)}
          onClose={() => setSelected(null)}
          onUpdated={updated}
          onSource={() => openSource(selected)}
          onInspectTarget={inspectTarget}
          onReturn={() => setReturning({ branch: selected })}
        />
      ) : null}
      {returning ? (
        <PortableConversationResultDialog
          key={returning.artifact?.returnId ?? returning.branch.branchId}
          branch={returning.branch}
          target={view.target}
          existingArtifact={returning.artifact}
          onClose={() => setReturning(null)}
          onSaved={() => family.reload()}
        />
      ) : null}
    </>
  )
}
