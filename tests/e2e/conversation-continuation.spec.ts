import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  installContinuationCodexFixture,
  continuationCodexRolloutPath,
  CONTINUATION_CODEX_READY_MARKER,
  CONTINUATION_CODEX_COMPACTED_MARKER
} from './helpers/continuation-codex-fixture'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  waitForActiveTerminalManager,
  resolveActiveTabId,
  waitForActivePaneHookDescriptor
} from './helpers/terminal'
import { readHookEndpoint, emitCodexHookStatus } from './helpers/agent-hook-endpoint'

const provider = installContinuationCodexFixture()
test.use({ launchEnv: provider.launchEnv })
test.afterEach(async ({ orcaPage }, info) => {
  await info.attach('continuation-view', {
    body: await orcaPage.screenshot(),
    contentType: 'image/png'
  })
  await info.attach('provider-events', {
    body: JSON.stringify(provider.readEvents(), null, 2),
    contentType: 'application/json'
  })
})
test.afterAll(() => provider.dispose())

async function terminalDom(page: Page) {
  await waitForActiveTerminalManager(page)
  const tabId = await resolveActiveTabId(page)
  await page.evaluate((id) => {
    const manager = id ? window.__paneManagers?.get(id) : null
    const pane = manager?.getActivePane() ?? manager?.getPanes()[0]
    if (!pane) {
      throw new Error('Test terminal is unavailable')
    }
    pane.terminal.options.screenReaderMode = true
    pane.terminal.refresh(0, pane.terminal.rows - 1)
  }, tabId)
  return page.locator(`[data-terminal-tab-id=${JSON.stringify(tabId)}] .xterm-accessibility-tree`)
}

async function startSource(page: Page) {
  await waitForSessionReady(page)
  await page.evaluate(async (settings) => {
    await window.__store!.getState().updateSettings({
      ...settings,
      defaultTuiAgent: 'blank',
      experimentalNativeChat: true,
      conversationContinuationOfferAfterMs: 1_000,
      conversationContinuationAutoCompact: false
    })
  }, provider.settings)
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page)
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Codex/ }).click()
  const terminal = await terminalDom(page)
  await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${provider.sessionId}`)
  const panel = page.getByRole('region', { name: 'Conversation continuation' })
  await expect(panel.getByRole('button', { name: 'Compact a copy', exact: true })).toBeEnabled({
    timeout: 30_000
  })
  return { panel, terminal }
}

test('idle CLI offers original and compacts a copy before resuming in the same pane', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  const { panel, terminal } = await startSource(page)
  const isolatedHome = await electronApp.evaluate(({ app }) => app.getPath('home'))
  const sourcePath = continuationCodexRolloutPath(
    path.join(isolatedHome, '.codex'),
    provider.sessionId
  )
  const original = readFileSync(sourcePath, 'utf8')
  const paneKey = await panel.evaluate((el) =>
    el.closest('[data-leaf-id]')?.getAttribute('data-leaf-id')
  )
  await panel.getByRole('button', { name: 'Continue original', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Compact a copy', exact: true })).toBeHidden()
  await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${provider.sessionId}`)
  await panel.getByRole('button', { name: 'Conversation continuation', exact: true }).click()
  const endpoint = await readHookEndpoint(electronApp)
  const descriptor = {
    ...(await waitForActivePaneHookDescriptor(page)),
    sessionId: provider.sessionId,
    transcriptPath: sourcePath
  }
  await emitCodexHookStatus(endpoint, {
    ...descriptor,
    state: 'working',
    prompt: 'Test running turn'
  })
  await expect(panel.getByRole('button', { name: 'New conversation', exact: true })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Compact a copy', exact: true })).toBeDisabled()
  await emitCodexHookStatus(endpoint, { ...descriptor, state: 'done' })
  await expect(panel.getByRole('button', { name: 'Compact a copy', exact: true })).toBeEnabled({
    timeout: 20_000
  })
  await panel.getByRole('button', { name: 'Compact a copy', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Continue compacted', exact: true })).toBeEnabled({
    timeout: 40_000
  })
  await page.screenshot({ path: testInfo.outputPath('compacted-copy-ready.png') })
  expect(readFileSync(sourcePath, 'utf8')).toBe(original)
  const compacted = provider.readEvents().findLast((entry) => entry.event === 'compact-completed')!
  const startsBefore = provider
    .readEvents()
    .filter((entry) => entry.event === 'terminal-start').length
  await panel.getByRole('button', { name: 'Continue compacted', exact: true }).click()
  await expect
    .poll(() => provider.readEvents().filter((entry) => entry.event === 'terminal-start').length)
    .toBe(startsBefore + 1)
  const resumed = await terminalDom(page)
  await expect(resumed).toContainText(
    `${CONTINUATION_CODEX_COMPACTED_MARKER}:${compacted.threadId}`,
    { timeout: 40_000 }
  )
  await expect(page.locator(`[data-leaf-id=${JSON.stringify(paneKey)}]`)).toContainText(
    'Conversation continuation'
  )
  expect(readFileSync(sourcePath, 'utf8')).toBe(original)
  await expect(panel.getByRole('alert')).toHaveCount(0)
})

