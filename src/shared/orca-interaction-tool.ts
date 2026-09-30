const identifier = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' } as const
const fieldBase = {
  id: identifier,
  label: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', minLength: 1, maxLength: 2000 },
  required: { type: 'boolean' }
} as const
const option = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: {
    id: identifier,
    label: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    recommended: { type: 'boolean' }
  }
} as const
const choice = {
  ...fieldBase,
  options: { type: 'array', minItems: 1, maxItems: 64, items: option },
  allowCustom: { type: 'boolean' }
} as const

export const ORCA_INTERACT_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    submitLabel: { type: 'string', minLength: 1, maxLength: 80 },
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label', 'options'],
            properties: { ...choice, type: { const: 'single_choice' }, default: identifier }
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label', 'options'],
            properties: {
              ...choice,
              type: { const: 'multi_choice' },
              default: { type: 'array', maxItems: 64, items: identifier }
            }
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label'],
            properties: { ...fieldBase, type: { const: 'boolean' }, default: { type: 'boolean' } }
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label'],
            properties: {
              ...fieldBase,
              type: { const: 'text' },
              default: { type: 'string', maxLength: 8000 },
              placeholder: { type: 'string', maxLength: 200 },
              minLength: { type: 'integer', minimum: 0, maximum: 8000 },
              maxLength: { type: 'integer', minimum: 1, maximum: 8000 }
            }
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label'],
            properties: {
              ...fieldBase,
              type: { const: 'textarea' },
              default: { type: 'string', maxLength: 32000 },
              placeholder: { type: 'string', maxLength: 200 },
              minLength: { type: 'integer', minimum: 0, maximum: 32000 },
              maxLength: { type: 'integer', minimum: 1, maximum: 32000 }
            }
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label'],
            properties: {
              ...fieldBase,
              type: { const: 'number' },
              default: { type: 'number' },
              min: { type: 'number' },
              max: { type: 'number' },
              step: { type: 'number', exclusiveMinimum: 0 },
              unit: { type: 'string', minLength: 1, maxLength: 40 }
            }
          }
        ]
      }
    }
  }
} as const
