import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree
} from './helpers/golden-source-control'
import {
  commitSnapshotFixture,
  MOVED_LABEL,
  SNAPSHOT_FIXTURE_PATHS
} from './helpers/snapshot-image-fixture'
import { waitForSessionReady } from './helpers/store'

/**
 * The Snapshots view on an invented repository: the real branch comparison, the real image
 * loading and the real pixel comparison in its worker, in a window that stays hidden.
 */

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

async function pinActiveWorktreeBase(page: Page, baseRef: string): Promise<void> {
  await page.evaluate(async (ref) => {
    const state = window.__store?.getState()
    if (!state?.activeWorktreeId) {
      throw new Error('No active worktree')
    }
    await state.updateWorktreeMeta(state.activeWorktreeId, { baseRef: ref })
  }, baseRef)
}

/** One pixel of a shown image, beside the colour a theme token resolves to, both read in the page. */
function pixelBesideToken(
  image: Locator,
  point: { x: number; y: number },
  token: string
): Promise<{ pixel: number[]; token: number[] }> {
  return image.evaluate(
    async (element, { x, y, name }) => {
      if (!(element instanceof HTMLImageElement)) {
        throw new Error('Not an image')
      }
      await element.decode()
      const canvas = document.createElement('canvas')
      canvas.width = element.naturalWidth
      canvas.height = element.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        throw new Error('No canvas')
      }
      context.drawImage(element, 0, 0)
      const pixel = Array.from(context.getImageData(x, y, 1, 1).data)
      context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      context.fillRect(0, 0, 1, 1)
      return { pixel, token: Array.from(context.getImageData(0, 0, 1, 1).data) }
    },
    { ...point, name: token }
  )
}

function paneScroll(page: Page): Promise<{ top: number; height: number }[]> {
  return page
    .getByTestId('snapshot-diff-detail')
    .locator('.scrollbar-editor')
    .evaluateAll((surfaces) =>
      surfaces.map((surface) => ({
        top: Math.round(surface.scrollTop),
        height: surface.scrollHeight - surface.clientHeight
      }))
    )
}