test('terminal Chat UI offers continuation and starts a fresh CLI from its panel', async ({
  orcaPage: page
}) => {
  const { panel } = await startSource(page)
  await page.evaluate(() => {
    const state = window.__store!.getState()
    const worktreeId = state.activeWorktreeId!
    const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
      (entry) => entry.contentType === 'terminal' && entry.entityId === state.activeTabId
    )
    if (!tab) {
      throw new Error('Test terminal tab is unavailable')
    }
    state.toggleTabViewMode(tab.id)
  })
  await expect(page.locator('[data-native-chat-root="true"]')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible()
  const startsBefore = provider
    .readEvents()
    .filter((entry) => entry.event === 'terminal-start').length
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click()
  await expect
    .poll(() => provider.readEvents().filter((entry) => entry.event === 'terminal-start').length)
    .toBe(startsBefore + 1)
  const started = provider.readEvents().findLast((entry) => entry.event === 'terminal-start')!
  expect(started.threadId).not.toBe(provider.sessionId)
  const terminal = await terminalDom(page)
  await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${started.threadId}`, {
    timeout: 30_000
  })
})

test('new CLI with reference receives an unsent history reference', async ({ orcaPage: page }) => {
  const { panel } = await startSource(page)
  const startsBefore = provider
    .readEvents()
    .filter((entry) => entry.event === 'terminal-start').length
  await panel.getByRole('button', { name: 'New with reference', exact: true }).click()
  await expect
    .poll(() => provider.readEvents().filter((entry) => entry.event === 'terminal-start').length)
    .toBe(startsBefore + 1)
  const terminal = await terminalDom(page)
  await expect(terminal).toContainText('Historical Codex transcript (read-only):', {
    timeout: 30_000
  })
  const started = provider.readEvents().findLast((entry) => entry.event === 'terminal-start')!
  expect(started.threadId).not.toBe(provider.sessionId)
  expect(
    provider
      .readEvents()
      .filter((entry) => entry.event === 'terminal-submit' && entry.threadId === started.threadId)
  ).toHaveLength(0)
  await expect(panel.getByRole('alert')).toHaveCount(0)
})

test('failed background compaction leaves the original CLI available', async ({
  orcaPage: page
}) => {
  const { panel, terminal } = await startSource(page)
  provider.failNextCompaction('E2E provider refused compaction')
  try {
    await panel.getByRole('button', { name: 'Compact a copy', exact: true }).click()
    await expect(panel.getByRole('status')).toContainText('E2E provider refused compaction', {
      timeout: 35_000
    })
    await expect(
      panel.getByRole('button', { name: 'Continue original', exact: true })
    ).toBeEnabled()
    await panel.getByRole('button', { name: 'Continue original', exact: true }).click()
    await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${provider.sessionId}`)
  } finally {
    provider.clearCompactionFailure()
  }
})

test('automatic compaction requires opt-in and invalidates the copy after new activity', async ({
  orcaPage: page
}) => {
  const before = provider.readEvents().filter((entry) => entry.event === 'compact-completed').length
  const { panel, terminal } = await startSource(page)
  expect(provider.readEvents().filter((entry) => entry.event === 'compact-completed')).toHaveLength(
    before
  )
  await page.evaluate(async () => {
    await window.__store!.getState().updateSettings({
      conversationContinuationAutoCompact: true,
      conversationContinuationCompactAfterMs: 60_000
    })
  })
  await expect(panel.getByRole('button', { name: 'Continue compacted', exact: true })).toBeEnabled({
    timeout: 50_000
  })
  await expect(terminal).toContainText(`${CONTINUATION_CODEX_READY_MARKER}:${provider.sessionId}`)
  const source = provider.readEvents().findLast((entry) => entry.event === 'terminal-start')!
  appendFileSync(
    String(source.transcriptPath),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: 'new-active-turn' }
    })}\n`
  )
  await expect(panel.getByRole('button', { name: 'Continue compacted', exact: true })).toBeHidden({
    timeout: 20_000
  })
  await panel.getByRole('button', { name: 'Conversation continuation', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Compact a copy', exact: true })).toBeDisabled()
})
