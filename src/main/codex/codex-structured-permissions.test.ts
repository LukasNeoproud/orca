import { describe, expect, it } from 'vitest'
import {
  codexLaunchedPermissions,
  codexStructuredPermissions,
  codexTurnOptionParams,
  readCodexPermissionChoices
} from './codex-structured-permissions'
import { CodexAppServerRequestError } from './codex-app-server-connection'

function connection(requirements: unknown) {
  return { request: async () => ({ requirements }) }
}

describe('structured Codex permissions', () => {
  it('offers every preset when the admin requirements allow them', async () => {
    const choices = await readCodexPermissionChoices(connection(null))
    expect(choices.map((choice) => choice.value)).toEqual([
      'read-only',
      'workspace-write',
      'auto-review',
      'full-access'
    ])
  })

  it.each([
    [{ allowedSandboxModes: ['workspace-write'] }, ['workspace-write', 'auto-review']],
    [{ allowedApprovalPolicies: ['on-request'] }, ['read-only', 'workspace-write', 'auto-review']],
    [{ allowedApprovalsReviewers: ['user'] }, ['read-only', 'workspace-write', 'full-access']],
    [{ allowedPermissionProfiles: { ':workspace': true } }, []]
  ])('narrows the presets to %j', async (requirements, expected) => {
    const choices = await readCodexPermissionChoices(connection(requirements))
    expect(choices.map((choice) => choice.value)).toEqual(expected)
  })

  it('offers nothing on a Codex without configRequirements/read, and asks only once', async () => {
    let calls = 0
    const old = {
      request: async () => {
        calls += 1
        throw new CodexAppServerRequestError('configRequirements/read', -32601, 'not found')
      }
    }
    expect(await readCodexPermissionChoices(old)).toEqual([])
    expect(await readCodexPermissionChoices(old)).toEqual([])
    expect(calls).toBe(1)
  })

  it('waits for the prefetch, then names the preset the thread opened with until the chat picks one', async () => {
    const session = {
      connection: connection(null),
      options: new Map<string, string>(),
      launchedPermissions: codexLaunchedPermissions({
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write'
      })
    }
    expect(codexStructuredPermissions(session)).toBeNull()
    await readCodexPermissionChoices(session.connection)
    expect(codexStructuredPermissions(session)?.current).toBe('workspace-write')
    session.options.set('permissions', 'auto-review')
    expect(codexStructuredPermissions(session)).toMatchObject({
      optionId: 'permissions',
      current: 'auto-review'
    })
  })

  it('expands a pick into turn policy fields and keeps the other options', () => {
    const params = codexTurnOptionParams(
      new Map([
        ['model', 'gpt-5'],
        ['permissions', 'auto-review']
      ]),
      '/work'
    )
    expect(params).toEqual({
      model: 'gpt-5',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: ['/work'],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      }
    })
    expect(codexTurnOptionParams(new Map([['effort', 'high']]), undefined)).toEqual({
      effort: 'high'
    })
  })
})
