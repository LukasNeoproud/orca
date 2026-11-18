import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import {
  getRuntimeGitLineHistory,
  isGitAnnotateUnsupportedHostError
} from '@/runtime/runtime-git-annotate-client'
import { useAppStore } from '@/store'
import type { GitLineRange } from '../../../../shared/git-line-history'
import type { GitAnnotateFileContext } from './git-annotate-file-context'
import { nextGitAnnotateRequestId, useGitAnnotateStore } from './git-annotate-store'

/** Lists the commits that changed `range` in the Source Control commit list. */
export async function showGitLineHistory(
  context: GitAnnotateFileContext,
  range: GitLineRange
): Promise<void> {
  const { worktreeId, relativePath } = context
  const requestId = nextGitAnnotateRequestId()
  const store = useGitAnnotateStore.getState()
  store.setLineHistory(worktreeId, { context, range, requestId, state: { status: 'loading' } })

  const app = useAppStore.getState()
  if (!canShowRightSidebarForView(app.activeView)) {
    app.setActiveView('terminal')
  }
  app.setRightSidebarTab('source-control')
  app.setRightSidebarOpen(true)

  const isCurrent = (): boolean =>
    useGitAnnotateStore.getState().lineHistoryByWorktree[worktreeId]?.requestId === requestId
  try {
    const result = await getRuntimeGitLineHistory(context.gitContext, { relativePath, ...range })
    if (isCurrent()) {
      store.setLineHistory(worktreeId, {
        context,
        range,
        requestId,
        state: { status: 'ready', result }
      })
    }
  } catch (error) {
    if (isGitAnnotateUnsupportedHostError(error)) {
      // The disabled action now explains this; the commit list goes back to the log.
      store.setHostSupport(context.hostKey, 'unsupported')
      if (isCurrent()) {
        store.setLineHistory(worktreeId, null)
      }
      return
    }
    if (isCurrent()) {
      store.setLineHistory(worktreeId, {
        context,
        range,
        requestId,
        state: { status: 'error', error: error instanceof Error ? error.message : String(error) }
      })
    }
  }
}
