import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SwitchIndicator } from '@/components/ui/switch'
import type { DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu'
import type { PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import {
  nativeChatSessionChoiceLabel,
  nativeChatSessionOptionLabel
} from './native-chat-session-option-labels'
import { NativeChatSessionOptionChoiceBody } from './NativeChatSessionOptionChoiceBody'

// The pill and the menu rows every session option picker in the composer is built from.

function PickerTooltipContent(props: {
  label: string
  disabledReason?: string | null
  dispatched: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <div>{props.disabledReason ?? props.label}</div>
      {props.dispatched ? (
        <div>
          {translate(
            'components.native-chat.composer.sentNotConfirmed',
            'Sent to the agent — not confirmed'
          )}
        </div>
      ) : null}
    </div>
  )
}

export function PickerTrigger(props: {
  /** The trigger of whichever surface the pill opens. */
  Trigger: typeof DropdownMenuTrigger | typeof PopoverTrigger
  label: string
  tooltipLabel: string
  disabled: boolean
  disabledReason?: string | null
  dispatched: boolean
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>
}): React.JSX.Element {
  // Why: value-only visible text must still include the category in the
  // accessible name (WCAG 2.5.3 Label in Name / voice control).
  const accessibleName =
    props.label === props.tooltipLabel
      ? props.tooltipLabel
      : translate('components.native-chat.composer.pillAccessibleName', '{{value0}} {{value1}}', {
          value0: props.tooltipLabel,
          value1: props.label
        })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <props.Trigger asChild disabled={props.disabled}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={accessibleName}
            className="max-w-48"
            onKeyDown={props.onKeyDown}
          >
            <span className="truncate">{props.label}</span>
            <ChevronDown className="size-3" />
          </Button>
        </props.Trigger>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <PickerTooltipContent
          label={props.tooltipLabel}
          disabledReason={props.disabledReason}
          dispatched={props.dispatched}
        />
      </TooltipContent>
    </Tooltip>
  )
}

export function DescriptorMenuRows(props: {
  descriptor: SessionOptionDescriptor
  pending: boolean
  setValue: (value: SessionOptionValue) => void
  invokeAction: () => void
  /** Called by the rows whose choice closes the menu. */
  notePick: () => void
}): React.JSX.Element {
  const { descriptor, pending, setValue, invokeAction, notePick } = props
  // Why: flip-only without a baseline is an action — never claim On/Off.
  if (descriptor.action?.type === 'toggle-command') {
    return (
      <DropdownMenuItem
        disabled={!descriptor.settable || pending}
        onSelect={() => {
          notePick()
          invokeAction()
        }}
      >
        {translate('components.native-chat.composer.toggleOption', 'Toggle {{value0}}', {
          value0: nativeChatSessionOptionLabel(descriptor).toLowerCase()
        })}
      </DropdownMenuItem>
    )
  }
  // Why: agent-picker opens the TUI; it is not a set of radio choices, and that picker owns focus.
  if (descriptor.action?.type === 'agent-picker') {
    return (
      <DropdownMenuItem disabled={!descriptor.settable || pending} onSelect={() => invokeAction()}>
        {translate(
          'components.native-chat.composer.chooseInAgentPicker',
          'Choose in agent picker…'
        )}
      </DropdownMenuItem>
    )
  }
  // Why one switch row and not On/Off: the option is binary, so a single control
  // carries it. The row owns the label, which is why the caller drops its header.
  if (descriptor.kind.type === 'boolean') {
    const checked = descriptor.kind.currentValue
    const label = nativeChatSessionOptionLabel(descriptor)
    return (
      <DropdownMenuItem
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={!descriptor.settable || pending}
        // Keep the menu open: the write is async and its result lands in this row.
        onSelect={(event) => {
          event.preventDefault()
          setValue(!checked)
        }}
        className="justify-between"
      >
        <span>{label}</span>
        <SwitchIndicator checked={checked} />
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuRadioGroup
      aria-label={nativeChatSessionOptionLabel(descriptor)}
      value={descriptor.kind.currentValue}
      onValueChange={(value) => {
        notePick()
        setValue(value)
      }}
    >
      {descriptor.kind.choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.value}
          value={choice.value}
          disabled={!descriptor.settable || pending}
        >
          <NativeChatSessionOptionChoiceBody
            label={nativeChatSessionChoiceLabel(choice, descriptor.id)}
            description={choice.description}
          />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}
