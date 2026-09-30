import { delimiter, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  AgentJournalMessageItem,
  AgentSessionJournalIdentity
} from '../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type {
  CodexAppServerConnection,
  CodexAppServerConnectionHandlers,
  CodexAppServerLaunch,
  openCodexAppServerConnection
} from './codex-app-server-connection'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import {
  ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS,
  ORCA_INTERACT_DYNAMIC_TOOLS
} from './codex-orca-interaction'
import { CODEX_SPAWN_TOKEN_ENV } from './codex-structured-owner-identity'
import { ORCA_STRUCTURED_SESSION_ENV } from '../../shared/structured-session-marker'
import {
  CodexStructuredSessionAdapter,
  type CodexStructuredLaunch,
  type CodexStructuredSessionAdapterDeps,
  type CodexStructuredSessionEvent
} from './codex-structured-session-adapter'
import { codexInteractionMcpConfig } from './codex-interaction-mcp-config'
import { CodexAppServerRequestError } from './codex-app-server-connection'

const THREAD_ID = 'thread-abc'

function identityFor(sessionId: string): AgentSessionJournalIdentity {
  return {
    sessionId,
    workspaceId: 'ws-1',
    hostId: 'host-1',
    agent: 'codex',
    providerHandle: { kind: 'codex', threadId: THREAD_ID }
  }
}

const USER_MESSAGE: AgentJournalMessageItem = {
  kind: 'message',
  role: 'user',
  blocks: [{ type: 'text', text: 'ship it' }]
}

type Route = (params: Record<string, unknown> | undefined) => unknown

function isContextRefreshConfigRead(params: Record<string, unknown> | undefined): boolean {
  return params?.includeLayers === false
}

// `closed` is readonly on the real connection; the fake flips it so a test can
// kill the child at a chosen moment.
type FakeConnection = Omit<CodexAppServerConnection, 'closed'> & {
  closed: boolean
  launch: CodexAppServerLaunch
  handlers: CodexAppServerConnectionHandlers
  calls: { method: string; params?: Record<string, unknown> }[]
  replies: { id: number | string; result?: unknown; code?: number; message?: string }[]
  bridgePrepares: string[]
  closeCount: number
}

/** Stands in for a live `codex app-server`: every RPC is answered from `routes`,
 *  and the test drives Codex's own traffic through `handlers`. */
function fakeCodex(routes: Record<string, Route> = {}): {
  connections: FakeConnection[]
  openConnection: typeof openCodexAppServerConnection
  routes: Record<string, Route>
} {
  const connections: FakeConnection[] = []
  const openConnection = (async (launch, handlers = {}) => {
    const connection: FakeConnection = {
      launch,
      handlers,
      calls: [],
      replies: [],
      bridgePrepares: [],
      closeCount: 0,
      pid: 4321,
      closed: false,
      request: async (method, params) => {
        connection.calls.push({ method, params })
        const route = routes[method]
        return route ? route(params) : {}
      },
      notify: () => {},
      respond: (id, result) => connection.replies.push({ id, result }),
      respondWithError: (id, code, message) => connection.replies.push({ id, code, message }),
      prepareInteractionBridge: async (threadId) => {
        connection.bridgePrepares.push(threadId)
        return {
          ORCA_INTERACTION_SOCKET: '/tmp/orca-interaction.sock',
          ORCA_INTERACTION_TOKEN: 'bridge-token'
        }
      },
      close: async () => {
        connection.closeCount += 1
        connection.closed = true
        return true
      }
    }
    connections.push(connection)
    return connection
  }) as typeof openCodexAppServerConnection
  routes['thread/start'] ??= () => ({
    thread: { id: THREAD_ID, path: '/rollouts/abc.jsonl' },
    model: 'gpt-live',
    reasoningEffort: 'medium'
  })
  routes['thread/resume'] ??= (params) => ({
    thread: { id: (params as { threadId: string }).threadId },
    model: 'gpt-live',
    reasoningEffort: 'medium'
  })
  routes['thread/turns/list'] ??= () => ({ data: [], nextCursor: null })
  return { connections, openConnection, routes }
}

