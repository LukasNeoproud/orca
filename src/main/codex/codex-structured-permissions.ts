import type { AgentSessionOptionChoice } from '../../shared/agent-session-wire'
import type { AgentSessionPermissionsOption } from '../../shared/agent-session-permissions-option'
import {
  isCodexAppServerRequestError,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import type { CodexStructuredPermissionPolicy } from './codex-structured-permission-policy'

/** The session option a chat's permission pick is stored under; expanded on every `turn/start`. */
export const CODEX_PERMISSIONS_OPTION = 'permissions'

const PRESETS = [
  {
    value: 'read-only',
    label: 'Read only',
    description: 'Read files. Edits and network access need approval.',
    sandboxMode: 'read-only',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user'
  },
  {
    value: 'workspace-write',
    label: 'Workspace',
    description: 'Edit workspace files. Access outside it or to the network needs approval.',
    sandboxMode: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user'
  },
  {
    value: 'auto-review',
    label: 'Auto review',
    description: 'Edit workspace files. Codex reviews requests to leave the sandbox itself.',
    sandboxMode: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review'
  },
  {
    value: 'full-access',
    label: 'Full access',
    description: 'Run commands with unrestricted file and network access, without asking.',
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
    approvalsReviewer: 'user'
  }
] as const

type CodexPermissionsSession = {
  connection: Pick<CodexAppServerConnection, 'request'>
  options: Map<string, string>
  workspaceCwd?: string
  launchedPermissions?: string
}

const choicesByConnection = new WeakMap<object, Promise<AgentSessionOptionChoice[]>>()
const settledChoices = new WeakMap<object, AgentSessionOptionChoice[]>()

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function allowed(requirements: Record<string, unknown>, key: string, value: string): boolean {
  const restriction = requirements[key]
  return restriction == null || (Array.isArray(restriction) && restriction.includes(value))
}

async function fetchCodexPermissionChoices(
  connection: Pick<CodexAppServerConnection, 'request'>,
  timeoutMs: number | undefined
): Promise<AgentSessionOptionChoice[]> {
  const response = record(await connection.request('configRequirements/read', {}, { timeoutMs }))
  if (!response || !Object.hasOwn(response, 'requirements')) {
    return []
  }
  const requirements = response.requirements === null ? {} : record(response.requirements)
  // A managed permission profile cannot be faithfully replaced with a sandbox preset.
  if (!requirements || requirements.allowedPermissionProfiles != null) {
    return []
  }
  return PRESETS.filter(
    (preset) =>
      allowed(requirements, 'allowedSandboxModes', preset.sandboxMode) &&
      allowed(requirements, 'allowedApprovalPolicies', preset.approvalPolicy) &&
      allowed(requirements, 'allowedApprovalsReviewers', preset.approvalsReviewer)
  ).map(({ value, label, description }) => ({ value, label, description }))
}

/** What the admin requirements let this Codex offer; an older Codex without them offers none. */
export function readCodexPermissionChoices(
  connection: Pick<CodexAppServerConnection, 'request'>,
  timeoutMs?: number
): Promise<AgentSessionOptionChoice[]> {
  let choices = choicesByConnection.get(connection)
  if (!choices) {
    choices = fetchCodexPermissionChoices(connection, timeoutMs).then(
      (fetched) => {
        settledChoices.set(connection, fetched)
        return fetched
      },
      (error: unknown) => {
        // Only a method this Codex lacks is final; anything else may answer on the next read.
        if (!isCodexAppServerRequestError(error) || error.code !== -32601) {
          choicesByConnection.delete(connection)
        }
        return []
      }
    )
    choicesByConnection.set(connection, choices)
  }
  return choices
}

/** The preset a thread opened under Agent Permissions answers to. */
export function codexLaunchedPermissions(
  policy: CodexStructuredPermissionPolicy | undefined
): string | undefined {
  return !policy ? undefined : policy.approvalPolicy === 'never' ? 'full-access' : 'workspace-write'
}

export function assertCodexPermissionsValue(value: string): void {
  if (!PRESETS.some((preset) => preset.value === value)) {
    throw new Error(`Unknown Codex permissions mode: ${value}`)
  }
}

/** `turn/start` fields for a preset; workspace sandboxes need the execution workspace path. */
export function codexPermissionOverrides(
  value: string,
  cwd: string | undefined
): Record<string, unknown> {
  const preset = PRESETS.find((entry) => entry.value === value)
  if (!preset) {
    throw new Error(`Unknown Codex permissions mode: ${value}`)
  }
  if (preset.sandboxMode === 'workspace-write' && !cwd) {
    throw new Error('Codex workspace permissions require the execution workspace path')
  }
  return {
    approvalPolicy: preset.approvalPolicy,
    approvalsReviewer: preset.approvalsReviewer,
    sandboxPolicy:
      preset.sandboxMode === 'danger-full-access'
        ? { type: 'dangerFullAccess' }
        : preset.sandboxMode === 'read-only'
          ? { type: 'readOnly', networkAccess: false }
          : {
              type: 'workspaceWrite',
              writableRoots: [cwd],
              networkAccess: false,
              excludeTmpdirEnvVar: false,
              excludeSlashTmp: false
            }
  }
}

/** A session's options as `turn/start` fields, with the permission pick expanded. */
export function codexTurnOptionParams(
  options: ReadonlyMap<string, string>,
  cwd: string | undefined
): Record<string, unknown> {
  const { [CODEX_PERMISSIONS_OPTION]: permissions, ...rest } = Object.fromEntries(options)
  return permissions ? { ...rest, ...codexPermissionOverrides(permissions, cwd) } : rest
}

/**
 * The chat's permission picker from what is already known; null until the session's prefetch
 * answers, or when this Codex offers no presets. Never waits: an options read must not block on it.
 */
export function codexStructuredPermissions(
  session: CodexPermissionsSession
): AgentSessionPermissionsOption | null {
  const choices = settledChoices.get(session.connection) ?? []
  if (choices.length === 0) {
    return null
  }
  const current = session.options.get(CODEX_PERMISSIONS_OPTION) ?? session.launchedPermissions
  return {
    optionId: CODEX_PERMISSIONS_OPTION,
    ...(current && choices.some((choice) => choice.value === current) ? { current } : {}),
    choices
  }
}
