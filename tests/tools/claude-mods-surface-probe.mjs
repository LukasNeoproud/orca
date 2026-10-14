#!/usr/bin/env node
// Drives the Claude Code remote-surface (`ui_*`) control protocol headlessly against the
// fixture mods and logs every frame, so the wire shapes the app relies on can be re-checked
// after a CLI update. Not shipped. Usage:
//   node tests/tools/claude-mods-surface-probe.mjs [--claude <path>] [--out <file.jsonl>]
import { query } from '@anthropic-ai/claude-agent-sdk'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = import.meta.dirname
const fixtures = path.resolve(here, '../fixtures/claude-mods')
const args = process.argv.slice(2)
const argValue = (name) => {
  const index = args.indexOf(name)
  return index !== -1 ? args[index + 1] : undefined
}
const claudePath = argValue('--claude') ?? 'claude'
const outFile = argValue('--out')
const scenario = argValue('--scenario') ?? 'hello-tabs'
const defaultPlugins = scenario === 'transcript' ? 'transcript-marks,spinner-word' : 'hello-tabs'
const pluginNames = (argValue('--plugins') ?? defaultPlugins).split(',')
if (outFile) {
  writeFileSync(outFile, '')
}

const t0 = Date.now()
function log(kind, payload) {
  const line = JSON.stringify({ t: Date.now() - t0, kind, payload })
  console.log(line.length > 4000 ? `${line.slice(0, 4000)}…` : line)
  if (outFile) {
    appendFileSync(outFile, `${line}\n`)
  }
}

let pushInput
const inputQueue = []
async function* input() {
  while (true) {
    if (inputQueue.length > 0) {
      yield inputQueue.shift()
      continue
    }
    await new Promise((resolve) => {
      pushInput = resolve
    })
  }
}
function sendUser(text) {
  inputQueue.push({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
    parent_tool_use_id: null,
    session_id: ''
  })
  pushInput?.()
}

const cwd = mkdtempSync(path.join(tmpdir(), 'mods-probe-'))
const q = query({
  prompt: input(),
  options: {
    cwd,
    pathToClaudeCodeExecutable: claudePath,
    plugins: pluginNames.map((name) => ({ type: 'local', path: path.join(fixtures, name) })),
    settingSources: ['user'],
    permissionMode: 'default',
    canUseTool: async (toolName, toolInput) => {
      log('can_use_tool', { toolName, toolInput })
      return { behavior: 'deny', message: 'probe denies tools' }
    },
    stderr: (data) => log('stderr', data.trim())
  }
})

const waiters = []
function waitFor(predicate, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for frame')), timeoutMs)
    waiters.push((message) => {
      if (predicate(message)) {
        clearTimeout(timer)
        resolve(message)
        return true
      }
      return false
    })
  })
}

;(async () => {
  for await (const message of q) {
    log('message', message)
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i](message)) {
        waiters.splice(i, 1)
      }
    }
  }
  log('end', null)
})().catch((error) => log('iterator_error', String(error)))

async function request(body) {
  log('request', body)
  try {
    const response = await q.request(body)
    log('response', { subtype: body.subtype, response: response?.response ?? response })
    return response?.response ?? response
  } catch (error) {
    log('request_error', { subtype: body.subtype, error: String(error?.message ?? error) })
    return null
  }
}

const isSystem = (subtype) => (m) => m.type === 'system' && m.subtype === subtype
const SURFACE = { surface: 'desktop', client_id: 'orca.probe' }
const viewport = { columns: 60, rows: 30, isFullscreen: true }

function findPress(tree, key) {
  if (!tree || typeof tree !== 'object') {
    return null
  }
  if (tree.props?.key === key && tree.press) {
    return tree.press
  }
  for (const child of tree.props?.children ?? tree.children ?? []) {
    const found = findPress(child, key)
    if (found) {
      return found
    }
  }
  return null
}

async function render(component, instanceId) {
  return request({
    subtype: 'ui_render',
    component,
    instance_id: instanceId,
    props: {},
    viewport,
    ...SURFACE
  })
}

