import { describe, expect, it } from 'vitest'
import {
  dispatchedStructuredPermissions,
  structuredPermissionsDescriptor
} from './structured-agent-session-permissions'

const permissions = {
  optionId: 'permissionMode',
  current: 'default',
  choices: [
    { value: 'default', label: 'Ask' },
    { value: 'auto', label: 'Auto' }
  ]
}

describe('structured chat permission picker', () => {
  it('shows the host-reported posture as a settable mode select', () => {
    expect(structuredPermissionsDescriptor(permissions)).toMatchObject({
      id: 'permissionMode',
      category: 'mode',
      kind: { type: 'select', currentValue: 'default' },
      valueSource: 'reported',
      transport: 'agent-session',
      settable: true
    })
  })

  it('shows a pick at once as sent, not yet reported', () => {
    expect(
      structuredPermissionsDescriptor(dispatchedStructuredPermissions(permissions, 'auto'))
    ).toMatchObject({ kind: { currentValue: 'auto' }, valueSource: 'dispatched' })
  })

  it('shows nothing for a host without permission postures', () => {
    expect(structuredPermissionsDescriptor(undefined)).toBeNull()
    expect(structuredPermissionsDescriptor({ ...permissions, choices: [] })).toBeNull()
  })
})
