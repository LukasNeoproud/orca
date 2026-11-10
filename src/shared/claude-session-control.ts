// What a Claude chat asks its running CLI outside a turn: MCP servers, permission rules and a side
// question. Shared by the host handler and every client.

export const CLAUDE_MCP_SERVER_STATUSES = [
  'connected',
  'failed',
  'needs-auth',
  'pending',
  'disabled'
] as const
export type ClaudeMcpServerStatus = (typeof CLAUDE_MCP_SERVER_STATUSES)[number]

export type ClaudeMcpServerSummary = {
  name: string
  status: ClaudeMcpServerStatus
  error?: string
  /** Where the server is configured: user, project, local, plugin, claudeai… */
  scope?: string
  transport?: string
  /** Present once connected. */
  tools?: string[]
}

/** A subagent the session can hand work to. */
export type ClaudeSubagentSummary = { name: string; description?: string }

/** One plan limit as the CLI's /usage reports it. */
export type ClaudeUsageLimit = {
  /** The CLI's kind: `session`, `weekly_all`, `weekly_scoped`… */
  kind: string
  /** The model a scoped limit is for. */
  model?: string
  percent: number
  /** ISO time the window resets. */
  resetsAt?: string
  severity?: string
}

export type ClaudeSessionUsage = {
  /** What this session's API calls would have cost; null when the CLI reports none. */
  costUsd: number | null
  plan?: string
  limits: ClaudeUsageLimit[]
}

export type ClaudePermissionRuleBehavior = 'allow' | 'deny' | 'ask'

/** The settings files a rule can be saved to or removed from. */
export const CLAUDE_PERMISSION_RULE_FILES = [
  'localSettings',
  'projectSettings',
  'userSettings'
] as const
export type ClaudePermissionRuleFile = (typeof CLAUDE_PERMISSION_RULE_FILES)[number]

export function isClaudePermissionRuleFile(source: string): source is ClaudePermissionRuleFile {
  return CLAUDE_PERMISSION_RULE_FILES.some((file) => file === source)
}

export type ClaudePermissionRule = {
  behavior: ClaudePermissionRuleBehavior
  /** The CLI's source name: userSettings, projectSettings, localSettings, session, cliArg… */
  source: string
  rule: string
  /** The CLI's plain-language reading of the rule. */
  description?: string
  /** `persistent` rules live in a settings file, `session` ones last until the chat stops. */
  editability: 'persistent' | 'session' | 'readonly'
}

export type ClaudePermissionRules = {
  rules: ClaudePermissionRule[]
  workspaceDirectories: { path: string; source: string }[]
  originalCwd: string
  /** Managed settings allow policy rules only; other rules are listed but ignored. */
  managedOnly: boolean
}

export type ClaudeMcpAuthentication = {
  /** The sign-in page to open; absent when the server needed no user action. */
  authUrl?: string
}

export type ClaudeSideAnswer = {
  /** Null when the CLI had nothing to answer with. */
  response: string | null
}

export type ClaudeSessionControlRequest =
  | { kind: 'mcp-status' }
  | { kind: 'agents' }
  | { kind: 'usage' }
  | { kind: 'mcp-reconnect'; server: string }
  | { kind: 'mcp-toggle'; server: string; enabled: boolean }
  | { kind: 'mcp-authenticate'; server: string }
  | { kind: 'mcp-clear-auth'; server: string }
  | { kind: 'permission-rules' }
  | {
      kind: 'permission-rule-edit'
      action: 'add' | 'remove'
      file: ClaudePermissionRuleFile
      behavior: ClaudePermissionRuleBehavior
      rule: string
    }
  | { kind: 'side-question'; question: string }
  | { kind: 'background-tool'; toolUseId: string }

export type ClaudeSessionControlReply = {
  'mcp-status': { servers: ClaudeMcpServerSummary[] }
  agents: { agents: ClaudeSubagentSummary[] }
  usage: ClaudeSessionUsage
  'mcp-reconnect': { ok: true }
  'mcp-toggle': { ok: true }
  'mcp-authenticate': ClaudeMcpAuthentication
  'mcp-clear-auth': { ok: true }
  'permission-rules': ClaudePermissionRules
  'permission-rule-edit': { changed: boolean }
  'side-question': ClaudeSideAnswer
  'background-tool': { backgrounded: boolean }
}

export const MAX_CLAUDE_SIDE_QUESTION_LENGTH = 20_000

/** The side question a `/btw …` line asks; null for any other text. */
export function claudeSideQuestionOf(text: string): string | null {
  const match = /^\/btw(?:\s+([\s\S]*))?$/.exec(text.trim())
  const question = match?.[1]?.trim()
  return question ? question : null
}
