import { test, expect } from './helpers/orca-app'
import { installContinuationCodexFixture } from './helpers/continuation-codex-fixture'
import type { Locator, Page } from '@stablyai/playwright-test'

const codex = installContinuationCodexFixture()

test.use({ launchEnv: codex.launchEnv })

test.afterAll(() => {
  codex.dispose()
})

async function configureCodex(page: Page): Promise<void> {
  await page.evaluate(
    async (settings) => {
      const store = window.__store
      if (!store) {
        throw new Error('E2E store is unavailable')
      }
      await store.getState().updateSettings(settings)
    },
    {
      ...codex.settings,
      conversationContinuationOfferAfterMs: 1_000,
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true
    }
  )
}

async function startStructuredCodexChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New tab' }).click()
  const item = page.getByRole('menuitem', { name: 'New Codex Chat', exact: true })
  await expect(item).toBeVisible({ timeout: 20_000 })
  await item.click()
  await expect(page.locator('[data-native-chat-root="true"]').last()).toBeVisible({
    timeout: 30_000
  })
}

function activeComposer(page: Page) {
  return page
    .locator('[data-native-chat-root="true"] [contenteditable="true"][role="textbox"]')
    .last()
}

async function expandContinuation(panel: Locator): Promise<void> {
  const toggle = panel.getByRole('button', { name: 'Conversation continuation', exact: true })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
}

function structuredTurnStarts(): number {
  return codex
    .readEvents()
    .filter(
      (entry) =>
        entry.event === 'app-server-request' &&
        (entry.method === 'turn/start' || entry.method === 'thread/turn/start')
    ).length
}

async function completeInitialTurn(page: Page): Promise<void> {
  const composer = activeComposer(page)
  await composer.fill('Create the structured source turn.')
  await composer.press('Enter')
  await expect(page.locator('[data-native-chat-root="true"]').last()).toContainText(
    'Fixture structured reply.',
    { timeout: 20_000 }
  )
}

test.describe('structured Codex conversation continuation', () => {
  test('keeps the original active, then stages the reference and draft in a fresh Chat', async ({
    orcaPage
  }) => {
    await configureCodex(orcaPage)
    await startStructuredCodexChat(orcaPage)
    await completeInitialTurn(orcaPage)

    const composer = activeComposer(orcaPage)
    await composer.fill('Follow the focused regression after reading history.')
    const tabsBeforeOriginal = await orcaPage.locator('[data-testid="sortable-tab"]').count()
    const continuation = orcaPage.getByRole('region', { name: 'Conversation continuation' })
    await expect(continuation).toBeVisible({ timeout: 20_000 })
    await expandContinuation(continuation)

    await continuation.getByRole('button', { name: 'Continue original' }).click()
    await expect(orcaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabsBeforeOriginal)
    await expect(composer).toHaveText('Follow the focused regression after reading history.')

    await expandContinuation(continuation)
    const tabsBeforeReference = await orcaPage.locator('[data-testid="sortable-tab"]').count()
    const turnStartsBeforeReference = structuredTurnStarts()
    await continuation.getByRole('button', { name: 'New with reference' }).click()
    await expect
      .poll(async () => activeComposer(orcaPage).textContent(), { timeout: 30_000 })
      .toContain('Historical Codex transcript (read-only):')
    await expect(activeComposer(orcaPage)).toHaveText(
      /Historical Codex transcript \(read-only\):[\s\S]*Follow the focused regression after reading history\./
    )
    await expect(orcaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(
      tabsBeforeReference + 1
    )
    await expect(orcaPage.locator('[data-native-chat-root="true"]').last()).toBeVisible()
    await orcaPage.waitForTimeout(300)
    expect(structuredTurnStarts()).toBe(turnStartsBeforeReference)
  })

  test('resumes a compacted copy and carries the unsent Chat draft', async ({ orcaPage }) => {
    await configureCodex(orcaPage)
    await startStructuredCodexChat(orcaPage)
    await completeInitialTurn(orcaPage)

    const composer = activeComposer(orcaPage)
    await composer.fill('Keep this unsent compacted draft.')
    const continuation = orcaPage.getByRole('region', { name: 'Conversation continuation' })
    await expect(continuation).toBeVisible({ timeout: 20_000 })
    await expandContinuation(continuation)
    await continuation.getByRole('button', { name: 'Compact a copy' }).click()
    await expect(continuation.getByRole('button', { name: 'Continue compacted' })).toBeVisible({
      timeout: 30_000
    })
    const tabsBeforeCompacted = await orcaPage.locator('[data-testid="sortable-tab"]').count()
    const turnStartsBeforeCompacted = structuredTurnStarts()
    await continuation.getByRole('button', { name: 'Continue compacted' }).click()

    await expect
      .poll(async () => activeComposer(orcaPage).textContent(), { timeout: 30_000 })
      .toBe('Keep this unsent compacted draft.')
    await expect(orcaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(
      tabsBeforeCompacted + 1
    )
    await expect(orcaPage.locator('[data-native-chat-root="true"]').last()).toBeVisible()
    await orcaPage.waitForTimeout(300)
    expect(structuredTurnStarts()).toBe(turnStartsBeforeCompacted)
  })
})
