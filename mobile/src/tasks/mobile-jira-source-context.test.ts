import { describe, expect, it } from 'vitest'
import { buildJiraWorkspaceSource } from '../../../src/shared/new-workspace/workspace-source'
import { isWorkspaceLinkedItemSourceContextMatch } from '../../../src/shared/workspace-linked-item-source-context'
import type { JiraIssue, JiraSite } from '../../../src/shared/jira-types'
import { buildMobileJiraSourceContext } from './mobile-jira-source-context'

const site = {
  id: 'site-1',
  siteUrl: 'https://acme.atlassian.net',
  email: 'ada@acme.test',
  displayName: 'Acme',
  accountId: 'ada'
} as JiraSite
const issue = {
  key: 'ORCA-7',
  title: 'Fix setup',
  url: 'https://acme.atlassian.net/browse/ORCA-7',
  project: { key: 'ORCA' }
} as JiraIssue

describe('buildMobileJiraSourceContext', () => {
  it('binds the selected account and issue to the workspace source', () => {
    const context = buildMobileJiraSourceContext({
      projectId: 'project-1',
      hostId: 'ssh:server-1',
      repoId: 'repo-1',
      site,
      issue
    })
    expect(context).toMatchObject({
      provider: 'jira',
      projectId: 'project-1',
      hostId: 'local',
      repoId: 'repo-1',
      providerIdentity: { provider: 'jira', siteId: 'site-1', projectKey: 'ORCA' }
    })
    expect(isWorkspaceLinkedItemSourceContextMatch(buildJiraWorkspaceSource(issue), context)).toBe(
      true
    )
  })
})
