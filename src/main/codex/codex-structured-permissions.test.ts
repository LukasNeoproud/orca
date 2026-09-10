import { describe, expect, it, vi } from 'vitest'
import { CodexAppServerRequestError } from './codex-app-server-connection'
import {
  codexPermissionOverrides,
  readCodexPermissionChoices,
  readCodexPermissionsMode
} from './codex-structured-permissions'

describe('structured Codex permissions', () => {
  it('offers presets only after reading host requirements', async () => {
    const connection = { request: vi.fn(async () => ({ requirements: null })) }
    const choices = await readCodexPermissionChoices(connection, 1000)
    expect(choices.map((choice) => choice.value)).toEqual([
      'read-only',
      'workspace-write',
      'full-access'
    ])
    expect(connection.request).toHaveBeenCalledWith(
      'configRequirements/read',
      {},
      { timeoutMs: 1000 }
    )
  })

  it.each([
    [{ allowedSandboxModes: ['workspace-write'] }, ['workspace-write']],
    [{ allowedApprovalPolicies: ['on-request'] }, ['read-only', 'workspace-write']],
    [{ allowedApprovalsReviewers: ['auto_review'] }, []],
    [{ allowedPermissionProfiles: { ':workspace': true } }, []],
    [{ allowedSandboxModes: [] }, []],
    [{ allowedSandboxModes: 'unexpected' }, []]
  ])('honors managed requirements %j', async (requirements, expected) => {
    const choices = await readCodexPermissionChoices({ request: async () => ({ requirements }) })
    expect(choices.map((choice) => choice.value)).toEqual(expected)
  })

  it('does not mistake unavailable requirements for unrestricted access', async () => {
    for (const response of [{}, { requirements: false }]) {
      expect(await readCodexPermissionChoices({ request: async () => response })).toEqual([])
    }
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('disconnected'))
      .mockResolvedValue({ requirements: null })
    const connection = { request }
    expect(await readCodexPermissionChoices(connection)).toEqual([])
    expect(await readCodexPermissionChoices(connection)).toHaveLength(3)
  })

  it('caches only a missing method, scoped to its connection', async () => {
    const request = vi.fn(async () => {
      throw new CodexAppServerRequestError('configRequirements/read', -32601, 'method not found')
    })
    const old = { request }
    expect(await readCodexPermissionChoices(old)).toEqual([])
    expect(await readCodexPermissionChoices(old)).toEqual([])
    expect(request).toHaveBeenCalledOnce()
    expect(
      await readCodexPermissionChoices({ request: async () => ({ requirements: null }) })
    ).toHaveLength(3)
  })

  it.each(['/srv/folder-workspace', 'C:\\work\\folder-workspace'])(
    'scopes workspace writes to the execution host path %s',
    (cwd) => {
      expect(codexPermissionOverrides('workspace-write', cwd)).toEqual({
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [cwd],
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false
        }
      })
    }
  )

  it('refuses unknown modes and missing workspace context', () => {
    expect(() => codexPermissionOverrides('workspace-write', undefined)).toThrow('workspace path')
    expect(() => codexPermissionOverrides('anything', '/workspace')).toThrow('Unknown Codex')
  })

  it('distinguishes effective presets from custom access', () => {
    const workspace = {
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: { type: 'workspaceWrite', writableRoots: ['/workspace'], networkAccess: false }
    }
    expect(readCodexPermissionsMode(workspace, '/workspace')).toBe('workspace-write')
    expect(
      readCodexPermissionsMode(
        {
          ...workspace,
          sandbox: {
            ...workspace.sandbox,
            writableRoots: ['/workspace', '/other']
          }
        },
        '/workspace'
      )
    ).toBeUndefined()
    expect(
      readCodexPermissionsMode({ ...workspace, approvalsReviewer: 'auto_review' }, '/workspace')
    ).toBeUndefined()
    expect(
      readCodexPermissionsMode(
        { ...workspace, activePermissionProfile: { id: 'custom' } },
        '/workspace'
      )
    ).toBeUndefined()
    expect(
      readCodexPermissionsMode(
        {
          approvalPolicy: 'never',
          sandbox: { type: 'dangerFullAccess' },
          activePermissionProfile: { id: ':danger-full-access' }
        },
        '/workspace'
      )
    ).toBe('full-access')
    expect(
      readCodexPermissionsMode(
        {
          approvalPolicy: 'on-request',
          sandbox: { type: 'readOnly', networkAccess: false }
        },
        '/workspace'
      )
    ).toBe('read-only')
    expect(
      readCodexPermissionsMode(
        {
          approvalPolicy: 'on-request',
          sandbox: { type: 'readOnly', access: { type: 'restricted' } }
        },
        '/workspace'
      )
    ).toBeUndefined()
  })
})
