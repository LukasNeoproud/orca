import {
  CLAUDE_MCP_SERVER_STATUSES,
  type ClaudeMcpServerSummary,
  type ClaudePermissionRule,
  type ClaudePermissionRules,
  type ClaudeSessionControlReply,
  type ClaudeSessionControlRequest
} from '../../shared/claude-session-control'
import type { ClaudeControlSurface } from './claude-agent-sdk-control-requests'
import { claudeSessionUsage } from './claude-session-usage-reply'
import {
  editClaudePermissionRule,
  type ClaudeSettingsFileLocations
} from './claude-permission-rule-settings-file'

/** A side question runs a model call of its own, so it gets a turn's patience. */
const SIDE_QUESTION_TIMEOUT_MS = 180_000

export type ClaudeSessionControlConnection = Pick<ClaudeControlSurface, 'rawRequest'> &
  Partial<Pick<ClaudeControlSurface, 'initializationResult'>>

type LiveSession = {
  connection: ClaudeSessionControlConnection
  files: ClaudeSettingsFileLocations
}

const live = new Map<string, LiveSession>()

/** The session's current child; the returned unbind is a no-op once another child bound. */
export function bindClaudeSessionControls(
  sessionId: string,
  connection: ClaudeSessionControlConnection,
  files: ClaudeSettingsFileLocations,
  /** Released with it: the session's other per-child binding. */
  alsoUnbind: () => void = () => {}
): () => void {
  const session = { connection, files }
  live.set(sessionId, session)
  return () => {
    alsoUnbind()
    if (live.get(sessionId) === session) {
      live.delete(sessionId)
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a non-null, non-array object is checked on the line above.
      (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mcpServers(answer: unknown): ClaudeMcpServerSummary[] {
  const servers = record(answer)?.mcpServers
  return (Array.isArray(servers) ? servers : []).flatMap((value): ClaudeMcpServerSummary[] => {
    const server = record(value)
    const name = text(server?.name)
    const status = CLAUDE_MCP_SERVER_STATUSES.find((known) => known === server?.status)
    if (!server || !name || !status) {
      return []
    }
    const error = text(server.error)
    const scope = text(server.scope) ?? text(server.source)
    const transport = text(server.transport) ?? text(record(server.config)?.type)
    const tools = Array.isArray(server.tools)
      ? server.tools.flatMap((tool) => text(record(tool)?.name) ?? [])
      : null
    return [
      {
        name,
        status,
        ...(error ? { error } : {}),
        ...(scope ? { scope } : {}),
        ...(transport ? { transport } : {}),
        ...(tools ? { tools } : {})
      }
    ]
  })
}

const BEHAVIORS = ['allow', 'deny', 'ask'] as const
const EDITABILITY = ['persistent', 'session', 'readonly'] as const

function permissionRules(answer: unknown): ClaudePermissionRules {
  const state = record(record(answer)?.state)
  const rules = Array.isArray(state?.rules) ? state.rules : []
  const directories = Array.isArray(state?.workspaceDirectories) ? state.workspaceDirectories : []
  return {
    rules: rules.flatMap((value): ClaudePermissionRule[] => {
      const entry = record(value)
      const behavior = BEHAVIORS.find((known) => known === entry?.behavior)
      const rule = text(entry?.rule)
      if (!entry || !behavior || !rule) {
        return []
      }
      const described = record(entry.description)
      const description = described
        ? [described.prefix, described.emphasis, described.suffix]
            .filter((part) => typeof part === 'string')
            .join('')
        : ''
      return [
        {
          behavior,
          rule,
          source: text(entry.source) ?? 'session',
          editability: EDITABILITY.find((known) => known === entry.editability) ?? 'readonly',
          ...(description ? { description } : {})
        }
      ]
    }),
    workspaceDirectories: directories.flatMap((value) => {
      const directory = record(value)
      const path = text(directory?.path)
      return path ? [{ path, source: text(directory?.source) ?? 'session' }] : []
    }),
    originalCwd: text(state?.originalCwd) ?? '',
    managedOnly: state?.managedOnly === true
  }
}

/**
 * Runs one out-of-turn request against the session's running CLI. Throws when no child runs:
 * these read or change live state, which a chat at rest does not have.
 */
export async function runClaudeSessionControl<K extends ClaudeSessionControlRequest['kind']>(
  sessionId: string,
  request: Extract<ClaudeSessionControlRequest, { kind: K }>
): Promise<ClaudeSessionControlReply[K]>
export async function runClaudeSessionControl(
  sessionId: string,
  request: ClaudeSessionControlRequest
): Promise<ClaudeSessionControlReply[ClaudeSessionControlRequest['kind']]> {
  const session = live.get(sessionId)
  const send = session?.connection.rawRequest
  if (!session || !send) {
    throw new Error('claude_session_not_running')
  }
  switch (request.kind) {
    case 'mcp-status':
      return { servers: mcpServers(await send({ subtype: 'mcp_status' })) }
    case 'usage':
      // Without the transcript scan: only the session totals and the plan's limits are shown.
      return claudeSessionUsage(await send({ subtype: 'get_usage', skip_behaviors: true }))
    case 'agents': {
      // The initialize answer the session already holds; nothing is asked of the CLI again.
      const agents = record(await session.connection.initializationResult?.())?.agents
      return {
        agents: (Array.isArray(agents) ? agents : []).flatMap((value) => {
          const name = text(record(value)?.name)
          const description = text(record(value)?.description)
          return name ? [{ name, ...(description ? { description } : {}) }] : []
        })
      }
    }
    case 'mcp-reconnect':
      // A stdio server can take its whole startup to answer.
      await send({ subtype: 'mcp_reconnect', serverName: request.server }, { timeoutMs: 60_000 })
      return { ok: true }
    case 'mcp-toggle':
      await send({ subtype: 'mcp_toggle', serverName: request.server, enabled: request.enabled })
      return { ok: true }
    case 'mcp-authenticate': {
      const answer = record(await send({ subtype: 'mcp_authenticate', serverName: request.server }))
      const authUrl = text(answer?.authUrl)
      return authUrl && /^https?:\/\//i.test(authUrl) ? { authUrl } : {}
    }
    case 'mcp-clear-auth':
      await send({ subtype: 'mcp_clear_auth', serverName: request.server })
      return { ok: true }
    case 'permission-rules':
      return permissionRules(await send({ subtype: 'list_permission_rules' }))
    case 'permission-rule-edit':
      return { changed: await editClaudePermissionRule(session.files, request) }
    case 'side-question': {
      const answer = record(
        await send(
          { subtype: 'side_question', question: request.question },
          { timeoutMs: SIDE_QUESTION_TIMEOUT_MS }
        )
      )
      return { response: text(answer?.response) ?? null }
    }
    case 'background-tool': {
      const answer = await send({ subtype: 'background_tasks', tool_use_id: request.toolUseId })
      return { backgrounded: record(answer)?.backgrounded !== false }
    }
  }
}
