import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { resolveCodexCommand } from '../codex-cli/command'
import { openCodexThread } from './codex-structured-thread-open'
import { openCodexAppServerConnection } from './codex-app-server-connection'

const RUN_REAL_BINARY = process.env.ORCA_RUN_CODEX_CONTEXT_PLUGIN_REAL_MCP === '1'
const SERVER_NAME = 'orca-context-management'
const temporaryPaths: string[] = []

type McpTool = { name?: unknown; inputSchema?: { required?: unknown } }

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('real Codex context-management MCP plugin', () => {
  it.skipIf(!RUN_REAL_BINARY)(
    'initializes the opt-in stdio server and exposes its tools through app-server',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'orca-context-plugin-mcp-'))
      const codexHome = join(root, 'codex-home')
      const runtimeData = join(root, 'runtime-data')
      const workspace = join(root, 'workspace')
      const marketplaceRoot = join(process.cwd(), 'resources', 'codex-plugins')
      const cliBin = join(process.cwd(), 'out', 'bin')
      temporaryPaths.push(root)
      await Promise.all([
        mkdir(codexHome),
        mkdir(runtimeData),
        mkdir(join(workspace, '.git'), { recursive: true })
      ])
      await writeFile(
        join(codexHome, 'config.toml'),
        [`[projects.${JSON.stringify(workspace)}]`, 'trust_level = "trusted"', ''].join('\n')
      )
      await addContextPluginMarketplace(codexHome, marketplaceRoot)
      const connection = await openCodexAppServerConnection({
        command: resolveCodexCommand(),
        args: ['app-server'],
        cwd: workspace,
        env: {
          CODEX_HOME: codexHome,
          ORCA_USER_DATA_PATH: runtimeData,
          PATH: `${cliBin}${delimiter}${process.env.PATH ?? ''}`
        },
        envToDelete: [
          'ORCA_AGENT_SESSION_ID',
          'ORCA_AGENT_SESSION_SPAWN_TOKEN',
          'ORCA_TERMINAL_HANDLE',
          'ORCA_PANE_KEY'
        ]
      })
      try {
        const thread = await openCodexThread(
          connection,
          { cwd: workspace, resumeThreadId: null },
          30_000
        )
        const tools = await waitForMcpTools(connection, thread.threadId)
        expect(tools.map((tool) => tool.name).sort()).toEqual([
          'cancel_context_request',
          'context_request_status',
          'context_transition_state',
          'request_compact',
          'request_fresh_context'
        ])
        expect(
          tools.find((tool) => tool.name === 'request_compact')?.inputSchema?.required
        ).toEqual(['checkpoint', 'reason', 'continuation'])
        const state = await connection.request(
          'mcpServer/tool/call',
          {
            threadId: thread.threadId,
            server: SERVER_NAME,
            tool: 'context_transition_state',
            arguments: {}
          },
          { timeoutMs: 30_000 }
        )
        expect(JSON.stringify(state)).toContain('must run inside an Orca-owned Codex session')
      } finally {
        await connection.close()
      }
    },
    60_000
  )
})

async function addContextPluginMarketplace(
  codexHome: string,
  marketplaceRoot: string
): Promise<void> {
  const environment = { ...process.env, CODEX_HOME: codexHome }
  const codexCommand = resolveCodexCommand()
  for (const args of [
    ['plugin', 'marketplace', 'add', marketplaceRoot, '--json'],
    ['plugin', 'add', `${SERVER_NAME}@orca-local`, '--json']
  ]) {
    const result = await runProcess({
      program: codexCommand,
      args,
      env: environment,
      timeoutMs: 30_000
    })
    if (result.code !== 0) {
      throw new Error(`Codex ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
    }
  }
}

async function waitForMcpTools(
  connection: {
    request: (
      method: string,
      params?: Record<string, unknown>,
      options?: { timeoutMs?: number }
    ) => Promise<unknown>
  },
  threadId: string
): Promise<McpTool[]> {
  const deadline = Date.now() + 20_000
  let lastStatus: unknown = null
  while (Date.now() < deadline) {
    lastStatus = await connection.request(
      'mcpServerStatus/list',
      { threadId, detail: 'full', limit: 100 },
      { timeoutMs: 10_000 }
    )
    const tools = contextToolsFromStatus(lastStatus)
    if (tools.length > 0) {
      return tools
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Codex did not initialize ${SERVER_NAME}: ${JSON.stringify(lastStatus)}`)
}

function contextToolsFromStatus(status: unknown): McpTool[] {
  if (!isRecord(status) || !Array.isArray(status.data)) {
    return []
  }
  const server = status.data.find((entry) => isRecord(entry) && entry.name === SERVER_NAME)
  if (!isRecord(server) || !isRecord(server.tools)) {
    return []
  }
  return Object.entries(server.tools).map(([name, tool]) => ({
    name,
    inputSchema:
      isRecord(tool) && isRecord(tool.inputSchema)
        ? { required: tool.inputSchema.required }
        : undefined
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
