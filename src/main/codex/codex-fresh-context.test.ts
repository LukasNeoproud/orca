import { describe, expect, it, vi } from 'vitest'
import { codexFreshContextParameters, createCodexFreshContext } from './codex-fresh-context'

const configuration = {
  model: 'source-model',
  reasoningEffort: 'high',
  approvalPolicy: 'on-request',
  approvalsReviewer: 'user',
  modelProvider: 'openai',
  serviceTier: null,
  runtimeWorkspaceRoots: ['/workspace'],
  sandbox: {
    type: 'workspaceWrite',
    writableRoots: ['/workspace', '/extra'],
    networkAccess: false,
    excludeTmpdirEnvVar: true,
    excludeSlashTmp: true
  }
}

describe('fresh Codex context', () => {
  it('preserves exact writable roots, sandbox exclusions, approval, model and reasoning', () => {
    expect(codexFreshContextParameters(configuration, '/workspace')).toMatchObject({
      model: 'source-model',
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      config: {
        model_reasoning_effort: 'high',
        sandbox_workspace_write: {
          writable_roots: ['/workspace', '/extra'],
          network_access: false,
          exclude_tmpdir_env_var: true,
          exclude_slash_tmp: true
        }
      }
    })
  })

  it.each([
    { ...configuration, activePermissionProfile: { id: 'managed-profile' } },
    { ...configuration, sandbox: { type: 'externalSandbox', networkAccess: 'enabled' } },
    { ...configuration, sandbox: { type: 'readOnly', networkAccess: true } },
    { ...configuration, sandbox: { type: 'workspaceWrite', writableRoots: [] } }
  ])('refuses a policy it cannot reproduce instead of widening it', (input) => {
    expect(() => codexFreshContextParameters(input, '/workspace')).toThrow(
      'agent_context_permissions_unsupported'
    )
  })

  it('creates a distinct thread and injects only the handoff without starting a turn', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'thread/fork') {
        return { ...configuration, thread: { id: 'ephemeral' } }
      }
      if (method === 'thread/start') {
        return { thread: { id: 'fresh', path: '/fresh.jsonl' } }
      }
      return {}
    })
    const onCreated = vi.fn(async () => undefined)
    expect(
      await createCodexFreshContext({
        connection: { request } as never,
        sourceThreadId: 'source',
        lastTurnId: 'turn',
        cwd: '/workspace',
        handoff: 'Bounded handoff',
        baseInstructions: 'Persistent instructions',
        timeoutMs: 100,
        onCreated
      })
    ).toEqual({ threadId: 'fresh', transcriptPath: '/fresh.jsonl' })
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'thread/fork',
      'thread/start',
      'thread/inject_items'
    ])
    expect(request).toHaveBeenNthCalledWith(
      2,
      'thread/start',
      expect.objectContaining({ baseInstructions: 'Persistent instructions' }),
      { timeoutMs: 100 }
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      'thread/inject_items',
      {
        threadId: 'fresh',
        items: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Bounded handoff' }]
          }
        ]
      },
      { timeoutMs: 100 }
    )
    expect(onCreated).toHaveBeenCalledWith('fresh', '/fresh.jsonl')
  })
})
