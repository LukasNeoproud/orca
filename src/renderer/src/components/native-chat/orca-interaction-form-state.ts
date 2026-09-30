import {
  isValidOrcaInteractionResult,
  type OrcaInteractionChoiceValue,
  type OrcaInteractionRequest,
  type OrcaInteractionResult,
  type OrcaInteractionValue
} from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'
import type { ChoiceDraft, FieldDraft } from './NativeChatInteractionFieldControl'

export type OrcaInteractionDrafts = Record<string, FieldDraft>

export type ResolvedOrcaInteractionDrafts = {
  canSubmit: boolean
  errors: Record<string, string>
  formError: string | null
  result: Extract<OrcaInteractionResult, { status: 'submitted' }>
}

export function createOrcaInteractionDrafts(
  request: OrcaInteractionRequest
): OrcaInteractionDrafts {
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
  drafts: OrcaInteractionDrafts
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

export function resolveOrcaInteractionDrafts(
  request: OrcaInteractionRequest,
  drafts: OrcaInteractionDrafts
): ResolvedOrcaInteractionDrafts {
  const resolved = resolveValues(request, drafts)
  const result = { status: 'submitted' as const, values: resolved.values }
  const canonicalResult = isValidOrcaInteractionResult(request, result)
  return {
    canSubmit: resolved.valid && canonicalResult,
    errors: resolved.errors,
    formError:
      resolved.valid && !canonicalResult
        ? translate(
            'components.native-chat.interaction.validationForm',
            'The combined response is too large.'
          )
        : null,
    result
  }
}
