import type { JiraIssue, JiraSite } from '../../../src/shared/jira-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../src/shared/task-source-context'

export function buildMobileJiraSourceContext(args: {
  projectId: string
  hostId: string | null | undefined
  repoId: string
  site: JiraSite
  issue: JiraIssue
}): TaskSourceContext | null {
  return normalizeTaskSourceContext({
    provider: 'jira',
    projectId: args.projectId,
    hostId: args.hostId?.startsWith('ssh:') ? 'local' : args.hostId,
    repoId: args.repoId,
    providerIdentity: {
      provider: 'jira',
      siteId: args.site.id,
      siteUrl: args.site.siteUrl,
      projectKey: args.issue.project.key
    },
    accountLabel: args.site.email || args.site.displayName
  })
}
