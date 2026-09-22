#!/usr/bin/env node
'use strict'

// Hermetic Codex provider for Electron E2E. It is deliberately small, but speaks
// the real JSONL app-server protocol and writes rollout files the app validates.
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const SOURCE_ID =
  process.env.ORCA_E2E_CONTINUATION_CODEX_SESSION_ID || '00000000-0000-4000-8000-000000000001'
const READY = 'ORCA_E2E_CONTINUATION_CODEX_READY'
const COMPACTED = 'ORCA_E2E_CONTINUATION_CODEX_COMPACTED'
const DRAFT = 'ORCA_E2E_CONTINUATION_CODEX_DRAFT'
const OLD = '2020-01-02T03:04:05.000Z'
const SESSION_DATE = ['sessions', '2020', '01', '02']
const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

function record(event, fields = {}) {
  const ledger = process.env.ORCA_E2E_CONTINUATION_CODEX_LEDGER
  if (!ledger) {
    return
  }
  try {
    fs.appendFileSync(ledger, `${JSON.stringify({ event, ...fields, at: Date.now() })}\n`)
  } catch {
    // The app test owns fixture cleanup; an absent ledger must not break the PTY.
  }
}

function isWithin(candidate, root) {
  const resolve = (value) => {
    try {
      return fs.realpathSync.native(value)
    } catch {
      return path.resolve(value)
    }
  }
  const relative = path.relative(resolve(root), resolve(candidate))
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

function home() {
  const isolatedRoot = process.env.ORCA_E2E_HOME_DIR
  if (isolatedRoot) {
    const defaultHome = path.join(isolatedRoot, '.codex')
    const configuredHome = process.env.CODEX_HOME
    const managedHome =
      configuredHome && isWithin(configuredHome, path.dirname(isolatedRoot))
        ? configuredHome
        : undefined
    if (process.argv.includes('app-server') || process.argv.includes('resume')) {
      if (configuredHome && !managedHome) {
        throw new Error('Fixture CODEX_HOME is outside the isolated E2E profile.')
      }
      return managedHome || defaultHome
    }
    return defaultHome
  }
  const defaultHome = path.join(process.env.HOME || process.cwd(), '.codex')
  return process.argv.includes('app-server') ? process.env.CODEX_HOME || defaultHome : defaultHome
}

function rolloutPath(threadId) {
  return path.join(home(), ...SESSION_DATE, `rollout-${threadId}.jsonl`)
}

function writeRollout(threadId, cwd, label) {
  const target = rolloutPath(threadId)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)) {
    return target
  }
  const lines = [
    { timestamp: OLD, type: 'session_meta', payload: { id: threadId, cwd } },
    {
      timestamp: OLD,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: `${label} prompt` }]
      }
    },
    {
      timestamp: OLD,
      type: 'event_msg',
      payload: { type: 'agent_message', message: `${label} completed` }
    },
    {
      timestamp: OLD,
      type: 'event_msg',
      payload: { type: 'task_complete', turn_id: `turn-${threadId}`, completed_at: OLD }
    }
  ]
  fs.writeFileSync(target, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  return target
}

function appendCompletedTurn(threadId, cwd, turnId, prompt) {
  const target = writeRollout(threadId, cwd, 'structured')
  const existing = fs.readFileSync(target, 'utf8')
  if (existing.includes(`"turn_id":"${turnId}"`)) {
    return
  }
  const timestamp = new Date().toISOString()
  const lines = [
    {
      timestamp,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    },
    {
      timestamp,
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'Fixture structured reply.' }
    },
    {
      timestamp,
      type: 'event_msg',
      payload: { type: 'task_complete', turn_id: turnId, completed_at: timestamp }
    }
  ]
  fs.appendFileSync(target, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
}

function readState() {
  const target = path.join(home(), 'orca-e2e-continuation-state.json')
  try {
    return { target, value: JSON.parse(fs.readFileSync(target, 'utf8')) }
  } catch {
    return { target, value: { nextThread: 1 } }
  }
}

function nextThread() {
  const state = readState()
  const id = randomUUID()
  fs.mkdirSync(path.dirname(state.target), { recursive: true })
  fs.writeFileSync(state.target, JSON.stringify(state.value))
  return id
}

function claimOriginalThread() {
  const state = readState()
  if (!state.value.originalStarted) {
    state.value.originalStarted = true
    fs.mkdirSync(path.dirname(state.target), { recursive: true })
    fs.writeFileSync(state.target, JSON.stringify(state.value))
    return SOURCE_ID
  }
  return nextThread()
}

function postHook(payload) {
  const port = process.env.ORCA_AGENT_HOOK_PORT
  const token = process.env.ORCA_AGENT_HOOK_TOKEN
  const paneKey = process.env.ORCA_PANE_KEY
  if (!port || !token || !paneKey) {
    return
  }
  const body = JSON.stringify({
    paneKey,
    tabId: process.env.ORCA_TAB_ID || paneKey.split(':')[0],
    worktreeId: process.env.ORCA_WORKTREE_ID || '',
    env: process.env.ORCA_AGENT_HOOK_ENV || 'development',
    version: process.env.ORCA_AGENT_HOOK_VERSION || '1',
    payload
  })
  const request = http.request(
    {
      hostname: '127.0.0.1',
      port: Number(port),
      path: '/hook/codex',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Orca-Agent-Hook-Token': token
      }
    },
    (response) => response.resume()
  )
  request.on('error', () => undefined)
  request.end(body)
  record('hook', { eventName: payload.hook_event_name, sessionId: payload.session_id || null })
}

