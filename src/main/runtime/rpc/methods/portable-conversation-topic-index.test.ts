import { describe, expect, it } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { PORTABLE_CONVERSATION_TOPIC_INDEX_METHODS } from './portable-conversation-topic-index'

const runtime = { getRuntimeId: () => 'runtime-a' } as unknown as OrcaRuntimeService
const dispatch = (method: string, params: unknown) =>
  new RpcDispatcher({ runtime, methods: PORTABLE_CONVERSATION_TOPIC_INDEX_METHODS }).dispatch({
    id: 'request',
    authToken: '',
    method,
    params
  })

describe('portable conversation topic index RPC contract', () => {
  it('registers read/continuation and revision-fenced write methods', () => {
    expect(PORTABLE_CONVERSATION_TOPIC_INDEX_METHODS.map((method) => method.name)).toEqual([
      'portableConversation.topicIndex',
      'portableConversation.writeTopicIndex'
    ])
  })

  it('rejects local sources and malformed manual indices before runtime access', async () => {
    const source = {
      executionHostId: 'local',
      workspace: { id: 'worktree', path: '/repo', kind: 'git-worktree' },
      provider: { agent: 'codex', sessionId: 'provider' },
      transcriptPath: '/sessions/provider.jsonl'
    }
    expect(await dispatch('portableConversation.topicIndex', { source })).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(
      await dispatch('portableConversation.writeTopicIndex', {
        source: { ...source, executionHostId: 'ssh:host-a' },
        expectedRevision: 0,
        index: { sessionId: 'portable-session', revision: 1, automatic: true, chapters: [{}] }
      })
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})
