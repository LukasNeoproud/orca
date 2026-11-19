import { translate } from '@/i18n/i18n'
import type { EditorGet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'

export function buildGitGraphTabId(worktreeId: string): string {
  return `${worktreeId}::git-graph`
}

export function createGitGraphTabActions(get: EditorGet): Pick<EditorSlice, 'openGitGraphTab'> {
  return {
    openGitGraphTab: (worktreeId) => {
      const id = buildGitGraphTabId(worktreeId)
      // Why: focus the graph in whichever split already holds it instead of adding a second tab.
      const openTab = (get().unifiedTabsByWorktree?.[worktreeId] ?? []).find(
        (tab) => tab.contentType === 'git-graph' && tab.entityId === id
      )
      get().openFile(
        {
          filePath: id,
          relativePath: translate('components.right-sidebar.gitGraph.title', 'Git graph'),
          worktreeId,
          language: 'plaintext',
          mode: 'git-graph'
        },
        {
          preview: false,
          // The graph reads its workspace's repository; it has no file owner to capture.
          suppressActiveRuntimeFallback: true,
          ...(openTab ? { targetGroupId: openTab.groupId } : {})
        }
      )
    }
  }
}
