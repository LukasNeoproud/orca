import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import {
  cancelQualityGates,
  classifyQualityGateCallFailure,
  setQualityGateFeedbackLoop,
  startQualityGates
} from '@/lib/quality-gate-client'
import { useWorktreeGitOwnerTarget } from '../right-sidebar/worktree-git-owner-target'
import { Button } from '../ui/button'
import { readQualityGateFeedbackLoop } from './quality-gate-feedback-loop-view'
import { getRepositoryQualityGatesSectionId } from './quality-gate-settings-target'
import { hasLiveQualityGateRun, presentQualityGateStatus } from './quality-gate-status-view'
import { useQualityGateStatus } from './use-quality-gate-status'
import { WorkspaceQualityGateFeedbackLoop } from './WorkspaceQualityGateFeedbackLoop'
import { WorkspaceQualityGateRow } from './WorkspaceQualityGateRow'
import {
  summarizeWorkspaceQualityGates,
  workspaceQualityGatesSummaryLabel
} from './workspace-quality-gates-summary'

type WorkspaceQualityGatesSectionProps = {
  worktreeId: string | null
  /** False while the panel is hidden: nothing is read and no stream is held open. */
  visible: boolean
}

function Note({ alert, children }: { alert?: boolean; children: React.ReactNode }) {
  return alert ? (
    <p role="alert" className="pb-2 text-xs text-destructive select-text">
      {children}
    </p>
  ) : (
    <p role="status" className="pb-2 text-xs text-muted-foreground select-text">
      {children}
    </p>
  )
}

/**
 * The repository's own gates as they last ran in the active workspace. Independent of any pull
 * request: the host that owns the workspace answers, whatever forge the branch is on.
 */
export function WorkspaceQualityGatesSection({
  worktreeId,
  visible
}: WorkspaceQualityGatesSectionProps): React.JSX.Element | null {
  const target = useWorktreeGitOwnerTarget(worktreeId)
  const repoId = useAppStore((state) =>
    worktreeId ? (state.getKnownWorktreeById(worktreeId)?.repoId ?? null) : null
  )
  const repo = useRepoById(repoId)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const [pending, setPending] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  // Why the gates of the row: editing them in settings must re-read what the host reports.
  const { view, refresh } = useQualityGateStatus(
    visible ? target : null,
    worktreeId,
    JSON.stringify(repo?.qualityGates ?? null),
    { watch: true }
  )

  if (!worktreeId || !target) {
    return null
  }
  const status = presentQualityGateStatus(view)
  const gates = status?.gates ?? []
  const running = !view.contactLost && hasLiveQualityGateRun(view.status)
  const canAsk = !pending && !view.unsupported && !view.contactLost

  /** True once the host took the request. */
  const callHost = async (request: () => Promise<unknown>): Promise<boolean> => {
    setPending(true)
    setRequestError(null)
    try {
      await request()
      return true
    } catch (error) {
      // An older or unreachable host is shown by the status read that follows.
      if (classifyQualityGateCallFailure(error) === 'refused') {
        setRequestError(error instanceof Error ? error.message : String(error))
      }
      return false
    } finally {
      setPending(false)
      refresh()
    }
  }

  const error = requestError ?? view.error
  const loop = gates.length > 0 ? readQualityGateFeedbackLoop(view) : null
  return (
    <section
      className="shrink-0 border-b border-border px-3 pt-2"
      aria-label={translate('qualityGates.panelTitle', 'Local gates')}
      data-workspace-quality-gates={worktreeId}
    >
      <div className="flex min-h-6 items-center gap-2 pb-2">
        <h3 className="shrink-0 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {translate('qualityGates.panelTitle', 'Local gates')}
        </h3>
        <span
          className="min-w-0 flex-1 truncate text-2xs text-muted-foreground"
          data-workspace-quality-gates-summary
        >
          {status && gates.length > 0
            ? workspaceQualityGatesSummaryLabel(summarizeWorkspaceQualityGates(status))
            : null}
        </span>
        {gates.length === 0 ? null : running ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => void callHost(() => cancelQualityGates(target, worktreeId))}
          >
            <Square />
            {translate('qualityGates.stop', 'Stop')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canAsk}
            onClick={() => void callHost(() => startQualityGates(target, worktreeId))}
          >
            <Play />
            {translate('qualityGates.runAll', 'Run all')}
          </Button>
        )}
      </div>

      {view.unsupported ? (
        <Note>
          {translate(
            'qualityGates.unsupported',
            'Orca on the host of this repository does not support quality gates yet. Update Orca on that host.'
          )}
        </Note>
      ) : null}
      {view.contactLost ? (
        <Note>
          {translate(
            'qualityGates.contactLost',
            'The host of this repository did not answer. The outcome of a run that was in progress is unknown until it answers again.'
          )}
        </Note>
      ) : null}
      {error ? <Note alert>{error}</Note> : null}
      {loop ? (
        <WorkspaceQualityGateFeedbackLoop
          reading={loop}
          disabled={view.contactLost}
          onToggle={(enabled) =>
            callHost(() => setQualityGateFeedbackLoop(target, worktreeId, enabled))
          }
        />
      ) : null}
      {status && gates.length === 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
          <p className="text-xs text-muted-foreground">
            {translate('qualityGates.empty', 'No quality gates are set up for this repository.')}
          </p>
          {repo ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => {
                openSettingsTarget({
                  pane: 'repo',
                  repoId: repo.id,
                  sectionId: getRepositoryQualityGatesSectionId(repo.id)
                })
                openSettingsPage()
              }}
            >
              {translate('qualityGates.openSettings', 'Set up gates')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {gates.length > 0 ? (
        <ul className="scrollbar-sleek max-h-96 divide-y divide-border/50 overflow-y-auto">
          {gates.map(({ gate, latestRun }) => (
            <WorkspaceQualityGateRow
              key={gate.id}
              gate={gate}
              run={latestRun}
              target={target}
              worktreeId={worktreeId}
              disabled={latestRun?.liveness === 'live' ? pending : !canAsk}
              onRun={() => void callHost(() => startQualityGates(target, worktreeId, [gate.id]))}
              onStop={() => void callHost(() => cancelQualityGates(target, worktreeId, gate.id))}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
