// What a Claude chat answers itself rather than sending to the model: the /mcp, /permissions and
// /btw panels, and Ctrl+R prompt search. Nothing is sent, so no account is needed; the live CLI
// side is covered by claude-session-controls-real-cli.test.ts.
import { expect, test } from './helpers/orca-app'
import { seedReviewConversation, shoot } from './helpers/conversation-branch-fixture'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('answers /mcp, /permissions and /btw itself and searches sent prompts', async ({
  electronApp,
  orcaPage: page,
  seededRepoPath
}, testInfo) => {
  test.skip(process.env.ORCA_E2E_CONVERSATION_BRANCH !== '1', 'needs the claude CLI on PATH')
  test.setTimeout(240_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await seedReviewConversation(electronApp, seededRepoPath)

  await page.evaluate(async () => {
    const next = await window.api.settings.set({ experimentalNativeChat: true })
    window.__store?.setState({ settings: next })
    const state = window.__store?.getState()
    state?.setRightSidebarOpen(true)
    state?.setRightSidebarTab('vault')
    state?.setRightSidebarWidth(400)
  })
  await page.getByRole('button', { name: 'Agents', exact: true }).click()
  await page.getByRole('radio', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh Session History', exact: true }).click()
  const row = page.getByText('Review the parser and the cache.', { exact: true }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Resume in New Native Chat' }).click()

  const chat = page.locator('[data-native-chat-root="true"]').last()
  await expect(chat.getByText('Nothing else stood out.', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  const composer = page.getByRole('textbox', { name: /Ask anything/ }).filter({ visible: true })
  const run = async (text: string): Promise<void> => {
    await composer.click()
    await page.keyboard.type(text)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Enter')
  }
  const dialog = page.getByRole('dialog')

  // At rest there is no CLI to ask: the panel says so instead of sending `/mcp` to the model.
  await run('/mcp')
  await expect(dialog.getByText('MCP servers')).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByRole('alert')).toContainText('Send a message first')
  await shoot(page, testInfo, '01-mcp-at-rest')
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toHaveCount(0)

  await run('/permissions')
  await expect(dialog.getByText('Permissions', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByRole('alert')).toContainText('Send a message first')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await run('/btw Which fruit did nobody mention here?')
  await expect(dialog.locator('[data-native-chat-side-answer="failed"]')).toBeVisible({
    timeout: 15_000
  })
  await shoot(page, testInfo, '02-side-question-at-rest')
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  // None of the three reached the conversation as a message.
  await expect(chat.getByText(/Which fruit did nobody mention/)).toHaveCount(0)
  await expect(chat.getByText('/mcp', { exact: true })).toHaveCount(0)

  // The permission mode has a pill of its own beside the model, listing every mode.
  const modePill = page.getByRole('button', { name: /^Permissions/ }).filter({ visible: true })
  await expect(modePill).toBeVisible({ timeout: 15_000 })
  await modePill.click()
  const modes = page.getByRole('menuitemradio')
  await expect(modes.first()).toBeVisible()
  expect(await modes.count()).toBeGreaterThan(1)
  await shoot(page, testInfo, '03-permission-mode-menu')
  await page.keyboard.press('Escape')

  // The panel beside the chat: opened from the corner, it narrows the chat instead of covering it.
  const chatWidth = (await chat.boundingBox())?.width ?? 0
  await page.getByRole('button', { name: 'Conversation panel' }).filter({ visible: true }).click()
  const panel = page.getByRole('complementary', { name: 'Conversation panel' })
  await expect(panel).toBeVisible()
  expect((await chat.boundingBox())?.width ?? 0).toBeLessThan(chatWidth)
  await expect(panel.getByText('Nothing is running in the background.')).toBeVisible()
  await shoot(page, testInfo, '04-panel-background')
  for (const tab of ['Plan', 'Subagents', 'Context', 'Artifacts']) {
    await panel.getByRole('tab', { name: tab, exact: true }).click()
    await expect(panel).toHaveAttribute('data-native-chat-side-panel', tab.toLowerCase())
  }
  await panel.getByRole('tab', { name: 'Context', exact: true }).click()
  await shoot(page, testInfo, '05-panel-context')
  await panel.getByRole('button', { name: 'Close panel' }).click()
  await expect(panel).toHaveCount(0)

  // Ctrl+R finds the newest sent prompt holding what is typed, as in a shell.
  await composer.click()
  await page.keyboard.type('parser')
  await page.keyboard.press('Control+r')
  await expect(composer).toContainText('Review the parser and the cache.')
  await shoot(page, testInfo, '06-prompt-search')
})
