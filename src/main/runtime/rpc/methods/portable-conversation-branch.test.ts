import { describe, expect, it } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { PORTABLE_CONVERSATION_BRANCH_METHODS } from './portable-conversation-branch'

const runtime = { getRuntimeId: () => 'runtime-a' } as unknown as OrcaRuntimeService
const dispatch = (method: string, params: unknown) =>
  new RpcDispatcher({ runtime, methods: PORTABLE_CONVERSATION_BRANCH_METHODS }).dispatch({
    id: 'request',
    authToken: '',
    method,
    params
  })

describe('portable conversation branch RPC contract', () => {
  it('registers every durable operation used by the renderer', () => {
    expect(PORTABLE_CONVERSATION_BRANCH_METHODS.map((method) => method.name)).toEqual([
      'portableConversation.branchPreview',
      'portableConversation.branchPrepare',
      'portableConversation.branchBeginStart',
      'portableConversation.branchCompleteStart',
      'portableConversation.branchResolveTarget',
      'portableConversation.branches',
      'portableConversation.branchResultPrepare',
      'portableConversation.branchResultBegin',
      'portableConversation.branchResultComplete'
    ])
  })

  it('rejects local sources and malformed receipts before touching runtime state', async () => {
    expect(
      await dispatch('portableConversation.branchPreview', {
        source: {
          executionHostId: 'local',
          workspace: { id: 'worktree', path: '/repo', kind: 'git-worktree' },
          provider: { agent: 'codex', sessionId: 'provider' },
          transcriptPath: '/sessions/provider.jsonl'
        },
        anchor: {},
        mode: 'history'
      })
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })

    expect(
      await dispatch('portableConversation.branchCompleteStart', {
        branchId: 'branch',
        attemptId: 'attempt',
        outcome: { kind: 'launched', receipt: { tabId: '' } }
      })
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})
