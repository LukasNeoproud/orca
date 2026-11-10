import { useNativeChatPermissionModeCycle } from './use-native-chat-permission-mode-cycle'
import { useRef, memo, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { PopoverTrigger } from '@/components/ui/popover'
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
  nativeChatSessionOptionDisabledReason,
  nativeChatSessionOptionLabel
} from './native-chat-session-option-labels'
import type { NativeChatOptionPickerRequest } from './native-chat-composer-types'
import { agentSessionThrownFailure } from '../../../../shared/agent-session-write-failure'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { agentSessionWriteFailureText } from './agent-session-write-notice-text'
import { NativeChatModelCombobox } from './NativeChatModelCombobox'
import { useNativeChatPickerFocusReturn } from './native-chat-picker-focus-return'
import { DescriptorMenuRows, PickerTrigger } from './NativeChatSessionOptionMenuParts'
import {
  isNativeChatPermissionModeOption,
  NativeChatPermissionModePicker
} from './NativeChatPermissionModePicker'

export type NativeChatSessionOptionPickersProps = {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
  isWorking: boolean
  pickerRequest?: NativeChatOptionPickerRequest | null
  /** Where focus lands after a pick; see `useNativeChatPickerFocusReturn`. */
  focusComposer?: () => void
}

/** A host's error is words for its log, so it gets the table's; a local surface's error is
 *  already written for the person. */
function optionUpdateFailureDescription(error: unknown): string {
  if (error instanceof RuntimeRpcCallError) {
    return agentSessionWriteFailureText(agentSessionThrownFailure(error, error.code), 'option')
  }
  return error instanceof Error ? error.message : String(error)
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
        { description: optionUpdateFailureDescription(error) }
      )
    })
    .finally(() => setPendingId(null))
}

