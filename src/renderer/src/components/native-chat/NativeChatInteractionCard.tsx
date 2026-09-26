import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  encodeOrcaInteractionResult,
  isValidOrcaInteractionResult,
  type OrcaInteractionChoiceValue,
  type OrcaInteractionRequest,
  type OrcaInteractionValue
} from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  InteractionFieldControl,
  type ChoiceDraft,
  type FieldDraft
} from './NativeChatInteractionFieldControl'

type Drafts = Record<string, FieldDraft>

function initialDrafts(request: OrcaInteractionRequest): Drafts {
  return Object.fromEntries(
    request.fields.map((field): [string, FieldDraft] => {
      switch (field.type) {
        case 'single_choice':
          return [
            field.id,
            {
              kind: 'choice',
              selected: field.default ? [field.default] : [],
              customSelected: false,
              custom: ''
            }
          ]
        case 'multi_choice':
          return [
            field.id,
            { kind: 'choice', selected: field.default ?? [], customSelected: false, custom: '' }
          ]
        case 'boolean':
          return [field.id, { kind: 'boolean', value: field.default }]
        case 'text':
        case 'textarea':
          return [field.id, { kind: 'text', value: field.default ?? '' }]
        case 'number':
          return [field.id, { kind: 'number', value: field.default?.toString() ?? '' }]
      }
    })
  )
}

function choiceValue(draft: ChoiceDraft): OrcaInteractionChoiceValue | undefined {
  if (draft.customSelected) {
    const value = draft.custom.trim()
    return value ? { type: 'custom', value } : undefined
  }
  return draft.selected[0]
}

function resolveValues(
  request: OrcaInteractionRequest,
  drafts: Drafts
): {
  valid: boolean
  values: Record<string, OrcaInteractionValue>
  errors: Record<string, string>
} {
  const values: Record<string, OrcaInteractionValue> = {}
  const errors: Record<string, string> = {}
  let valid = true
  const markInvalid = (id: string, message: string): void => {
    valid = false
    errors[id] = message
  }
  const requiredMessage = translate(
    'components.native-chat.interaction.validationRequired',
    'Complete this required field.'
  )
  for (const field of request.fields) {
    const draft = drafts[field.id]
    if (!draft) {
      markInvalid(field.id, requiredMessage)
      continue
    }
    if (field.type === 'single_choice' && draft.kind === 'choice') {
      const value = choiceValue(draft)
      if (value !== undefined) {
        values[field.id] = value
      } else if (field.required || draft.customSelected) {
        markInvalid(
          field.id,
          draft.customSelected
            ? translate(
                'components.native-chat.interaction.validationCustom',
                'Enter a custom answer.'
              )
            : requiredMessage
        )
      }
    } else if (field.type === 'multi_choice' && draft.kind === 'choice') {
      const selected: OrcaInteractionChoiceValue[] = [...draft.selected]
      const custom = draft.custom.trim()
      if (draft.customSelected && custom) {
        selected.push({ type: 'custom', value: custom })
      }
      if (selected.length > 0) {
        values[field.id] = selected
      }
      if ((field.required && selected.length === 0) || (draft.customSelected && !custom)) {
        markInvalid(
          field.id,
          draft.customSelected
            ? translate(
                'components.native-chat.interaction.validationCustom',
                'Enter a custom answer.'
              )
            : requiredMessage
        )
      }
    } else if (field.type === 'boolean' && draft.kind === 'boolean') {
      if (draft.value !== undefined) {
        values[field.id] = draft.value
      } else if (field.required) {
        markInvalid(field.id, requiredMessage)
      }
    } else if ((field.type === 'text' || field.type === 'textarea') && draft.kind === 'text') {
      if (draft.value.length > 0) {
        values[field.id] = draft.value
      }
      const minimum = field.minLength ?? (field.required ? 1 : 0)
      const maximum = field.maxLength ?? (field.type === 'text' ? 8_000 : 32_000)
      if (
        (field.required || draft.value.length > 0) &&
        (draft.value.length < minimum || draft.value.length > maximum)
      ) {
        markInvalid(
          field.id,
          translate(
            'components.native-chat.interaction.validationText',
            'Enter between {{minimum}} and {{maximum}} characters.',
            { minimum, maximum }
          )
        )
      }
    } else if (field.type === 'number' && draft.kind === 'number') {
      const raw = draft.value.trim()
      if (!raw) {
        if (field.required) {
          markInvalid(field.id, requiredMessage)
        }
        continue
      }
      const value = Number(raw)
      const stepValid =
        field.step === undefined ||
        Math.abs(
          (value - (field.min ?? 0)) / field.step -
            Math.round((value - (field.min ?? 0)) / field.step)
        ) < 1e-9
      if (
        !Number.isFinite(value) ||
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max) ||
        !stepValid
      ) {
        markInvalid(
          field.id,
          translate(
            'components.native-chat.interaction.validationNumber',
            'Enter a number within the allowed range and step.'
          )
        )
      } else {
        values[field.id] = value
      }
    } else {
      markInvalid(field.id, requiredMessage)
    }
  }
  return { valid, values, errors }
}

export function NativeChatInteractionCard({
  request,
  onRespond
}: {
  request: OrcaInteractionRequest
  onRespond: (answer: string) => void
}): React.JSX.Element {
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(request))
  const formRef = useRef<HTMLFormElement>(null)
  const resolved = resolveValues(request, drafts)
  const result = { status: 'submitted' as const, values: resolved.values }
  const canonicalResult = isValidOrcaInteractionResult(request, result)
  const canSubmit = resolved.valid && canonicalResult
  const formError =
    resolved.valid && !canonicalResult
      ? translate(
          'components.native-chat.interaction.validationForm',
          'The combined response is too large.'
        )
      : null

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[data-interaction-control]')?.focus()
  }, [])

  const update = (id: string, draft: FieldDraft): void => {
    setDrafts((current) => ({ ...current, [id]: draft }))
  }
  const cancel = (): void => onRespond(encodeOrcaInteractionResult({ status: 'cancelled' }))
  const submit = (): void => {
    if (canSubmit) {
      onRespond(encodeOrcaInteractionResult(result))
    }
  }

  return (
    <div className="shrink-0 bg-background">
      <div className="mx-auto w-full max-w-4xl px-3 pt-2 pb-4 sm:px-4">
        <form
          ref={formRef}
          className="overflow-hidden rounded-lg border border-input bg-card shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            } else if (
              event.key === 'Enter' &&
              event.target instanceof HTMLElement &&
              event.target.tagName !== 'TEXTAREA' &&
              event.target.tagName !== 'BUTTON'
            ) {
              event.preventDefault()
              submit()
            }
          }}
          noValidate
        >
          <div className="flex items-start justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold text-foreground">
                {request.title ??
                  translate('components.native-chat.interaction.title', 'Input requested')}
              </h3>
              {request.description ? (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {request.description}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={cancel}
              aria-label={translate('components.native-chat.interaction.cancel', 'Cancel')}
            >
              <X />
            </Button>
          </div>

          <div className="max-h-[50vh] space-y-4 overflow-y-auto border-t border-border px-3.5 py-3 scrollbar-sleek">
            {request.fields.map((field, index) => (
              <InteractionFieldControl
                key={field.id}
                field={field}
                draft={drafts[field.id]!}
                autofocus={index === 0}
                error={resolved.errors[field.id]}
                onChange={(draft) => update(field.id, draft)}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-3.5 py-2.5">
            {formError ? (
              <p className="mr-auto self-center text-xs text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              {translate('components.native-chat.interaction.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {request.submitLabel ??
                translate('components.native-chat.interaction.submit', 'Submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
