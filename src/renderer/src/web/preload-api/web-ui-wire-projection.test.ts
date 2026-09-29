import { describe, expect, it } from 'vitest'
import { getPairingSafeUiUpdates } from './web-ui-wire-projection'

describe('getPairingSafeUiUpdates', () => {
  it('maps the desktop-only manager view for older paired hosts', () => {
    expect(getPairingSafeUiUpdates({ activeView: 'agent-manager', sidebarWidth: 280 })).toEqual({
      activeView: 'terminal',
      sidebarWidth: 280
    })
  })

  it('preserves established paired views', () => {
    expect(getPairingSafeUiUpdates({ activeView: 'tasks' })).toEqual({ activeView: 'tasks' })
  })
})
