import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentContextTransitionRequest } from '../../shared/agent-context-transition'
import type { ResolvedCodexContinuationSource } from '../codex/codex-continuation-source'
import type { OrcaRuntimeService } from './orca-runtime'

const boundaryMocks = vi.hoisted(() => ({
  current: vi.fn(async () => true),
  host: null as Record<string, unknown> | null
}))

vi.mock('./agent-context-binding', () => ({
  agentContextBindingIsCurrent: boundaryMocks.current
}))
vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => boundaryMocks.host
}))

import { captureAgentContextTarget, inspectAgentContextBoundary } from './agent-context-boundary'

const roots: string[] = []
const line = (value: unknown) => `${JSON.stringify(value)}\n`

async function transcriptFixture(): Promise<{
  source: ResolvedCodexContinuationSource
  transcript: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'orca-context-boundary-'))
  roots.push(root)
  const codexHome = join(root, 'codex-home')
  const transcript = join(
    codexHome,
    'sessions',
    '2026',
    '09',
    '23',
    'rollout-2026-09-23T10-00-00-provider-session.jsonl'
  )
  const cwd = join(root, 'workspace')
  await mkdir(dirname(transcript), { recursive: true })
  await mkdir(cwd)
  await writeFile(
    transcript,
    [
      line({ type: 'session_meta', payload: { id: 'provider-session', cwd } }),
      line({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } }),
      line({ type: 'event_msg', payload: { type: 'user_message', message: 'Do it' } })
    ].join('')
  )
  return {
    transcript,
    source: {
      providerSessionId: 'provider-session',
      workspaceId: 'workspace',
      cwd,
      transcriptPath: transcript,
      codexHome
    }
  }
}

function runtime(source: ResolvedCodexContinuationSource) {
  type PaneSnapshot = {
    agentType?: string
    providerSession?: { id: string }
    state?: string
    interrupted?: boolean
    restoredUnconfirmed?: boolean
    subagents?: { state: string }[]
  }
  const value = {
    resolveConversationContinuationSource: vi.fn(async () => source),
    getAgentContextPaneSnapshot: vi.fn((): PaneSnapshot => ({
      agentType: 'codex',
      providerSession: { id: source.providerSessionId },
      state: 'done',
      interrupted: false,
      restoredUnconfirmed: false,
      subagents: []
    })),
    isConversationContinuationBusy: vi.fn(() => false)
  }
  return value as typeof value & OrcaRuntimeService
}

function request(
  target: Awaited<ReturnType<typeof captureAgentContextTarget>>
): AgentContextTransitionRequest {
  return {
    requestId: 'request-1',
    target,
    input: {
      mode: 'compact',
      reason: 'Topic complete',
      checkpoint: {
        goal: 'Finish',
        completed: 'Done',
        decisions: [],
        constraints: [],
        changes: [],
        verification: [],
        openQuestions: []
      },
      continuation: 'wait-for-user'
    },
    status: 'queued',
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z'
  }
}

afterEach(async () => {
  boundaryMocks.current.mockReset().mockResolvedValue(true)
  boundaryMocks.host = null
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('agent context boundary', () => {
  it('captures the active provider turn and becomes ready only for its exact completion', async () => {
    const { source, transcript } = await transcriptFixture()
    const owner = runtime(source)
    const target = await captureAgentContextTarget(owner, {
      workspaceId: 'workspace',
      providerSessionId: 'provider-session',
      sourceGeneration: 'pty-1',
      terminalHandle: 'terminal-1',
      paneKey: 'tab:leaf'
    })
    expect(target).toMatchObject({ turnId: 'turn-1', userMessageCount: 1 })
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({ timestamp: '2026-09-23T10:01:00.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } })}`
    )

    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toMatchObject({
      status: 'ready',
      revision: expect.any(String)
    })
  })

  it('rejects new input, owner generation changes, and positive stop evidence', async () => {
    const { source, transcript } = await transcriptFixture()
    const owner = runtime(source)
    const target = await captureAgentContextTarget(owner, {
      workspaceId: 'workspace',
      providerSessionId: 'provider-session',
      sourceGeneration: 'pty-1',
      terminalHandle: 'terminal-1',
      paneKey: 'tab:leaf'
    })
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({ type: 'event_msg', payload: { type: 'user_message', message: 'Changed scope' } })}`
    )
    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toMatchObject({
      status: 'stale',
      errorCode: 'agent_context_new_input'
    })

    boundaryMocks.current.mockResolvedValueOnce(false)
    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toMatchObject({
      status: 'stale',
      errorCode: 'agent_context_owner_changed'
    })

    const stoppedTarget = { ...target, userMessageCount: 2 }
    owner.getAgentContextPaneSnapshot.mockReturnValue({ interrupted: true })
    await expect(inspectAgentContextBoundary(owner, request(stoppedTarget))).resolves.toEqual({
      status: 'stopped'
    })
  })

  it('requires a verifiable frontier and waits for working subagents', async () => {
    const { source, transcript } = await transcriptFixture()
    const owner = runtime(source)
    const target = await captureAgentContextTarget(owner, {
      workspaceId: 'workspace',
      providerSessionId: 'provider-session',
      sourceGeneration: 'pty-1',
      terminalHandle: 'terminal-1',
      paneKey: 'tab:leaf'
    })
    await writeFile(
      transcript,
      `${await readFile(transcript, 'utf8')}${line({ timestamp: '2026-09-23T10:01:00.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } })}{"broken"`
    )
    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toEqual({
      status: 'unverifiable',
      errorCode: 'agent_context_input_unverifiable'
    })

    owner.getAgentContextPaneSnapshot.mockReturnValue({
      state: 'done',
      interrupted: false,
      restoredUnconfirmed: false,
      subagents: [{ state: 'working' }]
    })
    await writeFile(transcript, (await readFile(transcript, 'utf8')).replace('{"broken"', ''))
    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toEqual({
      status: 'waiting'
    })
  })

  it('waits for structured pending submissions and captures their journal frontier', async () => {
    const { source } = await transcriptFixture()
    const owner = runtime(source)
    const snapshot = {
      submissions: [{ dispatchState: 'pending' }],
      items: []
    }
    boundaryMocks.host = {
      journalSnapshot: vi.fn(() => snapshot),
      flushStreamedEvents: vi.fn(async () => {}),
      deps: { adapter: {}, store: {} }
    }
    const target = await captureAgentContextTarget(owner, {
      workspaceId: 'workspace',
      providerSessionId: 'provider-session',
      sourceGeneration: 'native:1',
      sessionId: 'session-1'
    })
    expect(target.journalUserMessageCount).toBe(1)
    await expect(inspectAgentContextBoundary(owner, request(target))).resolves.toEqual({
      status: 'waiting'
    })
  })
})
