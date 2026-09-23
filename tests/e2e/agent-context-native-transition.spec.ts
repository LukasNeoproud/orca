import { expect, test } from './helpers/orca-app'
import { installContinuationCodexFixture } from './helpers/continuation-codex-fixture'
import type { Page } from '@stablyai/playwright-test'

const codex = installContinuationCodexFixture()

test.use({ launchEnv: codex.launchEnv })
test.afterAll(() => codex.dispose())

async function configure(page: Page): Promise<void> {
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
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      agentContextAutonomy: 'all' as const
    }
  )
}

async function startChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New tab' }).click()
  const item = page.getByRole('menuitem', { name: 'New Codex Chat', exact: true })
  await expect(item).toBeVisible({ timeout: 20_000 })
  await item.click()
  await expect(page.locator('[data-native-chat-root="true"]').last()).toBeVisible({
    timeout: 30_000
  })
}

function composer(page: Page) {
  return page
    .locator('[data-native-chat-root="true"] [contenteditable="true"][role="textbox"]')
    .last()
}

function turnStarts(events: Record<string, unknown>[]): number {
  return events.filter(
    (entry) =>
      entry.event === 'app-server-request' &&
      (entry.method === 'turn/start' || entry.method === 'thread/turn/start')
  ).length
}

async function submitTransition(
  page: Page,
  mode: 'compact' | 'fresh',
  continuation: 'wait-for-user' | 'continue',
  requestId: string
): Promise<{ eventOffset: number; turnStartCount: number }> {
  const events = codex.readEvents()
  await composer(page).fill(`ORCA_E2E_AGENT_CONTEXT ${mode} ${continuation} ${requestId}`)
  await composer(page).press('Enter')
  await expect
    .poll(
      () =>
        codex
          .readEvents()
          .slice(events.length)
          .find(
            (entry) => entry.event === 'agent-context-request' && entry.requestId === requestId
          ),
      { timeout: 30_000 }
    )
    .toMatchObject({ code: 0, mode, continuation })
  return { eventOffset: events.length, turnStartCount: turnStarts(events) }
}

async function expectCompleted(page: Page): Promise<void> {
  const status = page.getByRole('region', { name: 'Agent context request' })
  await expect(status).toContainText('Context change completed', { timeout: 90_000 })
}

test.describe('agent-requested native context transitions', () => {
  test('compact wait-for-user replaces the session without starting another turn', async ({
    orcaPage
  }) => {
    await configure(orcaPage)
    await startChat(orcaPage)
    const start = await submitTransition(orcaPage, 'compact', 'wait-for-user', 'native-wait-user')

    await expectCompleted(orcaPage)
    await orcaPage.waitForTimeout(1_000)

    const events = codex.readEvents()
    expect(turnStarts(events)).toBe(start.turnStartCount + 1)
    const completedThreads = new Set(
      events
        .slice(start.eventOffset)
        .filter((event) => event.event === 'structured-turn-completed')
        .map((event) => event.threadId)
    )
    expect(completedThreads.size).toBe(1)
  })

  test('fresh continue starts the inherited next step once on the replacement', async ({
    orcaPage
  }) => {
    await configure(orcaPage)
    await startChat(orcaPage)
    const start = await submitTransition(orcaPage, 'fresh', 'continue', 'native-continue')

    await expectCompleted(orcaPage)
    await expect
      .poll(() => turnStarts(codex.readEvents()), { timeout: 30_000 })
      .toBe(start.turnStartCount + 2)
    await expect
      .poll(
        () =>
          new Set(
            codex
              .readEvents()
              .slice(start.eventOffset)
              .filter((event) => event.event === 'structured-turn-completed')
              .map((event) => event.threadId)
          ).size,
        { timeout: 30_000 }
      )
      .toBe(2)
  })
})
