import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationContinuationSource } from '../../shared/conversation-continuation'
import type {
  CodexAppServerConnection,
  CodexAppServerConnectionHandlers
} from './codex-app-server-connection'
import { CodexAppServerRequestError } from './codex-app-server-request-error'
import {
  CodexContinuationService,
  type CodexContinuationResolvedSource
} from './codex-continuation-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

async function writeRollout(input: {
  path: string
  id: string
  cwd: string
  turnId: string
}): Promise<void> {
  await mkdir(dirname(input.path), { recursive: true })
  await writeFile(
    input.path,
    [
      line({
        timestamp: '2026-09-22T10:00:00.000Z',
        type: 'session_meta',
        payload: { id: input.id, cwd: input.cwd, thread_source: 'user' }
      }),
      line({
        timestamp: '2026-09-22T10:00:01.000Z',
        type: 'event_msg',
        payload: { type: 'task_started', turn_id: input.turnId }
      }),
      line({
        timestamp: '2026-09-22T10:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: input.turnId, completed_at: 1_790_070_402 }
      })
    ].join('')
  )
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orca-codex-continuation-service-'))
  roots.push(root)
  const codexHome = join(root, 'codex-home')
  const cwd = join(root, 'workspace')
  const sourcePath = join(
    codexHome,
    'sessions',
    '2026',
    '09',
    '22',
    'rollout-2026-09-22T10-00-00-source-session.jsonl'
  )
  const candidatePath = join(
    codexHome,
    'sessions',
    '2026',
    '09',
    '22',
    'rollout-2026-09-22T10-02-00-candidate-session.jsonl'
  )
  await mkdir(cwd, { recursive: true })
  await writeRollout({ path: sourcePath, id: 'source-session', cwd, turnId: 'turn-source' })
  await writeRollout({ path: candidatePath, id: 'candidate-session', cwd, turnId: 'turn-compact' })
  const source: ConversationContinuationSource = {
    providerSessionId: 'source-session',
    workspaceId: 'workspace-1'
  }
  const resolved: CodexContinuationResolvedSource = {
    ...source,
    cwd,
    transcriptPath: sourcePath,
    codexHome,
    launch: {
      command: 'codex',
      args: ['-c', 'model_reasoning_effort=high', 'app-server'],
      cwd,
      env: { CODEX_HOME: codexHome }
    }
  }
  return { root, source, resolved, sourcePath, candidatePath }
}

function fakeConnection(input: {
  candidatePath: string
  calls: { method: string; params?: Record<string, unknown> }[]
  onOpen?: () => void
  compactError?: Error
}) {
  return vi.fn(async (_launch, handlers: CodexAppServerConnectionHandlers = {}) => {
    input.onOpen?.()
    const connection: CodexAppServerConnection = {
      pid: 42,
      closed: false,
      request: async (method, params) => {
        input.calls.push({ method, params })
        if (method === 'thread/fork') {
          return { thread: { id: 'candidate-session', path: input.candidatePath } }
        }
        if (method === 'thread/compact/start') {
          if (input.compactError) {
            throw input.compactError
          }
          handlers.onNotification?.('turn/started', {
            threadId: 'candidate-session',
            turn: { id: 'compact-turn' }
          })
          handlers.onNotification?.('item/completed', {
            threadId: 'candidate-session',
            item: { id: 'compact', type: 'contextCompaction' }
          })
          handlers.onNotification?.('turn/completed', {
            threadId: 'candidate-session',
            turn: { id: 'compact-turn', status: 'completed' }
          })
          return {}
        }
        throw new Error(`unexpected method ${method}`)
      },
      notify: vi.fn(),
      respond: vi.fn(),
      respondWithError: vi.fn(),
      close: vi.fn(async () => true)
    }
    return connection
  })
}

async function prepareReadyCandidate() {
  const state = await fixture()
  const calls: { method: string; params?: Record<string, unknown> }[] = []
  const service = new CodexContinuationService({
    userDataPath: state.root,
    resolveSource: async () => state.resolved,
    openConnection: fakeConnection({ candidatePath: state.candidatePath, calls })
  })
  const checkpoint = (await service.inspect(state.source)).checkpoint!
  const candidate = await service.prepareInBackground({
    source: state.source,
    expectedRevision: checkpoint.revision
  })
  await service.settled()
  return { ...state, service, candidate }
}

