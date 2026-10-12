import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveCodexCommand } from '../codex-cli/command'
import {
  openCodexAppServerConnection,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import {
  answerOrcaInteractionElicitation,
  readOrcaInteractionElicitation
} from './codex-interaction-elicitation'
import { orcaInteractionToolResponse, readOrcaInteractionCall } from './codex-orca-interaction'
import { readCodexThreadId, readCodexTurnId } from './codex-structured-thread-facts'
import { openCodexThread } from './codex-structured-thread-open'
import { startCodexTurn } from './codex-structured-turn-start'
import { createCodexDispatchEchoes } from './codex-structured-dispatch-echo'
import { createCodexTurnOpenWaits } from './codex-structured-turn-open-wait'
import {
  encodeOrcaInteractionResult,
  type OrcaInteractionRequest,
  type OrcaInteractionResult,
  type OrcaInteractionValue
} from '../../shared/orca-interaction'
import {
  CODEX_MCP_ELICITATION_METHOD,
  ORCA_INTERACTION_MCP_SERVER
} from '../../shared/orca-interaction-elicitation'

const RUN_REAL_BINARY = process.env.ORCA_RUN_INTERACTIVE_GRILL_REAL_BINARY === '1'
const skillRoot = process.env.ORCA_INTERACTIVE_GRILL_SKILL_ROOT
const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

function waitFor(condition: () => boolean, diagnostic: () => unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false
    const deadline = setTimeout(() => {
      finished = true
      reject(new Error(`Codex handoff timed out: ${JSON.stringify(diagnostic())}`))
    }, 90_000)
    const poll = (): void => {
      if (finished) {
        return
      }
      if (condition()) {
        finished = true
        clearTimeout(deadline)
        resolve()
      } else {
        setTimeout(poll, 50)
      }
    }
    poll()
  })
}

function fixtureValues(request: OrcaInteractionRequest): Record<string, OrcaInteractionValue> {
  const values: Record<string, OrcaInteractionValue> = {}
  for (const field of request.fields) {
    if (field.type === 'single_choice') {
      values[field.id] = field.options[0]!.id
    } else if (field.type === 'multi_choice') {
      values[field.id] = [field.options[0]!.id]
    } else if (field.type === 'boolean') {
      values[field.id] = true
    } else if (field.type === 'text' || field.type === 'textarea') {
      values[field.id] = 'x'.repeat(Math.max(1, field.minLength ?? 1))
    } else if (field.type === 'number') {
      values[field.id] = field.min ?? (field.max !== undefined && field.max < 0 ? field.max : 0)
    }
  }
  return values
}

function fixtureResult(
  request: OrcaInteractionRequest,
  alreadyAnswered: boolean
): OrcaInteractionResult {
  return alreadyAnswered
    ? { status: 'cancelled' }
    : { status: 'submitted', values: fixtureValues(request) }
}

