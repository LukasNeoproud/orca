import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import {
  nativeChatSessionChoiceLabel,
  nativeChatSessionOptionDisabledReason,
  nativeChatSessionOptionLabel
} from './native-chat-session-option-labels'
import { sessionOptionDispatchUnconfirmed } from '../../../../shared/native-chat-session-options'
import { useNativeChatPickerFocusReturn } from './native-chat-picker-focus-return'
import { DescriptorMenuRows, PickerTrigger } from './NativeChatSessionOptionMenuParts'

/** The agent's permission mode as a list of choices; an action-only option stays in the options menu. */
export function isNativeChatPermissionModeOption(descriptor: SessionOptionDescriptor): boolean {
  return (
    (descriptor.id === 'permissionMode' || descriptor.id === 'permissions') &&
    descriptor.kind.type === 'select' &&
    !descriptor.action
  )
}

/**
 * The permission mode's own pill beside the model and effort: the current mode on the pill, every
 * mode the agent offers in its menu. Shift+Tab in the message box steps through the same list.
 */
export function NativeChatPermissionModePicker({
  descriptor,
  defaultOpen,
  disabled,
  pending,
  setValue,
  focusComposer
}: {
  descriptor: SessionOptionDescriptor
  defaultOpen: boolean
  disabled: boolean
  pending: boolean
  setValue: (value: SessionOptionValue) => void
  focusComposer?: () => void
}): React.JSX.Element | null {
  const focus = useNativeChatPickerFocusReturn(focusComposer)
  if (descriptor.kind.type !== 'select') {
    return null
  }
  const { choices, currentValue } = descriptor.kind
  const current = choices.find((choice) => choice.value === currentValue)
  const category = nativeChatSessionOptionLabel(descriptor)
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <PickerTrigger
        Trigger={DropdownMenuTrigger}
        label={current ? nativeChatSessionChoiceLabel(current, descriptor.id) : category}
        tooltipLabel={category}
        disabled={disabled}
        disabledReason={
          descriptor.settable
            ? null
            : nativeChatSessionOptionDisabledReason(descriptor.disabledReason)
        }
        dispatched={sessionOptionDispatchUnconfirmed(descriptor)}
      />
      <DropdownMenuContent
        align="start"
        side="top"
        collisionPadding={8}
        className="w-64"
        onCloseAutoFocus={focus.onCloseAutoFocus}
      >
        <DescriptorMenuRows
          descriptor={descriptor}
          pending={pending}
          setValue={setValue}
          invokeAction={() => {}}
          notePick={focus.notePick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