describe('CodexContinuationService', () => {
  it('forks the completed boundary, compacts it, and never starts a normal turn', async () => {
    const { root, source, resolved, sourcePath, candidatePath } = await fixture()
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const openConnection = fakeConnection({ candidatePath, calls })
    const before = await readFile(sourcePath, 'utf8')
    const service = new CodexContinuationService({
      userDataPath: root,
      resolveSource: async () => resolved,
      openConnection
    })
    const inspection = await service.inspect(source)
    const initial = await service.prepareInBackground({
      source,
      expectedRevision: inspection.checkpoint!.revision
    })
    await service.settled()

    expect(service.status(initial.candidateId)).toMatchObject({
      status: 'ready',
      providerSessionId: 'candidate-session',
      transcriptPath: candidatePath
    })
    expect(calls.map((call) => call.method)).toEqual(['thread/fork', 'thread/compact/start'])
    expect(calls[0]?.params).toEqual({
      threadId: 'source-session',
      lastTurnId: 'turn-source',
      cwd: resolved.cwd,
      excludeTurns: true,
      deferGoalContinuation: true
    })
    expect(calls.some((call) => call.method === 'turn/start')).toBe(false)
    expect(await readFile(sourcePath, 'utf8')).toBe(before)

    const duplicate = await service.prepareInBackground({
      source,
      expectedRevision: inspection.checkpoint!.revision
    })
    expect(duplicate.candidateId).toBe(initial.candidateId)
    expect(openConnection).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      name: 'unsupported method',
      error: new CodexAppServerRequestError('thread/compact/start', -32601, 'Method not found'),
      status: 'failed'
    },
    {
      name: 'confirmed provider refusal',
      error: new CodexAppServerRequestError('thread/compact/start', -32000, 'compact refused'),
      status: 'failed'
    },
    { name: 'disconnect', error: new Error('connection lost'), status: 'unconfirmed' }
  ] as const)('records compact $name as $status without reporting success', async (outcome) => {
    const { root, source, resolved, candidatePath } = await fixture()
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const openConnection = fakeConnection({ candidatePath, calls, compactError: outcome.error })
    const service = new CodexContinuationService({
      userDataPath: root,
      resolveSource: async () => resolved,
      openConnection
    })
    const checkpoint = (await service.inspect(source)).checkpoint!
    const candidate = await service.prepareInBackground({
      source,
      expectedRevision: checkpoint.revision
    })
    await service.settled()
    expect(service.status(candidate.candidateId)).toMatchObject({ status: outcome.status })
    if (outcome.name === 'unsupported method') {
      expect(service.status(candidate.candidateId)?.error).toBe(
        'agent_context_provider_unsupported'
      )
    }
    expect(service.status(candidate.candidateId)?.status).not.toBe('ready')
    expect(calls.map((call) => call.method)).toEqual(['thread/fork', 'thread/compact/start'])

    const duplicate = await service.prepareInBackground({
      source,
      expectedRevision: checkpoint.revision
    })
    expect(duplicate.candidateId).toBe(candidate.candidateId)
    expect(openConnection).toHaveBeenCalledTimes(1)
  })

  it('allows exactly one of two concurrent claims to consume a ready candidate', async () => {
    const { service, candidate } = await prepareReadyCandidate()
    const claims = await Promise.allSettled([
      service.claim(candidate.candidateId),
      service.claim(candidate.candidateId)
    ])

    expect(claims.map((claim) => claim.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(String(claims.find((claim) => claim.status === 'rejected')?.reason)).toContain(
      'conversation_continuation_candidate_already_claimed'
    )
    expect(service.status(candidate.candidateId)?.status).toBe('used')
  })

  it('reuses one candidate for concurrent preparations of the same checkpoint', async () => {
    const { root, source, resolved, candidatePath } = await fixture()
    const calls: { method: string; params?: Record<string, unknown> }[] = []
    const openConnection = fakeConnection({ candidatePath, calls })
    const service = new CodexContinuationService({
      userDataPath: root,
      resolveSource: async () => resolved,
      openConnection
    })
    const checkpoint = (await service.inspect(source)).checkpoint!
    const input = { source, expectedRevision: checkpoint.revision }
    const [first, second] = await Promise.all([
      service.prepareInBackground(input),
      service.prepareInBackground(input)
    ])
    await service.settled()

    expect(second.candidateId).toBe(first.candidateId)
    expect(calls.map((call) => call.method)).toEqual(['thread/fork', 'thread/compact/start'])
    expect(openConnection).toHaveBeenCalledTimes(1)
  })

  it('rejects a ready candidate when the source advances before claim', async () => {
    const { service, candidate, sourcePath } = await prepareReadyCandidate()
    await appendFile(
      sourcePath,
      line({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-next' } }) +
        line({ type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-next' } })
    )

    await expect(service.claim(candidate.candidateId)).rejects.toThrow(
      'conversation_continuation_checkpoint_changed'
    )
    expect(service.status(candidate.candidateId)?.status).toBe('stale')
  })

  it('recovers a persisted preparing state as unconfirmed after restart', async () => {
    const { root, source, resolved } = await fixture()
    const checkpoint = (
      await new CodexContinuationService({
        userDataPath: root,
        resolveSource: async () => resolved
      }).inspect(source)
    ).checkpoint!
    await writeFile(
      join(root, 'conversation-continuation-candidates.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        candidates: [
          {
            candidateId: 'candidate-1',
            source,
            checkpoint,
            status: 'preparing',
            createdAt: '2026-09-22T10:00:00.000Z',
            updatedAt: '2026-09-22T10:00:00.000Z'
          }
        ]
      })}\n`
    )
    const restarted = new CodexContinuationService({
      userDataPath: root,
      resolveSource: async () => resolved
    })
    expect(restarted.status('candidate-1')).toMatchObject({
      status: 'unconfirmed',
      error: expect.stringContaining('restarted')
    })
    await restarted.settled()
  })
})
