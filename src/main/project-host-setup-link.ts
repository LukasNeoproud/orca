import { getRepoExecutionHostId, parseExecutionHostId } from '../shared/execution-host'
import { splitGitRemoteKey, matchGitRemoteKeyParts } from '../shared/git-remote-identity'
import { normalizeGitHubRemoteHost } from '../shared/git-remote-host-alias'
import { getProjectHostSetupForRepo } from '../shared/project-host-setup-lookup'
import {
  getProjectIdForProviderIdentity,
  getProjectProviderIdentity,
  hasProjectRemoteIdentity,
  sanitizeHostLocalProjectId
} from '../shared/project-host-setup-projection'
import type {
  ProjectHostSetupExistingFolderArgs,
  ProjectProviderIdentity,
  ProjectHostSetupResult
} from '../shared/project-types'
import type { Repo } from '../shared/repo-types'
import type { Store } from './persistence'

type LinkStore = Pick<Store, 'getProjects' | 'getProjectHostSetups' | 'updateRepo'>

export function linkRepoToProjectHostSetup(
  store: LinkStore,
  initialRepo: Repo,
  args: ProjectHostSetupExistingFolderArgs
): ProjectHostSetupResult {
  const hostId = getRepoExecutionHostId(initialRepo)
  if (!parseExecutionHostId(args.hostId) || hostId !== args.hostId) {
    throw new Error('Imported folder does not belong to the selected host.')
  }
  const setups = store.getProjectHostSetups()
  if (
    setups.some(
      (setup) =>
        setup.projectId === args.projectId &&
        setup.hostId === hostId &&
        setup.repoId &&
        setup.repoId !== initialRepo.id
    )
  ) {
    throw new Error('The selected project is already set up on this host.')
  }
  const updates: Partial<Repo> = {
    projectHostSetupMethod: args.setupMethod ?? 'imported-existing-folder'
  }
  if (getProjectHostSetupForRepo(setups, initialRepo).projectId !== args.projectId) {
    if (sanitizeHostLocalProjectId(args.projectId)) {
      if (
        hasProjectRemoteIdentity(initialRepo) ||
        (initialRepo.hostLocalProjectId && initialRepo.hostLocalProjectId !== args.projectId)
      ) {
        throw new Error('Imported folder does not match the selected project identity.')
      }
      updates.hostLocalProjectId = args.projectId
    } else {
      const project = store.getProjects().find((entry) => entry.id === args.projectId)
      const identity = project?.providerIdentity ?? args.projectProviderIdentity
      if (!identity || getProjectIdForProviderIdentity(identity) !== args.projectId) {
        throw new Error('Imported folder does not match the selected project identity.')
      }
      if (
        (hasProjectRemoteIdentity(initialRepo) &&
          (getProjectProviderIdentity(initialRepo) !== null ||
            !matchesProviderProjectRemote(initialRepo, identity))) ||
        (initialRepo.hostLocalProjectId && initialRepo.hostLocalProjectId !== args.projectId)
      ) {
        throw new Error('Imported folder does not match the selected project identity.')
      }
      updates.upstream = {
        owner: identity.owner,
        repo: identity.repo,
        ...(identity.host ? { host: identity.host } : {})
      }
    }
  }
  const previous = {
    upstream: initialRepo.upstream,
    hostLocalProjectId: initialRepo.hostLocalProjectId,
    projectHostSetupMethod: initialRepo.projectHostSetupMethod
  }
  try {
    const repo = store.updateRepo(initialRepo.id, updates, hostId)
    if (!repo) {
      throw new Error(`Project setup repo disappeared before it could be linked: ${initialRepo.id}`)
    }
    const setup = getProjectHostSetupForRepo(store.getProjectHostSetups(), repo)
    if (setup.projectId !== args.projectId) {
      throw new Error('Imported folder does not match the selected project identity.')
    }
    const project = store.getProjects().find((entry) => entry.id === setup.projectId)
    if (!project) {
      throw new Error(`Project setup was created without a project record: ${setup.projectId}`)
    }
    return { project, setup, repo }
  } catch (error) {
    store.updateRepo(initialRepo.id, previous, hostId)
    throw error
  }
}

function matchesProviderProjectRemote(repo: Repo, identity: ProjectProviderIdentity): boolean {
  const remote = repo.gitRemoteIdentity
  const actual = splitGitRemoteKey(remote?.canonicalKey, normalizeGitHubRemoteHost)
  const expected = splitGitRemoteKey(
    `${identity.host ?? 'github.com'}/${identity.owner}/${identity.repo}`,
    normalizeGitHubRemoteHost
  )
  if (!actual || !expected || matchGitRemoteKeyParts(actual, expected) !== true) {
    return false
  }
  if (!identity.host?.includes(':')) {
    return true
  }
  try {
    const url = new URL(remote!.remoteUrl)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.host.toLowerCase() === identity.host.toLowerCase()
    )
  } catch {
    return false
  }
}
