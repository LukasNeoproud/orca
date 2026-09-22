import {
  runBackgroundWorktreeCreation,
  type BackgroundWorktreeCreationCallbacks
} from '@/lib/worktree-creation-flow'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

export type ComposerBackgroundWorktreeCreationCallbacks = BackgroundWorktreeCreationCallbacks & {
  onQueued?: (creationId: string) => void
}

export function queueComposerBackgroundWorktreeCreation(
  request: WorktreeCreationRequest,
  callbacks?: ComposerBackgroundWorktreeCreationCallbacks
): void {
  const creationId = runBackgroundWorktreeCreation(request, callbacks)
  callbacks?.onQueued?.(creationId)
}
