import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * Set up gates in the Checks panel lands on the Quality Gates section of the repository settings,
 * also when the settings were left open on another pane or further down the same pane.
 */

async function clickSetUpGates(page: Page, workspaceId: string): Promise<void> {
  await page.evaluate((workspaceId) => {
    const state = window.__store!.getState()
    state.setActiveWorktree(workspaceId)
    state.setActiveView('terminal')
    state.setRightSidebarTab('checks')
    state.setRightSidebarOpen(true)
  }, workspaceId)
  const section = page.locator(`[data-workspace-quality-gates="${workspaceId}"]`)
  await section.getByRole('button', { name: 'Set up gates' }).click({ timeout: 20_000 })
}

/** Where the gates section sits in the settings scroller: its offset from the top, and the scroll. */
function gatesPlacement(
  page: Page,
  repoId: string
): Promise<{ offset: number; scrollTop: number }> {
  return page.evaluate((repoId) => {
    const section = document.querySelector<HTMLElement>(`[data-quality-gates-section="${repoId}"]`)
    let scroller = section?.parentElement ?? null
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement
    }
    if (!section || !scroller) {
      return { offset: Number.NaN, scrollTop: Number.NaN }
    }
    const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    return { offset: Math.round(offset), scrollTop: Math.round(scroller.scrollTop) }
  }, repoId)
}

async function expectGatesAtTop(page: Page, repoId: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Quality Gates' })).toBeInViewport()
  // Why: the section is far down the pane, so landing at its top proves the scroll happened.
  await expect
    .poll(async () => {
      const { offset, scrollTop } = await gatesPlacement(page, repoId)
      return scrollTop > 0 && offset >= 0 && offset <= 40
    })
    .toBe(true)
}

test('Set up gates opens the repository settings at the Quality Gates section', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.setTimeout(180_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-146')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null

  try {
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))

    // Settings left open on another pane.
    await page.evaluate(() => {
      const state = window.__store!.getState()
      state.openSettingsTarget({ pane: 'appearance', repoId: null })
      state.openSettingsPage()
    })
    await expect(page.getByPlaceholder('Search settings')).toBeVisible({ timeout: 10_000 })
    const maybeLater = page.getByRole('button', { name: 'Maybe Later' })
    if (await maybeLater.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await maybeLater.click()
    }
    await clickSetUpGates(page, workspaceId)
    await expectGatesAtTop(page, repoId)
    await page.screenshot({ path: path.join(screenshotDir, '01-from-another-pane.png') })

    // Settings left at the top of the same repository pane.
    await page.evaluate((repoId) => {
      const state = window.__store!.getState()
      state.openSettingsTarget({ pane: 'repo', repoId })
      state.openSettingsPage()
    }, repoId)
    await expect.poll(async () => (await gatesPlacement(page, repoId)).scrollTop).toBe(0)
    await clickSetUpGates(page, workspaceId)
    await expectGatesAtTop(page, repoId)
    await page.screenshot({ path: path.join(screenshotDir, '02-from-the-same-pane.png') })
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
  }
})
