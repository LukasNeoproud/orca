import { describe, expect, it, vi } from 'vitest'
import { readNativeSessionOptions } from './structured-agent-session-option-restoration'

describe('native option restoration', () => {
  it('persists only available provider-reported control values alongside model and effort', async () => {
    const restored = await readNativeSessionOptions({
      sessionId: 'session',
      fence: 1,
      priorOptions: { model: 'old', effort: 'low', personality: 'concise' },
      adapter: {
        readOptions: vi.fn(async () => ({
          models: [],
          current: { model: 'current', effort: 'high' },
          options: [
            {
              id: 'serviceTier',
              label: 'Fast',
              currentValue: 'default',
              choices: [{ value: 'default', label: 'Off' }]
            },
            {
              id: 'permissions',
              label: 'Permissions',
              currentValue: 'read-only',
              choices: [{ value: 'read-only', label: 'Read only' }]
            },
            { id: 'custom', label: 'Custom', currentValue: 'unavailable', choices: [] },
            { id: 'unknown', label: 'Unknown', choices: [{ value: 'guessed', label: 'Guessed' }] }
          ]
        }))
      }
    })
    expect(restored).toEqual({
      model: 'current',
      effort: 'high',
      personality: 'concise',
      serviceTier: 'default',
      permissions: 'read-only'
    })
  })

  it('does not reinstate controls whose restore failed', async () => {
    expect(
      await readNativeSessionOptions({
        sessionId: 'session',
        fence: 1,
        priorOptions: { serviceTier: 'priority' },
        adapter: {
          readOptionRestoreFailures: () => ['serviceTier'],
          readOptions: vi.fn(async () => ({
            models: [],
            current: { model: 'current' },
            options: [
              {
                id: 'serviceTier',
                label: 'Fast',
                currentValue: 'priority',
                choices: [{ value: 'priority', label: 'Fast' }]
              }
            ]
          }))
        }
      })
    ).toEqual({ model: 'current' })
  })
})
