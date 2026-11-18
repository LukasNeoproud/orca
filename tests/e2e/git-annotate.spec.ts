import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree
} from './helpers/golden-source-control'
import { waitForSessionReady } from './helpers/store'

/**
 * Annotate and block history on an invented repository, in a window that stays hidden. What a
 * unit test cannot reach: Monaco drawing the annotations in its gutter, its hover and click,
 * and the request crossing IPC into the real Git.
 */

const RELATIVE_PATH = 'kitchen/bread.ts'

type Commit = { author: string; date: string; subject: string; salt: number; yeast: number }

const COMMITS: Commit[] = [
  { author: 'Ada Baker', date: '2024-03-04', subject: 'Add the bread recipe', salt: 9, yeast: 3 },
  {
    author: 'Noor Castillo',
    date: '2024-05-06',
    subject: 'Use less salt and yeast',
    salt: 8,
    yeast: 2
  },
  {
    author: 'Ada Baker',
    date: '2024-07-08',
    subject: 'Halve the yeast for a slow rise',
    salt: 8,
    yeast: 1
  }
]

function recipe({ salt, yeast }: Commit): string {
  return [
    'export const loaf = {',
    '  flour: 500,',
    '  water: 350,',
    `  salt: ${salt},`,
    `  yeast: ${yeast},`,
    '  restMinutes: 60,',
    '  bakeMinutes: 35,',
    '  ovenCelsius: 230',
    '}',
    '',
    "export const steps = ['mix', 'rest', 'shape', 'bake']",
    ''
  ].join('\n')
}

/** Commits the recipe once per entry and returns each commit's short hash. */
function commitRecipeHistory(worktreePath: string): string[] {
  const filePath = path.join(worktreePath, RELATIVE_PATH)
  mkdirSync(path.dirname(filePath), { recursive: true })
  return COMMITS.map((commit) => {
    writeFileSync(filePath, recipe(commit))
    const git = (args: string[]): string =>
      execFileSync('git', args, { cwd: worktreePath, stdio: 'pipe' }).toString().trim()
    git(['add', RELATIVE_PATH])
    const email = `${commit.author.split(' ')[0]?.toLowerCase()}@example.invalid`
    git([
      '-c',
      `user.name=${commit.author}`,
      '-c',
      `user.email=${email}`,
      'commit',
      '--no-verify',
      `--date=${commit.date}T10:00:00`,
      '-m',
      commit.subject
    ])
    return git(['rev-parse', '--short=7', 'HEAD'])
  })
}

function gutterRow(page: Page, line: number): Locator {
  return page
    .locator('.monaco-editor .margin .line-numbers')
    .filter({ has: page.locator('span', { hasText: new RegExp(`^${line}$`) }) })
}

async function rightClickGutterLine(page: Page, line: number): Promise<void> {
  const cell = page.locator('.monaco-editor .margin .line-numbers')
  const read = (): Promise<{ x: number; y: number } | null> =>
    cell.evaluateAll((cells, target) => {
      const match = cells.find((node) => (node.textContent ?? '').trim().endsWith(target))
      if (!match) {
        return null
      }
      const rect = match.getBoundingClientRect()
      return { x: Math.round(rect.right - 6), y: Math.round(rect.y + rect.height / 2) }
    }, `${line}`)
  await expect.poll(read, { timeout: 20_000, message: `gutter line ${line}` }).not.toBeNull()
  const point = await read()
  if (!point) {
    throw new Error(`gutter line ${line} has no box`)
  }
  await page.mouse.click(point.x, point.y, { button: 'right' })
}

// Why: the menu fades in, and a screenshot taken mid-fade shows it translucent.
async function waitForMenuAnimation(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('[data-slot="dropdown-menu-content"]')
        .evaluate((menu) => menu.getAnimations().every((a) => a.playState === 'finished'))
    )
    .toBe(true)
}

