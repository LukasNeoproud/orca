// Branching Claude in a terminal: the pane's branch menu, a turn picked from the saved conversation,
// a new terminal resuming the fork with its prompt prefilled (never sent), the family, and the way
// back. Needs the `claude` CLI on PATH; no account, since nothing is sent.
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { seedReviewConversation, shoot } from './helpers/conversation-branch-fixture'
import {
  ensureTerminalVisible,
  getActiveTabId,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'

/** What the hook server would report once Claude starts in the tab's active pane. */
async function reportClaudeInTab(page: Page, tabId: string, providerSessionId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.__store?.getState().terminalLayoutsByTabId[id]?.activeLeafId,
        tabId
      )
    )
    .toBeTruthy()
  await page.evaluate(
    ({ id, sessionId }) => {
      const state = window.__store!.getState()
      const leafId = state.terminalLayoutsByTabId[id]!.activeLeafId!
      const paneKey = `${id}:${leafId}`
      const now = Date.now()
      window.__store!.setState({
        agentStatusByPaneKey: {
          ...state.agentStatusByPaneKey,
          [paneKey]: {
            state: 'done',
            prompt: '',
            updatedAt: now,
            stateStartedAt: now,
            agentType: 'claude',
            paneKey,
            worktreeId: state.activeWorktreeId ?? undefined,
            stateHistory: [],
            providerSession: { key: 'session_id', id: sessionId }
          }
        }
      })
    },
    { id: tabId, sessionId: providerSessionId }
  )
}

async function openBranchMenuItem(page: Page, item: RegExp): Promise<void> {
  await page
    .getByRole('button', { name: 'Conversation branches' })
    .filter({ visible: true })
    .click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('branches a Claude terminal conversation, shows its family and returns the result', async ({
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

  const sessionId = await seedReviewConversation(electronApp, seededRepoPath)
  await page.evaluate(async () => {
    const next = await window.api.settings.set({ experimentalNativeChat: true })
    window.__store?.setState({ settings: next })
    // Keeps each launch's command, which is what the branch terminal runs.
    const store = window.__store!
    const queue = store.getState().queueTabStartupCommand
    const seen: string[] = []
    Object.assign(window, { __branchCommands: seen })
    store.setState({
      queueTabStartupCommand: (tabId, startup) => {
        seen.push(startup.command)
        queue(tabId, startup)
      }
    })
  })
  const parentTabId = (await getActiveTabId(page))!
  await reportClaudeInTab(page, parentTabId, sessionId)

  await openBranchMenuItem(page, /Branch this conversation/)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Branch this conversation', { exact: true })).toBeVisible()
  // The latest turn is the default; the review is the one to branch after.
  const turn = dialog.getByRole('combobox', { name: 'Branch after' })
  await expect(turn).toContainText('2. Thanks, anything else?', { timeout: 30_000 })
  await turn.click()
  await page.getByRole('option', { name: '1. Review the parser and the cache.' }).click()
  await expect(dialog.getByLabel('Name')).toHaveValue('Review findings:')
  await dialog.getByLabel('Name').fill('Fix the parser')
  await dialog.getByLabel('Prompt').fill('Fix finding 1 only.')
  await expect(dialog.getByRole('combobox', { name: 'Open in' })).toContainText('A new terminal')
  await page.waitForTimeout(300)
  await shoot(page, testInfo, '01-terminal-branch-dialog')
  await dialog.getByRole('button', { name: 'Create branch' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 60_000 })

  const branchTab = page.locator('[data-tab-title="Fix the parser"]')
  await expect(branchTab).toBeVisible({ timeout: 30_000 })
  const command = await page.evaluate(() => {
    const seen = '__branchCommands' in window ? window.__branchCommands : undefined
    return Array.isArray(seen)
      ? seen.find((line): line is string => typeof line === 'string' && line.includes('--prefill'))
      : undefined
  })
  // Arguments arrive shell-quoted.
  expect(command).toMatch(/--resume'? '?[0-9a-f-]{36}/)
  expect(command).toContain('Fix finding 1 only.')
  const childId = /--resume'? '?([0-9a-f-]{36})/.exec(command ?? '')?.[1]
  expect(childId).toBeTruthy()
  expect(childId).not.toBe(sessionId)
  await page.waitForTimeout(1_500)
  await shoot(page, testInfo, '02-terminal-branch-opened')

  const branchTabId = (await getActiveTabId(page))!
  expect(branchTabId).not.toBe(parentTabId)
  await reportClaudeInTab(page, branchTabId, childId!)

  await openBranchMenuItem(page, /Conversation family/)
  const family = page.getByRole('group', { name: 'Conversation family' })
  await expect(family.getByText('Fix the parser')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(300)
  await shoot(page, testInfo, '03-terminal-family')
  // The original runs in a terminal here, so the family focuses it rather than opening another.
  await family.getByRole('button', { name: /Original conversation/ }).click()
  await expect.poll(() => getActiveTabId(page)).toBe(parentTabId)

  await branchTab.click()
  await expect.poll(() => getActiveTabId(page)).toBe(branchTabId)
  await openBranchMenuItem(page, /Return result to the branch point/)
  const returnDialog = page.getByRole('dialog')
  await expect(returnDialog.getByRole('textbox', { name: 'Result' })).toHaveValue(
    /^Result of the branch "Fix the parser":\n\nReview findings:/,
    { timeout: 30_000 }
  )
  await page.waitForTimeout(300)
  await shoot(page, testInfo, '04-terminal-return-dialog')
  await returnDialog.getByRole('button', { name: 'Return to the branch point' }).click()
  await expect(returnDialog).toHaveCount(0, { timeout: 60_000 })
  await expect.poll(() => getActiveTabId(page)).toBe(parentTabId)
})
