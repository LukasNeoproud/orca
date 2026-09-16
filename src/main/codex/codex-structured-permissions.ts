import type { AgentSessionOptionChoice } from '../../shared/agent-session-wire'
import {
  isCodexAppServerRequestError,
  type CodexAppServerConnection
} from './codex-app-server-connection'

const PRESETS = [
  {
    value: 'read-only',
    label: 'Read only',
    description: 'Read files. Commands need approval for edits or network access.',
    sandboxMode: 'read-only',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user'
  },
  {
    value: 'workspace-write',
    label: 'Workspace',
    description:
      'Edit workspace files. Commands need approval for access outside it or to the network.',
    sandboxMode: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user'
  },
  {
    value: 'auto-review',
    label: 'Auto review',
    description:
      'Edit workspace files. Codex automatically reviews requests for access outside the sandbox.',
    sandboxMode: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review'
  },
  {
    value: 'full-access',
    label: 'Full access',
    description:
      'Run commands with unrestricted file and network access, without asking for approval.',
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
    approvalsReviewer: 'user'
  }
] as const

const unsupportedRequirements = new WeakSet<object>()

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function allowed(requirements: Record<string, unknown>, key: string, value: string): boolean {
  const restriction = requirements[key]
  return restriction == null || (Array.isArray(restriction) && restriction.includes(value))
}

export async function readCodexPermissionChoices(
  connection: Pick<CodexAppServerConnection, 'request'>,
  timeoutMs?: number
): Promise<AgentSessionOptionChoice[]> {
  if (unsupportedRequirements.has(connection)) {
    return []
  }
  let response: Record<string, unknown> | null
  try {
    response = record(await connection.request('configRequirements/read', {}, { timeoutMs }))
  } catch (error) {
    if (isCodexAppServerRequestError(error) && error.code === -32601) {
      unsupportedRequirements.add(connection)
    }
    return []
  }
  if (!response || !Object.hasOwn(response, 'requirements')) {
    return []
  }
  const requirements = response.requirements === null ? {} : record(response.requirements)
  // Named managed profiles cannot be faithfully replaced with a legacy sandbox preset.
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

export function codexPermissionOverrides(value: string, cwd: string | undefined) {
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
      value === 'full-access'
        ? { type: 'dangerFullAccess' }
        : value === 'read-only'
          ? { type: 'readOnly', networkAccess: false }
          : {
              type: 'workspaceWrite',
              writableRoots: [cwd!],
              networkAccess: false,
              excludeTmpdirEnvVar: false,
              excludeSlashTmp: false
            }
  }
}

/** Only name a preset when the provider's effective policy matches it. */
export function readCodexPermissionsMode(
  response: Record<string, unknown>,
  cwd: string | undefined
): string | undefined {
  const sandbox = record(response.sandbox)
  const profile = record(response.activePermissionProfile)
  if (
    !sandbox ||
    (profile &&
      ![':read-only', ':workspace', ':danger-full-access'].includes(String(profile.id))) ||
    (response.approvalsReviewer != null &&
      !['user', 'auto_review'].includes(String(response.approvalsReviewer)))
  ) {
    return undefined
  }
  if (
    sandbox.type === 'dangerFullAccess' &&
    response.approvalPolicy === 'never' &&
    response.approvalsReviewer !== 'auto_review'
  ) {
    return 'full-access'
  }
  if (response.approvalPolicy !== 'on-request' || sandbox.networkAccess === true) {
    return undefined
  }
  if (
    sandbox.type === 'readOnly' &&
    sandbox.access == null &&
    response.approvalsReviewer !== 'auto_review'
  ) {
    return 'read-only'
  }
  if (
    sandbox.type === 'workspaceWrite' &&
    sandbox.readOnlyAccess == null &&
    !sandbox.excludeTmpdirEnvVar &&
    !sandbox.excludeSlashTmp &&
    Array.isArray(sandbox.writableRoots) &&
    sandbox.writableRoots.every((root) => root === cwd)
  ) {
    return response.approvalsReviewer === 'auto_review' ? 'auto-review' : 'workspace-write'
  }
  return undefined
}

/** Summarize an authoritative policy that does not exactly match a settable preset. */
export function readCodexCustomPermissionsDescription(
  response: Record<string, unknown>,
  cwd: string | undefined
): string | undefined {
  if (readCodexPermissionsMode(response, cwd)) {
    return undefined
  }
  const sandbox = record(response.sandbox)
  if (!sandbox || response.approvalPolicy == null) {
    return undefined
  }
  const sandboxLabel =
    sandbox.type === 'readOnly'
      ? 'Read-only sandbox'
      : sandbox.type === 'workspaceWrite'
        ? 'Workspace sandbox'
        : sandbox.type === 'dangerFullAccess'
          ? 'Full access'
          : sandbox.type === 'externalSandbox'
            ? 'External sandbox'
            : 'Custom sandbox'
  const reviewLabel =
    response.approvalPolicy === 'never'
      ? 'No approvals'
      : typeof response.approvalPolicy === 'object'
        ? 'Granular approvals'
        : response.approvalsReviewer === 'auto_review'
          ? 'Auto review'
          : response.approvalsReviewer === 'user'
            ? 'User approval'
            : 'Custom approvals'
  return `${sandboxLabel} · ${reviewLabel}`
}
