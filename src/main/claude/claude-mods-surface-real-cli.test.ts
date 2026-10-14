// Claude Code mods' remote surface against the real CLI: the fixture mods under
// tests/fixtures/claude-mods load through `plugins`, and the session's channel draws, presses
// and redraws exactly as the renderer does. Opt-in like every real-CLI suite
// (ORCA_REAL_CLAUDE_CLI_TEST=1); a slash command a mod answers itself costs no model turn.
// The hello-tabs fixture's `$.store` count lives in the CLI's own plugin store.

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ClaudeModsSurfaceEvent } from '../../shared/claude-mods-surface'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import { claudeModsSessionChannel } from './claude-mods-surface-channel'
import { CLAUDE_STRUCTURED_BASE_OPTIONS } from './claude-structured-launch-resolution'
import {
  realClaudeAuthenticated,
  realClaudeAvailable,
  realClaudeCliGate,
  realClaudeCommand,
  realClaudeLaunchHome
} from './claude-real-cli-availability-test-support'
import {
  ClaudeStructuredSessionAdapter,
  type ClaudeStructuredSessionEvent
} from './claude-structured-session-adapter'
import { claudeStartupSettled } from './claude-structured-session-test-support'

const SESSION_ID = 'real-cli-mods'
const FIXTURES = resolve(import.meta.dirname, '../../../tests/fixtures/claude-mods')
const suiteTitle = `Claude mods surface against the real CLI${realClaudeCliGate.skipReason ? ` (skipped: ${realClaudeCliGate.skipReason})` : ''}`

type Tree = {
  type?: string
  props?: Record<string, unknown>
  children?: unknown[]
  press?: unknown
}

function find(tree: unknown, predicate: (node: Tree) => boolean): Tree | null {
  if (typeof tree !== 'object' || tree === null) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only optional fields are read, each checked before use.
  const node = tree as Tree
  if (predicate(node)) {
    return node
  }
  for (const child of node.children ?? []) {
    const hit = find(child, predicate)
    if (hit) {
      return hit
    }
  }
  return null
}

const byKey = (key: string) => (node: Tree) => node.props?.key === key
const countText = (tree: unknown): string | undefined =>
  find(
    tree,
    (node) => typeof node.children?.[0] === 'string' && node.children[0].startsWith('Count:')
  )?.children?.[0] as string | undefined

async function openSession(events: ClaudeStructuredSessionEvent[]) {
  const providerSessionId = randomUUID()
  const adapter = new ClaudeStructuredSessionAdapter({
    resolveLaunch: async () => ({
      pathToClaudeCodeExecutable: realClaudeCommand,
      options: {
        ...CLAUDE_STRUCTURED_BASE_OPTIONS,
        sessionId: providerSessionId,
        plugins: [{ type: 'local', path: join(FIXTURES, 'hello-tabs') }]
      },
      cwd: process.cwd(),
      env: realClaudeLaunchHome().env,
      claudeConfigDir: process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude'),
      providerSessionId,
      resumeLeafUuid: null,
      resumesTranscript: false,
      continuesChain: false
    }),
    onEvent: (event) => events.push(event),
    readProcessStartTime: async () => 1,
    now: () => 2
  })
  await adapter.acquire({
    identity: {
      sessionId: SESSION_ID,
      workspaceId: 'real-cli-workspace',
      hostId: 'local',
      agent: 'claude',
      providerHandle: claudeProviderHandle(providerSessionId, null)
    },
    fence: 1,
    spawnToken: 'real-cli-mods'
  })
  await claudeStartupSettled(adapter, SESSION_ID)
  return adapter
}

function waitFor(
  events: ClaudeModsSurfaceEvent[],
  predicate: (event: ClaudeModsSurfaceEvent) => boolean
): Promise<ClaudeModsSurfaceEvent> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now()
    const poll = (): void => {
      const hit = events.find(predicate)
      if (hit) {
        resolvePromise(hit)
      } else if (Date.now() - started > 10_000) {
        reject(new Error('timed out waiting for a mods event'))
      } else {
        setTimeout(poll, 25)
      }
    }
    poll()
  })
}

async function openHelloTabs(
  adapter: ClaudeStructuredSessionAdapter,
  modEvents: ClaudeModsSurfaceEvent[],
  clientMessageId: string
): Promise<void> {
  await waitFor(modEvents, (event) => event.type === 'state' && event.available)
  await adapter.dispatch({
    sessionId: SESSION_ID,
    clientMessageId,
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: '/hello-tabs' }] },
    fence: 1
  })
  await waitFor(
    modEvents,
    (event) => event.type === 'panes' && event.roster.shown_id === 'hello-tabs'
  )
}

async function renderPane(): Promise<unknown> {
  const answer = await claudeModsSessionChannel(SESSION_ID).request('ui_render', {
    component: 'Pane',
    instance_id: 'hello-tabs',
    props: {},
    viewport: { columns: 60, rows: 30, isFullscreen: true }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a ui_render answer is an object carrying `tree`; the test reads only that.
  return (answer as { tree?: unknown }).tree
}

async function press(tree: unknown, key: string): Promise<unknown> {
  const node = find(tree, byKey(key))
  expect(node?.press).toBeDefined()
  return claudeModsSessionChannel(SESSION_ID).request('ui_press', {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: checked defined above; the CLI validates its shape.
    ...(node?.press as Record<string, unknown>),
    key
  })
}

describe.skipIf(!realClaudeAvailable)(suiteTitle, () => {
  it.skipIf(!realClaudeAuthenticated)(
    'draws a mod pane, routes presses back, and keeps the count across a restart',
    async () => {
      const events: ClaudeStructuredSessionEvent[] = []
      const modEvents: ClaudeModsSurfaceEvent[] = []
      let adapter = await openSession(events)
      let unsubscribe = claudeModsSessionChannel(SESSION_ID).subscribe((event) =>
        modEvents.push(event)
      )
      let before: number
      try {
        await openHelloTabs(adapter, modEvents, 'mods-1')
        let tree = await renderPane()
        expect(find(tree, byKey('tab-one'))).toMatchObject({ type: 'Button' })
        expect(await press(tree, 'tab-two')).toMatchObject({ handled: true, element: 'tab-two' })
        const stale = tree
        tree = await renderPane()
        // The redraw retired every handle of the drawing before it.
        expect(await press(stale, 'tab-two')).toMatchObject({ handled: false })
        before = Number(countText(tree)?.replace('Count: ', ''))
        expect(Number.isInteger(before)).toBe(true)
        modEvents.length = 0
        await press(tree, 'more')
        await waitFor(modEvents, (event) => event.type === 'invalidate')
        expect(countText(await renderPane())).toBe(`Count: ${before + 1}`)
        // Mods pushes reach the channel, never the session's transcript.
        expect(
          events.some(
            (event) =>
              event.type === 'message' &&
              typeof event.message.subtype === 'string' &&
              event.message.subtype.startsWith('ui_')
          )
        ).toBe(false)
      } finally {
        unsubscribe()
        await adapter.closeAll()
      }

      modEvents.length = 0
      adapter = await openSession(events)
      unsubscribe = claudeModsSessionChannel(SESSION_ID).subscribe((event) => modEvents.push(event))
      try {
        await openHelloTabs(adapter, modEvents, 'mods-2')
        await press(await renderPane(), 'tab-two')
        expect(countText(await renderPane())).toBe(`Count: ${before + 1}`)
      } finally {
        unsubscribe()
        await adapter.closeAll()
      }
    },
    60_000
  )
})
