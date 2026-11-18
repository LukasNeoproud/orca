import {
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  type KeybindingActionId,
  type KeybindingOverrides
} from '../../shared/keybindings'

/** The action's bindings as menu text; "Unassigned" when it has none. */
export function appMenuShortcutLabel(
  actionId: KeybindingActionId,
  overrides: KeybindingOverrides | undefined
): string {
  return formatKeybindingList(
    getEffectiveKeybindingsForAction(actionId, process.platform, overrides),
    process.platform
  )
}

/** Like the label, but empty for an unbound action so the item shows no hint. */
export function appMenuShortcutHint(
  actionId: KeybindingActionId | undefined,
  overrides: KeybindingOverrides | undefined
): string {
  if (!actionId) {
    return ''
  }
  const bindings = getEffectiveKeybindingsForAction(actionId, process.platform, overrides)
  return bindings.length > 0 ? formatKeybindingList(bindings, process.platform) : ''
}