describe('real Codex interactive grill-me handoff', () => {
  it.skipIf(!RUN_REAL_BINARY)(
    'submits a form in new threads and MCP-backed pre-existing threads',
    async () => {
      if (!skillRoot) {
        throw new Error('Set ORCA_INTERACTIVE_GRILL_SKILL_ROOT to an installed grill-me skill root')
      }
      const root = await mkdtemp(join(tmpdir(), 'orca-interactive-grill-'))
      temporaryPaths.push(root)
      const codexHome = join(root, 'codex-home')
      const workspace = join(root, 'workspace')
      await Promise.all([mkdir(codexHome), mkdir(workspace)])
      await copyFile(
        join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'),
        join(codexHome, 'auth.json')
      )
      await writeFile(
        join(codexHome, 'config.toml'),
        `[projects.${JSON.stringify(workspace)}]\ntrust_level = "trusted"\n`
      )
      const skillDestination = join(codexHome, 'skills', 'grill-me')
      await mkdir(skillDestination, { recursive: true })
      await copyFile(join(skillRoot, 'grill-me', 'SKILL.md'), join(skillDestination, 'SKILL.md'))

      const completed = new Set<string>()
      const dynamicCalls: {
        threadId: string
        turnId: string | null
        status: string
        value?: string
      }[] = []
      const mcpCalls: {
        threadId: string
        turnId: string | null
        status: string
        value?: string
      }[] = []
      const providerMessages: { threadId: string; text: string }[] = []
      const turnStatuses: string[] = []
      const serverRequests: string[] = []
      const mcpCompletedItems: Record<string, unknown>[] = []
      const mcpNotifications: { method: string; params: unknown }[] = []
      const mcpStatuses: unknown[] = []
      const sentResponses: string[] = []
      const responseErrors: string[] = []
      const events: {
        threadId: string
        turnId: string | null
        method: string
        itemType?: string
      }[] = []
      const live = { connection: null as CodexAppServerConnection | null }
      const resumedThreadIds = new Set<string>()
      const connect = async (): Promise<CodexAppServerConnection> => {
        live.connection = await openCodexAppServerConnection(
          {
            command: resolveCodexCommand(),
            args: ['app-server'],
            cwd: workspace,
            env: { CODEX_HOME: codexHome }
          },
          {
            onNotification: (method, params) => {
              const record = params as Record<string, unknown>
              const item =
                typeof record.item === 'object' && record.item !== null
                  ? (record.item as Record<string, unknown>)
                  : null
              if (method.toLowerCase().includes('mcp')) {
                mcpNotifications.push({ method, params })
              }
              if (method === 'item/completed' && item?.type === 'mcpToolCall') {
                mcpCompletedItems.push(item)
              }
              events.push({
                threadId: String(record.threadId),
                turnId: readCodexTurnId(params),
                method,
                ...(typeof item?.type === 'string' ? { itemType: item.type } : {})
              })
              if (method === 'turn/completed') {
                const turnId = readCodexTurnId(params)
                if (turnId) {
                  completed.add(turnId)
                }
                turnStatuses.push(JSON.stringify(record.turn ?? record).slice(0, 500))
              }
              if (method === 'item/completed' && item) {
                if (item.type === 'agentMessage' && typeof item.text === 'string') {
                  providerMessages.push({ threadId: String(record.threadId), text: item.text })
                }
              }
            },
            onServerRequest: (request) => {
              const interaction = readOrcaInteractionCall(request.params)
              const elicitation = readOrcaInteractionElicitation(request.params)
              const isOrcaElicitation =
                request.method === CODEX_MCP_ELICITATION_METHOD && elicitation !== null
              serverRequests.push(
                `${request.method}:${interaction || isOrcaElicitation ? 'valid' : 'invalid'}`
              )
              if (isOrcaElicitation) {
                const field = elicitation.request.fields.find(
                  (candidate) => candidate.type === 'single_choice'
                )
                const option = field?.type === 'single_choice' ? field.options[0] : null
                const result = fixtureResult(
                  elicitation.request,
                  mcpCalls.some(
                    (call) =>
                      call.threadId === elicitation.threadId &&
                      call.turnId === elicitation.turnId &&
                      call.status === 'submitted'
                  )
                )
                mcpCalls.push({
                  threadId: elicitation.threadId,
                  turnId: elicitation.turnId,
                  status: result.status,
                  ...(option ? { value: option.id } : {})
                })
                live.connection?.respond(
                  request.id,
                  answerOrcaInteractionElicitation(
                    elicitation.request,
                    encodeOrcaInteractionResult(result)
                  )
                )
                return
              }
              if (request.method !== 'item/tool/call' || !interaction) {
                live.connection?.respondWithError(
                  request.id,
                  -32001,
                  'Only Orca interaction tools are supported in this test'
                )
                return
              }
              const field = interaction.request.fields.find(
                (candidate) => candidate.type === 'single_choice'
              )
              const option = field?.type === 'single_choice' ? field.options[0] : null
              const alreadyAnswered = dynamicCalls.some(
                (call) =>
                  call.threadId === interaction.threadId &&
                  call.turnId === interaction.turnId &&
                  call.status === 'submitted'
              )
              const result = fixtureResult(interaction.request, alreadyAnswered)
              dynamicCalls.push({
                threadId: interaction.threadId,
                turnId: interaction.turnId,
                status: result.status,
                ...(option ? { value: option.id } : {})
              })
              try {
                const response = orcaInteractionToolResponse(
                  interaction.request,
                  encodeOrcaInteractionResult(result)
                )
                setTimeout(() => {
                  sentResponses.push(String(request.id))
                  live.connection?.respond(request.id, response)
                }, 20)
              } catch (error) {
                responseErrors.push(error instanceof Error ? error.message : String(error))
                live.connection?.respondWithError(request.id, -32001, 'Invalid fixture response')
              }
            }
          }
        )
        return live.connection
      }
      const turn = async (
        client: CodexAppServerConnection,
        threadId: string,
        text: string,
        permissions = 'read-only'
      ): Promise<string> => {
        const started = await startCodexTurn(
          {
            connection: client,
            threadId,
            resumedInteractiveChat: resumedThreadIds.has(threadId),
            options: new Map([['permissions', permissions]]),
            dispatchEchoes: createCodexDispatchEchoes(),
            turnOpenWaits: createCodexTurnOpenWaits()
          },
          {
            clientMessageId: randomUUID(),
            body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] },
            timeoutMs: 30_000
          }
        )
        if (!started || !started.turnId) {
          throw new Error('Codex did not identify the turn')
        }
        return started.turnId
      }

      const handoffObserved = (
        threadId: string,
        turnId: string,
        toolItemType: 'dynamicToolCall' | 'mcpToolCall' = 'dynamicToolCall'
      ): boolean => {
        const completedIndex = events.findIndex(
          (event) =>
            event.threadId === threadId &&
            event.turnId === turnId &&
            event.method === 'item/completed' &&
            event.itemType === toolItemType
        )
        return (
          completedIndex !== -1 &&
          events
            .slice(completedIndex + 1)
            .some(
              (event) =>
                event.threadId === threadId &&
                event.turnId === turnId &&
                ((event.method === 'item/started' &&
                  (event.itemType === 'dynamicToolCall' ||
                    event.itemType === 'mcpToolCall' ||
                    event.itemType === 'reasoning' ||
                    event.itemType === 'agentMessage')) ||
                  event.method === 'item/agentMessage/delta' ||
                  event.method.startsWith('item/reasoning/'))
            )
        )
      }
      const diagnostic = (): unknown => ({
        dynamicCalls,
        mcpCalls,
        providerMessages,
        turnStatuses,
        serverRequests,
        mcpCompletedItems,
        mcpNotifications,
        mcpStatuses,
        sentResponses,
        responseErrors,
        events: events.slice(-30)
      })

      try {
        let client = await connect()
        const fresh = await openCodexThread(
          client,
          { cwd: workspace, resumeThreadId: null },
          30_000
        )
        const freshTurnId = await turn(
          client,
          fresh.threadId,
          '$grill-me Chci navrhnout lokální cache vrstvu pro Android. Polož první rozhodovací otázku a po odpovědi pokračuj další závislou otázkou.'
        )
        await waitFor(() => handoffObserved(fresh.threadId, freshTurnId), diagnostic)
        expect(
          dynamicCalls.some(
            (call) => call.threadId === fresh.threadId && call.status === 'submitted'
          )
        ).toBe(true)
        expect(sentResponses.length).toBeGreaterThan(0)
        expect(responseErrors).toEqual([])
        console.info('Verified new-thread dynamic-tool handoff')
        if (!completed.has(freshTurnId)) {
          await client.request('turn/interrupt', { threadId: fresh.threadId, turnId: freshTurnId })
          await waitFor(() => completed.has(freshTurnId), diagnostic)
        }
        expect(await client.close()).toBe(true)

        client = await connect()
        const resumedInteractive = await openCodexThread(
          client,
          { cwd: workspace, resumeThreadId: fresh.threadId },
          30_000
        )
        expect(resumedInteractive.threadId).toBe(fresh.threadId)
        resumedThreadIds.add(fresh.threadId)
        const priorCallCount = dynamicCalls.length
        const resumedInteractiveTurnId = await turn(
          client,
          fresh.threadId,
          '$grill-me Pokračuj dalším rozhodnutím o lokální cache pro Android.'
        )
        await waitFor(() => handoffObserved(fresh.threadId, resumedInteractiveTurnId), diagnostic)
        expect(
          dynamicCalls
            .slice(priorCallCount)
            .some(
              (call) => call.turnId === resumedInteractiveTurnId && call.status === 'submitted'
            ),
          JSON.stringify(diagnostic())
        ).toBe(true)
        if (!completed.has(resumedInteractiveTurnId)) {
          await client.request('turn/interrupt', {
            threadId: fresh.threadId,
            turnId: resumedInteractiveTurnId
          })
          await waitFor(() => completed.has(resumedInteractiveTurnId), diagnostic)
        }
        console.info('Verified resumed dynamic-tool handoff')
        expect(await client.close()).toBe(true)

        client = await connect()
        const legacy = await client.request(
          'thread/start',
          { cwd: workspace },
          { timeoutMs: 30_000 }
        )
        const legacyThreadId = readCodexThreadId(legacy)
        if (!legacyThreadId) {
          throw new Error('Codex did not identify the historical thread')
        }
        const legacyTurnId = await turn(
          client,
          legacyThreadId,
          'Budeme navrhovat lokální cache vrstvu pro Android; zatím jen potvrď kontext.'
        )
        await waitFor(() => completed.has(legacyTurnId), diagnostic)
        expect(await client.close()).toBe(true)

        client = await connect()
        const resumed = await openCodexThread(
          client,
          { cwd: workspace, resumeThreadId: legacyThreadId },
          30_000
        )
        expect(resumed.threadId).toBe(legacyThreadId)
        resumedThreadIds.add(legacyThreadId)
        try {
          mcpStatuses.push(
            await client.request(
              'mcpServerStatus/list',
              {
                threadId: legacyThreadId,
                serverName: ORCA_INTERACTION_MCP_SERVER,
                detail: 'full',
                limit: 100
              },
              { timeoutMs: 30_000 }
            )
          )
        } catch (error) {
          mcpStatuses.push({ error: error instanceof Error ? error.message : String(error) })
        }
        const retainedHistory = (await client.request(
          'thread/read',
          { threadId: legacyThreadId, includeTurns: true },
          { timeoutMs: 30_000 }
        )) as { thread?: { turns?: { id?: string }[] } }
        expect(retainedHistory.thread?.turns).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: legacyTurnId })])
        )
        const resumedTurnId = await turn(
          client,
          resumed.threadId,
          '$grill-me Pokračuj v návrhu cache a polož další rozhodovací otázku.'
        )
        await waitFor(
          () => handoffObserved(legacyThreadId, resumedTurnId, 'mcpToolCall'),
          diagnostic
        )
        expect(dynamicCalls.some((call) => call.threadId === legacyThreadId)).toBe(false)
        expect(
          mcpCalls.some(
            (call) =>
              call.threadId === legacyThreadId &&
              call.turnId === resumedTurnId &&
              call.status === 'submitted'
          ),
          JSON.stringify(diagnostic())
        ).toBe(true)
        if (!completed.has(resumedTurnId)) {
          await client.request('turn/interrupt', {
            threadId: legacyThreadId,
            turnId: resumedTurnId
          })
          await waitFor(() => completed.has(resumedTurnId), diagnostic)
        }
        console.info('Verified legacy-thread MCP handoff and retained history')
        const fullAccessTurnId = await turn(
          client,
          legacyThreadId,
          '$grill-me Polož další navazující rozhodovací otázku o cache. Nic neupravuj.',
          'full-access'
        )
        await waitFor(
          () => handoffObserved(legacyThreadId, fullAccessTurnId, 'mcpToolCall'),
          diagnostic
        )
        expect(
          mcpCalls.some(
            (call) =>
              call.threadId === legacyThreadId &&
              call.turnId === fullAccessTurnId &&
              call.status === 'submitted'
          ),
          JSON.stringify(diagnostic())
        ).toBe(true)
        console.info('Verified full-access legacy-thread MCP handoff')
        if (!completed.has(fullAccessTurnId)) {
          await client.request('turn/interrupt', {
            threadId: legacyThreadId,
            turnId: fullAccessTurnId
          })
          await waitFor(() => completed.has(fullAccessTurnId), diagnostic)
        }
        expect(await client.close()).toBe(true)
        client = await connect()
        await client.request('thread/resume', {
          threadId: legacyThreadId,
          cwd: workspace,
          excludeTurns: true
        })
        const plainResumeTools = await client.request('mcpServerStatus/list', {
          threadId: legacyThreadId,
          serverName: ORCA_INTERACTION_MCP_SERVER,
          detail: 'full',
          limit: 100
        })
        expect(
          (plainResumeTools as { data: { name: string }[] }).data.map((entry) => entry.name)
        ).not.toContain(ORCA_INTERACTION_MCP_SERVER)
      } finally {
        await live.connection?.close()
      }
    },
    420_000
  )
})
