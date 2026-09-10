export type BranchManagementAction = 'switch' | 'create' | 'rename'
export type BranchManagementPreview = {
  path: string
  current: string | null
  head: string
  branches: string[]
  worktrees: { path: string; branch: string | null }[]
  blockers: string[]
  sessions: string[]
}
