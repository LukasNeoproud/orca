import type {
  RepoHookSettings,
  SetupAgentStartupPolicy
} from '../../../src/shared/orca-yaml-hook-types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'

export async function persistNewWorkspaceSetupPolicy(args: {
  client: RpcClient
  repoId: string
  policy: SetupAgentStartupPolicy
}): Promise<void> {
  const listResponse = await args.client.sendRequest('repo.list')
  if (!listResponse.ok) {
    throw new Error(listResponse.error.message)
  }
  const repos = (
    (listResponse as RpcSuccess).result as {
      repos: { id: string; hookSettings?: RepoHookSettings }[]
    }
  ).repos
  const repo = repos.find((item) => item.id === args.repoId)
  if (!repo) {
    throw new Error('Project is no longer available.')
  }
  if ((repo.hookSettings?.setupAgentStartupPolicy ?? 'start-immediately') === args.policy) {
    return
  }
  const hookSettings: RepoHookSettings = {
    mode: 'auto',
    setupRunPolicy: 'run-by-default',
    ...repo.hookSettings,
    scripts: {
      setup: '',
      archive: '',
      ...repo.hookSettings?.scripts
    },
    setupAgentStartupPolicy: args.policy
  }
  const response = await args.client.sendRequest('repo.update', {
    repo: `id:${args.repoId}`,
    updates: { hookSettings }
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const updated = (
    (response as RpcSuccess).result as {
      repo?: { hookSettings?: RepoHookSettings }
    }
  ).repo
  if (updated?.hookSettings?.setupAgentStartupPolicy !== args.policy) {
    throw new Error('The host did not save the setup startup behavior.')
  }
}
