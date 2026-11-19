import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import { buildPersistedUnifiedTabSessionData } from '@/lib/workspace-session-unified-tabs'
import { isMobilePublishableOpenFile } from '@/runtime/sync-runtime-graph/mobile-session-surfaces'
import { getDefaultSettings } from '../../../../shared/constants'

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

  it('focuses the graph in the split that holds it instead of adding one beside the chat', () => {
    const store = createEditorTabsStore()
    const chat = store
      .getState()
      .createUnifiedTab('wt-1', 'agent-session', { entityId: 'session-1', label: 'Chat' })
    store.getState().openGitGraphTab('wt-1')
    const [graphTab] = graphTabs(store)
    store
      .getState()
      .dropUnifiedTab(graphTab!.id, { groupId: chat.groupId, splitDirection: 'right' })
    const graphGroupId = graphTabs(store)[0]!.groupId
    expect(graphGroupId).not.toBe(chat.groupId)
    store.getState().focusGroup('wt-1', chat.groupId)
    store.getState().activateTab(chat.id)

    store.getState().openGitGraphTab('wt-1')

    const state = store.getState()
    const groups = state.groupsByWorktree['wt-1'] ?? []
    expect(graphTabs(store)).toHaveLength(1)
    expect(state.activeGroupIdByWorktree['wt-1']).toBe(graphGroupId)
    expect(groups.find((group) => group.id === graphGroupId)?.activeTabId).toBe(graphTab!.id)
    expect(groups.find((group) => group.id === chat.groupId)?.activeTabId).toBe(chat.id)
  })

  it('opens as a pinned tab and keeps the Active Server off its record', () => {
    const store = createEditorTabsStore()
    store.setState({
      settings: {
        ...getDefaultSettings('/tmp/orca-test'),
        activeRuntimeEnvironmentId: 'env-a',
        editorPreviewTabsEnabled: true
      }
    })

    store.getState().openGitGraphTab('wt-1')

    const [file] = store.getState().openFiles
    expect(file).toEqual(expect.objectContaining({ id: TAB_ID, isDirty: false }))
    expect(file!.runtimeEnvironmentId ?? null).toBeNull()
    expect(file!.isPreview).toBeFalsy()
    expect(graphTabs(store)[0]!.isPreview).toBeFalsy()
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
