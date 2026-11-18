import { ipcRenderer } from 'electron'
import type { GitBlameOptions, GitBlameResult } from '../../shared/git-blame'
import type { GitLineHistoryOptions, GitLineHistoryResult } from '../../shared/git-line-history'

type AnnotateWorktree = { worktreePath: string; connectionId?: string }

export type GitAnnotateApi = {
  blame: (args: AnnotateWorktree & GitBlameOptions) => Promise<GitBlameResult>
  lineHistory: (args: AnnotateWorktree & GitLineHistoryOptions) => Promise<GitLineHistoryResult>
}

export const gitAnnotateApi: GitAnnotateApi = {
  blame: (args) => ipcRenderer.invoke('git:blame', args),
  lineHistory: (args) => ipcRenderer.invoke('git:lineHistory', args)
}