function NativeChatSessionOptionPickersInner({
  surface,
  snapshot,
  isWorking,
  pickerRequest,
  focusComposer
}: NativeChatSessionOptionPickersProps): React.JSX.Element | null {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const modelMenuFocus = useNativeChatPickerFocusReturn(focusComposer)
  const optionsMenuFocus = useNativeChatPickerFocusReturn(focusComposer)
  const model = snapshot.find((descriptor) => descriptor.category === 'model')
  // The permission mode has a pill of its own, beside the model.
  const mode = snapshot.find(isNativeChatPermissionModeOption)
  const options = sortNativeChatSessionOptions(snapshot).filter((option) => option !== mode)
  const anchor = useRef<HTMLDivElement>(null)
  useNativeChatPermissionModeCycle({
    anchor,
    mode: surface ? mode : undefined,
    disabled: isWorking || pendingId !== null,
    setMode: (descriptor, value) =>
      surface &&
      runSurfaceCall(descriptor.id, setPendingId, () => surface.setOption(descriptor.id, value))
  })
  if (!surface || !model) {
    return null
  }
  const requestedModelSequence = pickerRequest?.id === model.id ? pickerRequest.sequence : null
  const requestedOptionsSequence = options.some((descriptor) => descriptor.id === pickerRequest?.id)
    ? (pickerRequest?.sequence ?? null)
    : null

  const setOption = (descriptor: SessionOptionDescriptor, value: SessionOptionValue): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.setOption(descriptor.id, value))
  }
  const invokeAction = (descriptor: SessionOptionDescriptor): void => {
    runSurfaceCall(descriptor.id, setPendingId, () => surface.invokeAction(descriptor.id))
  }

  const modelReason = nativeChatSessionOptionDisabledReason(model.disabledReason)
  const modelPickerKey = `model:${requestedModelSequence ?? 'idle'}`
  // Read only when a request remounts the picker.
  const modelPickerDefaultOpen = requestedModelSequence !== null
  const modelTrigger = {
    label: nativeChatModelPillLabel(model),
    tooltipLabel: translate('components.native-chat.composer.model', 'Model'),
    disabled: isWorking || pendingId !== null,
    disabledReason: modelReason,
    dispatched: sessionOptionDispatchUnconfirmed(model)
  }
  const optionsTooltip = nativeChatOptionsPillTitle(options)
  const optionsReason =
    options.length > 0 && options.every((descriptor) => !descriptor.settable)
      ? nativeChatSessionOptionDisabledReason(options[0]?.disabledReason)
      : null

  return (
    <div ref={anchor} className="flex min-w-0 items-center gap-0.5 text-chat-foreground-faint">
      {model.kind.type === 'select' && !model.action ? (
        <NativeChatModelCombobox
          key={modelPickerKey}
          defaultOpen={modelPickerDefaultOpen}
          choices={model.kind.choices}
          currentValue={model.kind.currentValue}
          readOnly={!model.settable || pendingId !== null}
          readOnlyReason={modelReason}
          onSelect={(value) => setOption(model, value)}
          focusComposer={focusComposer}
          renderTrigger={(onKeyDown) => (
            <PickerTrigger Trigger={PopoverTrigger} {...modelTrigger} onKeyDown={onKeyDown} />
          )}
        />
      ) : (
        <DropdownMenu key={modelPickerKey} defaultOpen={modelPickerDefaultOpen}>
          <PickerTrigger Trigger={DropdownMenuTrigger} {...modelTrigger} />
          <DropdownMenuContent
            align="start"
            side="top"
            collisionPadding={8}
            className="w-64"
            onCloseAutoFocus={modelMenuFocus.onCloseAutoFocus}
          >
            {modelReason && !model.settable ? (
              <DropdownMenuLabel className="font-normal">{modelReason}</DropdownMenuLabel>
            ) : null}
            <DescriptorMenuRows
              descriptor={model}
              pending={pendingId !== null}
              setValue={(value) => setOption(model, value)}
              invokeAction={() => invokeAction(model)}
              notePick={modelMenuFocus.notePick}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {mode ? (
        <NativeChatPermissionModePicker
          key={`mode:${pickerRequest?.id === mode.id ? pickerRequest.sequence : 'idle'}`}
          descriptor={mode}
          defaultOpen={pickerRequest?.id === mode.id}
          disabled={isWorking || pendingId !== null}
          pending={pendingId !== null}
          setValue={(value) => setOption(mode, value)}
          focusComposer={focusComposer}
        />
      ) : null}
      {options.length > 0 ? (
        <DropdownMenu
          key={`options:${requestedOptionsSequence ?? 'idle'}`}
          defaultOpen={requestedOptionsSequence !== null}
        >
          <PickerTrigger
            Trigger={DropdownMenuTrigger}
            label={nativeChatOptionsPillLabel(options)}
            tooltipLabel={optionsTooltip}
            disabled={isWorking || pendingId !== null}
            disabledReason={optionsReason}
            dispatched={options.some(sessionOptionDispatchUnconfirmed)}
          />
          <DropdownMenuContent
            align="start"
            side="top"
            collisionPadding={8}
            className="w-60"
            onCloseAutoFocus={optionsMenuFocus.onCloseAutoFocus}
          >
            {options.map((descriptor, index) => {
              const reason = nativeChatSessionOptionDisabledReason(descriptor.disabledReason)
              return (
                <div key={descriptor.id}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  {descriptor.kind.type === 'boolean' && !descriptor.action ? null : (
                    <DropdownMenuLabel>
                      {nativeChatSessionOptionLabel(descriptor)}
                    </DropdownMenuLabel>
                  )}
                  {reason && !descriptor.settable ? (
                    <DropdownMenuLabel className="font-normal">{reason}</DropdownMenuLabel>
                  ) : null}
                  <DescriptorMenuRows
                    descriptor={descriptor}
                    pending={pendingId !== null}
                    setValue={(value) => setOption(descriptor, value)}
                    invokeAction={() => invokeAction(descriptor)}
                    notePick={optionsMenuFocus.notePick}
                  />
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

export const NativeChatSessionOptionPickers = memo(NativeChatSessionOptionPickersInner)
