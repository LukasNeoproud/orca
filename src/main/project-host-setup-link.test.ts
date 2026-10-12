import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../shared/repo-types'
import {
  getProjectIdentityKey,
  projectHostSetupProjectionFromRepos
} from '../shared/project-host-setup-projection'
import { hydrateRepo } from './persistence/tracking-repos/repo-hydration'
import { sanitizeRepoUpdatesForPersistence } from './persistence/tracking-repos/repo-sanitization'
import { linkRepoToProjectHostSetup } from './project-host-setup-link'
import { RuntimeProjectHostSetupController } from './runtime/runtime-project-host-setup-controller'

function repo(id: string, extra: Partial<Repo> = {}): Repo {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder',
    ...extra
  } as Repo
}
function fixture(initial: Repo[]) {
  let repos = initial.map((entry) => ({ ...entry }))
  const store = {
    getProjects: () => [...projectHostSetupProjectionFromRepos(repos).projects],
    getProjectHostSetups: () => [...projectHostSetupProjectionFromRepos(repos).setups],
    updateRepo: vi.fn((id: string, updates: Partial<Repo>) => {
      const found = repos.find((entry) => entry.id === id)
      if (!found) {
        return null
      }
      Object.assign(found, sanitizeRepoUpdatesForPersistence(updates))
      return hydrateRepo(found, new Map())
    }),
    removeProject: vi.fn((id: string) => {
      repos = repos.filter((entry) => entry.id !== id)
    })
  }
  return { store, repos: () => repos }
}
const args = {
  projectId: 'repo:source',
  hostId: 'local',
  path: '/tmp/destination',
  kind: 'folder'
} as const

