import { describe, expect, it, vi } from 'vitest'
import type { CodexAppServerConnection } from './codex-app-server-connection'
import { CodexAcquisitionWindow } from './codex-structured-acquisition-window'
import {
  applyCodexStructuredSessionOption,
  readCodexStructuredSessionOptions,
  reportedCodexThreadOptions,
  restoredCodexSessionOptions,
  readLiveCodexSessionOptions
} from './codex-structured-session-options'
import type { CodexSession } from './codex-structured-session-state'

function optionSession(request: CodexAppServerConnection['request']): CodexSession {
  return {
    connection: {
      pid: 1,
      closed: false,
      request,
      notify: () => {},
      respond: () => {},
      respondWithError: () => {},
      close: async () => true
    },
    ended: false,
    requestedClose: false,
    fence: 1,
    acquisitionGeneration: 'generation-1',
    threadId: 'thread-1',
    historyPath: null,
    prompts: new CodexAcquisitionWindow().prompts,
    options: new Map(),
    reportedOptions: { model: 'gpt-live', effort: 'high' },
    turnIdWaiters: [],
    translator: null
  }
}

describe('structured Codex session options', () => {
  function configurableSession(): CodexSession {
    const session = optionSession(
      vi.fn(async (method: string) =>
        method === 'configRequirements/read'
          ? { requirements: null }
          : {
              data: [
                {
                  model: 'gpt-live',
                  supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
                  serviceTiers: [{ id: 'priority' }]
                },
                {
                  model: 'gpt-standard',
                  supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
                  serviceTiers: []
                }
              ]
            }
      )
    )
    session.cwd = '/workspace'
    session.reportedOptions.serviceTier = null
    session.reportedOptions.permissions = 'workspace-write'
    return session
  }

  it('reads effective Fast and permissions independently of model/effort', async () => {
    const result = await readLiveCodexSessionOptions(configurableSession(), undefined)
    expect(result.options).toEqual([
      expect.objectContaining({ id: 'serviceTier', currentValue: 'default' }),
      expect.objectContaining({ id: 'permissions', currentValue: 'workspace-write' })
    ])
  })

  it('reports a known custom permissions policy separately from settable presets', async () => {
    const session = configurableSession()
    delete session.reportedOptions.permissions
    session.reportedOptions.permissionsCustomDescription = 'Workspace sandbox · Auto review'
    session.connection.request = vi.fn(async (method: string) =>
      method === 'configRequirements/read'
        ? {
            requirements: {
              allowedApprovalsReviewers: ['auto_review'],
              allowedSandboxModes: ['read-only']
            }
          }
        : { data: [{ model: 'gpt-live' }] }
    )
    const option = (await readLiveCodexSessionOptions(session, undefined)).options?.find(
      (entry) => entry.id === 'permissions'
    )
    expect(option).toMatchObject({
      currentValueLabel: 'Custom',
      currentValueDescription: 'Workspace sandbox · Auto review'
    })
    expect(option).not.toHaveProperty('currentValue')
    expect(option?.choices).toEqual([])
  })

  it('selects Auto review, reports it as current, and switches back to user review', async () => {
    const session = configurableSession()
    await applyCodexStructuredSessionOption(session, 'permissions', 'auto-review', undefined)
    expect(session.options.get('permissions')).toBe('auto-review')
    const result = await readLiveCodexSessionOptions(session, undefined)
    expect(result.options).toContainEqual(
      expect.objectContaining({
        id: 'permissions',
        currentValue: 'auto-review',
        choices: expect.arrayContaining([expect.objectContaining({ value: 'auto-review' })])
      })
    )
    await applyCodexStructuredSessionOption(session, 'permissions', 'workspace-write', undefined)
    expect(session.options.get('permissions')).toBe('workspace-write')
  })

  it('rejects Auto review when the host requires user review', async () => {
    const session = configurableSession()
    session.connection.request = vi.fn(async () => ({
      requirements: { allowedApprovalsReviewers: ['user'] }
    }))
    await expect(
      applyCodexStructuredSessionOption(session, 'permissions', 'auto-review', undefined)
    ).rejects.toThrow('does not offer')
    expect(session.options.size).toBe(0)
  })

  it('keeps other advertised tiers available to existing session API callers', async () => {
    const session = configurableSession()
    session.connection.request = vi.fn(async () => ({
      data: [{ model: 'gpt-live', serviceTiers: [{ id: 'priority' }, { id: 'flex' }] }]
    }))
    await expect(
      applyCodexStructuredSessionOption(session, 'serviceTier', 'fast', undefined)
    ).resolves.toEqual({ serviceTier: 'priority' })
    await expect(
      applyCodexStructuredSessionOption(session, 'serviceTier', 'flex', undefined)
    ).resolves.toEqual({ serviceTier: 'flex' })
  })

  it('queues changes for the next turn and preserves global selections across models', async () => {
    const session = configurableSession()
    session.options.set('approvalPolicy', 'on-request')
    session.options.set('approvalsReviewer', 'auto_review')
    await expect(
      applyCodexStructuredSessionOption(session, 'permissions', 'read-only', undefined)
    ).resolves.toEqual({ permissions: 'read-only' })
    await expect(
      applyCodexStructuredSessionOption(session, 'serviceTier', 'priority', undefined)
    ).resolves.toEqual({ permissions: 'read-only', serviceTier: 'priority' })
    await expect(
      applyCodexStructuredSessionOption(session, 'model', 'gpt-live', undefined)
    ).resolves.toMatchObject({
      model: 'gpt-live',
      permissions: 'read-only',
      serviceTier: 'priority'
    })
    expect(
      vi
        .mocked(session.connection.request)
        .mock.calls.every(
          ([method]) => method === 'model/list' || method === 'configRequirements/read'
        )
    ).toBe(true)
  })

  it.each(['priority', 'fast'])(
    'clears %s when the selected model cannot run Fast',
    async (tier) => {
      const session = configurableSession()
      session.reportedOptions.serviceTier = tier
      await expect(
        applyCodexStructuredSessionOption(session, 'model', 'gpt-standard', undefined)
      ).resolves.toEqual({ model: 'gpt-standard', effort: 'low', serviceTier: 'default' })
      expect(
        (await readLiveCodexSessionOptions(session, undefined)).options?.map((option) => option.id)
      ).toEqual(['permissions'])
    }
  )

  it('rejects invalid and managed-disallowed selections without changing session state', async () => {
    const session = configurableSession()
    await expect(
      applyCodexStructuredSessionOption(session, 'serviceTier', 'turbo', undefined)
    ).rejects.toThrow('does not offer')
    await expect(
      applyCodexStructuredSessionOption(session, 'permissions', 'arbitrary', undefined)
    ).rejects.toThrow('does not offer')
    const request = session.connection.request
    session.connection.request = vi.fn(async (method, ...args) =>
      method === 'configRequirements/read'
        ? { requirements: { allowedSandboxModes: ['read-only'] } }
        : request(method, ...args)
    )
    await expect(
      applyCodexStructuredSessionOption(session, 'permissions', 'full-access', undefined)
    ).rejects.toThrow('does not offer')
    expect(session.options.size).toBe(0)
  })

  it('retains model/effort and fast discovery when requirements cannot be read', async () => {
    const session = configurableSession()
    const request = session.connection.request
    session.connection.request = vi.fn(async (method, ...args) => {
      if (method === 'configRequirements/read') {
        throw new Error('unavailable')
      }
      return request(method, ...args)
    })
    const result = await readLiveCodexSessionOptions(session, undefined)
    expect(result.models).toHaveLength(2)
    expect(result.options?.map((option) => option.id)).toEqual(['serviceTier'])
  })

  it.each([
    [{ additionalSpeedTiers: ['fast'] }, true],
    [{ serviceTiers: [], additionalSpeedTiers: ['fast'] }, false],
    [{}, false]
  ])('uses advertised speed capabilities %j', async (capabilities, available) => {
    const result = await readCodexStructuredSessionOptions({
      connection: { request: async () => ({ data: [{ model: 'gpt-live', ...capabilities }] }) },
      current: { model: 'gpt-live', serviceTier: 'fast' }
    })
    expect(result.options?.some((option) => option.id === 'serviceTier') ?? false).toBe(available)
    if (available) {
      expect(result.options?.[0].currentValue).toBe('priority')
    }
  })

  it('distinguishes model-default Fast from explicitly selected standard speed', async () => {
    const session = configurableSession()
    const request = session.connection.request
    session.connection.request = vi.fn(async (method, ...args) => {
      const response = (await request(method, ...args)) as { data?: Record<string, unknown>[] }
      if (response.data) {
        response.data[0].defaultServiceTier = 'priority'
      }
      return response
    })
    expect((await readLiveCodexSessionOptions(session, undefined)).options?.[0].currentValue).toBe(
      'priority'
    )
    expect(session.supportsDefaultServiceTier).toBe(true)
    await applyCodexStructuredSessionOption(session, 'serviceTier', 'default', undefined)
    expect((await readLiveCodexSessionOptions(session, undefined)).options?.[0].currentValue).toBe(
      'default'
    )
  })

  it('filters restored records to recognized turn options', () => {
    expect(
      Object.fromEntries(
        restoredCodexSessionOptions({
          model: 'gpt-live',
          effort: 'high',
          threadId: 'thread-injected',
          input: 'input-injected'
        })
      )
    ).toEqual({ model: 'gpt-live', effort: 'high' })
  })

  it('hydrates paged provider models and their supported efforts', async () => {
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) =>
      params?.cursor
        ? {
            data: [
              {
                model: 'gpt-second',
                displayName: 'GPT Second',
                description: 'Fast',
                hidden: false,
                supportedReasoningEfforts: [
                  { reasoningEffort: 'low', description: 'Quick reasoning' }
                ],
                defaultReasoningEffort: 'low',
                isDefault: false
              }
            ],
            nextCursor: null
          }
        : {
            data: [
              {
                model: 'gpt-live',
                displayName: 'GPT Live',
                hidden: false,
                supportedReasoningEfforts: [
                  { reasoningEffort: 'medium', description: 'Balanced' },
                  { reasoningEffort: 'high', description: 'Deep reasoning' }
                ],
                defaultReasoningEffort: 'medium',
                isDefault: true
              }
            ],
            nextCursor: 'page-2'
          }
    )

    await expect(
      readCodexStructuredSessionOptions({
        connection: { request } as never,
        current: { model: 'gpt-live', effort: 'medium' }
      })
    ).resolves.toEqual({
      models: [
        {
          id: 'gpt-live',
          label: 'GPT Live',
          isDefault: true,
          defaultEffort: 'medium',
          efforts: [
            { value: 'medium', label: 'Medium', description: 'Balanced' },
            { value: 'high', label: 'High', description: 'Deep reasoning' }
          ]
        },
        {
          id: 'gpt-second',
          label: 'GPT Second',
          description: 'Fast',
          isDefault: false,
          defaultEffort: 'low',
          efforts: [{ value: 'low', label: 'Low', description: 'Quick reasoning' }]
        }
      ],
      current: { model: 'gpt-live', effort: 'medium' }
    })
    expect(request).toHaveBeenNthCalledWith(
      2,
      'model/list',
      { limit: 100, includeHidden: false, cursor: 'page-2' },
      { timeoutMs: undefined }
    )
  })

  it('hydrates current values from thread start or resume', () => {
    expect(
      reportedCodexThreadOptions({
        threadId: 'thread-1',
        historyPath: null,
        model: 'gpt-live',
        effort: 'high'
      })
    ).toEqual({ model: 'gpt-live', effort: 'high' })
  })

  it('reconciles an incompatible effort when only the model changes', async () => {
    const session = optionSession(
      vi.fn(async () => ({
        data: [
          {
            model: 'gpt-live',
            supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
            defaultReasoningEffort: 'high'
          },
          {
            model: 'gpt-fast',
            supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
            defaultReasoningEffort: 'low'
          }
        ],
        nextCursor: null
      }))
    )

    await expect(
      applyCodexStructuredSessionOption(session, 'model', 'gpt-fast', undefined)
    ).resolves.toEqual({ model: 'gpt-fast', effort: 'low' })
  })

  it('rejects values absent from the provider catalog', async () => {
    const session = optionSession(
      vi.fn(async () => ({
        data: [{ model: 'gpt-live', supportedReasoningEfforts: [] }],
        nextCursor: null
      }))
    )

    await expect(
      applyCodexStructuredSessionOption(session, 'model', 'not-entitled', undefined)
    ).rejects.toThrow('does not offer model not-entitled')
    await expect(
      applyCodexStructuredSessionOption(session, 'effort', 'high', undefined)
    ).rejects.toThrow('does not support high')
  })
})
