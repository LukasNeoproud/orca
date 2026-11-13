import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import { buildPersistedUnifiedTabSessionData } from '@/lib/workspace-session-unified-tabs'
import { isMobilePublishableOpenFile } from '@/runtime/sync-runtime-graph/mobile-session-surfaces'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

const TAB_ID = 'wt-1::git-graph'

function graphTabs(store: ReturnType<typeof createEditorTabsStore>) {
  return (store.getState().unifiedTabsByWorktree['wt-1'] ?? []).filter(
    (tab) => tab.contentType === 'git-graph'
  )
}

describe('git graph tab', () => {
  it('opens one tab per workspace and focuses it when opened again', () => {
    const store = createEditorTabsStore()

    store.getState().openGitGraphTab('wt-1')
    store.getState().openFile({
      filePath: '/repo/other.ts',
      relativePath: 'other.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
    store.getState().openGitGraphTab('wt-1')

    expect(store.getState().activeFileId).toBe(TAB_ID)
    expect(store.getState().openFiles.filter((file) => file.id === TAB_ID)).toEqual([
      expect.objectContaining({ mode: 'git-graph', relativePath: 'Git graph' })
    ])
    expect(graphTabs(store)).toEqual([
      expect.objectContaining({ entityId: TAB_ID, label: 'Git graph' })
    ])
  })

  it('stays out of the saved session and off the mobile tab list', () => {
    const store = createEditorTabsStore()
    store.getState().openGitGraphTab('wt-1')
    const state = store.getState()

    const saved = buildPersistedUnifiedTabSessionData(state)
    expect(JSON.stringify(saved)).not.toContain('git-graph')
    expect(isMobilePublishableOpenFile(state.openFiles[0]!)).toBe(false)
  })

  it('closes without leaving a tab to reopen', () => {
    const store = createEditorTabsStore()
    store.getState().openGitGraphTab('wt-1')

    store.getState().closeFile(TAB_ID)

    expect(store.getState().openFiles).toEqual([])
    expect(graphTabs(store)).toEqual([])
  })
})
