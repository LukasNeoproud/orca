import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { AgentSessionPermissionsOption } from '../../shared/agent-session-permissions-option'
import { record } from './claude-structured-model-catalog'
import type { ClaudeSession } from './claude-structured-session-state'

/** Every mode the SDK's `PermissionMode` names, in Claude Code's own cycle order. */
const CHOICES = [
  { value: 'default', label: 'Ask', description: 'Ask before editing files or running commands.' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Edit files without asking.' },
  { value: 'plan', label: 'Plan', description: 'Read and plan; change nothing.' },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Claude decides what is safe to run and asks only for risky actions.'
  },
  {
    value: 'dontAsk',
    label: "Don't ask",
    description: 'Run only what your permission rules allow; refuse the rest without asking.'
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Run everything without asking.'
  }
] as const satisfies readonly { value: PermissionMode; label: string; description: string }[]

export function isClaudePermissionMode(value: unknown): value is PermissionMode {
  return CHOICES.some((choice) => choice.value === value)
}

/** A system frame's `permissionMode` (init and status both carry it) as the session's report. */
export function observeClaudePermissionModeFrame(
  session: Pick<ClaudeSession, 'reportedPermissionMode'>,
  message: Record<string, unknown>
): void {
  if (message.type === 'system' && isClaudePermissionMode(message.permissionMode)) {
    session.reportedPermissionMode = message.permissionMode
  }
}

/** The initialize answer's mode, which no frame may have reported yet; undeclared by the SDK. */
export function observeClaudeInitializePermissionMode(
  session: Pick<ClaudeSession, 'reportedPermissionMode'>,
  initialization: unknown
): void {
  const mode = record(initialization)?.current_permission_mode
  if (session.reportedPermissionMode === undefined && isClaudePermissionMode(mode)) {
    session.reportedPermissionMode = mode
  }
}

/** Modes the effective settings (managed ones included) switch off; the CLI refuses both. */
export function observeClaudeSettingsPermissionModes(
  session: Pick<ClaudeSession, 'unavailablePermissionModes'>,
  settings: unknown
): void {
  const effective = record(record(settings)?.effective)
  if (!effective) {
    return
  }
  const unavailable = new Set(session.unavailablePermissionModes)
  if (effective.disableAutoMode === 'disable') {
    unavailable.add('auto')
  }
  if (record(effective.permissions)?.disableBypassPermissionsMode === 'disable') {
    unavailable.add('bypassPermissions')
  }
  session.unavailablePermissionModes = unavailable
}

/** "Cannot set permission mode to X: …" holds for the child's life, unlike a lost request. */
export function observeClaudePermissionModeRefusal(
  session: Pick<ClaudeSession, 'unavailablePermissionModes'>,
  mode: string,
  message: string
): void {
  if (isClaudePermissionMode(mode) && message.startsWith('Cannot set permission mode to')) {
    session.unavailablePermissionModes = new Set(session.unavailablePermissionModes).add(mode)
  }
}

/**
 * The chat's permission picker: the modes this Claude takes. Bypass needs the child launched with
 * `--dangerously-skip-permissions` (Agent Permissions), and such a child can re-enter it after
 * leaving; a launch without it is refused the switch.
 */
export function claudeStructuredPermissions(
  session: Pick<
    ClaudeSession,
    'options' | 'launchedPermissions' | 'reportedPermissionMode' | 'unavailablePermissionModes'
  >
): AgentSessionPermissionsOption {
  const current =
    session.reportedPermissionMode ??
    session.options.get('permissionMode') ??
    session.launchedPermissions?.mode
  const offered = (mode: PermissionMode): boolean =>
    !session.unavailablePermissionModes?.has(mode) &&
    (mode !== 'bypassPermissions' || session.launchedPermissions?.mode === 'bypassPermissions')
  return {
    optionId: 'permissionMode',
    ...(current ? { current } : {}),
    choices: CHOICES.filter((choice) => choice.value === current || offered(choice.value)).map(
      (choice) => ({ ...choice })
    )
  }
}

/**
 * The modes a chat may pick before its child runs. The pick is applied at the next start; bypass
 * is a launch setting (Agent Permissions), so it shows only where it is already the saved pick.
 */
export function claudeRestingPermissions(saved: string | undefined): AgentSessionPermissionsOption {
  const current = isClaudePermissionMode(saved) ? saved : undefined
  return {
    optionId: 'permissionMode',
    ...(current ? { current } : {}),
    choices: CHOICES.filter(
      (choice) => choice.value === current || choice.value !== 'bypassPermissions'
    ).map((choice) => ({ ...choice }))
  }
}
