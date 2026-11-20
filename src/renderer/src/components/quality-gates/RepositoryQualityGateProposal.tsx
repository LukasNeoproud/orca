import { useState } from 'react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { classifyQualityGateCallFailure } from '@/lib/quality-gate-client'
import {
  answerQualityGateProposal,
  type QualityGateProposalAnswer
} from '@/lib/quality-gate-proposal-client'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { QualityGateProposal } from '../../../../shared/quality-gate-proposal'
import {
  QUALITY_GATE_LIMITS,
  type QualityGateDefinition
} from '../../../../shared/quality-gate-types'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { Button } from '../ui/button'
import { QualityGateDraftEditor } from './QualityGateDraftEditor'
import { QualityGateProposalItemCard } from './QualityGateProposalItemCard'
import {
  draftFromQualityGateProposalItem,
  presentQualityGateProposal
} from './quality-gate-proposal-view'
import {
  applyQualityGateDraft,
  validateQualityGateDraft,
  type QualityGateDraft
} from './quality-gate-settings-draft'
import { showStoredQualityGateSettings } from './use-repository-quality-gate-settings-writer'

type RepositoryQualityGateProposalProps = {
  repo: Repo
  gates: readonly QualityGateDefinition[]
  proposal: QualityGateProposal
  /** The host that keeps the repository and its proposal. */
  target: RuntimeClientTarget
  /** Locked while the section edits or saves a gate of its own. */
  busy: boolean
  /** The section's own write of the gates, on this computer or on the host that keeps them. */
  saveGates: (gates: QualityGateDefinition[]) => Promise<boolean>
  onAnswered: (next: QualityGateProposal | null) => void
  /** Read the proposal again: an answer failed, perhaps because a newer one replaced it. */
  onStale: () => void
  /** The item being edited, kept by the section so it can hold its own editor meanwhile. */
  editing: QualityGateProposalEdit | null
  onEditingChange: (next: QualityGateProposalEdit | null) => void
}

export type QualityGateProposalEdit = {
  /** Item ids restart with every proposal, so the edit names its proposal too. */
  proposalId: string
  itemId: string
  draft: QualityGateDraft
  showErrors: boolean
}

/** The edit still open: an item that left the proposal meanwhile has nothing to edit. */
export function openQualityGateProposalEdit(
  proposal: QualityGateProposal | null,
  edit: QualityGateProposalEdit | null
): QualityGateProposalEdit | null {
  return edit &&
    proposal?.id === edit.proposalId &&
    proposal.items.some((item) => item.id === edit.itemId)
    ? edit
    : null
}

function failureText(error: unknown): string {
  return classifyQualityGateCallFailure(error) === 'refused' && error instanceof Error
    ? error.message
    : translate('qualityGates.proposalAnswerFailed', 'The host of this repository did not answer.')
}

/**
 * A pending proposal shown against the gates in force, with the user's answer. Accepting goes to
 * the host, which writes the gates itself; an edited item is saved as the user's own gate and
 * then dismissed, so the protocol carries no gate the agent did not send.
 */
