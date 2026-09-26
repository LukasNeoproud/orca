import { z } from 'zod'

export const ORCA_INTERACTION_FALLBACK_SKIP_OPTION_ID = '__orca_skip__'
export const ORCA_INTERACTION_RESULT_MAX_BYTES = 64 * 1024

const IdentifierSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/, 'must be a stable identifier')

const utf8Bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length

const OptionSchema = z
  .object({
    id: IdentifierSchema,
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2_000).optional(),
    recommended: z.boolean().optional()
  })
  .strict()

const FieldBase = {
  id: IdentifierSchema,
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000).optional(),
  required: z.boolean().optional()
}

const ChoiceBase = {
  ...FieldBase,
  options: z.array(OptionSchema).min(1).max(64),
  allowCustom: z.boolean().optional()
}

const InteractionFieldSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...ChoiceBase,
      type: z.literal('single_choice'),
      default: IdentifierSchema.optional()
    })
    .strict(),
  z
    .object({
      ...ChoiceBase,
      type: z.literal('multi_choice'),
      default: z.array(IdentifierSchema).max(64).optional()
    })
    .strict(),
  z
    .object({
      ...FieldBase,
      type: z.literal('boolean'),
      default: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      ...FieldBase,
      type: z.literal('text'),
      default: z.string().max(8_000).optional(),
      placeholder: z.string().max(200).optional(),
      minLength: z.number().int().min(0).max(8_000).optional(),
      maxLength: z.number().int().min(1).max(8_000).optional()
    })
    .strict(),
  z
    .object({
      ...FieldBase,
      type: z.literal('textarea'),
      default: z.string().max(32_000).optional(),
      placeholder: z.string().max(200).optional(),
      minLength: z.number().int().min(0).max(32_000).optional(),
      maxLength: z.number().int().min(1).max(32_000).optional()
    })
    .strict(),
  z
    .object({
      ...FieldBase,
      type: z.literal('number'),
      default: z.number().finite().optional(),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
      step: z.number().finite().positive().optional(),
      unit: z.string().trim().min(1).max(40).optional()
    })
    .strict()
])

export const OrcaInteractionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    fields: z.array(InteractionFieldSchema).min(1).max(32),
    submitLabel: z.string().trim().min(1).max(80).optional()
  })
  .strict()
  .superRefine((request, ctx) => {
    const fieldIds = new Set<string>()
    request.fields.forEach((field, fieldIndex) => {
      if (fieldIds.has(field.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate field id ${field.id}`,
          path: ['fields', fieldIndex, 'id']
        })
      }
      fieldIds.add(field.id)
      if (field.type === 'single_choice' || field.type === 'multi_choice') {
        const optionIds = new Set<string>()
        field.options.forEach((option, optionIndex) => {
          if (optionIds.has(option.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate option id ${option.id}`,
              path: ['fields', fieldIndex, 'options', optionIndex, 'id']
            })
          }
          optionIds.add(option.id)
        })
        const defaults = field.type === 'single_choice' ? [field.default] : (field.default ?? [])
        for (const defaultId of defaults) {
          if (defaultId && !optionIds.has(defaultId)) {
            ctx.addIssue({
              code: 'custom',
              message: `default ${defaultId} is not an offered option`,
              path: ['fields', fieldIndex, 'default']
            })
          }
        }
      }
      if (field.type === 'text' || field.type === 'textarea') {
        if (
          field.minLength !== undefined &&
          field.maxLength !== undefined &&
          field.minLength > field.maxLength
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'minLength must not exceed maxLength',
            path: ['fields', fieldIndex]
          })
        }
        if (
          field.default !== undefined &&
          (field.default.length < (field.minLength ?? 0) ||
            field.default.length > (field.maxLength ?? (field.type === 'text' ? 8_000 : 32_000)))
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'default does not satisfy the text length constraints',
            path: ['fields', fieldIndex, 'default']
          })
        }
      }
      if (field.type === 'number') {
        if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
          ctx.addIssue({
            code: 'custom',
            message: 'min must not exceed max',
            path: ['fields', fieldIndex]
          })
        }
        if (
          field.default !== undefined &&
          ((field.min !== undefined && field.default < field.min) ||
            (field.max !== undefined && field.default > field.max))
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'default is outside the allowed range',
            path: ['fields', fieldIndex, 'default']
          })
        }
        if (
          field.default !== undefined &&
          field.step !== undefined &&
          Math.abs(
            (field.default - (field.min ?? 0)) / field.step -
              Math.round((field.default - (field.min ?? 0)) / field.step)
          ) >= 1e-9
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'default does not align with step',
            path: ['fields', fieldIndex, 'default']
          })
        }
      }
    })
  })
  .refine((request) => utf8Bytes(request) <= 256 * 1024, 'interaction request is too large')

