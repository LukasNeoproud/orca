import type { AgentSessionPermissionsOption } from '../../shared/agent-session-permissions-option'
import type { ClaudeSession } from './claude-structured-session-state'

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
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Run everything without asking.'
  }
] as const

/**
 * The chat's permission picker. Bypass is offered only while the chat runs it: Agent Permissions
 * grants it at launch, and the CLI cannot be switched back into it once left.
 */
export function claudeStructuredPermissions(
  session: Pick<ClaudeSession, 'options' | 'launchedPermissions'>
): AgentSessionPermissionsOption {
  const current = session.options.get('permissionMode') ?? session.launchedPermissions?.mode
  return {
    optionId: 'permissionMode',
    ...(current ? { current } : {}),
    choices: CHOICES.filter(
      (choice) => choice.value !== 'bypassPermissions' || current === 'bypassPermissions'
    ).map((choice) => ({ ...choice }))
  }
}
