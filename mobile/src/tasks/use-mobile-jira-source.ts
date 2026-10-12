import { useEffect, useMemo, useState } from 'react'
import {
  getMatchingJiraSites,
  isResolvedJiraIssueMatch,
  parseJiraIssueUrl
} from '../../../src/shared/jira-issue-url'
import type { JiraConnectionStatus, JiraIssue, JiraSite } from '../../../src/shared/jira-types'
import {
  getJiraIssueSearchQuery,
  isSmartWorkspaceSourceQueryWithinLimit
} from '../../../src/shared/new-workspace/smart-workspace-source-results'
import {
  buildJiraIssueKeyJql,
  buildJiraTextMatchJql
} from '../../../src/shared/jira-search-input-jql'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'

const JIRA_UNAVAILABLE = 'Jira source is unavailable on this host. Update Orca to use Jira.'

async function requestJiraResult<T>(
  client: RpcClient,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await client.sendRequest(method, params)
  if (!response.ok) {
    if (response.error.code === 'method_not_found' || response.error.code === 'forbidden') {
      throw new Error(JIRA_UNAVAILABLE)
    }
    throw new Error(response.error.message)
  }
  return (response as RpcSuccess).result as T
}

function selectUrlSite(
  status: JiraConnectionStatus,
  parsed: NonNullable<ReturnType<typeof parseJiraIssueUrl>>
): JiraSite {
  const matches = getMatchingJiraSites(parsed, status.sites ?? [])
  const preferred = matches.find(
    (site) => site.id === status.selectedSiteId || site.id === status.activeSiteId
  )
  const site = preferred ?? (matches.length === 1 ? matches[0] : null)
  if (!site) {
    throw new Error(
      matches.length === 0
        ? 'This Jira site is not connected on the host.'
        : 'Select a Jira account on the host before using this URL.'
    )
  }
  return site
}

export function useMobileJiraSource(args: {
  client: RpcClient | null
  enabled: boolean
  mode: 'smart' | 'jira' | 'other'
  query: string
}) {
  const intent = useMemo(
    () =>
      args.enabled && (args.mode === 'smart' || args.mode === 'jira')
        ? parseJiraIssueUrl(args.query)
        : null,
    [args.enabled, args.mode, args.query]
  )
  const engaged = args.enabled && (args.mode === 'jira' || intent !== null)
  const [connection, setConnection] = useState<{
    client: RpcClient
    status: JiraConnectionStatus | null
    error: string
  } | null>(null)
  const [search, setSearch] = useState<{
    client: RpcClient
    key: string
    issues: JiraIssue[]
    error: string
    loading: boolean
  } | null>(null)

  useEffect(() => {
    if (!args.client || !engaged) {
      return
    }
    let stale = false
    const client = args.client
    void requestJiraResult<JiraConnectionStatus>(client, 'jira.readStatus')
      .then((status) => {
        if (!stale) {
          setConnection({ client, status, error: '' })
        }
      })
      .catch((cause) => {
        if (!stale) {
          setConnection({
            client,
            status: null,
            error: cause instanceof Error ? cause.message : JIRA_UNAVAILABLE
          })
        }
      })
    return () => {
      stale = true
    }
  }, [args.client, engaged])

  const activeConnection = connection?.client === args.client ? connection : null
  const key = `${args.mode}:${args.query}`
  useEffect(() => {
    const client = args.client
    const status = activeConnection?.status
    if (!client || !engaged || !status?.connected) {
      return
    }
    if (!intent && args.mode !== 'jira') {
      return
    }
    let stale = false
    setSearch({ client, key, issues: [], error: '', loading: true })
    const timer = setTimeout(() => {
      void (async (): Promise<JiraIssue[]> => {
        if (intent) {
          const site = selectUrlSite(status, intent)
          const issue = await requestJiraResult<JiraIssue>(client, 'jira.getIssue', {
            key: intent.issueKey,
            siteId: site.id
          })
          if (!isResolvedJiraIssueMatch(intent, site, issue)) {
            throw new Error('The Jira issue did not match the pasted URL.')
          }
          return [issue]
        }
        const searchQuery = getJiraIssueSearchQuery(args.query)
        if (!searchQuery || !isSmartWorkspaceSourceQueryWithinLimit(args.query)) {
          return []
        }
        const jql = buildJiraIssueKeyJql(searchQuery) ?? buildJiraTextMatchJql(searchQuery)
        return requestJiraResult<JiraIssue[]>(client, 'jira.searchIssues', {
          jql,
          limit: 36,
          siteId: status.selectedSiteId || status.activeSiteId || 'all'
        })
      })()
        .then((issues) => {
          if (!stale) {
            setSearch({ client, key, issues, error: '', loading: false })
          }
        })
        .catch((cause) => {
          if (!stale) {
            setSearch({
              client,
              key,
              issues: [],
              error: cause instanceof Error ? cause.message : 'Jira search failed.',
              loading: false
            })
          }
        })
    }, 200)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [activeConnection, args.client, args.mode, args.query, engaged, intent, key])

  const activeSearch = search?.client === args.client && search.key === key ? search : null
  const status = activeConnection?.status
  return {
    intent: intent !== null,
    issue: intent ? (activeSearch?.issues[0] ?? null) : null,
    issues: !intent ? (activeSearch?.issues ?? []) : [],
    sites: status?.sites ?? [],
    loading:
      engaged &&
      (!activeConnection ||
        (status?.connected === true && (!activeSearch || activeSearch.loading))),
    error:
      activeConnection?.error ||
      (activeConnection && !status?.connected
        ? 'Connect Jira on this host to select an issue.'
        : '') ||
      activeSearch?.error ||
      ''
  }
}
