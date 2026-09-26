import type { OrcaInteractionField } from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export type ChoiceDraft = {
  kind: 'choice'
  selected: string[]
  customSelected: boolean
  custom: string
}
export type FieldDraft =
  | ChoiceDraft
  | { kind: 'boolean'; value: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: string }

function FieldHeader({ field }: { field: OrcaInteractionField }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-foreground">
        {field.label}
        {field.required ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {translate('components.native-chat.interaction.required', '(required)')}
          </span>
        ) : null}
      </div>
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  )
}

export function InteractionFieldControl({
  field,
  draft,
  autofocus,
  onChange
}: {
  field: OrcaInteractionField
  draft: FieldDraft
  autofocus: boolean
  onChange: (draft: FieldDraft) => void
}): React.JSX.Element {
  if (
    (field.type === 'single_choice' || field.type === 'multi_choice') &&
    draft.kind === 'choice'
  ) {
    return <ChoiceControl field={field} draft={draft} autofocus={autofocus} onChange={onChange} />
  }
  if (field.type === 'boolean' && draft.kind === 'boolean') {
    return <BooleanControl field={field} draft={draft} autofocus={autofocus} onChange={onChange} />
  }
  if ((field.type === 'text' || field.type === 'textarea') && draft.kind === 'text') {
    const controlProps = {
      id: `interaction-${field.id}`,
      value: draft.value,
      placeholder: field.placeholder,
      minLength: field.minLength,
      maxLength: field.maxLength,
      required: field.required,
      'data-interaction-control': autofocus ? '' : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ kind: 'text', value: event.target.value })
    }
    return (
      <div className="space-y-2">
        <label htmlFor={`interaction-${field.id}`}>
          <FieldHeader field={field} />
        </label>
        {field.type === 'textarea' ? <Textarea {...controlProps} /> : <Input {...controlProps} />}
      </div>
    )
  }
  if (field.type === 'number' && draft.kind === 'number') {
    return (
      <div className="space-y-2">
        <label htmlFor={`interaction-${field.id}`}>
          <FieldHeader field={field} />
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`interaction-${field.id}`}
            type="number"
            value={draft.value}
            min={field.min}
            max={field.max}
            step={field.step}
            required={field.required}
            data-interaction-control={autofocus ? '' : undefined}
            onChange={(event) => onChange({ kind: 'number', value: event.target.value })}
          />
          {field.unit ? <span className="text-xs text-muted-foreground">{field.unit}</span> : null}
        </div>
      </div>
    )
  }
  return <div />
}

type ChoiceField = Extract<OrcaInteractionField, { type: 'single_choice' | 'multi_choice' }>

function ChoiceControl({
  field,
  draft,
  autofocus,
  onChange
}: {
  field: ChoiceField
  draft: ChoiceDraft
  autofocus: boolean
  onChange: (draft: ChoiceDraft) => void
}): React.JSX.Element {
  const multiple = field.type === 'multi_choice'
  const toggle = (id: string): void => {
    const selected = multiple
      ? draft.selected.includes(id)
        ? draft.selected.filter((value) => value !== id)
        : [...draft.selected, id]
      : [id]
    onChange({ ...draft, selected, customSelected: multiple && draft.customSelected })
  }
  return (
    <fieldset className="space-y-2">
      <legend className="w-full">
        <FieldHeader field={field} />
      </legend>
      <div className="space-y-1.5">
        {field.options.map((option, index) => {
          const checked = draft.selected.includes(option.id) && !draft.customSelected
          const id = `interaction-${field.id}-${option.id}`
          return (
            <label
              key={option.id}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2 hover:bg-accent"
            >
              {multiple ? (
                <Checkbox
                  id={id}
                  checked={draft.selected.includes(option.id)}
                  data-interaction-control={autofocus && index === 0 ? '' : undefined}
                  onCheckedChange={() => toggle(option.id)}
                />
              ) : (
                <input
                  id={id}
                  type="radio"
                  name={`interaction-${field.id}`}
                  checked={checked}
                  data-interaction-control={autofocus && index === 0 ? '' : undefined}
                  onChange={() => toggle(option.id)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                  {option.label}
                  {option.recommended ? (
                    <Badge variant="secondary">
                      {translate('components.native-chat.interaction.recommended', 'Recommended')}
                    </Badge>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
        {field.allowCustom ? (
          <div className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 focus-within:border-ring">
            {multiple ? (
              <Checkbox
                id={`interaction-${field.id}-custom`}
                aria-label={translate(
                  'components.native-chat.interaction.customAnswer',
                  'Custom answer'
                )}
                checked={draft.customSelected}
                onCheckedChange={(checked) =>
                  onChange({ ...draft, customSelected: checked === true })
                }
              />
            ) : (
              <input
                id={`interaction-${field.id}-custom`}
                type="radio"
                name={`interaction-${field.id}`}
                aria-label={translate(
                  'components.native-chat.interaction.customAnswer',
                  'Custom answer'
                )}
                checked={draft.customSelected}
                onChange={() => onChange({ ...draft, selected: [], customSelected: true })}
                className="size-4 shrink-0 accent-primary"
              />
            )}
            <Input
              value={draft.custom}
              aria-label={translate(
                'components.native-chat.interaction.customAnswer',
                'Custom answer'
              )}
              placeholder={translate(
                'components.native-chat.interaction.customPlaceholder',
                'Enter another value'
              )}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              onFocus={() =>
                onChange({
                  ...draft,
                  selected: multiple ? draft.selected : [],
                  customSelected: true
                })
              }
              onChange={(event) =>
                onChange({
                  ...draft,
                  selected: multiple ? draft.selected : [],
                  customSelected: true,
                  custom: event.target.value
                })
              }
            />
          </div>
        ) : null}
      </div>
    </fieldset>
  )
}

function BooleanControl({
  field,
  draft,
  autofocus,
  onChange
}: {
  field: Extract<OrcaInteractionField, { type: 'boolean' }>
  draft: Extract<FieldDraft, { kind: 'boolean' }>
  autofocus: boolean
  onChange: (draft: FieldDraft) => void
}): React.JSX.Element {
  return (
    <fieldset className="space-y-2">
      <legend className="w-full">
        <FieldHeader field={field} />
      </legend>
      <label
        htmlFor={`interaction-${field.id}`}
        className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
      >
        <Checkbox
          id={`interaction-${field.id}`}
          checked={draft.value}
          data-interaction-control={autofocus ? '' : undefined}
          onCheckedChange={(checked) => onChange({ kind: 'boolean', value: checked === true })}
        />
        {translate('components.native-chat.interaction.enabled', 'Enabled')}
      </label>
    </fieldset>
  )
}
