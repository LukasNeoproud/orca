import { useCallback, useMemo, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'
import NewWorkspaceComposerCard from '@/components/NewWorkspaceComposerCard'
import { useComposerState } from '@/hooks/useComposerState'
import { translate } from '@/i18n/i18n'
import type { WorkspaceConversationRoute } from '@/lib/workspace-conversation-activation'
import { retryBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { findKnownWorktreeById } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import { formatWorkspaceCreateError } from '@/lib/workspace-create-error-format'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { buildWorkspaceRunContext } from '../../../../shared/task-source-context'

export type TaskWorktreeComposerProps = {
  sourceRoute: WorkspaceConversationRoute
  taskTitle: string
  onCreated: (workspaceId: string) => void
  onCancel: () => void
  onFailed?: (message: string) => void
}

export function TaskWorktreeComposer({
  sourceRoute,
  taskTitle,
  onCreated,
  onCancel,
  onFailed
}: TaskWorktreeComposerProps): React.JSX.Element {
  const sourceOwner = useAppStore((state) =>
    findKnownWorktreeById(state, sourceRoute.workspaceId, sourceRoute.executionHostId)
  )
  const sourceRepo = useAppStore((state) =>
    sourceOwner
      ? findRepoForHost(state.repos, sourceOwner.repoId, {
          hostId: sourceRoute.executionHostId,
          settings: state.settings
        })
      : null
  )
  const projectHostSetups = useAppStore((state) => state.projectHostSetups)
  const sourceSetup = useMemo(() => {
    if (!sourceOwner) {
      return null
    }
    return (
      projectHostSetups.find((setup) => setup.id === sourceOwner.projectHostSetupId) ??
      projectHostSetups.find(
        (setup) =>
          setup.repoId === sourceOwner.repoId && setup.hostId === sourceRoute.executionHostId
      ) ??
      null
    )
  }, [projectHostSetups, sourceOwner, sourceRoute.executionHostId])
  const runContext = useMemo(() => {
    if (!sourceOwner || !sourceRepo) {
      return null
    }
    return buildWorkspaceRunContext({
      projectId: sourceOwner.projectId ?? sourceSetup?.projectId ?? '',
      hostId: sourceRoute.executionHostId,
      projectHostSetupId: sourceOwner.projectHostSetupId ?? sourceSetup?.id ?? '',
      repoId: sourceOwner.repoId,
      path: sourceRepo.path
    })
  }, [sourceOwner, sourceRepo, sourceRoute.executionHostId, sourceSetup])
  const [pending, setPending] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const creationIdRef = useRef<string | null>(null)
  const submitInFlightRef = useRef(false)

  const handleCreated = useCallback(
    (workspaceId: string): void => {
      onCreated(workspaceId)
    },
    [onCreated]
  )
  const handleFailed = useCallback(
    (message: string): void => {
      setPending(false)
      setBackgroundError(message)
      onFailed?.(message)
    },
    [onFailed]
  )
  const handleQueued = useCallback((creationId: string): void => {
    creationIdRef.current = creationId
  }, [])
  const {
    cardProps,
    composerRef,
    onComposerNodeChange,
    nameInputRef,
    submitQuick,
    createDisabled
  } = useComposerState({
    initialName: taskTitle,
    initialPrompt: '',
    initialRepoId: sourceOwner?.repoId,
    initialWorkspaceRunContext: runContext,
    repoIdOverride: sourceOwner?.repoId,
    onRepoIdOverrideChange: () => {},
    persistDraft: false,
    backgroundCreationCallbacks: {
      onQueued: handleQueued,
      onCreated: handleCreated,
      onFailed: handleFailed
    }
  })

  const sourceUnavailable =
    !sourceOwner || !sourceRepo || sourceRepo.kind === 'folder' || !runContext
  const handleCreate = useCallback(async (): Promise<void> => {
    if (submitInFlightRef.current || pending || sourceUnavailable) {
      return
    }
    setBackgroundError(null)
    setPending(true)
    if (creationIdRef.current) {
      retryBackgroundWorktreeCreation(creationIdRef.current, {
        onCreated: handleCreated,
        onFailed: handleFailed
      })
      return
    }
    submitInFlightRef.current = true
    try {
      await submitQuick(null)
      if (!creationIdRef.current) {
        setPending(false)
      }
    } catch (error) {
      handleFailed(error instanceof Error ? error.message : String(error))
    } finally {
      submitInFlightRef.current = false
    }
  }, [handleCreated, handleFailed, pending, sourceUnavailable, submitQuick])

  const sourceError = sourceUnavailable
    ? translate(
        'components.backlog.worktreeSourceUnavailable',
        'This task source is not an available Git project on its original execution host.'
      )
    : null
  const displayedError = backgroundError ?? sourceError
  const eligibleRepos = sourceRepo ? [sourceRepo] : []

  return (
    <div className="space-y-4">
      {sourceRepo ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/35 px-3 py-2">
          <GitBranch className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">
              {sourceRepo.displayName}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {sourceRoute.executionHostId}
            </div>
          </div>
        </div>
      ) : null}
      <NewWorkspaceComposerCard
        {...cardProps}
        containerClassName="max-h-[min(64vh,36rem)] overflow-y-auto px-1 scrollbar-sleek"
        composerRef={composerRef}
        onComposerNodeChange={onComposerNodeChange}
        nameInputRef={nameInputRef}
        eligibleRepos={eligibleRepos}
        repoId={sourceOwner?.repoId ?? ''}
        repoBackedSearchRepos={eligibleRepos}
        allowSmartNameAddProject={false}
        onRepoChange={() => {}}
        hideProjectSection
        hideAgentSection
        quickAgent={null}
        onQuickAgentChange={() => {}}
        showCreateMultiple={false}
        createMultiple={false}
        creating={pending || cardProps.creating}
        createDisabled={createDisabled || pending || sourceUnavailable}
        createError={
          displayedError
            ? formatWorkspaceCreateError(new Error(displayedError))
            : cardProps.createError
        }
        primaryActionLabel={
          pending
            ? translate('components.backlog.creatingWorktree', 'Creating worktree…')
            : translate('components.backlog.createWorktree', 'Create worktree')
        }
        cancelAction={{
          label: translate('components.backlog.cancel', 'Cancel'),
          onClick: onCancel,
          disabled: pending
        }}
        onCreate={() => void handleCreate()}
      />
    </div>
  )
}
