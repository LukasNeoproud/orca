import { describe, expect, it } from 'vitest'
import {
  decodeOrcaInteractionElicitationMessage,
  decodeOrcaInteractionElicitationResponse,
  encodeOrcaInteractionElicitationMessage,
  encodeOrcaInteractionElicitationResponse,
  isOrcaInteractionElicitationRequestedSchema,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
} from './orca-interaction-elicitation'

const request = {
  fields: [{ id: 'answer', type: 'text' as const, label: 'Answer', required: true }]
}

describe('Orca interaction elicitation contract', () => {
  it('round-trips validated requests and answers', () => {
    expect(
      decodeOrcaInteractionElicitationMessage(encodeOrcaInteractionElicitationMessage(request))
    ).toEqual(request)
    const result = { status: 'submitted' as const, values: { answer: 'yes' } }
    expect(
      decodeOrcaInteractionElicitationResponse(
        request,
        encodeOrcaInteractionElicitationResponse(result)
      )
    ).toEqual(result)
  })

  it('rejects malformed and request-incompatible payloads', () => {
    expect(decodeOrcaInteractionElicitationMessage('orca-interaction-v1:{')).toBeNull()
    expect(
      decodeOrcaInteractionElicitationResponse(request, {
        action: 'accept',
        content: encodeOrcaInteractionElicitationResponse({
          status: 'submitted',
          values: { answer: 'yes' }
        })
      })
    ).toBeNull()
  })

  it('recognizes only the exact answer schema', () => {
    expect(
      isOrcaInteractionElicitationRequestedSchema(ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA)
    ).toBe(true)
    expect(
      isOrcaInteractionElicitationRequestedSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        ...ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA,
        properties: {
          answer: {
            type: 'string',
            title: null,
            description: null,
            minLength: null,
            maxLength: null,
            format: null
          }
        }
      })
    ).toBe(true)
    expect(
      isOrcaInteractionElicitationRequestedSchema({
        ...ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA,
        properties: { answer: { type: 'string' }, extra: { type: 'string' } }
      })
    ).toBe(false)
  })
})
