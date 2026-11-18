import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

/**
 * The Review menu and the View panel items, through the real menu the main process built:
 * the item's own click handler, the IPC event, and the view that opens in the page.
 */

type MenuSnapshot = { label: string; accelerator: string | null }

async function readSubmenu(app: ElectronApplication, menuLabel: string): Promise<MenuSnapshot[]> {
  return app.evaluate(({ Menu }, label) => {
    const submenu = Menu.getApplicationMenu()?.items.find((item) => item.label === label)?.submenu
    return (submenu?.items ?? [])
      .filter((item) => item.type === 'normal' && !item.role)
      .map((item) => ({
        label: item.label.split('\t')[0],
        accelerator: item.accelerator ? String(item.accelerator) : null
      }))
  }, menuLabel)
}

// Why not a native click: the window stays hidden, so the OS menu is never opened; this runs the item's handler.
async function clickMenuItem(
  app: ElectronApplication,
  menuLabel: string,
  itemLabel: string
): Promise<void> {
  const clicked = await app.evaluate(
    ({ Menu }, { menuLabel: menu, itemLabel: target }) => {
      const item = Menu.getApplicationMenu()
        ?.items.find((entry) => entry.label === menu)
        ?.submenu?.items.find((entry) => entry.label.split('\t')[0] === target)
      item?.click()
      return Boolean(item)
    },
    { menuLabel, itemLabel }
  )
  expect(clicked, `${menuLabel} > ${itemLabel}`).toBe(true)
}

test('opens review views and sidebar panels from the app menu', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-62')
  mkdirSync(screenshotDir, { recursive: true })

  const review = await readSubmenu(electronApp, 'Review')
  expect(review).toEqual([
    { label: 'Pull requests', accelerator: null },
    { label: 'Git graph', accelerator: null }
  ])
  const view = await readSubmenu(electronApp, 'View')
  for (const label of ['Explorer', 'Search', 'Source Control', 'Checks', 'Agents', 'Backlog.md']) {
    expect(view, label).toContainEqual({ label, accelerator: null })
  }

  const connections = orcaPage.getByRole('button', { name: 'Azure DevOps connections' })
  await expect(connections).toHaveCount(0)
  await clickMenuItem(electronApp, 'Review', 'Pull requests')
  await expect(connections).toBeVisible()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'menu-review-pull-requests.png') })

  await clickMenuItem(electronApp, 'View', 'Search')
  await expect(orcaPage.getByPlaceholder('Search', { exact: true })).toBeVisible()
  await expect(connections).toHaveCount(0)

  await clickMenuItem(electronApp, 'Review', 'Git graph')
  await expect(orcaPage.getByTestId('git-graph-tab')).toBeVisible()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'menu-review-git-graph.png') })

  // A full page hides the workspace; the menu brings it back with the panel open.
  await orcaPage.evaluate(() => window.__store?.getState().openSettingsPage())
  await expect(orcaPage.getByTestId('git-graph-tab')).toBeHidden()
  await clickMenuItem(electronApp, 'Review', 'Pull requests')
  await expect(connections).toBeVisible()
})
