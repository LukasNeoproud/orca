import type { OrcaInteractionField } from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'
import { Checkbox } from '@/components/ui/checkbox'
import {
  InteractionFieldHeader,
  InteractionValidationMessage
} from './NativeChatInteractionFieldPresentation'

type BooleanField = Extract<OrcaInteractionField, { type: 'boolean' }>

export function InteractionBooleanControl({
  field,
  value,
  autofocus,
  error,
  onChange
}: {
  field: BooleanField
  value: boolean | undefined
  autofocus: boolean
  error?: string
  onChange: (value: boolean) => void
}): React.JSX.Element {
  const usesExplicitChoice = field.default === undefined
  return (
    <fieldset
      className="space-y-2"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `interaction-${field.id}-error` : undefined}
    >
      <legend className="w-full">
        <InteractionFieldHeader field={field} />
      </legend>
      {usesExplicitChoice ? (
        <div className="grid grid-cols-2 gap-2">
          <BooleanOption
            fieldId={field.id}
            label={translate('components.native-chat.interaction.yes', 'Yes')}
            optionValue={true}
            checked={value === true}
            autofocus={autofocus}
            onChange={onChange}
          />
          <BooleanOption
            fieldId={field.id}
            label={translate('components.native-chat.interaction.no', 'No')}
            optionValue={false}
            checked={value === false}
            autofocus={false}
            onChange={onChange}
          />
        </div>
      ) : (
        <label
          htmlFor={`interaction-${field.id}`}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
        >
          <Checkbox
            id={`interaction-${field.id}`}
            checked={value ?? false}
            data-interaction-control={autofocus ? '' : undefined}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {translate('components.native-chat.interaction.enabled', 'Enabled')}
        </label>
      )}
      <InteractionValidationMessage id={`interaction-${field.id}-error`} error={error} />
    </fieldset>
  )
}

function BooleanOption({
  fieldId,
  label,
  optionValue,
  checked,
  autofocus,
  onChange
}: {
  fieldId: string
  label: string
  optionValue: boolean
  checked: boolean
  autofocus: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  const id = `interaction-${fieldId}-${optionValue}`
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
    >
      <input
        id={id}
        type="radio"
        name={`interaction-${fieldId}`}
        checked={checked}
        data-interaction-control={autofocus ? '' : undefined}
        onChange={() => onChange(optionValue)}
        className="size-4 shrink-0 accent-primary"
      />
      {label}
    </label>
  )
}
