import { create } from 'zustand'
import type { GitLineHistoryResult, GitLineRange } from '../../../../shared/git-line-history'
import type { GitAnnotateFileContext } from './git-annotate-file-context'

/** The history of a selected block, shown in the Source Control commit list in place of the log. */
export type GitLineHistoryView = {
  /** The file the block belongs to, kept to ask its host again on refresh. */
  context: GitAnnotateFileContext
  range: GitLineRange
  requestId: number
  state:
    | { status: 'loading' }
    | { status: 'ready'; result: GitLineHistoryResult }
    | { status: 'error'; error: string }
}

export type GitGraphCommitFocus = { commitId: string; requestId: number }

type GitAnnotateState = {
  /** Editor models with annotations on, by model URI; kept for the session only. */
  annotatedModels: Record<string, true>
  /** Hosts already asked whether they know the annotate queries, by host key. */
  hostSupport: Record<string, 'supported' | 'unsupported'>
  lineHistoryByWorktree: Record<string, GitLineHistoryView>
  graphFocusByWorktree: Record<string, GitGraphCommitFocus>
  setAnnotated: (modelUri: string, annotated: boolean) => void
  setHostSupport: (hostKey: string, support: 'supported' | 'unsupported') => void
  setLineHistory: (worktreeId: string, view: GitLineHistoryView | null) => void
  focusGraphCommit: (worktreeId: string, commitId: string) => void
}

let nextRequestId = 0

export function nextGitAnnotateRequestId(): number {
  nextRequestId += 1
  return nextRequestId
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

// Why its own store: annotations are a mode of an open editor, with no persistence or session sync.
export const useGitAnnotateStore = create<GitAnnotateState>((set) => ({
  annotatedModels: {},
  hostSupport: {},
  lineHistoryByWorktree: {},
  graphFocusByWorktree: {},
  setAnnotated: (modelUri, annotated) =>
    set((state) => {
      if (Boolean(state.annotatedModels[modelUri]) === annotated) {
        return state
      }
      return {
        annotatedModels: annotated
          ? { ...state.annotatedModels, [modelUri]: true }
          : withoutKey(state.annotatedModels, modelUri)
      }
    }),
  setHostSupport: (hostKey, support) =>
    set((state) =>
      state.hostSupport[hostKey] === support
        ? state
        : { hostSupport: { ...state.hostSupport, [hostKey]: support } }
    ),
  setLineHistory: (worktreeId, view) =>
    set((state) => ({
      lineHistoryByWorktree: view
        ? { ...state.lineHistoryByWorktree, [worktreeId]: view }
        : withoutKey(state.lineHistoryByWorktree, worktreeId)
    })),
  focusGraphCommit: (worktreeId, commitId) =>
    set((state) => ({
      graphFocusByWorktree: {
        ...state.graphFocusByWorktree,
        [worktreeId]: { commitId, requestId: nextGitAnnotateRequestId() }
      }
    }))
}))
