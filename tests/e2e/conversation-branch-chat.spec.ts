// Branching a Claude chat from a finished reply: the dialog, the forked chat with its prompt unsent,
// and the way back. Needs the `claude` CLI on PATH; no account, since nothing is sent.
import { expect, test } from './helpers/orca-app'
import { seedReviewConversation, shoot } from './helpers/conversation-branch-fixture'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('branches a Claude chat after a review reply and returns to the branch point', async ({
  electronApp,
  orcaPage: page,
  seededRepoPath
}, testInfo) => {
  test.skip(process.env.ORCA_E2E_CONVERSATION_BRANCH !== '1', 'needs the claude CLI on PATH')
  test.setTimeout(240_000)
  // A hidden window does not run the popovers' entry animation; without one they draw settled.
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
  await expect(chat.getByText('The cache never expires.', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  await shoot(page, testInfo, '01-parent-chat')

  const branchButtons = chat.getByRole('button', { name: 'Branch from here' })
  await expect(branchButtons.first()).toBeVisible({ timeout: 30_000 })
  // The reply's controls show on hover, as for a person.
  await chat.getByText('The cache never expires.', { exact: true }).hover()
  await branchButtons.first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Branch from this reply')).toBeVisible()
  await expect(dialog.getByLabel('Name')).toHaveValue('Review findings:')
  await dialog.getByLabel('Name').fill('Fix the parser')
  await dialog.getByLabel('Prompt').fill('Fix finding 1 only.')
  await shoot(page, testInfo, '02-branch-dialog')
  await dialog.getByRole('button', { name: 'Create branch' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 60_000 })

  const breadcrumb = page.getByText(/Fix the parser · branch of/)
  await expect(breadcrumb).toBeVisible({ timeout: 60_000 })
  const branchChat = page.locator('[data-native-chat-root="true"]:visible')
  await expect(branchChat.getByText('The cache never expires.', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(branchChat.getByText('Nothing else stood out.', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('textbox', { name: /Ask anything/ }).filter({ visible: true })
  ).toContainText('Fix finding 1 only.')
  await expect(page.getByText('Fix the parser', { exact: true }).first()).toBeVisible()
  await shoot(page, testInfo, '03-branch-chat')

  await page.getByRole('button', { name: 'Family' }).click()
  await expect(page.getByRole('group', { name: 'Conversation family' })).toBeVisible()
  await shoot(page, testInfo, '04-family-from-branch')
  await page.getByRole('button', { name: 'Family' }).click()
  await expect(page.getByRole('group', { name: 'Conversation family' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to branch point' }).click()
  const parent = page.locator('[data-native-chat-root="true"]:visible')
  await expect(parent.getByText('Nothing else stood out.', { exact: true })).toBeVisible({
    timeout: 30_000
  })
  await parent.getByRole('button', { name: '1 branch' }).click()
  const family = page.getByRole('group', { name: 'Conversation family' })
  await expect(family.getByText('Fix the parser')).toBeVisible()
  await shoot(page, testInfo, '05-branch-point-chip')
  await family.getByText('Fix the parser').click()
  await expect(page.getByText(/Fix the parser · branch of/)).toBeVisible({ timeout: 30_000 })

  // The branch hands its reply back: a draft in the parent's composer, not a message.
  const fixChat = page.locator('[data-native-chat-root="true"]:visible')
  await fixChat.getByText('The cache never expires.', { exact: true }).hover()
  await fixChat.getByRole('button', { name: 'Return result to the branch point' }).click()
  const returnDialog = page.getByRole('dialog')
  await expect(returnDialog.getByRole('textbox', { name: 'Result' })).toHaveValue(
    /^Result of the branch "Fix the parser":/
  )
  await page.waitForTimeout(300)
  await shoot(page, testInfo, '06-return-dialog')
  await returnDialog.getByRole('button', { name: 'Return to the branch point' }).click()
  await expect(returnDialog).toHaveCount(0, { timeout: 30_000 })
  const review = page.locator('[data-native-chat-root="true"]:visible')
  await expect(review.getByText('Nothing else stood out.', { exact: true })).toBeVisible({
    timeout: 30_000
  })
  await expect(
    page.getByRole('textbox', { name: /Ask anything/ }).filter({ visible: true })
  ).toContainText('Result of the branch "Fix the parser"')

  // One branch per finding, opened beside the parent; none of them sends anything.
  await review.getByText('The cache never expires.', { exact: true }).hover()
  await review.getByRole('button', { name: 'Branch per finding' }).first().click()
  const batch = page.getByRole('dialog')
  await expect(batch.getByRole('textbox', { name: 'Name' })).toHaveCount(2)
  await expect(batch.getByRole('textbox', { name: 'Name' }).nth(1)).toHaveValue(
    '2. The cache never expires.'
  )
  // Dialogs keep their fade under reduced motion; the screenshot waits it out.
  await page.waitForTimeout(300)
  await shoot(page, testInfo, '07-batch-dialog')
  await batch.getByRole('button', { name: 'Create 2 branches' }).click()
  await expect(batch).toHaveCount(0, { timeout: 60_000 })
  await expect(page.locator('[data-tab-title="2. The cache never expires."]')).toBeVisible({
    timeout: 30_000
  })
  await expect(review.getByText('Nothing else stood out.', { exact: true })).toBeVisible()
  await expect(review.getByRole('button', { name: '3 branches' })).toBeVisible({
    timeout: 30_000
  })
  await shoot(page, testInfo, '08-batch-created')
})