function reportTerminalSession(threadId, transcriptPath, prompt) {
  postHook({
    hook_event_name: 'SessionStart',
    session_id: threadId,
    transcript_path: transcriptPath
  })
  postHook({ hook_event_name: 'UserPromptSubmit', session_id: threadId, prompt })
  setTimeout(() => {
    postHook({
      hook_event_name: 'Stop',
      session_id: threadId,
      transcript_path: transcriptPath,
      last_assistant_message: 'Hermetic continuation fixture completed.'
    })
  }, 25).unref()
}

function retainedMarkerPrefix(value, marker) {
  const length = Math.min(value.length, marker.length - 1)
  for (let index = length; index > 0; index -= 1) {
    if (marker.startsWith(value.slice(-index))) {
      return index
    }
  }
  return 0
}

function startTerminalInput(threadId) {
  let buffered = ''
  let insidePaste = false
  let pastedDraft = ''
  const submit = () => record('terminal-submit', { threadId })
  const consumePlain = (plain) => {
    for (const character of plain) {
      if (character === '\r') {
        submit()
      }
    }
  }
  const completeDraft = () => {
    const draft = pastedDraft
    const displayDraft = draft.replace(/\r\n?|\n/g, '\n').replaceAll('\n', '\r\n')
    pastedDraft = ''
    record('terminal-draft', { threadId, text: draft })
    process.stdout.write(`${DRAFT}:${displayDraft}\r\n`)
  }
  process.stdin.setEncoding('utf8')
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true)
    process.once('exit', () => process.stdin.setRawMode?.(false))
  }
  process.stdin.on('data', (chunk) => {
    buffered += String(chunk)
    while (buffered) {
      if (insidePaste) {
        const end = buffered.indexOf(PASTE_END)
        if (end === -1) {
          const retained = retainedMarkerPrefix(buffered, PASTE_END)
          pastedDraft += buffered.slice(0, buffered.length - retained)
          buffered = retained ? buffered.slice(-retained) : ''
          return
        }
        pastedDraft += buffered.slice(0, end)
        buffered = buffered.slice(end + PASTE_END.length)
        insidePaste = false
        completeDraft()
        continue
      }
      const start = buffered.indexOf(PASTE_START)
      if (start === -1) {
        const retained = retainedMarkerPrefix(buffered, PASTE_START)
        consumePlain(buffered.slice(0, buffered.length - retained))
        buffered = retained ? buffered.slice(-retained) : ''
        return
      }
      consumePlain(buffered.slice(0, start))
      buffered = buffered.slice(start + PASTE_START.length)
      insidePaste = true
    }
  })
  process.stdin.resume()
}

function turnPrompt(params) {
  if (!Array.isArray(params.input)) {
    return 'Fixture structured prompt.'
  }
  const text = params.input.flatMap((item) =>
    item && typeof item === 'object' && typeof item.text === 'string' ? [item.text] : []
  )
  return text.join('\n') || 'Fixture structured prompt.'
}

function scheduleProviderTurn({ threadId, turnId, cwd, prompt, compact = false }) {
  setTimeout(() => {
    const notify = (method, params) =>
      process.stdout.write(`${JSON.stringify({ method, params })}\n`)
    notify('turn/started', { threadId, turn: { id: turnId } })
    if (compact) {
      const item = { id: `compact-${turnId}`, type: 'contextCompaction' }
      notify('item/started', { threadId, turnId, item })
      notify('thread/compacted', { threadId, turnId })
      notify('item/completed', { threadId, turnId, item })
    } else {
      const userItem = {
        id: `user-${turnId}`,
        type: 'userMessage',
        content: [{ type: 'text', text: prompt }]
      }
      notify('item/started', { threadId, turnId, item: userItem })
      notify('item/completed', { threadId, turnId, item: userItem })
      const item = {
        id: `message-${turnId}`,
        type: 'agentMessage',
        text: 'Fixture structured reply.'
      }
      notify('item/started', { threadId, turnId, item: { ...item, text: '' } })
      notify('item/agentMessage/delta', { threadId, turnId, itemId: item.id, delta: item.text })
      notify('item/completed', { threadId, turnId, item })
      appendCompletedTurn(threadId, cwd, turnId, prompt)
    }
    notify('turn/completed', { threadId, turn: { id: turnId, status: 'completed' } })
    record(compact ? 'compact-completed' : 'structured-turn-completed', { threadId, turnId })
  }, 0)
}