export type OrcaInteractionOption = z.infer<typeof OptionSchema>
export type OrcaInteractionField = z.infer<typeof InteractionFieldSchema>
export type OrcaInteractionRequest = z.infer<typeof OrcaInteractionRequestSchema>

export type OrcaInteractionCustomValue = { type: 'custom'; value: string }
export type OrcaInteractionChoiceValue = string | OrcaInteractionCustomValue
export type OrcaInteractionValue =
  | OrcaInteractionChoiceValue
  | OrcaInteractionChoiceValue[]
  | boolean
  | number

export type OrcaInteractionResult =
  | { status: 'submitted'; values: Record<string, OrcaInteractionValue> }
  | { status: 'cancelled' }

const CustomValueSchema = z
  .object({ type: z.literal('custom'), value: z.string().trim().min(1).max(32_000) })
  .strict()
const ChoiceValueSchema = z.union([z.string(), CustomValueSchema])
const InteractionResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('submitted'),
      values: z.record(
        z.string(),
        z.union([ChoiceValueSchema, z.array(ChoiceValueSchema), z.boolean(), z.number().finite()])
      )
    })
    .strict(),
  z.object({ status: z.literal('cancelled') }).strict()
])

function isCustomValue(value: unknown): value is OrcaInteractionCustomValue {
  return CustomValueSchema.safeParse(value).success
}

function validChoice(
  value: unknown,
  field: Extract<OrcaInteractionField, { type: 'single_choice' | 'multi_choice' }>
): boolean {
  return typeof value === 'string'
    ? field.options.some((option) => option.id === value)
    : field.allowCustom === true && isCustomValue(value)
}

function validText(value: unknown, minLength: number, maxLength: number): boolean {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength
}

export function isValidOrcaInteractionResult(
  request: OrcaInteractionRequest,
  value: unknown
): value is OrcaInteractionResult {
  return parseOrcaInteractionResult(request, value) !== null
}

export function parseOrcaInteractionResult(
  request: OrcaInteractionRequest,
  value: unknown
): OrcaInteractionResult | null {
  const parsed = InteractionResultSchema.safeParse(value)
  if (!parsed.success || parsed.data.status === 'cancelled') {
    return parsed.success ? parsed.data : null
  }
  if (utf8Bytes(parsed.data) > ORCA_INTERACTION_RESULT_MAX_BYTES) {
    return null
  }
  const values = parsed.data.values
  if (Object.keys(values).some((id) => !request.fields.some((field) => field.id === id))) {
    return null
  }
  const valid = request.fields.every((field) => {
    const answer = values[field.id]
    if (answer === undefined) {
      return field.required !== true
    }
    switch (field.type) {
      case 'single_choice':
        return validChoice(answer, field)
      case 'multi_choice':
        return (
          Array.isArray(answer) &&
          (!field.required || answer.length > 0) &&
          answer.every((choice) => validChoice(choice, field))
        )
      case 'boolean':
        return typeof answer === 'boolean'
      case 'text':
      case 'textarea':
        return validText(
          answer,
          field.minLength ?? (field.required ? 1 : 0),
          field.maxLength ?? (field.type === 'text' ? 8_000 : 32_000)
        )
      case 'number':
        return (
          typeof answer === 'number' &&
          Number.isFinite(answer) &&
          (field.min === undefined || answer >= field.min) &&
          (field.max === undefined || answer <= field.max) &&
          (field.step === undefined ||
            Math.abs(
              (answer - (field.min ?? 0)) / field.step -
                Math.round((answer - (field.min ?? 0)) / field.step)
            ) < 1e-9)
        )
    }
  })
  return valid ? parsed.data : null
}

const ANSWER_PREFIX = 'orca-interaction:'

export function encodeOrcaInteractionResult(result: OrcaInteractionResult): string {
  return `${ANSWER_PREFIX}${JSON.stringify(result)}`
}

export function decodeOrcaInteractionResult(value: string): unknown {
  if (!value.startsWith(ANSWER_PREFIX)) {
    return null
  }
  try {
    return JSON.parse(value.slice(ANSWER_PREFIX.length))
  } catch {
    return null
  }
}
