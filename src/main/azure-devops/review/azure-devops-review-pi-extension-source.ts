import { AZURE_DEVOPS_REVIEW_TOOLS } from '../../../shared/azure-devops-review-tools'

// Why: Pi's model sees a tool result whole, so a large pull request is cut and saved in full.
const MAX_RESULT_CHARS = 50_000

/**
 * A Pi extension, loaded for one review launch with `--extension`, that declares the review tools
 * as native Pi tools and forwards each call to `orca ado mcp`. Native tools rather than
 * `pi.registerMcpServer` because an MCP extension such as pi-mcp-adapter disables Pi's own MCP.
 * Plain JavaScript: it runs inside Pi, which loads it with jiti.
 */
export function buildAzureDevOpsReviewPiExtensionSource(cli: string): string {
  return `// Orca review tools for a Pi review agent. Orca rewrites this file; do not edit it.
const CLI = ${JSON.stringify(cli)}
const TOOLS = ${JSON.stringify(AZURE_DEVOPS_REVIEW_TOOLS)}
const MAX_RESULT_CHARS = ${MAX_RESULT_CHARS}

function resultText(result) {
  const content = result && Array.isArray(result.content) ? result.content : []
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\\n')
}

function fitResult(text) {
  if (text.length <= MAX_RESULT_CHARS) {
    return text
  }
  const head = text.slice(0, MAX_RESULT_CHARS)
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orca-ado-')), 'result.json')
    fs.writeFileSync(file, text)
    return head + '\\n[Truncated after ' + MAX_RESULT_CHARS + ' of ' + text.length + ' characters. Read the full JSON from ' + file + ']'
  } catch {
    return head + '\\n[Truncated after ' + MAX_RESULT_CHARS + ' of ' + text.length + ' characters.]'
  }
}

export default function (pi) {
  let server = null

  function startServer() {
    const { spawn } = require('child_process')
    // Why a shell on Windows: the Orca CLI is a .cmd shim there; the arguments are fixed.
    const child = spawn(CLI, ['ado', 'mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32'
    })
    const pending = new Map()
    let stdout = ''
    let stderr = ''
    const current = {
      child,
      pending,
      nextId: 1,
      fail(error) {
        for (const request of pending.values()) {
          request.reject(error)
        }
        pending.clear()
        if (server === current) {
          server = null
        }
      }
    }
    const stopped = (reason) => {
      const detail = stderr.trim().split('\\n').slice(-3).join(' ')
      current.fail(new Error('\`' + CLI + ' ado mcp\` ' + reason + (detail ? ': ' + detail : '')))
    }
    child.on('error', (error) => stopped('could not start (' + error.message + ')'))
    child.on('close', (code) => stopped('exited with code ' + code))
    child.stdin.on('error', () => {})
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      let newline = stdout.indexOf('\\n')
      while (newline !== -1) {
        const line = stdout.slice(0, newline)
        stdout = stdout.slice(newline + 1)
        newline = stdout.indexOf('\\n')
        let message
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        const request = message ? pending.get(message.id) : undefined
        if (!request) {
          continue
        }
        pending.delete(message.id)
        if (message.error) {
          request.reject(new Error(message.error.message || 'Orca request failed'))
        } else {
          request.resolve(message.result)
        }
      }
    })
    server = current
    return current
  }

  function send(current, message) {
    current.child.stdin.write(JSON.stringify(message) + '\\n')
  }

  function callTool(name, args, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new Error('Cancelled'))
        return
      }
      const current = server || startServer()
      const id = current.nextId++
      const onAbort = () => {
        if (current.pending.delete(id)) {
          send(current, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })
          reject(new Error('Cancelled'))
        }
      }
      const detach = () => signal && signal.removeEventListener('abort', onAbort)
      current.pending.set(id, {
        resolve: (value) => {
          detach()
          resolve(value)
        },
        reject: (error) => {
          detach()
          reject(error)
        }
      })
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }
      send(current, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
    })
  }

  for (const tool of TOOLS) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
      async execute(_toolCallId, params, signal) {
        const abortSignal = signal && typeof signal.addEventListener === 'function' ? signal : undefined
        const result = await callTool(tool.name, params || {}, abortSignal)
        const text = resultText(result)
        if (result && result.isError) {
          throw new Error(text || 'The Orca tool failed')
        }
        return { content: [{ type: 'text', text: fitResult(text) }], details: undefined }
      }
    })
  }

  pi.on('session_shutdown', () => {
    const current = server
    server = null
    if (current) {
      current.fail(new Error('The Pi session ended'))
      current.child.kill()
    }
  })
}
`
}
