import type { Repo as SharedRepo } from '../../../src/shared/repo-types'
import type { RpcClient } from '../transport/rpc-client'
import type { SetupHookTrust } from '../tasks/setup-hook-trust'
import type { WorktreeCheckoutWarning } from '../../../src/shared/worktree/checkout-warning'
import { repoColor } from '../worktree/repo-color'
import type { Worktree as MobileWorktree } from '../worktree/workspace-list-types'

export type MobileWorkspaceRepo = Pick<SharedRepo, 'id' | 'displayName' | 'path'> &
  Partial<
    Pick<
      SharedRepo,
      | 'badgeColor'
      | 'connectionId'
      | 'executionHostId'
      | 'kind'
      | 'hookSettings'
      | 'upstream'
      | 'repoIcon'
      | 'gitRemoteIdentity'
      | 'hostLocalProjectId'
      | 'worktreeBasePath'
      | 'worktreeBaseRef'
      | 'simplifiedWorktreeLayout'
      | 'simplifiedWorktreeLocation'
    >
  >

export type NewWorktreeModalProps = {
  visible: boolean
  client: RpcClient | null
  hostId?: string
  existingWorktreePaths?: readonly string[]
  existingWorktrees?: readonly ({ repoId: string; branch: string } & Partial<
    Pick<MobileWorktree, 'worktreeId' | 'displayName' | 'hostId' | 'isArchived' | 'isMainWorktree'>
  >)[]
  openExternalUrl: (url: string) => void
  onCreated: (
    worktreeId: string,
    name: string,
    warning?: string,
    checkoutWarning?: WorktreeCheckoutWarning
  ) => void
  onPairHost?: () => void
  onClose: () => void
}

export type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'

export type SetupHookDetails = {
  repoId: string
  command: string | null
  source: string | null
  trust: SetupHookTrust | null
  runPolicy: SetupRunPolicy
}

export function getMobileWorkspaceRepoBadgeColor(repo: MobileWorkspaceRepo | null): string {
  return repo?.badgeColor || repoColor(repo?.displayName ?? 'repository')
}
