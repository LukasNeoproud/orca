import { expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { getProjectHostSetupProjectionFromState } from './project-host-setup-selector'

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

it('keeps host-published catalog links for clients that ignore the optional repo field', () => {
  const repos = [
    repo('source', { executionHostId: 'ssh:source' }),
    repo('destination', { hostLocalProjectId: 'repo:source' })
  ]
  const published = projectHostSetupProjectionFromRepos(repos)
  const legacyRepos = repos.map(({ hostLocalProjectId: _ignored, ...entry }) => entry)
  const received = getProjectHostSetupProjectionFromState({
    repos: legacyRepos,
    projects: published.projects,
    projectHostSetups: published.setups
  })
  expect(received.projects.map((project) => project.id)).toEqual(['repo:source'])
  expect(received.setups.map((setup) => setup.projectId)).toEqual(['repo:source', 'repo:source'])
})