function adapterFor(
  codex: ReturnType<typeof fakeCodex>,
  launch: Partial<CodexStructuredLaunch> = {},
  events: CodexStructuredSessionEvent[] = [],
  processControl: Partial<
    Pick<
      CodexStructuredSessionAdapterDeps,
      'captureTurnProcesses' | 'terminateTurnProcesses' | 'resolveWorkspacePath'
    >
  > = {},
  onStatusMetadataChanged?: (sessionId: string) => void
): CodexStructuredSessionAdapter {
  let acquisitionGeneration = 0
  return new CodexStructuredSessionAdapter({
    resolveLaunch: async () => ({
      command: 'codex',
      args: ['app-server'],
      cwd: '/work/repo',
      codexHome: null,
      resumeThreadId: null,
      ...launch
    }),
    onEvent: (event) => events.push(event),
    openConnection: codex.openConnection,
    readProcessStartTime: async () => 1_700_000_000_000,
    captureTurnProcesses: async () => ({ platform: 'win32', identities: new Map() }),
    terminateTurnProcesses: async () => true,
    now: () => 1_700_000_000_500,
    mintAcquisitionGeneration: () => `generation-${++acquisitionGeneration}`,
    ...(onStatusMetadataChanged ? { onStatusMetadataChanged } : {}),
    ...processControl
  })
}

async function acquired(
  codex: ReturnType<typeof fakeCodex>,
  launch: Partial<CodexStructuredLaunch> = {},
  events: CodexStructuredSessionEvent[] = []
): Promise<CodexStructuredSessionAdapter> {
  const adapter = adapterFor(codex, launch, events)
  await adapter.acquire({ identity: identityFor('session-1'), fence: 7, spawnToken: 'spawn-9' })
  return adapter
}

