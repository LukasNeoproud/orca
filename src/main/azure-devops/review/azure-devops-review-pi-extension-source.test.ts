import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { createContext, runInContext } from 'node:vm'
// TypeScript 7 is a native CLI; transpile tests still need the legacy JavaScript API.
import ts from 'typescript-api'
import { describe, expect, it, vi } from 'vitest'
import { AZURE_DEVOPS_REVIEW_TOOLS } from '../../../shared/azure-devops-review-tools'
import { buildAzureDevOpsReviewPiExtensionSource } from './azure-devops-review-pi-extension-source'

type PiTool = {
  name: string
  label: string
  description: string
  parameters: Record<string, unknown>
  annotations?: Record<string, unknown>
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<{ content: { type: string; text: string }[] }>
}

type FakeChild = EventEmitter & {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
}

type CallTool = (
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) => Promise<unknown>

/** The `tools/call` side of `orca ado mcp` (src/cli/stdio-mcp-server.ts): newline-delimited JSON-RPC. */
function serveTools(child: FakeChild, callTool: CallTool): void {
  const active = new Map<number, AbortController>()
  let buffer = ''
  const reply = (message: Record<string, unknown>): void => {
    child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }
  child.stdin.setEncoding('utf8')
  child.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const message = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (message.method === 'notifications/cancelled') {
        active.get(message.params.requestId)?.abort()
        continue
      }
      const controller = new AbortController()
      active.set(message.id, controller)
      const text = (value: string) => [{ type: 'text', text: value }]
      callTool(message.params.name, message.params.arguments, controller.signal).then(
        (result) => reply({ id: message.id, result: { content: text(JSON.stringify(result)) } }),
        (error: Error) =>
          reply({ id: message.id, result: { content: text(error.message), isError: true } })
      )
    }
  })
  child.stdin.on('end', () => child.emit('close', 0))
}