function startTerminal() {
  const resumeAt = process.argv.indexOf('resume')
  const resuming = resumeAt !== -1
  const original = process.argv.includes('--fixture-original') && Boolean(process.env.ORCA_PANE_KEY)
  const threadId = resuming
    ? process.argv[resumeAt + 1] || SOURCE_ID
    : original
      ? claimOriginalThread()
      : nextThread()
  const transcriptPath = writeRollout(
    threadId,
    process.cwd(),
    threadId === SOURCE_ID ? 'source' : 'resume'
  )
  process.stdout.write(`\x1b]0;Codex\x07${READY}:${threadId}\r\n\x1b[?2004h› `)
  if (resuming) {
    process.stdout.write(`${COMPACTED}:${threadId}\r\n`)
  }
  record('terminal-start', {
    threadId,
    transcriptPath,
    original: threadId === SOURCE_ID,
    resume: resuming,
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    home: home()
  })
  reportTerminalSession(threadId, transcriptPath, `fixture turn for ${threadId}`)
  startTerminalInput(threadId)
}

function appServer() {
  let input = ''
  const send = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`)
  const thread = (id, cwd) => ({ id, path: writeRollout(id, cwd || process.cwd(), id) })
  const result = (id, value) => send({ id, result: value })
  const handle = (message) => {
    const params = message.params || {}
    const cwd = typeof params.cwd === 'string' ? params.cwd : process.cwd()
    record('app-server-request', { method: message.method || null })
    if (message.method === 'initialized') {
      return
    }
    if (message.method === 'initialize') {
      return result(message.id, { serverInfo: { name: 'orca-e2e-codex' } })
    }
    if (message.method === 'thread/fork') {
      const id = nextThread()
      const opened = thread(id, cwd)
      return result(message.id, { thread: opened })
    }
    if (message.method === 'thread/compact/start') {
      const threadId = params.threadId || SOURCE_ID
      const failurePath = process.env.ORCA_E2E_CONTINUATION_CODEX_COMPACT_FAILURE_FILE
      if (failurePath && fs.existsSync(failurePath)) {
        const failureMessage =
          fs.readFileSync(failurePath, 'utf8').trim() || 'fixture compact failure'
        record('compact-failed', { threadId, message: failureMessage })
        return send({ id: message.id, error: { code: -32000, message: failureMessage } })
      }
      const turnId = `turn-${threadId}`
      result(message.id, {})
      scheduleProviderTurn({ threadId, turnId, cwd, prompt: '', compact: true })
      return
    }
    if (message.method === 'thread/start') {
      const id = nextThread()
      const opened = thread(id, cwd)
      return result(message.id, {
        thread: opened,
        model: 'orca-e2e-model',
        reasoningEffort: 'medium'
      })
    }
    if (message.method === 'thread/resume') {
      const opened = thread(params.threadId || SOURCE_ID, cwd)
      return result(message.id, {
        thread: opened,
        model: 'orca-e2e-model',
        reasoningEffort: 'medium'
      })
    }
    if (message.method === 'thread/read') {
      const opened = thread(params.threadId || SOURCE_ID, cwd)
      return result(message.id, { thread: opened, turns: [], items: [] })
    }
    if (message.method === 'turn/start' || message.method === 'thread/turn/start') {
      const threadId = params.threadId || SOURCE_ID
      const turnId = `turn-${threadId}-${Date.now()}`
      result(message.id, { turn: { id: turnId } })
      scheduleProviderTurn({ threadId, turnId, cwd, prompt: turnPrompt(params) })
      return
    }
    if (message.method === 'model/list') {
      return result(message.id, {
        data: [{ id: 'orca-e2e-model', model: 'orca-e2e-model', displayName: 'Orca E2E model' }]
      })
    }
    if (message.method === 'config/read') {
      return result(message.id, {
        config: { model_context_window: 128000, model_auto_compact_token_limit: 96000 },
        origins: {}
      })
    }
    if (message.method === 'configRequirements/read') {
      return result(message.id, { requirements: [] })
    }
    if (message.method === 'thread/turns/list') {
      return result(message.id, { data: [], nextCursor: null })
    }
    if (message.method === 'hooks/list') {
      return result(message.id, { data: [] })
    }
    if (message.method === 'config/batchWrite' || message.method === 'account/rateLimits/read') {
      return result(
        message.id,
        message.method === 'account/rateLimits/read' ? { rateLimits: {} } : {}
      )
    }
    return result(message.id, {})
  }
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    input += String(chunk)
    let newline
    while ((newline = input.indexOf('\n')) !== -1) {
      const line = input.slice(0, newline)
      input = input.slice(newline + 1)
      try {
        if (line.trim()) {
          handle(JSON.parse(line))
        }
      } catch {
        /* malformed input never crashes an E2E provider */
      }
    }
  })
  process.stdin.resume()
}

if (process.argv.includes('--version') || process.argv.includes('-V')) {
  process.stdout.write('codex-cli 0.150.0-orca-e2e\n')
} else if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write('Usage: codex [resume <thread-id>] [app-server]\n')
} else if (process.argv.includes('app-server')) {
  appServer()
} else if (!process.stdin.isTTY || !process.stdout.isTTY || !process.env.ORCA_PANE_KEY) {
  record('ignored-non-tty-invocation', {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    home: home()
  })
} else {
  startTerminal()
}
