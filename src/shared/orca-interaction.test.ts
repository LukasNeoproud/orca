import { describe, expect, it } from 'vitest'
import {
  decodeOrcaInteractionResult,
  encodeOrcaInteractionResult,
  isValidOrcaInteractionResult,
  OrcaInteractionRequestSchema,
  parseOrcaInteractionResult
} from './orca-interaction'

const request = OrcaInteractionRequestSchema.parse({
  title: 'Project setup',
  fields: [
    {
      id: 'platform',
      type: 'single_choice',
      label: 'Platform',
      required: true,
      allowCustom: true,
      options: [
        { id: 'android', label: 'Android', recommended: true },
        { id: 'ios', label: 'iOS' }
      ]
    },
    { id: 'offline', type: 'boolean', label: 'Offline support', default: true },
    { id: 'minSdk', type: 'number', label: 'Minimum SDK', min: 21, max: 36, step: 1 },
    {
      id: 'notes',
      type: 'textarea',
      label: 'Notes',
      minLength: 3,
      maxLength: 100
    }
  ]
})

describe('Orca interaction schema', () => {
  it('keeps recommended distinct from the explicit default', () => {
    const choice = request.fields[0]
    expect(choice).toMatchObject({ type: 'single_choice' })
    expect(choice).not.toHaveProperty('default')
    if (choice?.type === 'single_choice') {
      expect(choice.options[0]).toMatchObject({ id: 'android', recommended: true })
    }
  })

  it('rejects duplicate ids and defaults outside the offered options', () => {
    const parsed = OrcaInteractionRequestSchema.safeParse({
      fields: [
        {
          id: 'storage',
          type: 'single_choice',
          label: 'Storage',
          default: 'cloud',
          options: [
            { id: 'local', label: 'Local' },
            { id: 'local', label: 'Duplicate' }
          ]
        },
        { id: 'storage', type: 'boolean', label: 'Duplicate field' }
      ]
    })

    expect(parsed.success).toBe(false)
  })
})

describe('Orca interaction result validation', () => {
  it('accepts a valid multi-field response and explicit custom answer', () => {
    expect(
      isValidOrcaInteractionResult(request, {
        status: 'submitted',
        values: {
          platform: { type: 'custom', value: 'Desktop' },
          offline: false,
          minSdk: 26,
          notes: 'No cloud dependency'
        }
      })
    ).toBe(true)
  })

  it('rejects missing required, unknown, out-of-range, and invalid-step values', () => {
    expect(isValidOrcaInteractionResult(request, { status: 'submitted', values: {} })).toBe(false)
    expect(
      isValidOrcaInteractionResult(request, {
        status: 'submitted',
        values: { platform: 'android', surprise: true }
      })
    ).toBe(false)
    expect(
      isValidOrcaInteractionResult(request, {
        status: 'submitted',
        values: { platform: 'android', minSdk: 36.5 }
      })
    ).toBe(false)
  })

  it('returns the normalized custom value that passed validation', () => {
    expect(
      parseOrcaInteractionResult(request, {
        status: 'submitted',
        values: { platform: { type: 'custom', value: '  Desktop  ' } }
      })
    ).toEqual({
      status: 'submitted',
      values: { platform: { type: 'custom', value: 'Desktop' } }
    })
  })

  it('round-trips submitted and cancelled results through the prompt answer', () => {
    for (const result of [
      { status: 'submitted' as const, values: { platform: 'android' } },
      { status: 'cancelled' as const }
    ]) {
      expect(decodeOrcaInteractionResult(encodeOrcaInteractionResult(result))).toEqual(result)
    }
  })
})