describe('CodexStructuredSessionAdapter.acquire', () => {
  it('publishes root context and same-connection weekly usage as ephemeral status', async () => {
    const codex = fakeCodex({
      'config/read': () => ({
        config: {
          model_context_window: 200_000,
          model_auto_compact_token_limit: 170_000,
          model_auto_compact_token_limit_scope: 'total'
        },
        origins: {}
      }),
      'account/rateLimits/read': () => ({
        rateLimits: {
          primary: { usedPercent: 12, windowDurationMins: 300 },
          secondary: { usedPercent: 34, windowDurationMins: 10_080, resetsAt: 1_800_000_000 }
        }
      })
    })
    const changed: string[] = []
    const adapter = adapterFor(codex, {}, [], {}, (sessionId) => changed.push(sessionId))
    await adapter.acquire({ identity: identityFor('session-1'), fence: 7, spawnToken: 'spawn-9' })
    await vi.waitFor(() => {
      expect(adapter.codexWeeklyUsage?.('session-1')).toBeDefined()
      expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(170_000)
    })

    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: THREAD_ID,
      tokenUsage: {
        last: { totalTokens: 42_000 },
        total: { totalTokens: 900_000 },
        modelContextWindow: 190_000
      }
    })
    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: 'child-thread',
      tokenUsage: { last: { totalTokens: 99_000 }, modelContextWindow: 100_000 }
    })

    expect(adapter.contextUsage?.('session-1')).toEqual({
      usedTokens: 42_000,
      maxTokens: 190_000,
      autoCompactThresholdTokens: 170_000,
      thresholdSource: 'config',
      thresholdEstimated: true,
      compactScope: 'total',
      stale: false
    })
    expect(adapter.codexWeeklyUsage?.('session-1')).toEqual({
      usedPercent: 34,
      resetsAt: 1_800_000_000_000
    })
    codex.connections[0].handlers.onNotification?.('account/rateLimits/updated', {
      rateLimits: {
        primary: { usedPercent: 18, windowDurationMins: 300 },
        secondary: { usedPercent: 55, windowDurationMins: 10_080 }
      }
    })
    expect(adapter.codexWeeklyUsage?.('session-1')).toEqual({ usedPercent: 55 })
    expect(changed.length).toBeGreaterThanOrEqual(3)
    expect(codex.connections[0].calls.map(({ method }) => method)).toContain(
      'account/rateLimits/read'
    )
  })

  it('invalidates active usage at compaction until the next root snapshot', async () => {
    const codex = fakeCodex({
      'config/read': () => ({
        config: { model_context_window: 100_000, model_auto_compact_token_limit: 80_000 },
        origins: {}
      })
    })
    const adapter = await acquired(codex)
    await vi.waitFor(() =>
      expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(80_000)
    )
    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: THREAD_ID,
      tokenUsage: { last: { totalTokens: 60_000 }, modelContextWindow: 90_000 }
    })
    codex.connections[0].handlers.onNotification?.('thread/compacted', {
      threadId: THREAD_ID,
      turnId: 'turn-1'
    })

    expect(adapter.contextUsage?.('session-1')).toEqual({
      maxTokens: 90_000,
      autoCompactThresholdTokens: 80_000,
      thresholdSource: 'config',
      thresholdEstimated: true,
      stale: true
    })

    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: THREAD_ID,
      tokenUsage: { last: { totalTokens: 5_000 }, modelContextWindow: null }
    })
    expect(adapter.contextUsage?.('session-1')).toEqual({
      usedTokens: 5_000,
      autoCompactThresholdTokens: 80_000,
      thresholdSource: 'config',
      thresholdEstimated: true,
      stale: false
    })
  })

  it('clears old-model context before resolving the replacement model limits', async () => {
    let releaseConfig: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseConfig = resolve
    })
    let reads = 0
    const codex = fakeCodex({
      'config/read': async (params) => {
        if (!isContextRefreshConfigRead(params)) {
          return { config: { developer_instructions: null }, origins: {} }
        }
        reads += 1
        if (reads > 1) {
          await gate
        }
        return {
          config: {
            model_context_window: reads > 1 ? 200_000 : 100_000,
            model_auto_compact_token_limit: reads > 1 ? 160_000 : 80_000
          },
          origins: {}
        }
      }
    })
    const adapter = await acquired(codex)
    await vi.waitFor(() =>
      expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(80_000)
    )
    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: THREAD_ID,
      tokenUsage: { last: { totalTokens: 50_000 }, modelContextWindow: 90_000 }
    })

    codex.connections[0].handlers.onNotification?.('thread/settings/updated', {
      threadId: THREAD_ID,
      threadSettings: { model: 'gpt-next' }
    })
    expect(adapter.contextUsage?.('session-1')).toBeUndefined()

    codex.connections[0].handlers.onNotification?.('thread/tokenUsage/updated', {
      threadId: THREAD_ID,
      tokenUsage: { last: { totalTokens: 10_000 }, modelContextWindow: 150_000 }
    })
    releaseConfig?.()
    await vi.waitFor(() =>
      expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(160_000)
    )
    expect(adapter.contextUsage?.('session-1')).toMatchObject({
      usedTokens: 10_000,
      maxTokens: 150_000
    })
  })

  it('refuses late initial context and quota reads after newer provider updates', async () => {
    let releaseInitialConfig: (() => void) | undefined
    let releaseInitialRate: (() => void) | undefined
    const initialConfig = new Promise<void>((resolve) => (releaseInitialConfig = resolve))
    const initialRate = new Promise<void>((resolve) => (releaseInitialRate = resolve))
    let configReads = 0
    const codex = fakeCodex({
      'config/read': async (params) => {
        if (!isContextRefreshConfigRead(params)) {
          return { config: { developer_instructions: null }, origins: {} }
        }
        configReads += 1
        const read = configReads
        if (read === 1) {
          await initialConfig
        }
        return {
          config: { model_auto_compact_token_limit: read === 1 ? 80_000 : 160_000 },
          origins: {}
        }
      },
      'account/rateLimits/read': async () => {
        await initialRate
        return {
          rateLimits: { secondary: { usedPercent: 34, windowDurationMins: 10_080 } }
        }
      }
    })
    const adapter = await acquired(codex)
    codex.connections[0].handlers.onNotification?.('thread/settings/updated', {
      threadId: THREAD_ID,
      threadSettings: { model: 'gpt-next' }
    })
    codex.connections[0].handlers.onNotification?.('account/rateLimits/updated', {
      rateLimits: { secondary: { usedPercent: 55, windowDurationMins: 10_080 } }
    })
    await vi.waitFor(() =>
      expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(160_000)
    )

    releaseInitialConfig?.()
    releaseInitialRate?.()
    await vi.waitFor(() => expect(configReads).toBe(2))
    expect(adapter.contextUsage?.('session-1')?.autoCompactThresholdTokens).toBe(160_000)
    expect(adapter.codexWeeklyUsage?.('session-1')).toEqual({ usedPercent: 55 })
  })

  it('advertises the MCP fallback on the first turn of a new thread', async () => {
    const codex = fakeCodex({
      'turn/start': () => ({ turn: { id: 'first-turn' } }),
      'thread/start': (params) => {
        if (params?.dynamicTools) {
          throw new CodexAppServerRequestError(
            'thread/start',
            -32602,
            'unknown field `dynamicTools`'
          )
        }
        return { thread: { id: THREAD_ID } }
      }
    })
    const adapter = adapterFor(codex)
    await adapter.acquire({ identity: identityFor('fallback'), fence: 7, spawnToken: 'fallback' })
    await adapter.dispatch({
      sessionId: 'fallback',
      clientMessageId: 'first',
      body: USER_MESSAGE,
      fence: 7
    })
    expect(codex.connections[0].bridgePrepares).toEqual([THREAD_ID])
    expect(
      codex.connections[0].calls.find(({ method }) => method === 'turn/start')?.params
    ).toMatchObject({
      additionalContext: {
        'orca.interactive': { value: ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS }
      }
    })
  })

  it('starts a new thread and reports the process and link the lease will prove', async () => {
    const codex = fakeCodex()
    const adapter = adapterFor(codex, { codexHome: '/codex/home' })

    const acquisition = await adapter.acquire({
      identity: identityFor('session-1'),
      fence: 7,
      spawnToken: 'spawn-9'
    })

    const launchEnv = codex.connections[0].launch.env
    expect(launchEnv).toBeDefined()
    if (!launchEnv) {
      throw new Error('Codex child environment was not provided')
    }
    expect(launchEnv).toEqual({
      [CODEX_SPAWN_TOKEN_ENV]: 'spawn-9',
      CODEX_HOME: '/codex/home',
      [ORCA_STRUCTURED_SESSION_ENV]: '1',
      ORCA_AGENT_SESSION_ID: 'session-1',
      ORCA_USER_DATA_PATH: expect.any(String),
      PATH: expect.any(String)
    })
    expect(launchEnv.PATH?.split(delimiter)).toContain(
      join(launchEnv.ORCA_USER_DATA_PATH, 'cli', 'bin')
    )
    expect(codex.connections[0].launch.cwd).toBe('/work/repo')
    expect(codex.connections[0].calls.find(({ method }) => method === 'thread/start')).toEqual({
      method: 'thread/start',
      params: { cwd: '/work/repo', dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS }
    })
    expect(codex.connections[0].bridgePrepares).toEqual([])
    expect(acquisition.process).toEqual({
      hostId: 'host-1',
      pid: 4321,
      processStartTimeMs: 1_700_000_000_000,
      spawnToken: 'spawn-9'
    })
    expect(acquisition.link).toEqual({
      linkId: `codex-7-${THREAD_ID}`,
      handle: { provider: 'codex', threadId: THREAD_ID },
      origin: 'created',
      mintedAtFence: 7,
      observedAt: 1_700_000_000_500
    })
    expect(acquisition.acquisitionGeneration).toBe('generation-1')
  })

  it('resumes the thread the durable handle chain names, not the client one', async () => {
    const codex = fakeCodex({ 'turn/start': () => ({ turn: { id: 'turn-resumed' } }) })
    const adapter = adapterFor(codex, {
      resumeThreadId: 'thread-proven',
      resumePath: '/rollouts/thread-proven.jsonl'
    })

    const acquisition = await adapter.acquire({
      identity: identityFor('session-1'),
      fence: 9,
      spawnToken: 'spawn-9'
    })

    expect(codex.connections[0].calls.find(({ method }) => method === 'thread/resume')).toEqual({
      method: 'thread/resume',
      params: expect.objectContaining({
        threadId: 'thread-proven',
        cwd: '/work/repo',
        path: '/rollouts/thread-proven.jsonl',
        config: codexInteractionMcpConfig({
          ORCA_INTERACTION_SOCKET: '/tmp/orca-interaction.sock',
          ORCA_INTERACTION_TOKEN: 'bridge-token'
        })
      })
    })
    expect(codex.connections[0].bridgePrepares).toEqual(['thread-proven'])
    expect(acquisition.link.origin).toBe('resumed')
    expect(acquisition.link.handle).toEqual({ provider: 'codex', threadId: 'thread-proven' })
    await expect(
      adapter.dispatch({
        sessionId: 'session-1',
        clientMessageId: 'client-resumed',
        body: USER_MESSAGE,
        fence: 9
      })
    ).resolves.toMatchObject({ state: 'accepted' })
    expect(codex.connections[0].calls.find(({ method }) => method === 'turn/start')).toEqual({
      method: 'turn/start',
      params: expect.objectContaining({
        threadId: 'thread-proven',
        clientUserMessageId: 'client-resumed',
        input: [{ type: 'text', text: 'ship it' }],
        additionalContext: {
          'orca.interactive': {
            kind: 'application',
            value: ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS
          }
        }
      })
    })
  })

  it('restores canonical messages from a metadata-only resume without duplicating a repeat', async () => {
    const codex = fakeCodex({
      'thread/turns/list': () => ({
        data: [
          {
            id: 'turn-restored',
            items: [
              {
                type: 'userMessage',
                id: 'provider-user',
                content: [{ type: 'text', text: 'from terminal' }]
              },
              { type: 'agentMessage', id: 'provider-agent', text: 'same conversation' }
            ]
          }
        ],
        nextCursor: null
      })
    })
    const rows = new Map<string, AgentJournalMessageItem>()
    const appendItem = vi.fn((identity, body) => {
      if (body.kind === 'message') {
        rows.set(agentJournalItemKey(identity), body)
      }
    })
    const sink: StructuredAgentSessionEventSink = {
      appendItem,
      appendTombstone: vi.fn(),
      publish: vi.fn()
    }
    const adapter = adapterFor(codex, { resumeThreadId: 'thread-proven' })
    const acquireInput = {
      identity: identityFor('session-1'),
      fence: 9,
      spawnToken: 'spawn-9',
      events: sink
    }

    await adapter.acquire(acquireInput)
    await adapter.acquire({ ...acquireInput, fence: 10, spawnToken: 'spawn-10' })

    expect([...rows.entries()]).toEqual([
      [
        'codex:thread-proven:turn-restored:0',
        { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'from terminal' }] }
      ],
      [
        'codex:thread-proven:turn-restored:1',
        {
          kind: 'message',
          role: 'assistant',
          blocks: [{ type: 'text', text: 'same conversation' }]
        }
      ]
    ])
    expect(appendItem).toHaveBeenCalledTimes(4)
    expect(codex.connections.flatMap(({ calls }) => calls)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'thread/turns/list',
          params: expect.objectContaining({ threadId: 'thread-proven', itemsView: 'full' })
        })
      ])
    )
  })

  it('refuses a resume that lands on a different thread and reaps the child', async () => {
    const codex = fakeCodex({ 'thread/resume': () => ({ thread: { id: 'thread-other' } }) })
    const adapter = adapterFor(codex, { resumeThreadId: 'thread-proven' })

    await expect(
      adapter.acquire({ identity: identityFor('session-1'), fence: 9, spawnToken: 'spawn-9' })
    ).rejects.toThrow('resumed thread-other instead of thread-proven')
    expect(codex.connections[0].closeCount).toBe(1)
  })

  it('refuses a thread Codex never named', async () => {
    const codex = fakeCodex({ 'thread/start': () => ({}) })
    const adapter = adapterFor(codex)

    await expect(
      adapter.acquire({ identity: identityFor('session-1'), fence: 1, spawnToken: 'spawn-9' })
    ).rejects.toThrow('did not name the thread')
    expect(codex.connections[0].closeCount).toBe(1)
  })

  it('closes the previous child before re-acquiring at a new fence', async () => {
    const codex = fakeCodex()
    const adapter = await acquired(codex)

    await adapter.acquire({ identity: identityFor('session-1'), fence: 8, spawnToken: 'spawn-10' })

    expect(codex.connections).toHaveLength(2)
    expect(codex.connections[0].closeCount).toBe(1)
    expect(codex.connections[1].closeCount).toBe(0)
  })

  it('keeps the traffic Codex sends before the session is published', async () => {
    const codex = fakeCodex()
    const events: CodexStructuredSessionEvent[] = []
    codex.routes['thread/start'] = () => {
      // Codex talks as soon as the child is up, which is before the adapter has
      // a thread id to publish the session under.
      codex.connections[0].handlers.onNotification?.('item/started', { threadId: THREAD_ID })
      codex.connections[0].handlers.onServerRequest?.({
        id: 5,
        method: 'item/commandExecution/requestApproval',
        params: { itemId: 'codex-item-early', threadId: THREAD_ID, turnId: 'turn-1' }
      })
      return { thread: { id: THREAD_ID } }
    }

    const adapter = await acquired(codex, {}, events)

    expect(events.map((event) => event.type)).toEqual(['notification', 'prompt'])
    // The early approval is answerable, so Codex is not left blocked on a
    // request that arrived a moment too soon.
    await adapter.answerPrompt({
      sessionId: 'session-1',
      itemId: 'codex-item-early',
      kind: 'approval',
      optionId: 'accept',
      fence: 7
    })
    expect(codex.connections[0].replies).toEqual([{ id: 5, result: { decision: 'accept' } }])
  })

  it('retries a notification rejected by journal admission instead of dropping it', async () => {
    const codex = fakeCodex()
    const events: CodexStructuredSessionEvent[] = []
    let attempts = 0
    const sink: StructuredAgentSessionEventSink = {
      appendItem: vi.fn(),
      appendTombstone: vi.fn(),
      publish: vi.fn(),
      tryAppendItem: vi.fn((identity, body, blobs) => {
        attempts += 1
        if (attempts === 1) {
          return { accepted: false as const, reason: 'backpressure' as const }
        }
        sink.appendItem(identity, body, blobs)
        return { accepted: true as const }
      })
    }
    const adapter = adapterFor(codex, {}, events)
    await adapter.acquire({
      identity: identityFor('session-1'),
      fence: 7,
      spawnToken: 'spawn-9',
      events: sink
    })

    codex.connections[0].handlers.onNotification?.('item/completed', {
      item: { type: 'agentMessage', id: 'message-1', text: 'hello' }
    })

    await vi.waitFor(() => {
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'notification', method: 'item/completed' })
    })
    expect(attempts).toBe(2)
  })

  it('refuses to publish a session whose child died while it was being acquired', async () => {
    const codex = fakeCodex()
    const adapter = new CodexStructuredSessionAdapter({
      resolveLaunch: async () => ({
        command: 'codex',
        args: ['app-server'],
        cwd: '/work/repo',
        codexHome: null,
        resumeThreadId: null
      }),
      openConnection: codex.openConnection,
      // The child dies while the acquisition is still reading its identity.
      readProcessStartTime: async () => {
        codex.connections[0].closed = true
        return 1_700_000_000_000
      }
    })

    await expect(
      adapter.acquire({ identity: identityFor('session-1'), fence: 7, spawnToken: 'spawn-9' })
    ).rejects.toThrow('exited while being acquired')
    expect(codex.connections[0].closeCount).toBe(1)
    await expect(
      adapter.dispatch({
        sessionId: 'session-1',
        clientMessageId: 'client-1',
        body: USER_MESSAGE,
        fence: 7
      })
    ).rejects.toThrow('no live codex app-server')
  })

  it('classifies launch validation failure as pre-spawn without opening a child', async () => {
    const codex = fakeCodex()
    const adapter = new CodexStructuredSessionAdapter({
      resolveLaunch: async () => {
        throw new Error('workspace no longer exists')
      },
      openConnection: codex.openConnection
    })

    const error = await adapter
      .acquire({ identity: identityFor('session-1'), fence: 7, spawnToken: 'spawn-9' })
      .catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'AgentSessionPreSpawnError',
      message: 'workspace no longer exists'
    })
    expect(codex.connections).toHaveLength(0)
  })

  it('reports the rollout path Codex named, and null when it named none', async () => {
    const withPath = fakeCodex()
    const adapter = await acquired(withPath)
    expect(await adapter.historyFilePath({ identity: identityFor('session-1') })).toBe(
      '/rollouts/abc.jsonl'
    )

    const withoutPath = fakeCodex({ 'thread/start': () => ({ thread: { id: THREAD_ID } }) })
    const bare = await acquired(withoutPath)
    expect(await bare.historyFilePath({ identity: identityFor('session-1') })).toBeNull()
  })

  it('lets closeAll cancel and reap an acquisition still opening', async () => {
    const codex = fakeCodex()
    let releaseOpen = (): void => {}
    let markOpenEntered = (): void => {}
    const gate = new Promise<void>((resolve) => {
      releaseOpen = resolve
    })
    const openEntered = new Promise<void>((resolve) => {
      markOpenEntered = resolve
    })
    const openConnection: typeof openCodexAppServerConnection = async (...args) => {
      markOpenEntered()
      await gate
      return codex.openConnection(...args)
    }
    const adapter = new CodexStructuredSessionAdapter({
      resolveLaunch: async () => ({
        command: 'codex',
        args: ['app-server'],
        cwd: '/work/repo',
        codexHome: null,
        resumeThreadId: null
      }),
      openConnection,
      readProcessStartTime: async () => 1_700_000_000_000
    })
    const acquiring = adapter.acquire({
      identity: identityFor('session-1'),
      fence: 7,
      spawnToken: 'spawn-9'
    })
    await openEntered

    const closing = adapter.closeAll()
    releaseOpen()

    await expect(acquiring).rejects.toThrow('superseded while being acquired')
    await closing
    expect(codex.connections[0]?.closeCount).toBe(1)
  })

  it('fences an acquisition while launch resolution is still pending', async () => {
    const launch = Promise.withResolvers<CodexStructuredLaunch>()
    const codex = fakeCodex()
    const adapter = new CodexStructuredSessionAdapter({
      resolveLaunch: () => launch.promise,
      openConnection: codex.openConnection,
      readProcessStartTime: async () => 1_700_000_000_000
    })
    const acquiring = adapter.acquire({
      identity: identityFor('session-1'),
      fence: 7,
      spawnToken: 'spawn-9'
    })

    const closing = adapter.closeAll()
    launch.resolve({
      command: 'codex',
      args: ['app-server'],
      cwd: '/work/repo',
      codexHome: null,
      resumeThreadId: null
    })

    await expect(acquiring).rejects.toThrow('superseded while being acquired')
    await closing
    expect(codex.connections).toHaveLength(0)
  })
})

