import { describe, expect, it } from 'vitest'
import { CODEX_SESSION_OPTION_CATALOG } from './agent-session-option-catalog-claude-codex'
import type { AgentSessionOptionsResult } from './agent-session-wire'
import {
  applyStructuredAgentSessionOptions,
  canSetStructuredAgentSessionOption,
  commitStructuredAgentSessionOptionValues,
  createStructuredAgentSessionOptionState,
  refreshStructuredAgentSessionOptions,
  structuredAgentSessionOptionReadGuard,
  structuredAgentSessionOptionPicks,
  structuredAgentSessionOptionSnapshot
} from './structured-agent-session-options'

const result: AgentSessionOptionsResult = {
  models: ['first', 'second'].map((id) => ({ id, label: id, isDefault: false, efforts: [] })),
  current: { model: 'first', confirmed: ['serviceTier'] },
  options: [
    {
      id: 'serviceTier',
      label: 'Fast mode',
      category: 'mode',
      currentValue: 'priority',
      choices: [
        { value: 'priority', label: 'On' },
        { value: 'default', label: 'Off' }
      ]
    },
    {
      id: 'permissions',
      label: 'Permissions',
      category: 'mode',
      choices: [
        { value: 'read-only', label: 'Read only' },
        { value: 'workspace-write', label: 'Workspace' }
      ]
    }
  ]
}

function initial() {
  return applyStructuredAgentSessionOptions(
    createStructuredAgentSessionOptionState('codex'),
    CODEX_SESSION_OPTION_CATALOG,
    result
  )
}

function option(state: ReturnType<typeof initial>, id: string) {
  return structuredAgentSessionOptionSnapshot(state).find((entry) => entry.id === id)
}

describe('structured session-wide options', () => {
  it('discards a readback invalidated by a newer option mutation', async () => {
    let state = initial()
    let resolveRead!: (value: AgentSessionOptionsResult) => void
    const read = new Promise<AgentSessionOptionsResult>((resolve) => {
      resolveRead = resolve
    })
    const priorGeneration = structuredAgentSessionOptionReadGuard(state.record, true)
    const refresh = refreshStructuredAgentSessionOptions(
      () => read,
      (apply) => {
        state = apply(state)
      },
      CODEX_SESSION_OPTION_CATALOG,
      state.record,
      priorGeneration
    )
    structuredAgentSessionOptionReadGuard(state.record, true)
    state = commitStructuredAgentSessionOptionValues(state, { serviceTier: 'default' })
    resolveRead(result)
    await refresh
    expect(option(state, 'serviceTier')).toMatchObject({ kind: { currentValue: 'default' } })
  })

  it('offers only provider choices and retains unknown current permissions', () => {
    const state = initial()
    expect(option(state, 'serviceTier')).toMatchObject({
      valueSource: 'reported',
      kind: { currentValue: 'priority' },
      transport: 'agent-session'
    })
    expect(option(state, 'permissions')).toMatchObject({ valueSource: 'unknown' })
    expect(option(state, 'permissions')?.kind).not.toHaveProperty('currentValue')
    expect(canSetStructuredAgentSessionOption(state, 'permissions', 'read-only')).toBe(true)
    expect(canSetStructuredAgentSessionOption(state, 'permissions', 'full-access')).toBe(false)
    expect(canSetStructuredAgentSessionOption(state, 'serviceTier', true)).toBe(false)
    expect(
      canSetStructuredAgentSessionOption({ ...state, pendingId: 'model' }, 'serviceTier', 'default')
    ).toBe(false)
  })

  it('retains a reported custom current state outside the settable choices', () => {
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        ...result,
        options: result.options!.map((entry) =>
          entry.id === 'permissions'
            ? {
                ...entry,
                currentValueLabel: 'Custom',
                currentValueDescription: 'Workspace sandbox · Auto review'
              }
            : entry
        )
      }
    )
    expect(option(state, 'permissions')).toMatchObject({
      valueSource: 'reported',
      currentValueLabel: 'Custom',
      currentValueDescription: 'Workspace sandbox · Auto review'
    })
    expect(option(state, 'permissions')?.kind).not.toHaveProperty('currentValue')
    expect(canSetStructuredAgentSessionOption(state, 'permissions', 'workspace-write')).toBe(true)
    expect(canSetStructuredAgentSessionOption(state, 'permissions', 'Custom')).toBe(false)
  })

  it('retains global picks across model mutations and refreshes from provider reads', () => {
    let state = commitStructuredAgentSessionOptionValues(initial(), { permissions: 'read-only' })
    state = commitStructuredAgentSessionOptionValues(state, { model: 'second' })
    expect(option(state, 'permissions')).toMatchObject({ kind: { currentValue: 'read-only' } })
    expect(option(state, 'serviceTier')).toMatchObject({ kind: { currentValue: 'priority' } })
    state = applyStructuredAgentSessionOptions(state, CODEX_SESSION_OPTION_CATALOG, {
      ...result,
      current: { model: 'second', confirmed: ['permissions'] },
      options: result.options!.map((entry) =>
        entry.id === 'permissions' ? { ...entry, currentValue: 'workspace-write' } : entry
      )
    })
    expect(option(state, 'permissions')).toMatchObject({
      kind: { currentValue: 'workspace-write' },
      valueSource: 'reported'
    })
    state = commitStructuredAgentSessionOptionValues(state, {
      model: 'first',
      serviceTier: 'default',
      permissions: 'read-only',
      unsupported: 'value'
    })
    expect(option(state, 'serviceTier')).toMatchObject({ kind: { currentValue: 'default' } })
    expect(option(state, 'permissions')).toMatchObject({ kind: { currentValue: 'read-only' } })
    expect(option(state, 'unsupported')).toBeUndefined()
    expect(
      structuredAgentSessionOptionPicks(state, {
        serviceTier: 'default',
        permissions: 'read-only'
      })
    ).toEqual([])
  })

  it('removes extras when an older host omits the optional field', () => {
    const { options: _options, ...legacy } = result
    const state = applyStructuredAgentSessionOptions(
      initial(),
      CODEX_SESSION_OPTION_CATALOG,
      legacy
    )
    expect(structuredAgentSessionOptionSnapshot(state).map((entry) => entry.id)).toEqual(['model'])
    expect(canSetStructuredAgentSessionOption(state, 'permissions', 'read-only')).toBe(false)
  })
})