test('shows the changed snapshot images of a branch as before, after and difference', async ({
  electronApp,
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-64')
  mkdirSync(screenshotDir, { recursive: true })
  // Why: a hidden window paints no transition frames, so a shot would show the state before the last click.
  await orcaPage.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
  const shot = (name: string): Promise<Buffer> =>
    orcaPage.screenshot({ path: path.join(screenshotDir, `${name}.png`) })

  const fixture = createGoldenWorktree(testRepoPath, 'snapshots')
  const baseBranch = `${fixture.branchName}-base`
  registerPostElectronShutdownCleanup(async () => {
    cleanupGoldenWorktree(testRepoPath, fixture)
    execFileSync('git', ['branch', '-D', baseBranch], { cwd: testRepoPath, stdio: 'pipe' })
  })
  commitSnapshotFixture(fixture.worktreePath, baseBranch)
  await activateGoldenWorktree(orcaPage, testRepoPath, fixture.worktreePath)
  await pinActiveWorktreeBase(orcaPage, baseBranch)

  // From the main menu, with no comparison yet: Source Control runs it, then the view opens.
  const view = orcaPage.getByTestId('snapshot-diff-view')
  await expect(view).toHaveCount(0)
  await clickMenuItem(electronApp, 'View', 'Snapshots')
  await expect(view).toBeVisible({ timeout: 30_000 })

  const rows = view.getByTestId('snapshot-diff-entry')
  await expect(rows).toHaveCount(4)
  const listed = await rows.evaluateAll((items) =>
    items.map((item) => `${item.getAttribute('title')} ${item.textContent}`)
  )
  const rowOf = (relativePath: string): string =>
    listed.find((row) => row.startsWith(`${relativePath} `)) ?? `missing ${relativePath}`
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.changed)).toContain('Paparazzi')
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.changed)).toMatch(/\.png M/)
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.added)).toContain('swift-snapshot-testing')
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.added)).toMatch(/\.png A/)
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.removed)).toContain('Roborazzi')
  expect(rowOf(SNAPSHOT_FIXTURE_PATHS.removed)).toMatch(/\.png D/)
  expect(listed.join('\n')).not.toContain(SNAPSHOT_FIXTURE_PATHS.unrelatedImage)
  await expect(view).toContainText(`compared with ${baseBranch}`)

  // The changed snapshot: three panes, numbered areas, a summary.
  await rows.filter({ hasText: 'PaymentScreenTest_default' }).click()
  const detail = view.getByTestId('snapshot-diff-detail')
  const summary = detail.getByTestId('snapshot-diff-summary')
  await expect(summary).toContainText('Change areas: 5', { timeout: 20_000 })
  for (const label of ['Before', 'After', 'Difference']) {
    await expect(detail.locator('section').getByText(label, { exact: true })).toBeVisible()
  }
  await expect(detail.locator('img')).toHaveCount(3)
  const frames = detail.locator('[data-snapshot-region]')
  await expect(frames).toHaveText(['1', '2', '3', '4', '5'])
  const areas = detail.getByRole('button', { name: /^Go to change area/ })
  await expect(areas).toHaveText([
    '128 × 24 px',
    '280 × 14 px',
    // The moved label's two words, more than a cell apart.
    '358 × 24 px',
    '458 × 24 px',
    '5280 × 48 px'
  ])
  await shot('snapshot-diff-changed')

  // Jumping to an area scrolls every pane to it once the image is larger than its pane.
  const zoomIn = detail.getByRole('button', { name: 'Zoom in' })
  for (let step = 0; step < 6; step += 1) {
    await zoomIn.click()
  }
  await expect.poll(async () => (await paneScroll(orcaPage))[2]?.height ?? 0).toBeGreaterThan(200)
  await areas.nth(4).click()
  await expect(frames.nth(4)).toHaveAttribute('data-current', 'true')
  await expect(areas.nth(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(frames.nth(4)).toBeInViewport()
  const low = await paneScroll(orcaPage)
  expect(low[2].top).toBeGreaterThan(100)
  expect(low.map((pane) => pane.top)).toEqual([low[2].top, low[2].top, low[2].top])
  await shot('snapshot-diff-area-5-zoomed')
  await areas.nth(0).click()
  await expect(frames.nth(0)).toBeInViewport()
  await expect.poll(async () => (await paneScroll(orcaPage))[2].top).toBeLessThan(low[2].top)
  await detail.getByRole('button', { name: 'Reset zoom' }).click()

  // Highlighting off: no outlines, and the difference image itself changes.
  const difference = detail.locator('img').nth(2)
  const highlighted = await difference.getAttribute('src')
  const toggle = detail.getByRole('button', { name: 'Highlight changes' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(frames).toHaveCount(0)
  expect(await difference.getAttribute('src')).not.toBe(highlighted)
  await shot('snapshot-diff-highlight-off')
  await toggle.click()
  await expect(difference).toHaveAttribute('src', highlighted ?? '')

  // Moved text: its old place in the removed colour, its new place in the added one.
  await expect(detail.getByTestId('snapshot-diff-legend')).toHaveText(
    'Removed (before)Added or changed (after)'
  )
  const { x, y, afterY, scale } = MOVED_LABEL
  const lastLetter = x + (MOVED_LABEL.text.length - 1) * 6 * scale
  // Top row of the first letter, printed only before the move.
  const oldOnly = await pixelBesideToken(
    difference,
    { x: x + scale, y },
    '--git-decoration-deleted'
  )
  expect(oldOnly.pixel).toEqual(oldOnly.token)
  // Bottom row of the last letter, printed only after it.
  const newOnly = await pixelBesideToken(
    difference,
    { x: lastLetter + scale, y: afterY + 6 * scale },
    '--git-decoration-added'
  )
  expect(newOnly.pixel).toEqual(newOnly.token)
  // The stem of the last letter where both overlap stays faint.
  const overlap = await pixelBesideToken(
    difference,
    { x: lastLetter, y: afterY },
    '--git-decoration-added'
  )
  expect(overlap.pixel[3]).toBeLessThan(255)
  for (let step = 0; step < 3; step += 1) {
    await zoomIn.click()
  }
  await areas.nth(2).click()
  await expect(areas.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(frames.nth(2)).toBeInViewport()
  await shot('snapshot-diff-moved-text')

  // Blend: the after image over the before image, its share set with a slider.
  await detail.getByRole('button', { name: 'Blend' }).click()
  await expect(detail.locator('section').getByText('Blend', { exact: true })).toBeVisible()
  const afterLayer = detail.getByTestId('snapshot-blend-after')
  await expect(afterLayer).toHaveCSS('opacity', '0.5')
  await expect(detail.getByRole('button', { name: 'Highlight changes' })).toHaveCount(0)
  await expect(detail.getByTestId('snapshot-diff-legend')).toHaveCount(0)
  await shot('snapshot-diff-blend')
  const share = detail.getByRole('slider', { name: 'Share of the after image' })
  await share.press('End')
  await expect(afterLayer).toHaveCSS('opacity', '1')
  await share.press('Home')
  await expect(afterLayer).toHaveCSS('opacity', '0')
  await detail.getByRole('button', { name: 'Difference' }).click()
  await expect(afterLayer).toHaveCount(0)
  await detail.getByRole('button', { name: 'Reset zoom' }).click()

  // Above the limit the difference is not computed, and the pane says why.
  await rows.filter({ hasText: 'TabletCatalogTest_wide' }).click()
  await expect(detail.getByRole('status')).toHaveText(
    'The difference is not computed: 4000 × 2100 px is above the limit of 8 megapixels.'
  )
  await expect(detail.locator('img')).toHaveCount(2)
  await shot('snapshot-diff-too-large')

  // Added and removed snapshots have one side only.
  await rows.filter({ hasText: 'testEmptyCart.1.png' }).click()
  await expect(detail.getByRole('status')).toContainText('New snapshot')
  await expect(detail.locator('img')).toHaveCount(1)
  await shot('snapshot-diff-added')
  await rows.filter({ hasText: 'ProfileScreen.png' }).click()
  await expect(detail.getByRole('status')).toContainText('Removed snapshot')
  await expect(detail.locator('img')).toHaveCount(1)

  // From the diff: back to its sections, and its toolbar offers the snapshots again.
  await view.getByRole('button', { name: 'Back to diff' }).click()
  await expect(view).toHaveCount(0)
  const openSnapshots = orcaPage.getByRole('button', { name: 'Snapshots (4)' })
  await expect(openSnapshots).toBeVisible()
  await shot('snapshot-diff-toolbar-button')
  await openSnapshots.click()
  await expect(view).toBeVisible()
  await expect(rows).toHaveCount(4)
})