describe('CodexStructuredSessionAdapter.forkConversation', () => {
  it('forks at the selected completed turn without dispatching a user turn', async () => {
    const fork = vi.fn(() => ({ thread: { id: 'thread-child' } }))
    const codex = fakeCodex({ 'thread/fork': fork })
    const adapter = adapterFor(codex, {}, [], {
      resolveWorkspacePath: async (workspaceId) => `/work/${workspaceId}`
    })
    await adapter.acquire({
      identity: identityFor('session-1'),
      fence: 7,
      spawnToken: 'spawn-9'
    })

    await expect(
      adapter.forkConversation({
        sourceSessionId: 'session-1',
        targetSessionId: 'session-2',
        targetLocation: {
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'ws-2',
          workspaceKind: 'folder'
        },
        boundaryItemId: agentJournalItemKey({
          provider: 'codex',
          threadId: THREAD_ID,
          turnId: 'turn-selected',
          ordinal: 0
        })
      })
    ).resolves.toEqual({ providerSessionId: 'thread-child' })
    expect(fork).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      lastTurnId: 'turn-selected',
      cwd: '/work/ws-2',
      excludeTurns: true,
      deferGoalContinuation: true
    })
    expect(codex.connections[0]?.calls.some((call) => call.method === 'turn/start')).toBe(false)
  })
})
