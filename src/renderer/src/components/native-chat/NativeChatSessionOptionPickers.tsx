import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { sortNativeChatSessionOptions } from '../../../../shared/native-chat-session-option-snapshot'
import {
  sessionOptionDispatchUnconfirmed,
  type SessionOptionDescriptor,
  type SessionOptionsSurface,
  type SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import {
  nativeChatModelPillLabel,
  nativeChatOptionsPillLabel,
  nativeChatOptionsPillTitle,
  nativeChatSessionChoiceLabel,
  nativeChatSessionOptionDisabledReason,
  nativeChatSessionOptionLabel
} from './native-chat-session-option-labels'
import type { NativeChatOptionPickerRequest } from './native-chat-composer-types'

const REPORTED_CURRENT_VALUE = '__orca_reported_current__'

export type NativeChatSessionOptionPickersProps = {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
  isWorking: boolean
  pickerRequest?: NativeChatOptionPickerRequest | null
}

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

function PickerTrigger(props: {
  label: string
  tooltipLabel: string
  disabled: boolean
  disabledReason?: string | null
  dispatched: boolean
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
        <DropdownMenuTrigger asChild disabled={props.disabled}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={accessibleName}
            className="min-w-0 max-w-full text-muted-foreground"
          >
            <span className="max-w-48 truncate">{props.label}</span>
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
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

function ChoiceBody(props: { label: string; description?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 py-0.5">
      <div>{props.label}</div>
      {props.description ? (
        <div className="text-xs font-normal text-muted-foreground">{props.description}</div>
      ) : null}
    </div>
  )
}

function reportedCurrentValueLabel(descriptor: SessionOptionDescriptor): string | undefined {
  if (!descriptor.currentValueLabel) {
    return undefined
  }
  return descriptor.id === 'permissions' && descriptor.currentValueLabel === 'Custom'
    ? translate('components.native-chat.composer.optionValue.custom', 'Custom')
    : descriptor.currentValueLabel
}

function DescriptorMenuRows(props: {
  descriptor: SessionOptionDescriptor
  pending: boolean
  setValue: (value: SessionOptionValue) => void
  invokeAction: () => void
}): React.JSX.Element {
  const { descriptor, pending, setValue, invokeAction } = props
  // Why: flip-only without a baseline is an action — never claim On/Off.
  if (descriptor.action?.type === 'toggle-command') {
    return (
      <DropdownMenuItem disabled={!descriptor.settable || pending} onSelect={() => invokeAction()}>
        {translate('components.native-chat.composer.toggleOption', 'Toggle {{value0}}', {
          value0: nativeChatSessionOptionLabel(descriptor).toLowerCase()
        })}
      </DropdownMenuItem>
    )
  }
  // Why: agent-picker opens the TUI; it is not a set of radio choices.
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
  // Why: absolute On/Off only when we have tracked truth. Unknown composed
  // booleans leave the group unselected so empty radios are not a selection.
  if (descriptor.kind.type === 'boolean') {
    const selected =
      descriptor.kind.currentValue === true
        ? 'on'
        : descriptor.kind.currentValue === false
          ? 'off'
          : undefined
    return (
      <>
        {selected === undefined ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {translate(
              'components.native-chat.composer.valueUnknown',
              'Current value unknown — pick On or Off'
            )}
          </DropdownMenuLabel>
        ) : null}
        <DropdownMenuRadioGroup value={selected} onValueChange={(next) => setValue(next === 'on')}>
          <DropdownMenuRadioItem value="on" disabled={!descriptor.settable || pending}>
            {translate('components.native-chat.composer.optionValue.on', 'On')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off" disabled={!descriptor.settable || pending}>
            {translate('components.native-chat.composer.optionValue.off', 'Off')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </>
    )
  }
  const reportedCurrentLabel = reportedCurrentValueLabel(descriptor)
  return (
    <DropdownMenuRadioGroup
      value={
        descriptor.kind.currentValue ?? (reportedCurrentLabel ? REPORTED_CURRENT_VALUE : undefined)
      }
      onValueChange={(value) => setValue(value)}
    >
      {reportedCurrentLabel ? (
        <DropdownMenuRadioItem value={REPORTED_CURRENT_VALUE} disabled>
          <ChoiceBody
            label={reportedCurrentLabel}
            description={descriptor.currentValueDescription}
          />
        </DropdownMenuRadioItem>
      ) : null}
      {descriptor.kind.choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.value}
          value={choice.value}
          disabled={!descriptor.settable || pending}
        >
          <ChoiceBody
            label={nativeChatSessionChoiceLabel(choice, descriptor.id)}
            description={choice.description}
          />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function runSurfaceCall(
  pendingKey: string,
  setPendingId: (id: string | null) => void,
  call: () => Promise<unknown>
): void {
  setPendingId(pendingKey)
  void call()
    .catch((error) => {
      toast.error(
        translate('components.native-chat.composer.optionUpdateFailed', 'Could not update option'),
        { description: error instanceof Error ? error.message : String(error) }
      )
    })
    .finally(() => setPendingId(null))
}

function NativeChatSessionOptionPickersInner({
  surface,
  snapshot,
  isWorking,
  pickerRequest
}: NativeChatSessionOptionPickersProps): React.JSX.Element | null {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const model = snapshot.find((descriptor) => descriptor.category === 'model')
  const options = sortNativeChatSessionOptions(snapshot)
  if (!surface || !model) {
    return null
  }
  const requestedModelSequence = pickerRequest?.id === model.id ? pickerRequest.sequence : null

  const setOption = (descriptor: SessionOptionDescriptor, value: SessionOptionValue): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.setOption(descriptor.id, value))
  }
  const invokeAction = (descriptor: SessionOptionDescriptor): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.invokeAction(descriptor.id))
  }

  const modelReason = nativeChatSessionOptionDisabledReason(model.disabledReason)
  const modelTooltip = translate('components.native-chat.composer.model', 'Model')
  const optionGroups = [
    { id: 'options', descriptors: options.filter((descriptor) => descriptor.id !== 'permissions') },
    {
      id: 'permissions',
      descriptors: options.filter((descriptor) => descriptor.id === 'permissions')
    }
  ]

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      <DropdownMenu
        key={`model:${requestedModelSequence ?? 'idle'}`}
        defaultOpen={requestedModelSequence !== null}
      >
        <PickerTrigger
          label={nativeChatModelPillLabel(model)}
          tooltipLabel={modelTooltip}
          disabled={isWorking || pendingId !== null}
          disabledReason={modelReason}
          dispatched={sessionOptionDispatchUnconfirmed(model)}
        />
        <DropdownMenuContent align="start" side="top" collisionPadding={8} className="w-64">
          {modelReason && !model.settable ? (
            <DropdownMenuLabel className="font-normal">{modelReason}</DropdownMenuLabel>
          ) : null}
          <DescriptorMenuRows
            descriptor={model}
            pending={pendingId !== null}
            setValue={(value) => setOption(model, value)}
            invokeAction={() => invokeAction(model)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {optionGroups
        .filter((group) => group.descriptors.length > 0)
        .map(({ id, descriptors }) => {
          const requestedSequence = descriptors.some(
            (descriptor) => descriptor.id === pickerRequest?.id
          )
            ? (pickerRequest?.sequence ?? null)
            : null
          const tooltipLabel =
            id === 'permissions'
              ? nativeChatSessionOptionLabel(descriptors[0])
              : nativeChatOptionsPillTitle(descriptors)
          const label =
            id === 'permissions'
              ? (reportedCurrentValueLabel(descriptors[0]) ??
                (descriptors[0].valueSource === 'unknown'
                  ? tooltipLabel
                  : nativeChatOptionsPillLabel(descriptors)))
              : nativeChatOptionsPillLabel(descriptors)
          const reason = descriptors.every((descriptor) => !descriptor.settable)
            ? nativeChatSessionOptionDisabledReason(descriptors[0].disabledReason)
            : null
          return (
            <DropdownMenu
              key={`${id}:${requestedSequence ?? 'idle'}`}
              defaultOpen={requestedSequence !== null}
            >
              <PickerTrigger
                label={label}
                tooltipLabel={tooltipLabel}
                disabled={isWorking || pendingId !== null}
                disabledReason={reason}
                dispatched={descriptors.some(sessionOptionDispatchUnconfirmed)}
              />
              <DropdownMenuContent align="start" side="top" collisionPadding={8} className="w-60">
                {descriptors.map((descriptor, index) => {
                  const reason = nativeChatSessionOptionDisabledReason(descriptor.disabledReason)
                  return (
                    <div key={descriptor.id}>
                      {index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel>
                        {nativeChatSessionOptionLabel(descriptor)}
                      </DropdownMenuLabel>
                      {reason && !descriptor.settable ? (
                        <DropdownMenuLabel className="font-normal">{reason}</DropdownMenuLabel>
                      ) : null}
                      <DescriptorMenuRows
                        descriptor={descriptor}
                        pending={pendingId !== null}
                        setValue={(value) => setOption(descriptor, value)}
                        invokeAction={() => invokeAction(descriptor)}
                      />
                    </div>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
    </div>
  )
}

export const NativeChatSessionOptionPickers = memo(NativeChatSessionOptionPickersInner)
