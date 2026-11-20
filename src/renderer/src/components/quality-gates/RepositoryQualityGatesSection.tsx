import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  cancelQualityGates,
  classifyQualityGateCallFailure,
  startQualityGates
} from '@/lib/quality-gate-client'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  QUALITY_GATE_LIMITS,
  normalizeQualityGateDefinitions,
  type QualityGateDefinition
} from '../../../../shared/quality-gate-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  worktreeHostMatchOptions,
  worktreeMatchesHost
} from '../../store/slices/worktrees/listing/worktree-host-ownership'
import { Button } from '../ui/button'
import { QualityGateDraftEditor } from './QualityGateDraftEditor'
import { QualityGateRunBar } from './QualityGateRunBar'
import { QualityGateSettingsRow } from './QualityGateSettingsRow'
import {
  applyQualityGateDraft,
  draftFromQualityGate,
  moveQualityGate,
  newQualityGateDraft,
  removeQualityGate,
  validateQualityGateDraft,
  type QualityGateDraft
} from './quality-gate-settings-draft'
import { getRepositoryQualityGatesSectionId } from './quality-gate-settings-target'
import { hasLiveQualityGateRun, presentQualityGateStatus } from './quality-gate-status-view'
import { useQualityGateStatus } from './use-quality-gate-status'

type RepositoryQualityGatesSectionProps = {
  repo: Repo
  updateRepo: (
    repoId: string,
    updates: { qualityGates: QualityGateDefinition[] }
  ) => void | Promise<boolean>
}

const EMPTY_WORKTREES: Worktree[] = []
const EMPTY_GATES: QualityGateDefinition[] = []

function workspaceLabel(worktree: Worktree): string {
  return worktree.displayName || worktree.branch || worktree.path
}

function Notice({
  tone,
  children
}: {
  tone: 'error' | 'info'
  children: React.ReactNode
}): React.JSX.Element {
  return tone === 'error' ? (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive select-text"
    >
      {children}
    </div>
  ) : (
    <div
      role="status"
      className="rounded-md border border-status-warning-border bg-status-warning-background px-3 py-2 text-xs select-text"
    >
      {children}
    </div>
  )
}

