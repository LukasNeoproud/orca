import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { CreateWorktreeResult } from '../../../shared/worktree/create-types'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

// Only the creation flow handles a recovered checkout without launching fallback work.
export function checkoutRecoveryCreateOptions(request: WorktreeCreationRequest): {
  recoverCompletedCheckoutFailure: true
  explicitCreation?: WorktreeCreationRequest['explicitCreation']
} {
  return {
    recoverCompletedCheckoutFailure: true,
    ...(request.explicitCreation ? { explicitCreation: request.explicitCreation } : {})
  }
}

export async function completeRecoveredWorktreeCreation(
  creationId: string,
  request: WorktreeCreationRequest,
  result: CreateWorktreeResult
): Promise<void> {
  const warning = result.checkoutWarning
  if (!warning) {
    return
  }
  // Reveal the paused worktree only while its creation panel or no other surface is in view.
  const state = useAppStore.getState()
  const activate =
    state.activeView === 'terminal' &&
    (state.activePendingCreationId === creationId || state.activePendingCreationId === null)

  const prompt =
    request.launchDraftPrompt ||
    request.quickPrompt ||
    request.startupPlan?.draftPrompt ||
    request.startupPlan?.followupPrompt ||
    ''
  const executionHostId = result.worktree.hostId ?? request.executionHostId
  const comment = [request.note, prompt].filter(Boolean).join('\n\n')
  let notesSaved = false
  if (comment) {
    try {
      const saved = await useAppStore
        .getState()
        .updateWorktreeMeta(result.worktree.id, { comment }, { executionHostId })
      notesSaved = saved.ok
    } catch (error) {
      console.error('Failed to preserve paused worktree creation notes:', error)
    }
  }

  if (activate) {
    activateAndRevealWorktree(result.worktree.id, {
      sidebarRevealBehavior: 'auto',
      providesInitialSurface: true,
      notifyHostRuntime: false,
      ...(executionHostId ? { executionHostId } : {})
    })
  }
  useAppStore.getState().removePendingWorktreeCreation(creationId, { cleanupVm: false })

  const paused = translate(
    'worktreeCreation.checkoutWarning.startupPaused',
    'Automatic setup and agent startup were paused. Review the error before starting them manually.'
  )
  const promptNotice = prompt
    ? notesSaved
      ? translate(
          'worktreeCreation.checkoutWarning.promptSaved',
          'Your initial prompt is saved in the worktree notes.'
        )
      : translate(
          'worktreeCreation.checkoutWarning.promptNotSaved',
          'Your initial prompt could not be saved. Copy it before dismissing this warning.'
        )
    : ''
  toast.warning(
    warning.kind === 'post-checkout-hook-failed'
      ? translate(
          'worktreeCreation.checkoutWarning.hookFailed',
          'Worktree created, but checkout hook failed'
        )
      : translate(
          'worktreeCreation.checkoutWarning.gitFailed',
          'Worktree created, but Git reported an error'
        ),
    {
      id: `worktree-checkout-warning:${result.worktree.hostId ?? ''}:${result.worktree.id}`,
      description: [warning.path, paused, promptNotice, warning.message]
        .filter(Boolean)
        .join('\n\n'),
      duration: Infinity,
      dismissible: true,
      ...(prompt
        ? {
            action: {
              label: translate(
                'worktreeCreation.checkoutWarning.copyPrompt',
                'Copy initial prompt'
              ),
              onClick: (event) => {
                event.preventDefault()
                void window.api.ui.writeClipboardText(prompt).catch(() => {
                  toast.error(
                    translate(
                      'worktreeCreation.checkoutWarning.copyFailed',
                      'Could not copy the initial prompt.'
                    )
                  )
                })
              }
            }
          }
        : {})
    }
  )
}