test('annotates the editor lines and lists the history of a selected block', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-66')
  mkdirSync(screenshotDir, { recursive: true })
  const shot = (name: string): Promise<Buffer> =>
    orcaPage.screenshot({ path: path.join(screenshotDir, `${name}.png`) })

  const fixture = createGoldenWorktree(testRepoPath, 'annotate')
  registerPostElectronShutdownCleanup(async () => cleanupGoldenWorktree(testRepoPath, fixture))
  const [first = '', second = '', third = ''] = commitRecipeHistory(fixture.worktreePath)
  await activateGoldenWorktree(orcaPage, testRepoPath, fixture.worktreePath)
  await orcaPage.evaluate(
    ({ filePath, relativePath }) => {
      const state = window.__store?.getState()
      if (!state?.activeWorktreeId) {
        throw new Error('No active worktree')
      }
      state.openFile({
        filePath,
        relativePath,
        worktreeId: state.activeWorktreeId,
        runtimeEnvironmentId: null,
        language: 'typescript',
        mode: 'edit'
      })
    },
    { filePath: path.join(fixture.worktreePath, RELATIVE_PATH), relativePath: RELATIVE_PATH }
  )

  // The gutter menu offers both actions; nothing is annotated yet.
  await rightClickGutterLine(orcaPage, 4)
  const toggle = orcaPage.getByRole('menuitemcheckbox', { name: 'Annotate with Git Blame' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(orcaPage.getByRole('menuitem', { name: 'Show History for Line 4' })).toBeVisible()
  await waitForMenuAnimation(orcaPage)
  await shot('01-gutter-menu')
  await toggle.click()

  // One annotation per run of lines from the same commit: short hash, date, author.
  const groups = orcaPage.locator('.orca-git-annotate-group-start .orca-git-annotate-cell')
  const added = `${first} 2024-03-04 Ada Baker`
  await expect(groups).toHaveText([
    added,
    `${second} 2024-05-06 Noor Castillo`,
    `${third} 2024-07-08 Ada Baker`,
    added
  ])
  await expect(gutterRow(orcaPage, 4)).toContainText(second)
  await expect(gutterRow(orcaPage, 5)).toContainText(third)
  // Continuation lines of a group carry no text of their own.
  await expect(gutterRow(orcaPage, 2).locator('.orca-git-annotate-cell')).toHaveText('')
  await shot('02-annotated')

  // Hover names the commit.
  await gutterRow(orcaPage, 4).locator('.orca-git-annotate-cell').hover()
  const hover = orcaPage.locator('.monaco-hover:visible')
  await expect(hover).toContainText('Use less salt and yeast', { timeout: 10_000 })
  await expect(hover).toContainText('Noor Castillo')
  await expect.poll(() => hover.evaluate((widget) => getComputedStyle(widget).opacity)).toBe('1')
  await shot('03-hover')
  await orcaPage.mouse.move(600, 500)

  // History of lines 4–5, from the editor's own context menu.
  const saltLine = orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'salt: 8' })
  await saltLine.click()
  await orcaPage.keyboard.press('Home')
  await orcaPage.keyboard.press('Shift+ArrowDown')
  await orcaPage.keyboard.press('Shift+End')
  await saltLine.click({ button: 'right' })
  const banner = orcaPage.getByTestId('git-line-history-banner')
  // Why retried: Monaco arms its menu items on a timer, which a hidden window throttles.
  await expect(async () => {
    await orcaPage
      .getByText('Show History for Selection', { exact: true })
      .click({ timeout: 2_000 })
    await expect(banner).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(banner).toContainText('History of bread.ts, lines 4–5', { timeout: 20_000 })
  // Newest first, and only the commits that touched the block: the repository's first is absent.
  const dock = banner.locator('xpath=..')
  await expect(dock).toContainText(
    /Halve the yeast for a slow rise.*Use less salt and yeast.*Add the bread recipe/s
  )
  await expect(dock).not.toContainText('Initial commit for E2E tests')
  await dock.getByText('Use less salt and yeast', { exact: true }).click()
  const patch = orcaPage.getByTestId('git-line-history-patch')
  await expect(patch).toContainText('-  salt: 9,')
  await expect(patch).toContainText('+  salt: 8,')
  await expect(patch).toContainText('+  yeast: 2,')
  await expect(patch).not.toContainText('flour')
  await shot('04-block-history')
  await banner.getByRole('button', { name: 'Show all commits' }).click()
  await expect(banner).toHaveCount(0)

  // An unsaved line is uncommitted, and its neighbours keep their commits one line lower.
  await orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'water: 350' }).click()
  await orcaPage.keyboard.press('End')
  await orcaPage.keyboard.press('Enter')
  await orcaPage.keyboard.type('rye: 50,')
  await expect(gutterRow(orcaPage, 4)).toContainText('Uncommitted')
  await expect(gutterRow(orcaPage, 5)).toContainText(second)
  await expect(gutterRow(orcaPage, 6)).toContainText(third)
  await shot('05-unsaved-line')

  // The history is read from the saved file, so it asks for a save instead of answering wrongly.
  await rightClickGutterLine(orcaPage, 5)
  await orcaPage.getByRole('menuitem', { name: 'Show History for Line 5' }).click()
  await expect(orcaPage.getByText('Save the file to see the history of its lines.')).toBeVisible()
  await expect(banner).toHaveCount(0)

  // Undo back to the saved text; the annotations follow.
  await orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'rye: 50' }).click()
  for (let step = 0; step < 12; step += 1) {
    await orcaPage.keyboard.press('ControlOrMeta+z')
  }
  await expect(gutterRow(orcaPage, 4)).toContainText(second)
  await expect(orcaPage.locator('.orca-git-annotate-cell', { hasText: 'Uncommitted' })).toHaveCount(
    0
  )

  // Clicking an annotation opens its commit in the Git graph.
  await gutterRow(orcaPage, 5).locator('.orca-git-annotate-cell').click()
  const graph = orcaPage.getByTestId('git-graph-tab')
  await expect(graph).toBeVisible({ timeout: 20_000 })
  await expect(graph.locator('[data-testid="git-graph-row"][aria-selected="true"]')).toContainText(
    'Halve the yeast for a slow rise',
    { timeout: 20_000 }
  )
  await shot('06-commit-in-graph')
})
