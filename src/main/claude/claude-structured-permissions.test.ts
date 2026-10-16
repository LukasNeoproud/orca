import { describe, expect, it } from 'vitest'
import type { ClaudeSession } from './claude-structured-session-state'
import {
  claudeStructuredPermissions,
  observeClaudeInitializePermissionMode,
  observeClaudePermissionModeFrame,
  observeClaudePermissionModeRefusal,
  observeClaudeSettingsPermissionModes
} from './claude-structured-permissions'

type PermissionsSession = Pick<
  ClaudeSession,
  'options' | 'launchedPermissions' | 'reportedPermissionMode' | 'unavailablePermissionModes'
>

function session(overrides: Partial<PermissionsSession> = {}): PermissionsSession {
  return {
    options: new Map(),
    launchedPermissions: { mode: 'default', allowsBypass: false },
    ...overrides
  }
}

const values = (target: PermissionsSession): string[] =>
  claudeStructuredPermissions(target).choices.map((choice) => choice.value)

describe('claudeStructuredPermissions', () => {
  it('offers every mode Claude takes without bypass when launched without it', () => {
    expect(values(session())).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk'])
    expect(claudeStructuredPermissions(session()).current).toBe('default')
  })

  it('keeps bypass on offer for a child launched with it, after it leaves the mode', () => {
    const target = session({
      launchedPermissions: { mode: 'bypassPermissions', allowsBypass: true },
      reportedPermissionMode: 'plan'
    })
    expect(values(target)).toContain('bypassPermissions')
    expect(claudeStructuredPermissions(target).current).toBe('plan')
  })

  it('drops the modes the effective settings disable', () => {
    const target = session({
      launchedPermissions: { mode: 'bypassPermissions', allowsBypass: true }
    })
    observeClaudeSettingsPermissionModes(target, {
      effective: {
        disableAutoMode: 'disable',
        permissions: { disableBypassPermissionsMode: 'disable' }
      }
    })
    target.reportedPermissionMode = 'default'
    expect(values(target)).toEqual(['default', 'acceptEdits', 'plan', 'dontAsk'])
  })

  it('still lists the mode the child reports running even when it is no longer offered', () => {
    const target = session({
      reportedPermissionMode: 'auto',
      unavailablePermissionModes: new Set(['auto'])
    })
    expect(values(target)).toContain('auto')
  })

  it('prefers what the CLI reports over the saved pick', () => {
    const target = session({ options: new Map([['permissionMode', 'plan']]) })
    expect(claudeStructuredPermissions(target).current).toBe('plan')
    observeClaudePermissionModeFrame(target, {
      type: 'system',
      subtype: 'status',
      status: null,
      permissionMode: 'acceptEdits'
    })
    expect(claudeStructuredPermissions(target).current).toBe('acceptEdits')
  })
})

describe('permission mode observers', () => {
  it('ignores frames that are not system frames or name no known mode', () => {
    const target = session()
    observeClaudePermissionModeFrame(target, { type: 'assistant', permissionMode: 'plan' })
    observeClaudePermissionModeFrame(target, { type: 'system', permissionMode: 'yolo' })
    expect(target.reportedPermissionMode).toBeUndefined()
  })

  it('takes the initialize answer only when no frame reported a mode first', () => {
    const target = session()
    observeClaudeInitializePermissionMode(target, { current_permission_mode: 'plan' })
    expect(target.reportedPermissionMode).toBe('plan')
    observeClaudeInitializePermissionMode(target, { current_permission_mode: 'default' })
    expect(target.reportedPermissionMode).toBe('plan')
  })

  it('retires a mode only on the CLI refusing it', () => {
    const target = session()
    observeClaudePermissionModeRefusal(
      target,
      'auto',
      'claude set_permission_mode request timed out'
    )
    expect(target.unavailablePermissionModes).toBeUndefined()
    observeClaudePermissionModeRefusal(
      target,
      'auto',
      'Cannot set permission mode to auto: auto mode disabled by settings'
    )
    expect(values(target)).not.toContain('auto')
  })
})
