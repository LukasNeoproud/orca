import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  resolveChecksPanelTerminalPtyId,
  resolveChecksPanelWorktreeFromTerminalCwd
} from '@/components/right-sidebar/checks-panel-terminal-worktree'
import type { DetectedWorktree } from '../../../../shared/worktree/types'

export type AndroidBuildDirectory = {
  path: string
  /** Branch name, or a short commit for a detached checkout. */
  label: string
  isWorkspace: boolean
}

const NO_WORKTREES: DetectedWorktree[] = []

function directoryLabel(worktree: DetectedWorktree): string {
  const branch = worktree.branch?.replace(/^refs\/heads\//, '')
  return branch || worktree.head?.slice(0, 8) || worktree.path
}

/** The terminal tab (or chat) showing in the workspace's focused pane. */
function selectActiveTabEntityId(state: AppState, worktreeId: string): string | null {
  const groupId = state.activeGroupIdByWorktree[worktreeId]
  const group = state.groupsByWorktree[worktreeId]?.find((candidate) => candidate.id === groupId)
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (candidate) => candidate.id === group?.activeTabId
  )
  return tab?.entityId ?? null
}

/** Transcript of the agent in the focused tab, else of the workspace's most recent agent. */
function selectAgentTranscriptPath(state: AppState, worktreeId: string): string | null {
  const activeEntityId = selectActiveTabEntityId(state, worktreeId)
  let inActiveTab: string | null = null
  let newest: { path: string; updatedAt: number } | null = null
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    const path = entry.providerSession?.transcriptPath
    if (!path) {
      continue
    }
    if (activeEntityId && entry.paneKey.startsWith(`${activeEntityId}:`)) {
      inActiveTab = path
    }
    if (entry.worktreeId === worktreeId && (!newest || entry.updatedAt > newest.updatedAt)) {
      newest = { path, updatedAt: entry.updatedAt }
    }
  }
  return inActiveTab ?? newest?.path ?? null
}

function selectActiveTerminalPtyId(state: AppState, worktreeId: string): string | null {
  const activeTabId = selectActiveTabEntityId(state, worktreeId)
  return resolveChecksPanelTerminalPtyId({
    activeTabId,
    ptyIdsByTabId: state.ptyIdsByTabId,
    terminalLayoutsByTabId: state.terminalLayoutsByTabId
  })
}

/**
 * Where Run builds from. A conversation in the main checkout often works in another git
 * worktree of the repository, so the choice defaults to the one the agent or terminal is in.
 */
export function useAndroidBuildDirectory({
  worktreeId,
  repoId,
  workspacePath
}: {
  worktreeId: string
  repoId: string
  workspacePath: string
}): {
  directories: AndroidBuildDirectory[]
  selected: AndroidBuildDirectory
  /** Set when the default came from the conversation rather than the workspace. */
  followsConversation: boolean
  select: (path: string) => void
} {
  const fetchDetectedWorktrees = useAppStore((state) => state.fetchDetectedWorktrees)
  const detected = useAppStore(
    (state) => state.detectedWorktreesByRepo[repoId]?.worktrees ?? NO_WORKTREES
  )
  const transcriptPath = useAppStore((state) => selectAgentTranscriptPath(state, worktreeId))
  const ptyId = useAppStore((state) => selectActiveTerminalPtyId(state, worktreeId))
  const worktrees = useMemo(
    () => detected.filter((worktree) => !worktree.isBare && !worktree.prunable),
    [detected]
  )

  // A fresh listing also lets the main process accept a worktree the agent just created.
  useEffect(() => {
    void fetchDetectedWorktrees(repoId)
  }, [fetchDetectedWorktrees, repoId])

  const [conversationPath, setConversationPath] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    const resolve = async (): Promise<void> => {
      const agentCwd = transcriptPath
        ? await window.api.androidAppRun.agentDirectory({ transcriptPath }).catch(() => null)
        : null
      // Remote PTYs live on another machine, where this local build cannot run.
      const localPty = ptyId && !/^(remote|ssh):/.test(ptyId) ? ptyId : null
      const cwd =
        agentCwd ?? (localPty ? await window.api.pty.getCwd(localPty).catch(() => null) : null)
      if (current) {
        setConversationPath(resolveChecksPanelWorktreeFromTerminalCwd(cwd, worktrees)?.path ?? null)
      }
    }
    void resolve()
    return () => {
      current = false
    }
  }, [ptyId, transcriptPath, worktrees])

  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const directories = useMemo(() => {
    const list = worktrees.map((worktree) => ({
      path: worktree.path,
      label: directoryLabel(worktree),
      isWorkspace: worktree.path === workspacePath
    }))
    // The workspace is always buildable, even before the listing arrives or for a folder workspace.
    return list.some((directory) => directory.isWorkspace)
      ? list
      : [{ path: workspacePath, label: workspacePath, isWorkspace: true }, ...list]
  }, [workspacePath, worktrees])

  const find = (path: string | null): AndroidBuildDirectory | undefined =>
    directories.find((directory) => directory.path === path)
  const chosen = find(chosenPath)
  const conversation = find(conversationPath)
  const selected = chosen ?? conversation ?? find(workspacePath) ?? directories[0]!
  return {
    directories,
    selected,
    followsConversation: !chosen && Boolean(conversation) && !selected.isWorkspace,
    select: setChosenPath
  }
}