export function RepositoryQualityGatesSection({
  repo,
  updateRepo
}: RepositoryQualityGatesSectionProps): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const allWorktrees = useAppStore((state) => state.worktreesByRepo[repo.id] ?? EMPTY_WORKTREES)
  const hostId = getRepoExecutionHostId(repo)
  // Why: gates are written only by this app into its own store; a repository on another host
  // keeps its gates in Orca there, and nothing this app can call changes them.
  const editable = hostId === LOCAL_EXECUTION_HOST_ID
  const target = useMemo(() => ipcOrRuntimeTargetForHostId(hostId), [hostId])
  const gates = useMemo(
    () => normalizeQualityGateDefinitions(repo.qualityGates) ?? EMPTY_GATES,
    [repo.qualityGates]
  )
  const workspaces = useMemo(() => {
    const options = worktreeHostMatchOptions({ repos }, repo.id, hostId)
    return allWorktrees
      .filter((worktree) => !worktree.isArchived && worktreeMatchesHost(worktree, hostId, options))
      .map((worktree) => ({ id: worktree.id, label: workspaceLabel(worktree) }))
  }, [allWorktrees, hostId, repo.id, repos])
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)

  const [chosenWorkspaceId, setChosenWorkspaceId] = useState<string | null>(null)
  // The workspace the user is working in is the likeliest one to check.
  const workspaceId =
    workspaces.find((workspace) => workspace.id === chosenWorkspaceId)?.id ??
    workspaces.find((workspace) => workspace.id === activeWorktreeId)?.id ??
    workspaces[0]?.id ??
    null
  const [draft, setDraft] = useState<QualityGateDraft | null>(null)
  const [showDraftErrors, setShowDraftErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [runPending, setRunPending] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const { view, refresh } = useQualityGateStatus(
    gates.length > 0 ? target : null,
    workspaceId,
    JSON.stringify(gates)
  )
  const status = presentQualityGateStatus(view)
  const running = !view.contactLost && hasLiveQualityGateRun(view.status)
  const draftErrors = draft ? validateQualityGateDraft(draft, gates) : {}

  const persist = async (next: QualityGateDefinition[]): Promise<boolean> => {
    setSaving(true)
    setSaveFailed(false)
    try {
      const saved = await updateRepo(repo.id, { qualityGates: next })
      if (saved === false) {
        setSaveFailed(true)
        return false
      }
      return true
    } catch {
      setSaveFailed(true)
      return false
    } finally {
      setSaving(false)
    }
  }

  const closeDraft = (): void => {
    setDraft(null)
    setShowDraftErrors(false)
  }

  const saveDraft = async (): Promise<void> => {
    if (!draft) {
      return
    }
    if (Object.keys(draftErrors).length > 0) {
      setShowDraftErrors(true)
      return
    }
    if (await persist(applyQualityGateDraft(gates, draft))) {
      closeDraft()
    }
  }

  const callHost = async (request: () => Promise<unknown>): Promise<void> => {
    setRunPending(true)
    setRunError(null)
    try {
      await request()
    } catch (error) {
      // An older or unreachable host is shown by the status read that follows.
      if (classifyQualityGateCallFailure(error) === 'refused') {
        setRunError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setRunPending(false)
      refresh()
    }
  }

  const draftEditor = draft ? (
    <QualityGateDraftEditor
      draft={draft}
      errors={draftErrors}
      showErrors={showDraftErrors}
      saving={saving}
      onChange={setDraft}
      onSave={() => void saveDraft()}
      onCancel={closeDraft}
    />
  ) : null

  return (
    <section
      id={getRepositoryQualityGatesSectionId(repo.id)}
      className="space-y-4"
      data-quality-gates-section={repo.id}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {translate('qualityGates.title', 'Quality Gates')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'qualityGates.description',
              'Commands Orca runs in a workspace when you ask, to check the work: lint, tests, a build. They are kept in Orca on this computer and never read from the repository.'
            )}
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft !== null || saving || gates.length >= QUALITY_GATE_LIMITS.maxGates}
            onClick={() => setDraft(newQualityGateDraft())}
          >
            <Plus className="size-3.5" />
            {translate('qualityGates.addGate', 'Add Gate')}
          </Button>
        ) : null}
      </div>

      {editable ? null : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'qualityGates.remoteReadOnly',
            'This repository lives on another host. Its gates run there and are set up in Orca on that host.'
          )}
        </p>
      )}
      {saveFailed ? (
        <Notice tone="error">
          {translate('qualityGates.saveFailed', 'The gates could not be saved.')}
        </Notice>
      ) : null}

      {draft?.id === null ? draftEditor : null}

      {gates.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          {translate('qualityGates.empty', 'No quality gates are set up for this repository.')}
        </div>
      ) : null}

      {gates.length > 0 && target ? (
        <QualityGateRunBar
          workspaces={workspaces}
          selectedWorkspaceId={workspaceId}
          running={running}
          pending={runPending}
          canRun={!view.unsupported && draft === null}
          onSelectWorkspace={setChosenWorkspaceId}
          onRun={() =>
            workspaceId ? void callHost(() => startQualityGates(target, workspaceId)) : undefined
          }
          onStop={() =>
            workspaceId ? void callHost(() => cancelQualityGates(target, workspaceId)) : undefined
          }
          onRefresh={refresh}
        />
      ) : null}

      {view.unsupported ? (
        <Notice tone="info">
          {translate(
            'qualityGates.unsupported',
            'Orca on the host of this repository does not support quality gates yet. Update Orca on that host.'
          )}
        </Notice>
      ) : null}
      {view.contactLost ? (
        <Notice tone="info">
          {translate(
            'qualityGates.contactLost',
            'The host of this repository did not answer. The outcome of a run that was in progress is unknown until it answers again.'
          )}
        </Notice>
      ) : null}
      {(runError ?? view.error) ? <Notice tone="error">{runError ?? view.error}</Notice> : null}

      {gates.length > 0 ? (
        <div className="space-y-2">
          {gates.map((gate, index) =>
            draft?.id === gate.id ? (
              <div key={gate.id}>{draftEditor}</div>
            ) : (
              <QualityGateSettingsRow
                key={gate.id}
                gate={gate}
                isFirst={index === 0}
                isLast={index === gates.length - 1}
                editable={editable}
                busy={saving || draft !== null}
                result={
                  target && workspaceId && status
                    ? {
                        run:
                          status.gates.find((entry) => entry.gate.id === gate.id)?.latestRun ??
                          null,
                        target,
                        worktreeId: workspaceId
                      }
                    : null
                }
                onMove={(direction) => void persist(moveQualityGate(gates, gate.id, direction))}
                onEdit={() => setDraft(draftFromQualityGate(gate))}
                onRemove={() => void persist(removeQualityGate(gates, gate.id))}
              />
            )
          )}
        </div>
      ) : null}
    </section>
  )
}
