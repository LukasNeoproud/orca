import type { AgentSessionPermissionsOption } from './agent-session-permissions-option'
import type { SessionOptionDescriptor } from './native-chat-session-options'

/** The host's permission picker, with a pick that is sent but not yet reported back. */
export type StructuredPermissionsState = AgentSessionPermissionsOption & { dispatched?: boolean }

/** A pick shows at once; the next options read replaces it with what the provider reports. */
export function dispatchedStructuredPermissions(
  permissions: StructuredPermissionsState,
  value: string
): StructuredPermissionsState {
  return { ...permissions, current: value, dispatched: true }
}

/** The picker row for a chat whose host offers permission postures. */
export function structuredPermissionsDescriptor(
  permissions: StructuredPermissionsState | undefined
): SessionOptionDescriptor | null {
  if (!permissions || permissions.choices.length === 0) {
    return null
  }
  return {
    id: permissions.optionId,
    label: 'Permissions',
    category: 'mode',
    kind: {
      type: 'select',
      ...(permissions.current ? { currentValue: permissions.current } : {}),
      choices: permissions.choices
    },
    valueSource: permissions.dispatched
      ? 'dispatched'
      : permissions.current
        ? 'reported'
        : 'unknown',
    transport: 'agent-session',
    settable: true
  }
}
