import type {
  ExplicitWorktreeCreation,
  WorktreeCreationPreview
} from '../../../src/shared/worktree/explicit-creation'
import type { MobileComposerCreateSelection } from './mobile-composer-source-types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'

export type MobileWorktreeLocation = 'automatic' | 'orca-default' | 'inside' | 'custom'
export type MobileWorktreeLayout = 'nested' | 'flat'

export function buildMobileExplicitWorktreeCreation(args: {
  name: string
  branchNameOverride?: string
  selection: MobileComposerCreateSelection | null
  location: Exclude<MobileWorktreeLocation, 'automatic'>
  customRoot: string
  layout: MobileWorktreeLayout
}): ExplicitWorktreeCreation | null {
  const name = args.name.trim()
  if (!name || args.selection?.kind === 'work-item') {
    return null
  }
  const branch =
    args.selection?.kind === 'branch'
      ? args.selection.reuse
        ? { kind: 'local' as const, name: args.selection.localBranchName }
        : { kind: 'new' as const, name: args.selection.branchNameOverride || name }
      : args.selection?.kind === 'new-branch'
        ? { kind: 'new' as const, name: args.selection.branchName }
        : { kind: 'new' as const, name: args.branchNameOverride?.trim() || name }
  const root =
    args.location === 'inside'
      ? '.worktrees'
      : args.location === 'custom'
        ? args.customRoot.trim()
        : ''
  if (args.location === 'custom' && !root) {
    return null
  }
  return {
    branch,
    destination: {
      ...(root ? { root } : {}),
      relativeDirectory: args.layout === 'flat' ? name.replaceAll('/', '-') : name
    }
  }
}

export async function previewMobileExplicitWorktreeCreation(args: {
  client: RpcClient
  repoId: string
  name: string
  baseBranch?: string
  explicitCreation: ExplicitWorktreeCreation
}): Promise<WorktreeCreationPreview> {
  const response = await args.client.sendRequest('worktree.previewCreation', {
    repo: `id:${args.repoId}`,
    name: args.name,
    baseBranch: args.baseBranch,
    explicitCreation: args.explicitCreation
  })
  if (!response.ok) {
    if (
      response.error.code === 'method_not_found' ||
      /unknown method|method not found|not allowed/i.test(response.error.message)
    ) {
      throw new Error('Update Orca on the host to choose a worktree location.')
    }
    throw new Error(response.error.message)
  }
  return (response as RpcSuccess).result as WorktreeCreationPreview
}

export async function ignoreMobileWorktreeCreationLocally(args: {
  client: RpcClient
  repoId: string
  name: string
  baseBranch?: string
  explicitCreation: ExplicitWorktreeCreation
}): Promise<void> {
  const response = await args.client.sendRequest('worktree.ignoreCreationLocally', {
    repo: `id:${args.repoId}`,
    name: args.name,
    baseBranch: args.baseBranch,
    explicitCreation: args.explicitCreation
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}
