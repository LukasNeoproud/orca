import type { RpcClient } from '../transport/rpc-client'

export type MobilePreservedBranch = { branchName?: string; head?: string }

export async function forceDeleteMobilePreservedBranch(args: {
  client: RpcClient
  worktreeId: string
  branch: MobilePreservedBranch
}): Promise<void> {
  const { branch } = args
  if (!branch.branchName || !branch.head) {
    throw new Error('The branch name and confirmed head are required to delete it.')
  }
  const response = await args.client.sendRequest('worktree.forceDeleteBranch', {
    worktree: `id:${args.worktreeId}`,
    branchName: branch.branchName,
    expectedHead: branch.head
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}
