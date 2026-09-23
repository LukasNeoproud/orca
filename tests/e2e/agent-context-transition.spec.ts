import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  CONTINUATION_CODEX_COMPACTED_MARKER,
  CONTINUATION_CODEX_READY_MARKER,
  installContinuationCodexFixture
} from './helpers/continuation-codex-fixture'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  resolveActiveTabId,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

const codex = installContinuationCodexFixture()
test.use({ launchEnv: codex.launchEnv })
test.describe.configure({ mode: 'serial' })

test.afterEach(async ({ orcaPage }, info) => {
  await info.attach('agent-context-transition-view', {
    body: await orcaPage.screenshot(),
    contentType: 'image/png'
  })
  await info.attach('agent-context-transition-events', {
    body: JSON.stringify(codex.readEvents(), null, 2),
    contentType: 'application/json'
  })
})

test.afterAll(() => codex.dispose())

async function terminalDom(page: Page) {
  await waitForActiveTerminalManager(page)
  const tabId = await resolveActiveTabId(page)
  await page.evaluate((id) => {
    const manager = id ? window.__paneManagers?.get(id) : null
    const pane = manager?.getActivePane() ?? manager?.getPanes()[0]
    if (!pane) {
      throw new Error('Active terminal is unavailable')
    }
    pane.terminal.options.screenReaderMode = true
    pane.terminal.refresh(0, pane.terminal.rows - 1)
  }, tabId)
  return page.locator(`[data-terminal-tab-id=${JSON.stringify(tabId)}] .xterm-accessibility-tree`)
}