/** Runs the generated extension against a fake Pi, with `orca ado mcp` served by Orca's own MCP server. */
function loadExtension(options: {
  callTool?: CallTool
  platform?: NodeJS.Platform
  failSpawn?: boolean
}) {
  const callTool = vi.fn<CallTool>(options.callTool ?? (async () => ({ ok: true })))
  const children: FakeChild[] = []
  const spawn = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => {
        child.stdin.end()
      })
    })
    children.push(child)
    if (options.failSpawn) {
      queueMicrotask(() => {
        child.stderr.write('orca: not found\n')
        child.emit('error', new Error('spawn orca ENOENT'))
      })
      return child
    }
    serveTools(child, callTool)
    return child
  })
  const tools = new Map<string, PiTool>()
  const handlers = new Map<string, () => void>()
  const module: { exports: { default?: (pi: unknown) => void } } = {
    exports: {}
  }
  const context = createContext({
    module,
    exports: module.exports,
    process: { platform: options.platform ?? 'darwin' },
    require: (specifier: string) => {
      const modules: Record<string, unknown> = {
        child_process: { spawn },
        fs,
        os,
        path
      }
      if (!(specifier in modules)) {
        throw new Error(`unexpected require(${specifier})`)
      }
      return modules[specifier]
    },
    JSON,
    Map,
    Promise,
    Error
  })
  const output = ts.transpileModule(buildAzureDevOpsReviewPiExtensionSource('orca-dev'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  runInContext(output, context)
  module.exports.default?.({
    registerTool: (tool: PiTool) => tools.set(tool.name, tool),
    on: (name: string, handler: () => void) => handlers.set(name, handler)
  })
  const tool = (name: string): PiTool => {
    const found = tools.get(name)
    if (!found) {
      throw new Error(`tool ${name} was not registered`)
    }
    return found
  }
  return { tools, tool, handlers, spawn, children, callTool }
}

describe('buildAzureDevOpsReviewPiExtensionSource', () => {
  it('declares every review tool with its JSON schema and starts the CLI only on first use', () => {
    const { tools, spawn } = loadExtension({})
    expect([...tools.keys()]).toEqual(AZURE_DEVOPS_REVIEW_TOOLS.map((tool) => tool.name))
    const get = tools.get('ado_get_pull_request')
    expect(get?.parameters).toEqual(AZURE_DEVOPS_REVIEW_TOOLS[1].inputSchema)
    expect(get?.annotations).toEqual({ readOnlyHint: true })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('forwards calls to one `orca ado mcp` process and returns its text', async () => {
    const { tool, spawn, callTool } = loadExtension({
      callTool: async (name, args) => ({ name, args })
    })
    const first = await tool('ado_get_pull_request').execute('call-1', {
      pullRequestKey: 'k+r+1'
    })
    const second = await tool('ado_list_drafts').execute('call-2', {
      pullRequestKey: 'k+r+1'
    })
    expect(JSON.parse(first.content[0].text)).toEqual({
      name: 'ado_get_pull_request',
      args: { pullRequestKey: 'k+r+1' }
    })
    expect(JSON.parse(second.content[0].text).name).toBe('ado_list_drafts')
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith('orca-dev', ['ado', 'mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false
    })
  })

  it('runs the .cmd shim through a shell on Windows', async () => {
    const { tool, spawn } = loadExtension({ platform: 'win32' })
    await tool('ado_list_pull_requests').execute('call-1', {})
    expect(spawn).toHaveBeenCalledWith(
      'orca-dev',
      ['ado', 'mcp'],
      expect.objectContaining({ shell: true })
    )
  })

  it("fails the Pi tool call with Orca's error", async () => {
    const { tool } = loadExtension({
      callTool: async () => {
        throw new Error('Unknown draft d1')
      }
    })
    await expect(tool('ado_delete_draft').execute('call-1', { id: 'd1' })).rejects.toThrow(
      'Unknown draft d1'
    )
  })

  it('cancels the Orca call when Pi aborts the tool', async () => {
    let orcaSignal: AbortSignal | undefined
    const { tool } = loadExtension({
      callTool: (_name, _args, signal) => {
        orcaSignal = signal
        return new Promise(() => {})
      }
    })
    const controller = new AbortController()
    const call = tool('ado_get_pull_request').execute(
      'call-1',
      { pullRequestKey: 'k' },
      controller.signal
    )
    await vi.waitFor(() => expect(orcaSignal).toBeDefined())
    controller.abort()
    await expect(call).rejects.toThrow('Cancelled')
    await vi.waitFor(() => expect(orcaSignal?.aborted).toBe(true))
  })

  it('reports a CLI that cannot start, and starts it again on the next call', async () => {
    const { tool, spawn } = loadExtension({ failSpawn: true })
    await expect(tool('ado_list_pull_requests').execute('call-1', {})).rejects.toThrow(
      '`orca-dev ado mcp` could not start (spawn orca ENOENT): orca: not found'
    )
    await expect(tool('ado_list_pull_requests').execute('call-2', {})).rejects.toThrow()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('saves a result too large for the model and points at the file', async () => {
    const big = 'x'.repeat(60_000)
    const { tool } = loadExtension({ callTool: async () => ({ big }) })
    const result = await tool('ado_get_pull_request').execute('call-1', {
      pullRequestKey: 'k'
    })
    const text = result.content[0].text
    expect(text.length).toBeLessThan(51_000)
    const file = /Read the full JSON from (.+)\]$/.exec(text)?.[1]
    expect(file).toBeDefined()
    expect(JSON.parse(fs.readFileSync(file!, 'utf8'))).toEqual({ big })
    fs.rmSync(path.dirname(file!), { recursive: true, force: true })
  })

  it('stops the CLI when the Pi session ends', async () => {
    const { tool, handlers, children } = loadExtension({})
    await tool('ado_list_pull_requests').execute('call-1', {})
    handlers.get('session_shutdown')?.()
    expect(children[0].kill).toHaveBeenCalled()
  })
})
