import type { AgentSessionLaunchArgs } from '../../shared/agent-session-record'
import { removeAgentArgOption } from '../../shared/agent-session-option-agent-args'
import {
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../../shared/tui-agent-startup-shell'
import { codexPermissionOverrides } from './codex-structured-permissions'
import { resolveCodexStructuredAppServerArgs } from './codex-structured-app-server-args'

const PERMISSION_FLAGS = ['-s', '--sandbox', '-a', '--ask-for-approval', '--add-dir']
const PERMISSION_SWITCHES = new Set([
  '--dangerously-bypass-approvals-and-sandbox',
  '--yolo',
  '--full-auto',
  '--approve-for-me'
])
const PERMISSION_CONFIG = new Set([
  'sandbox_mode',
  'approval_policy',
  'approvals_reviewer',
  'sandbox_workspace_write'
])

type Options = Readonly<Record<string, string>> | undefined

function configKey(value: string): string {
  return value.slice(0, value.indexOf('=')).trim().replaceAll('"', '').replaceAll("'", '')
}

function configArg(tokens: readonly string[], index: number) {
  const token = tokens[index]
  const separate = token === '-c' || token === '--config'
  const value = separate ? tokens[index + 1] : token.match(/^(?:-c=?|--config=)(.+)$/)?.[1]
  return { separate, key: value?.includes('=') ? configKey(value) : undefined }
}

function assertMappablePermissions(tokens: readonly string[], options: Options): void {
  if (options?.permissions === undefined) {
    return
  }
  const terminator = tokens.indexOf('--')
  const prefix = terminator === -1 ? tokens : tokens.slice(0, terminator)
  if (
    removeAgentArgOption(prefix, [
      '-p',
      '--profile',
      '--permissions',
      '--permission-profile',
      '-C',
      '--cd'
    ]).length !== prefix.length ||
    prefix.some((_, index) =>
      ['permissions', 'default_permissions', 'profiles'].includes(
        configArg(prefix, index).key?.split('.')[0] ?? ''
      )
    )
  ) {
    throw cannotApply(
      'custom permission profiles or working-directory overrides cannot be reproduced'
    )
  }
}

function removeControlledArgs(tokens: readonly string[], options: Options): string[] {
  const terminator = tokens.indexOf('--')
  const prefix = terminator === -1 ? tokens : tokens.slice(0, terminator)
  const suffix = terminator === -1 ? [] : tokens.slice(terminator)
  const filtered = options?.permissions
    ? removeAgentArgOption(prefix, PERMISSION_FLAGS).filter(
        (token) => !PERMISSION_SWITCHES.has(token)
      )
    : prefix
  const result: string[] = []
  for (let index = 0; index < filtered.length; index += 1) {
    const token = filtered[index]
    const { separate, key } = configArg(filtered, index)
    const controlled =
      key &&
      ((options?.serviceTier !== undefined && key === 'service_tier') ||
        (options?.permissions !== undefined && PERMISSION_CONFIG.has(key.split('.')[0])))
    if (controlled) {
      if (separate) {
        index += 1
      }
    } else {
      result.push(token)
    }
  }
  return [...result, ...suffix]
}

function cannotApply(detail: string): Error {
  return new Error(`Cannot preserve Codex chat options in the agent terminal: ${detail}.`)
}

/** Keep handoff choices in argv, where the execution host already owns startup quoting. */
export function resolveCodexStructuredTuiLaunchArgs(input: {
  launchArgs?: AgentSessionLaunchArgs
  options?: Options
  cwd: string
  commandOverride?: string
  shell: AgentStartupShell
}): AgentSessionLaunchArgs | undefined {
  const { launchArgs, options } = input
  if (options?.serviceTier === undefined && options?.permissions === undefined) {
    return launchArgs
  }
  if (!launchArgs) {
    throw cannotApply('this session has no pinned CLI arguments')
  }
  assertMappablePermissions(launchArgs, options)
  if (input.commandOverride) {
    const parsed = tokenizeStartupCommand(input.commandOverride, input.shell)
    if (!parsed.ok || parsed.spans.some((span) => span.divergesFromShell)) {
      throw cannotApply('the custom Codex command cannot be parsed safely')
    }
    try {
      resolveCodexStructuredAppServerArgs(
        input.commandOverride.slice(parsed.spans[0]?.end ?? 0),
        input.shell
      )
    } catch {
      throw cannotApply('the custom Codex command contains unsupported arguments')
    }
    assertMappablePermissions(parsed.tokens, options)
    const stripped = removeControlledArgs(parsed.tokens, options)
    if (stripped.length !== parsed.tokens.length) {
      throw cannotApply('the custom Codex command overrides Fast mode or permissions')
    }
  }
  const additions: string[] = []
  if (options?.serviceTier !== undefined) {
    if (!['priority', 'default', 'flex', 'fast'].includes(options.serviceTier)) {
      throw cannotApply(`unknown service tier ${options.serviceTier}`)
    }
    const serviceTier = options.serviceTier === 'fast' ? 'priority' : options.serviceTier
    additions.push('-c', `service_tier=${JSON.stringify(serviceTier)}`)
  }
  if (options?.permissions !== undefined) {
    const policy = codexPermissionOverrides(options.permissions, input.cwd)
    const sandbox =
      policy.sandboxPolicy.type === 'dangerFullAccess'
        ? 'danger-full-access'
        : policy.sandboxPolicy.type === 'workspaceWrite'
          ? 'workspace-write'
          : 'read-only'
    additions.push(
      '--sandbox',
      sandbox,
      '--ask-for-approval',
      policy.approvalPolicy,
      '-c',
      `approvals_reviewer=${JSON.stringify(policy.approvalsReviewer)}`,
      '-c',
      'sandbox_workspace_write={writable_roots=[],network_access=false,exclude_tmpdir_env_var=false,exclude_slash_tmp=false}'
    )
  }
  const retained = removeControlledArgs(launchArgs, options)
  const terminator = retained.indexOf('--')
  return terminator === -1
    ? [...retained, ...additions]
    : [...retained.slice(0, terminator), ...additions, ...retained.slice(terminator)]
}