async function startSource(page: Page, policy: 'off' | 'compact' | 'all' = 'all') {
  await waitForSessionReady(page)
  await page.evaluate(
    async ({ settings, policy }) => {
      await window.__store!.getState().updateSettings({
        ...settings,
        defaultTuiAgent: 'blank',
        experimentalNativeChat: true,
        conversationContinuationAutoCompact: false,
        agentContextAutonomy: policy
      })
    },
    { settings: codex.settings, policy }
  )
  await ensureTerminalVisible(page)
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Codex/ }).click()
  const terminal = await terminalDom(page)
  await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${codex.sessionId}`)
  return { terminal, ptyId: await waitForActivePanePtyId(page) }
}

function requestCommand(
  mode: 'compact' | 'fresh',
  continuation: 'wait-for-user' | 'continue',
  requestId: string
) {
  return `ORCA_E2E_AGENT_CONTEXT ${mode} ${continuation} ${requestId}`
}

async function request(
  page: Page,
  ptyId: string,
  mode: 'compact' | 'fresh',
  continuation: 'wait-for-user' | 'continue',
  requestId: string
) {
  await execInTerminal(page, ptyId, requestCommand(mode, continuation, requestId))
  await expect
    .poll(
      () =>
        codex
          .readEvents()
          .findLast(
            (event) => event.event === 'agent-context-request' && event.requestId === requestId
          ),
      { timeout: 30_000 }
    )
    .toBeTruthy()
  const outcome = codex
    .readEvents()
    .findLast((event) => event.event === 'agent-context-request' && event.requestId === requestId)
  if (outcome?.code !== 0) {
    throw new Error(`Agent context request failed: ${JSON.stringify(outcome)}`)
  }
}

async function complete(page: Page, ptyId: string, requestId: string) {
  await execInTerminal(page, ptyId, `ORCA_E2E_AGENT_CONTEXT_COMPLETE ${requestId}`)
  await waitForTerminalOutput(page, `ORCA_E2E_AGENT_CONTEXT:COMPLETED:${requestId}`, 15_000)
}

async function requestStatus(page: Page): Promise<unknown> {
  return page.evaluate(
    async ({ providerSessionId }) => {
      const workspaceId = window.__store!.getState().activeWorktreeId!
      const response = await window.api.runtime.call({
        method: 'agentContext.inspect',
        params: { source: { workspaceId, providerSessionId } }
      })
      return response
    },
    { providerSessionId: codex.sessionId }
  )
}

test('the terminal agent queues a compacted wait-for-user replacement and switches the same pane', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page)
  const requestId = 'e2e-terminal-compact-wait'
  await request(page, ptyId, 'compact', 'wait-for-user', requestId)
  await complete(page, ptyId, requestId)

  try {
    await expect
      .poll(() => codex.readEvents().findLast((event) => event.event === 'terminal-start'))
      .toMatchObject({ resume: true })
  } catch (error) {
    throw new Error(`No terminal replacement: ${JSON.stringify(await requestStatus(page))}`, {
      cause: error
    })
  }
  const replacement = codex.readEvents().findLast((event) => event.event === 'terminal-start')!
  await waitForTerminalOutput(
    page,
    `${CONTINUATION_CODEX_COMPACTED_MARKER}:${replacement.threadId}`,
    45_000
  )
  expect(
    codex
      .readEvents()
      .filter(
        (event) => event.event === 'terminal-submit' && event.threadId === replacement.threadId
      )
  ).toHaveLength(0)
})

test('the terminal agent continues exactly one next step after a fresh replacement', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page)
  const requestId = 'e2e-terminal-fresh-continue'
  await request(page, ptyId, 'fresh', 'continue', requestId)
  await complete(page, ptyId, requestId)

  try {
    await expect
      .poll(() => codex.readEvents().findLast((event) => event.event === 'terminal-start'))
      .toMatchObject({ resume: true })
  } catch (error) {
    throw new Error(`No fresh terminal replacement: ${JSON.stringify(await requestStatus(page))}`, {
      cause: error
    })
  }
  const replacement = codex.readEvents().findLast((event) => event.event === 'terminal-start')!
  await waitForTerminalOutput(
    page,
    `${CONTINUATION_CODEX_COMPACTED_MARKER}:${replacement.threadId}`,
    45_000
  )
  await expect
    .poll(
      () =>
        codex
          .readEvents()
          .filter(
            (event) => event.event === 'terminal-submit' && event.threadId === replacement.threadId
          ).length,
      { timeout: 30_000 }
    )
    .toBe(1)
})

test('the Chat UI over a terminal pane applies the agent-requested compacted replacement', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page)
  await page.evaluate(() => {
    const state = window.__store!.getState()
    const worktreeId = state.activeWorktreeId!
    const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
      (entry) => entry.contentType === 'terminal' && entry.entityId === state.activeTabId
    )
    if (!tab) {
      throw new Error('Active Codex terminal tab is unavailable')
    }
    state.toggleTabViewMode(tab.id)
  })
  await expect(page.locator('[data-native-chat-root="true"]')).toBeVisible()

  const requestId = 'e2e-terminal-chat-ui'
  await request(page, ptyId, 'compact', 'wait-for-user', requestId)
  await complete(page, ptyId, requestId)
  await expect
    .poll(() => codex.readEvents().findLast((event) => event.event === 'terminal-start'))
    .toMatchObject({ resume: true })
  const replacement = codex.readEvents().findLast((event) => event.event === 'terminal-start')!
  await waitForTerminalOutput(
    page,
    `${CONTINUATION_CODEX_COMPACTED_MARKER}:${replacement.threadId}`,
    45_000
  )
  await expect(page.locator('[data-native-chat-root="true"]')).toBeVisible()
})

test('new user input makes a queued terminal transition stale before any replacement', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page)
  const starts = codex.readEvents().filter((event) => event.event === 'terminal-start').length
  const requestId = 'e2e-terminal-stale'
  await request(page, ptyId, 'compact', 'wait-for-user', requestId)
  await execInTerminal(page, ptyId, `ORCA_E2E_AGENT_CONTEXT_STALE ${requestId}`)
  await waitForTerminalOutput(page, `ORCA_E2E_AGENT_CONTEXT:STALE:${requestId}`, 15_000)
  await page.waitForTimeout(1_500)
  expect(codex.readEvents().filter((event) => event.event === 'terminal-start')).toHaveLength(
    starts
  )
})

test('agent context policy off rejects the CLI request without changing the source terminal', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page, 'off')
  const starts = codex.readEvents().filter((event) => event.event === 'terminal-start').length
  const requestId = 'e2e-terminal-policy-off'
  await execInTerminal(page, ptyId, requestCommand('compact', 'wait-for-user', requestId))
  await waitForTerminalOutput(page, `ORCA_E2E_AGENT_CONTEXT:FAILED:${requestId}`, 30_000)
  const result = codex
    .readEvents()
    .findLast((event) => event.event === 'agent-context-request' && event.requestId === requestId)
  expect(result).toMatchObject({ code: 1 })
  expect(codex.readEvents().filter((event) => event.event === 'terminal-start')).toHaveLength(
    starts
  )
})

test('the agent can cancel its queued terminal transition before turn completion', async ({
  orcaPage: page
}) => {
  const { ptyId } = await startSource(page)
  const starts = codex.readEvents().filter((event) => event.event === 'terminal-start').length
  const requestId = 'e2e-terminal-cancel'
  await request(page, ptyId, 'compact', 'wait-for-user', requestId)
  await execInTerminal(page, ptyId, `ORCA_E2E_AGENT_CONTEXT_CANCEL ${requestId}`)
  await waitForTerminalOutput(page, `ORCA_E2E_AGENT_CONTEXT:CANCELLED:${requestId}`, 30_000)
  await complete(page, ptyId, requestId)
  await page.waitForTimeout(1_500)
  expect(codex.readEvents().filter((event) => event.event === 'terminal-start')).toHaveLength(
    starts
  )
})