async function scrollLog() {
  const panes = waitFor(isSystem('ui_panes')).catch(() => null)
  sendUser('/scroll-log')
  await panes
  const answer = await request({
    subtype: 'ui_render',
    component: 'Pane',
    instance_id: 'scroll-log',
    props: {},
    viewport,
    content_rows: 31,
    keyed: Array.from({ length: 30 }, (_, i) => ({
      plugin: 'scroll-log',
      key: `row-${i + 1}`,
      top: i + 1,
      bottom: i + 2
    })),
    ...SURFACE
  })
  const tree = answer?.tree
  const layout = {
    component: 'Pane',
    instance_id: 'scroll-log',
    body_rows: 10,
    content_rows: 31,
    keyed: Array.from({ length: 30 }, (_, i) => ({
      plugin: 'scroll-log',
      key: `row-${i + 1}`,
      top: i + 1,
      bottom: i + 2
    })),
    surface: 'desktop'
  }
  await request({ subtype: 'ui_scroll', ...layout, offset: 0, by: 0 })
  await request({
    subtype: 'ui_focus',
    component: 'Pane',
    instance_id: 'scroll-log',
    is_held: true,
    surface: 'desktop'
  })
  for (const key of ['end', 'top', 'reveal', 'focus-end', 'follow']) {
    const press = findPress(tree, key)
    if (press) {
      await request({ subtype: 'ui_press', ...press, key, surface: 'desktop' })
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
  await request({ subtype: 'ui_scroll', ...layout, content_rows: 34, offset: 24, by: -3 })
  await request({
    subtype: 'ui_focus',
    component: 'Pane',
    instance_id: 'scroll-log',
    is_held: true,
    element: { plugin: 'scroll-log', key: 'top' },
    by: 'person',
    surface: 'desktop'
  })
  await render('AbovePrompt', 'above-prompt')
}

async function helloTabs() {
  await request({ subtype: 'ui_panes', client_id: SURFACE.client_id })
  await render('AbovePrompt', 'above-prompt')
  const panes = waitFor(isSystem('ui_panes')).catch(() => null)
  sendUser('/hello-tabs')
  await panes
  let tree = (await render('Pane', 'hello-tabs'))?.tree
  const two = findPress(tree, 'tab-two')
  if (two) {
    const invalidated = waitFor(isSystem('ui_invalidate'), 5000).catch(() => null)
    await request({ subtype: 'ui_press', ...two, key: 'tab-two', surface: 'desktop' })
    await invalidated
    tree = (await render('Pane', 'hello-tabs'))?.tree
    const more = findPress(tree, 'more')
    if (more) {
      await request({ subtype: 'ui_press', ...more, key: 'more', surface: 'desktop' })
      await waitFor(isSystem('ui_invalidate'), 5000).catch(() => null)
      await render('Pane', 'hello-tabs')
    }
    // A retired handle must answer handled:false.
    await request({ subtype: 'ui_press', ...two, key: 'tab-two', surface: 'desktop' })
  }
  await request({ subtype: 'ui_pane_focus', id: null, surface: 'desktop' })
  await request({
    subtype: 'ui_scroll',
    component: 'Pane',
    instance_id: 'hello-tabs',
    offset: 0,
    by: 1,
    body_rows: 10,
    content_rows: 4,
    surface: 'desktop'
  })
  await request({ subtype: 'ui_close', id: 'hello-tabs' })
  await waitFor(isSystem('ui_panes'), 5000).catch(() => null)
}

// Realistic transcript props per the Phase 3 scout cheat-sheet.
const transcriptCases = [
  ['UserMessage', 'user-1', { text: 'hello', origin: { kind: 'sdk' }, isExpanded: true }],
  ['AssistantMessage', 'msg-1', { text: 'Hi **there**', isFirstOfReply: true, isSummary: false }],
  [
    'ToolUse',
    'toolu-bash',
    {
      tool: 'Bash',
      input: { command: 'ls' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { stdout: 'a', stderr: '', interrupted: false, isImage: false }
    }
  ],
  [
    'ToolUse',
    'toolu-read',
    {
      tool: 'Read',
      input: { file_path: '/x' },
      isRunning: true,
      isErrored: false,
      isInterrupted: false
    }
  ],
  [
    'ToolResult',
    'toolu-bash',
    {
      tool: 'Bash',
      output: { stdout: 'a', stderr: '', interrupted: false, isImage: false },
      isErrored: false
    }
  ],
  [
    'ToolGroup',
    'group-1',
    {
      calls: [
        {
          tool_use_id: 'g-1',
          tool: 'Read',
          input: { file_path: '/a' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false
        },
        {
          tool_use_id: 'g-2',
          tool: 'Grep',
          input: { pattern: 'x' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false
        }
      ],
      isActive: false,
      isExpanded: false
    }
  ],
  [
    'AskUserQuestion',
    'toolu-ask',
    {
      tool: 'AskUserQuestion',
      questions: [
        {
          question: 'Pick one?',
          header: 'Pick',
          multiSelect: false,
          options: [
            { label: 'A', description: 'first' },
            { label: 'B', description: 'second' }
          ]
        }
      ]
    }
  ],
  ['CommandOutput', 'cmd-1', { command: 'hello-tabs', args: '', text: 'done', isErrored: false }],
  ['Spinner', 'main', { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' }],
  ['SessionMode', 'session-mode', { modes: ['focus'] }],
  ['TurnDuration', 'turn-1', { word: 'Baked', durationMs: 1234 }],
  ['InfoNotice', 'notice-1', { text: 'notice', command: null }],
  ['PromptHint', 'prompt-hint', { isDraft: false, isWorking: false, hint: 'hint', tail: 'tail' }]
]
const onScreenComponents = new Set([
  'UserMessage',
  'AssistantMessage',
  'ToolUse',
  'ToolResult',
  'ToolGroup',
  'CommandOutput',
  'TurnDuration',
  'InfoNotice'
])

async function transcript() {
  const invalidated = waitFor(isSystem('ui_invalidate'), 12_000).catch(() => null)
  const rows = []
  for (const [component, instanceId, props] of transcriptCases) {
    const variants = onScreenComponents.has(component)
      ? [undefined, { first: 0, last: 2, of: 3 }, null]
      : [undefined]
    for (const onScreen of variants) {
      const answer = await request({
        subtype: 'ui_render',
        component,
        instance_id: instanceId,
        props,
        viewport,
        ...(onScreen === undefined ? {} : { on_screen: onScreen }),
        ...SURFACE
      })
      rows.push({
        component,
        instance_id: instanceId,
        on_screen: onScreen,
        request_props: props,
        answer
      })
      log('transcript_answer', {
        component,
        on_screen: onScreen,
        tree: answer?.tree,
        props: answer?.props,
        rewritten: answer?.rewritten,
        hooked: answer?.hooked,
        drawn_by: answer?.drawn_by
      })
    }
  }
  // A component no loaded plugin hooks.
  const unhooked = await request({
    subtype: 'ui_render',
    component: 'AbovePrompt',
    instance_id: 'above-prompt',
    props: {},
    viewport,
    ...SURFACE
  })
  log('transcript_answer', { component: 'AbovePrompt(unhooked)', answer: unhooked })
  // Re-ask after the invalidate so the instances shape and the redraw are recorded.
  const push = await invalidated
  log('transcript_invalidate', push)
  const again = await render('UserMessage', 'user-1')
  log('transcript_answer', { component: 'UserMessage(after invalidate)', answer: again })
  if (outFile) {
    writeFileSync(`${outFile}.rows.json`, JSON.stringify(rows, null, 2))
  }
}

async function runCommand(command, settleMs = 2000) {
  sendUser(command)
  await new Promise((resolve) => setTimeout(resolve, settleMs))
}

async function main() {
  const init = await q.initializationResult().catch((error) => String(error))
  log('init', { commands: init?.commands?.map?.((c) => c.name) })
  await request({ subtype: 'ui_attach', ...SURFACE, viewport })
  if (scenario === 'scroll-log') {
    await scrollLog()
  } else if (scenario === 'transcript') {
    await transcript()
  } else if (scenario === 'hello-tabs') {
    await helloTabs()
  } else {
    for (const command of scenario.split('+')) {
      await runCommand(`/${command}`)
      const panes = await request({ subtype: 'ui_panes', client_id: SURFACE.client_id })
      for (const pane of panes?.panes ?? []) {
        await render('Pane', pane.id)
      }
      await render('AbovePrompt', 'above-prompt')
    }
  }
  await request({ subtype: 'ui_detach', client_id: SURFACE.client_id })
  q.close()
  setTimeout(() => process.exit(0), 500)
}

main().catch((error) => {
  log('fatal', String(error?.stack ?? error))
  process.exit(1)
})