describe('durable host-local project links', () => {
  it('round-trips the link and merges host setups after reload without a provider identity', () => {
    const { store, repos } = fixture([
      repo('source', { executionHostId: 'ssh:source' }),
      repo('destination')
    ])
    const result = linkRepoToProjectHostSetup(store, repos()[1], args)
    const reloaded = JSON.parse(JSON.stringify(repos())).map((entry: Repo) =>
      hydrateRepo(entry, new Map())
    )
    const projection = projectHostSetupProjectionFromRepos(reloaded)
    expect(projection.projects).toHaveLength(1)
    expect(projection.projects[0].sourceRepoIds).toEqual(['source', 'destination'])
    expect(projection.setups.map((setup) => setup.projectId)).toEqual([
      'repo:source',
      'repo:source'
    ])
    expect(result.repo.hostLocalProjectId).toBe('repo:source')
    expect(result.repo.upstream).toBeUndefined()
  })
  it('validates persisted links and keeps provider and generic Git identities authoritative', () => {
    for (const value of ['', 'repo:', 'repo:bad id', 'github:acme/app', 1]) {
      const input = repo('destination', { hostLocalProjectId: value as string })
      expect(hydrateRepo(input, new Map()).hostLocalProjectId).toBeUndefined()
      expect(getProjectIdentityKey(input)).toBe('repo:destination')
      expect(sanitizeRepoUpdatesForPersistence({ hostLocalProjectId: value as string })).toEqual({})
    }
    expect(
      getProjectIdentityKey(
        repo('destination', {
          hostLocalProjectId: 'repo:source',
          upstream: { owner: 'acme', repo: 'app' }
        })
      )
    ).toBe('github:acme/app')
    expect(
      getProjectIdentityKey(
        repo('destination', {
          hostLocalProjectId: 'repo:source',
          gitRemoteIdentity: {
            canonicalKey: 'gitlab.com/acme/app',
            remoteName: 'origin',
            remoteUrl: 'https://gitlab.com/acme/app.git'
          }
        })
      )
    ).toBe('git:gitlab.com/acme/app')
  })
  it('rejects wrong hosts, duplicate setups and conflicting remote identities before updates', () => {
    const { store, repos } = fixture([repo('source'), repo('destination')])
    expect(() => linkRepoToProjectHostSetup(store, repos()[1], args)).toThrow('already set up')
    expect(() =>
      linkRepoToProjectHostSetup(store, repos()[1], { ...args, hostId: 'ssh:elsewhere' })
    ).toThrow('selected host')
    expect(() =>
      linkRepoToProjectHostSetup(
        store,
        repo('third', { upstream: { owner: 'acme', repo: 'app' } }),
        { ...args, projectId: 'repo:remote-source' }
      )
    ).toThrow('selected project identity')
    expect(store.updateRepo).not.toHaveBeenCalled()
  })
  it('does not relabel an imported repository from another provider project', () => {
    const source = repo('source', {
      executionHostId: 'ssh:source',
      upstream: { owner: 'acme', repo: 'app' }
    })
    const selected = {
      ...args,
      projectId: 'github:acme/app',
      projectProviderIdentity: { provider: 'github', owner: 'acme', repo: 'app' } as const
    }
    for (const destination of [
      repo('destination', { upstream: { owner: 'other', repo: 'app' } }),
      repo('destination', {
        gitRemoteIdentity: {
          canonicalKey: 'gitlab.com/other/app',
          remoteName: 'origin',
          remoteUrl: 'https://gitlab.com/other/app.git'
        }
      }),
      repo('destination', { hostLocalProjectId: 'repo:other' })
    ]) {
      const { store, repos } = fixture([source, destination])
      expect(() => linkRepoToProjectHostSetup(store, repos()[1], selected)).toThrow(
        'selected project identity'
      )
      expect(store.updateRepo).not.toHaveBeenCalled()
      expect(repos()[1].upstream).toEqual(destination.upstream)
    }
  })
  it('links an unclassified imported folder to a GitHub project', () => {
    const { store, repos } = fixture([
      repo('source', {
        executionHostId: 'ssh:source',
        upstream: { owner: 'acme', repo: 'app' }
      }),
      repo('destination')
    ])
    const result = linkRepoToProjectHostSetup(store, repos()[1], {
      ...args,
      projectId: 'github:acme/app',
      projectProviderIdentity: { provider: 'github', owner: 'acme', repo: 'app' }
    })
    expect(result.setup.projectId).toBe('github:acme/app')
  })
  it('links a matching custom GitHub Enterprise remote without relabeling another remote', () => {
    const selected = {
      ...args,
      projectId: 'github:code.corp.example/acme/app',
      projectProviderIdentity: {
        provider: 'github',
        host: 'code.corp.example',
        owner: 'acme',
        repo: 'app'
      } as const
    }
    const source = repo('source', {
      executionHostId: 'ssh:source',
      upstream: { host: 'code.corp.example', owner: 'acme', repo: 'app' }
    })
    const remote = (canonicalKey: string, remoteUrl: string) =>
      repo('destination', {
        gitRemoteIdentity: { canonicalKey, remoteName: 'origin', remoteUrl }
      })
    const matching = fixture([
      source,
      remote('code.corp.example/acme/app', 'https://code.corp.example/acme/app.git')
    ])
    expect(
      linkRepoToProjectHostSetup(matching.store, matching.repos()[1], selected).setup.projectId
    ).toBe(selected.projectId)
    for (const destination of [
      remote('code.corp.example/other/app', 'https://code.corp.example/other/app.git'),
      remote('other.corp.example/acme/app', 'https://other.corp.example/acme/app.git')
    ]) {
      const { store, repos } = fixture([source, destination])
      expect(() => linkRepoToProjectHostSetup(store, repos()[1], selected)).toThrow(
        'selected project identity'
      )
      expect(store.updateRepo).not.toHaveBeenCalled()
    }
  })
  it('restores existing registration metadata if catalog projection fails', () => {
    const { store, repos } = fixture([repo('destination')])
    store.getProjects = () => []
    expect(() => linkRepoToProjectHostSetup(store, repos()[0], args)).toThrow(
      'without a project record'
    )
    expect(hydrateRepo(repos()[0], new Map()).hostLocalProjectId).toBeUndefined()
    expect(repos()[0].projectHostSetupMethod).toBeUndefined()
  })
  it('links a source known only to another runtime through the runtime controller', async () => {
    const { store, repos } = fixture([repo('destination')])
    const controller = new RuntimeProjectHostSetupController({
      getStore: () => store as never,
      listRepos: repos,
      addRepo: async () => repos()[0],
      cloneRepo: vi.fn(),
      invalidateResolvedWorktrees: vi.fn(),
      invalidateWorktreeScan: vi.fn(),
      notifyReposChanged: vi.fn(),
      countLiveTerminalsForRepo: () => 0
    })
    expect((await controller.setupExistingFolder(args)).project.id).toBe('repo:source')
  })
})
