import { translate } from '@/i18n/i18n'
import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import type { OpenFile } from '../types/open-file'
import { openWorkspaceEditorItem } from '../tabs/workspace-editor-item'
import { buildEditorActiveResult } from '../tabs/editor-open-target-group'

export function buildGitGraphTabId(worktreeId: string): string {
  return `${worktreeId}::git-graph`
}

export function createGitGraphTabActions(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openGitGraphTab'> {
  return {
    openGitGraphTab: (worktreeId) => {
      const id = buildGitGraphTabId(worktreeId)
      const label = translate('components.right-sidebar.gitGraph.title', 'Git graph')
      const file: OpenFile = {
        id,
        filePath: id,
        relativePath: label,
        worktreeId,
        language: 'plaintext',
        isDirty: false,
        mode: 'git-graph'
      }
      set((s) => ({
        openFiles: s.openFiles.some((f) => f.id === id) ? s.openFiles : [...s.openFiles, file],
        ...buildEditorActiveResult(s, worktreeId, id)
      }))
      // Why: focus the graph in whichever split already holds it instead of adding a second tab.
      const openTab = (get().unifiedTabsByWorktree?.[worktreeId] ?? []).find(
        (tab) => tab.contentType === 'git-graph' && tab.entityId === id
      )
      void openWorkspaceEditorItem(
        get(),
        id,
        worktreeId,
        label,
        'git-graph',
        undefined,
        openTab?.groupId
      )
    }
  }
}