export function RepositoryQualityGateProposal({
  repo,
  gates,
  proposal,
  target,
  busy,
  saveGates,
  onAnswered,
  onStale,
  editing: requestedEdit,
  onEditingChange: setEditing
}: RepositoryQualityGateProposalProps): React.JSX.Element {
  const source = useAppStore(
    (state) =>
      state.worktreesByRepo[repo.id]?.find((worktree) => worktree.id === proposal.worktreeId) ??
      null
  )
  const now = useNow(60_000)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = openQualityGateProposalEdit(proposal, requestedEdit)
  const { entries, conflict } = presentQualityGateProposal(gates, proposal)
  const locked = busy || pending

  const answer = async (
    request: Omit<QualityGateProposalAnswer, 'proposalId'>,
    failure: (error: unknown) => string = failureText
  ): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      const result = await answerQualityGateProposal(target, repo.id, {
        proposalId: proposal.id,
        ...request
      })
      showStoredQualityGateSettings(repo.id, getRepoExecutionHostId(repo), {
        qualityGates: result.gates
      })
      onAnswered(result.proposal)
    } catch (caught) {
      setError(failure(caught))
      onStale()
    } finally {
      setPending(false)
    }
  }

  const saveEdited = async (current: QualityGateProposalEdit): Promise<void> => {
    if (Object.keys(validateQualityGateDraft(current.draft, gates)).length > 0) {
      setEditing({ ...current, showErrors: true })
      return
    }
    setPending(true)
    setError(null)
    const saved = await saveGates(applyQualityGateDraft(gates, current.draft)).catch(() => false)
    setPending(false)
    if (!saved) {
      return
    }
    setEditing(null)
    // Why after the save: a failed dismiss leaves the user's gate in force and the item visible.
    await answer({ action: 'dismiss', itemIds: [current.itemId] }, () =>
      translate(
        'qualityGates.proposalEditedLeft',
        'Your gate was saved, but the item could not be dismissed.'
      )
    )
  }

  const meta = [
    source
      ? translate('qualityGates.proposalFrom', 'From {{value0}}', {
          value0: source.displayName || source.branch || source.path
        })
      : null,
    // Never in the future: the shared clock's first reading can predate the proposal.
    proposal.proposedAt > 0 ? formatUiRelativeTime(Math.min(0, proposal.proposedAt - now)) : null
  ].filter((part) => part !== null)

  return (
    <div
      role="region"
      aria-label={translate('qualityGates.proposalTitle', 'Proposed gates')}
      className="space-y-2"
      data-quality-gate-proposal={proposal.id}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium">
            {translate('qualityGates.proposalTitle', 'Proposed gates')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {meta.length > 0 ? `${meta.join(' · ')}. ` : null}
            {translate(
              'qualityGates.proposalDescription',
              'The gates in force stay as they are until you accept.'
            )}
          </p>
          {proposal.rationale ? (
            <p className="text-xs">
              <span className="text-muted-foreground">
                {translate('qualityGates.proposalReasonLabel', 'Reason given:')}
              </span>{' '}
              <span className="whitespace-pre-wrap break-words select-text">
                {proposal.rationale}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || editing !== null}
            onClick={() => void answer({ action: 'dismiss' })}
          >
            {translate('qualityGates.proposalDismissAll', 'Dismiss all')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={locked || editing !== null || conflict !== null}
            onClick={() => void answer({ action: 'accept' })}
          >
            {translate('qualityGates.proposalAcceptAll', 'Accept all')}
          </Button>
        </div>
      </div>

      {conflict && entries.length > 1 ? (
        <p role="status" className="text-xs text-muted-foreground">
          {conflict === 'too-many'
            ? translate(
                'qualityGates.proposalAllTooMany',
                'Accepting everything would make more than {{value0}} gates. Take the items one at a time.',
                { value0: QUALITY_GATE_LIMITS.maxGates }
              )
            : translate(
                'qualityGates.proposalAllNameTaken',
                'Accepting everything would give two gates the same name. Take the items one at a time.'
              )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive select-text">
          {error}
        </p>
      ) : null}

      {entries.map((entry) =>
        editing?.itemId === entry.item.id ? (
          <div key={entry.item.id} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {translate(
                'qualityGates.proposalEditNote',
                'Saving sets up the gate as you edited it and dismisses the item.'
              )}
            </p>
            <QualityGateDraftEditor
              draft={editing.draft}
              errors={validateQualityGateDraft(editing.draft, gates)}
              showErrors={editing.showErrors}
              saving={pending}
              onChange={(draft) => setEditing({ ...editing, draft })}
              onSave={() => void saveEdited(editing)}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <QualityGateProposalItemCard
            key={entry.item.id}
            entry={entry}
            busy={locked || editing !== null}
            onAccept={() => void answer({ action: 'accept', itemIds: [entry.item.id] })}
            onDismiss={() => void answer({ action: 'dismiss', itemIds: [entry.item.id] })}
            onEdit={() =>
              setEditing({
                proposalId: proposal.id,
                itemId: entry.item.id,
                draft: draftFromQualityGateProposalItem(entry),
                showErrors: false
              })
            }
          />
        )
      )}
    </div>
  )
}
