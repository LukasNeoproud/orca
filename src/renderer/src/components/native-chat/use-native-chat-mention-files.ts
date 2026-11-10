import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { rankQuickOpenFilesWithHistory } from '@/components/quick-open-history-ranking'
import { useQuickOpenHistory } from '@/lib/quick-open-file-history'
import { findTerminalTabWorktreeId } from './native-chat-file-link'
import { useKnownWorktreeById } from '@/store/selectors'

const MENTION_FILE_LIMIT = 20
const NO_FILES: readonly string[] = []

export type NativeChatMentionFiles = {
  /** Workspace-relative paths, best match first; folders end in `/`. */
  files: readonly string[]
  loading: boolean
  failed: boolean
}

/** `query` is null while no `@` token is open. */
export function useNativeChatMentionFiles(args: {
  query: string | null
  terminalTabId: string
  structuredWorktreeId?: string
}): NativeChatMentionFiles {
  const { query, terminalTabId, structuredWorktreeId } = args
  const enabled = query !== null
  // Closed is the common state, so the tab scan only runs while a token is open.
  const worktreeId = useAppStore((state) =>
    enabled
      ? (structuredWorktreeId ?? findTerminalTabWorktreeId(state.tabsByWorktree, terminalTabId))
      : null
  )
  const worktreePath = useKnownWorktreeById(worktreeId)?.path ?? null
  const history = useQuickOpenHistory(worktreeId, worktreePath)
  const list = useRuntimeFileListForWorktree({
    enabled,
    worktreeId,
    query: query ?? '',
    recentPaths: history
  })
  const failed = list.loadError !== null

  return useMemo(() => {
    if (query === null) {
      return { files: NO_FILES, loading: list.loading, failed }
    }
    const files = rankQuickOpenFilesWithHistory(query, list.files, history)
      .slice(0, MENTION_FILE_LIMIT)
      .map((item) => item.path)
    return {
      files: [...mentionFolders(query, list.files), ...files].slice(0, MENTION_FILE_LIMIT),
      loading: list.loading,
      failed
    }
  }, [failed, history, list.files, list.loading, query])
}

const MENTION_FOLDER_LIMIT = 4

/**
 * The folders a query names, as `path/`: Claude reads a mentioned folder as its listing. Only for
 * a typed query, so a bare `@` still opens on the recent files; best is a folder whose own name
 * starts with the query, then the shallowest.
 */
export function mentionFolders(query: string, files: readonly string[]): string[] {
  const needle = query.toLowerCase().replace(/\/$/, '')
  if (!needle) {
    return []
  }
  const folders = new Map<string, number>()
  for (const file of files) {
    let end = file.lastIndexOf('/')
    while (end > 0) {
      const folder = file.slice(0, end)
      if (folders.has(folder)) {
        break
      }
      const lower = folder.toLowerCase()
      const name = lower.slice(lower.lastIndexOf('/') + 1)
      const rank = name.startsWith(needle) ? 0 : lower.includes(needle) ? 1 : -1
      folders.set(folder, rank)
      end = folder.lastIndexOf('/')
    }
  }
  return [...folders]
    .filter(([, rank]) => rank >= 0)
    .sort(
      ([a, rankA], [b, rankB]) =>
        rankA - rankB || a.split('/').length - b.split('/').length || a.localeCompare(b)
    )
    .slice(0, MENTION_FOLDER_LIMIT)
    .map(([folder]) => `${folder}/`)
}
