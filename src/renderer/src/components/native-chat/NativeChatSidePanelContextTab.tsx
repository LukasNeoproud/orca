import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { translate } from '@/i18n/i18n'
import { requestClaudeSessionControl } from '@/runtime/claude-session-control-client'
import type {
  ClaudeMcpServerSummary,
  ClaudeSessionUsage,
  ClaudeUsageLimit
} from '../../../../shared/claude-session-control'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { formatContextTokenCount, summarizeContextUsage } from './native-chat-context-usage-summary'
import type { NativeChatSidePanelFeed } from './native-chat-side-panel-context'

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

type ClaudeFacts = { servers: ClaudeMcpServerSummary[] | null; usage: ClaudeSessionUsage | null }
const NO_FACTS: ClaudeFacts = { servers: null, usage: null }

/** What only the chat's running Claude can say: its MCP servers, and the session's cost and the
 *  plan's limits. Read again whenever `refreshKey` changes; a part it cannot answer stays out. */
function useClaudeFacts(
  target: RuntimeClientTarget,
  sessionId: string,
  enabled: boolean,
  refreshKey: number
): ClaudeFacts {
  const [facts, setFacts] = useState(NO_FACTS)
  useEffect(() => {
    if (!enabled) {
      return
    }
    let current = true
    const quiet = (): null => null
    void Promise.all([
      requestClaudeSessionControl(target, sessionId, { kind: 'mcp-status' }).catch(quiet),
      requestClaudeSessionControl(target, sessionId, { kind: 'usage' }).catch(quiet)
    ]).then(([mcp, usage]) => {
      if (current) {
        setFacts({ servers: mcp?.servers ?? null, usage })
      }
    })
    return () => {
      current = false
    }
  }, [enabled, refreshKey, sessionId, target])
  return enabled ? facts : NO_FACTS
}

function limitLabel(limit: ClaudeUsageLimit): string {
  if (limit.model) {
    return translate('components.native-chat.sidePanel.limitScoped', 'Weekly · {{value0}}', {
      value0: limit.model
    })
  }
  switch (limit.kind) {
    case 'weekly_all':
      return translate('components.native-chat.sidePanel.limitWeekly', 'Weekly limit')
    case 'session':
    case 'five_hour':
      return translate('components.native-chat.sidePanel.limitSession', '5-hour limit')
    default:
      return limit.kind.replaceAll('_', ' ')
  }
}

/** The Context tab: how full the context window is and with what, and what the session loaded. */
export function NativeChatSidePanelContextTab({
  feed,
  target,
  sessionId,
  asksClaude
}: {
  feed: NativeChatSidePanelFeed
  target: RuntimeClientTarget
  sessionId: string
  /** A Claude chat on a host that answers its control requests. */
  asksClaude: boolean
}): React.JSX.Element {
  const usage = feed.contextUsage ? summarizeContextUsage(feed.contextUsage) : null
  // The usage moves with every answer, so the session's cost and limits are read again with it.
  const { servers, usage: account } = useClaudeFacts(
    target,
    sessionId,
    asksClaude,
    feed.contextUsage?.usedTokens ?? 0
  )
  const skills = (feed.commands ?? []).filter((command) => command.kind === 'skill')
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 scrollbar-sleek">
      <Section
        title={translate('components.native-chat.sidePanel.contextWindow', 'Context window')}
      >
        {usage ? (
          <>
            <Progress value={Math.min(100, usage.percentage)} />
            <p className="mt-1.5 text-sm tabular-nums text-foreground">
              {translate(
                'components.native-chat.sidePanel.contextUsed',
                '{{used}} of {{window}} tokens · {{percent}}%',
                {
                  used: formatContextTokenCount(usage.usedTokens),
                  window: formatContextTokenCount(usage.windowTokens),
                  percent: String(usage.percentage)
                }
              )}
            </p>
            <ul className="mt-2 space-y-0.5">
              {usage.rows.map((row) => (
                <li key={row.name} className="flex items-baseline gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatContextTokenCount(row.tokens)} · {row.percentage}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate(
              'components.native-chat.sidePanel.noContextUsage',
              'Known once the agent has answered.'
            )}
          </p>
        )}
      </Section>
      {account && (account.costUsd !== null || account.limits.length > 0) ? (
        <Section title={translate('components.native-chat.sidePanel.usage', 'Usage')}>
          {account.costUsd !== null ? (
            <p className="text-sm tabular-nums text-foreground">
              {translate(
                'components.native-chat.sidePanel.sessionCost',
                'This session: ${{value0}}',
                {
                  value0: account.costUsd.toFixed(2)
                }
              )}
            </p>
          ) : null}
          <ul className="mt-1.5 space-y-1.5">
            {account.limits.map((limit) => (
              <li key={`${limit.kind}:${limit.model ?? ''}`} className="text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {limitLabel(limit)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(limit.percent)}%
                    {limit.resetsAt
                      ? ` · ${translate(
                          'components.native-chat.sidePanel.resets',
                          'resets {{value0}}',
                          {
                            value0: new Date(limit.resetsAt).toLocaleString(undefined, {
                              weekday: 'short',
                              hour: 'numeric',
                              minute: '2-digit'
                            })
                          }
                        )}`
                      : null}
                  </span>
                </div>
                <Progress value={Math.min(100, Math.max(0, limit.percent))} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {servers && servers.length > 0 ? (
        <Section
          title={translate('components.native-chat.claudeControls.mcp.title', 'MCP servers')}
        >
          <ul className="space-y-1">
            {servers.map((server) => (
              <li key={server.name} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">{server.name}</span>
                <Badge variant={server.status === 'failed' ? 'destructive' : 'outline'}>
                  {server.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {skills.length > 0 ? (
        <Section
          title={translate('components.native-chat.sidePanel.skills', 'Skills ({{value0}})', {
            value0: skills.length
          })}
        >
          <p className="break-words text-xs text-muted-foreground">
            {skills.map((skill) => skill.name).join(' · ')}
          </p>
        </Section>
      ) : null}
    </div>
  )
}
