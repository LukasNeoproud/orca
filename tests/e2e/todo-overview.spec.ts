import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
 * The TODO view in the explorer's Contents mode on invented files, in a window that stays hidden:
 * the real bundled ripgrep, the real branch comparison from Source Control and the editor reveal.
 */

function write(root: string, relativePath: string, lines: string[]): void {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${lines.join('\n')}\n`)
}

function commitAll(worktreePath: string, subject: string): void {
  execFileSync('git', ['add', '-A'], { cwd: worktreePath, stdio: 'pipe' })
  execFileSync('git', ['commit', '--no-verify', '-m', subject], {
    cwd: worktreePath,
    stdio: 'pipe'
  })
}

async function readRoute(page: Page): Promise<{ tab: string; view: string }> {
  return page.evaluate(() => {
    const state = window.__store!.getState()
    return { tab: state.rightSidebarTab, view: state.rightSidebarExplorerView }
  })
}

async function showContentsView(page: Page): Promise<void> {
  await page.evaluate(() => window.__store!.getState().showRightSidebarSearch())
}

// Why: the hidden query row's buttons stay painted while their transition runs.
async function waitForQueryRowHidden(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Match Case' })).toBeHidden()
}

function fileRow(panel: Locator, name: string): Locator {
  return panel.getByRole('button').filter({ hasText: name }).first()
}

/** Row texts as rendered: `<name><folder><count>` for files and `<line><text>` for comments. */
function listed(panel: Locator): Promise<string[]> {
  return panel
    .locator('button')
    .evaluateAll((buttons) => buttons.map((button) => (button.textContent ?? '').trim()))
}

test('lists TODO and FIXME comments of the workspace and of its changed files', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-65')
  mkdirSync(screenshotDir, { recursive: true })
  const shot = (name: string): Promise<Buffer> =>
    orcaPage.screenshot({ path: path.join(screenshotDir, `${name}.png`) })

  const fixture = createGoldenWorktree(testRepoPath, 'todo')
  const baseBranch = `${fixture.branchName}-base`
  registerPostElectronShutdownCleanup(async () => {
    cleanupGoldenWorktree(testRepoPath, fixture)
    execFileSync('git', ['branch', '-D', baseBranch], { cwd: testRepoPath, stdio: 'pipe' })
  })
  const root = fixture.worktreePath
  // On the base: unchanged by the branch.
  write(root, 'kitchen/Oven.kt', ['class Oven {', '    // TODO: preheat faster', '}'])
  commitAll(root, 'Add the oven')
  execFileSync('git', ['branch', baseBranch], { cwd: root, stdio: 'pipe' })
  // Committed on the branch.
  write(root, 'kitchen/Bread.kt', [
    'class Bread {',
    '    // TODO: add rye flour',
    '    val label = "TODO is not a comment"',
    '    val salt = 8',
    '    /* FIXME: salt is guessed */',
    '}'
  ])
  commitAll(root, 'Add the bread')
  // Not committed yet.
  write(root, 'scripts/bake.sh', ['#!/bin/sh', '# FIXME: pin the oven temperature'])

  await activateGoldenWorktree(orcaPage, testRepoPath, root)
  await orcaPage.evaluate(async (ref) => {
    const state = window.__store!.getState()
    await state.updateWorktreeMeta(state.activeWorktreeId!, { baseRef: ref })
  }, baseBranch)

  await showContentsView(orcaPage)
  await orcaPage.getByRole('button', { name: 'Show TODO and FIXME comments' }).click()
  const panel = orcaPage.getByTestId('todo-overview-panel')
  await expect(panel).toBeVisible()
  await expect(fileRow(panel, 'Oven.kt')).toBeVisible({ timeout: 20_000 })
  const all = await listed(panel)
  for (const row of [
    'Oven.ktkitchen1',
    '2// TODO: preheat faster',
    'Bread.ktkitchen2',
    '2// TODO: add rye flour',
    '5/* FIXME: salt is guessed */',
    'bake.shscripts1',
    '2# FIXME: pin the oven temperature'
  ]) {
    expect(all).toContain(row)
  }
  expect(all.join('\n')).not.toContain('is not a comment')
  // The view lives only in this renderer: what paired clients and persistence see is unchanged.
  expect(await readRoute(orcaPage)).toEqual({ tab: 'explorer', view: 'search' })
  await waitForQueryRowHidden(orcaPage)
  await shot('01-todo-all')

  // Before Source Control compared the branch, only uncommitted files count as changed.
  await orcaPage.getByRole('checkbox', { name: 'Only files changed on this branch' }).click()
  await expect(panel).toContainText('only uncommitted changes count')
  await expect(fileRow(panel, 'bake.sh')).toBeVisible()
  await expect(fileRow(panel, 'Bread.kt')).toHaveCount(0)
  await shot('02-todo-changed-uncommitted-only')

  await panel.getByRole('button', { name: 'Compare in Source Control' }).click()
  await expect
    .poll(
      () =>
        orcaPage.evaluate(() => {
          const state = window.__store!.getState()
          return state.gitBranchCompareSummaryByWorktree[state.activeWorktreeId!]?.status
        }),
      { timeout: 30_000 }
    )
    .toBe('ready')
  await orcaPage.evaluate(() => window.__store!.getState().setRightSidebarTab('explorer'))
  await expect(panel).toContainText(`Changes against ${baseBranch} plus uncommitted changes.`)
  await expect(fileRow(panel, 'Bread.kt')).toBeVisible({ timeout: 20_000 })
  await expect(fileRow(panel, 'bake.sh')).toBeVisible()
  await expect(fileRow(panel, 'Oven.kt')).toHaveCount(0)
  await shot('03-todo-changed-against-base')

  // A click opens the file in the editor on the comment's line.
  await panel.getByRole('button', { name: /^5\s*\/\* FIXME\s*: salt is guessed/ }).click()
  await expect
    .poll(
      () =>
        orcaPage.evaluate(() => {
          const state = window.__store!.getState()
          const file = state.openFiles.find((entry) => entry.id === state.activeFileId)
          return file?.relativePath
        }),
      { timeout: 20_000 }
    )
    .toBe('kitchen/Bread.kt')
  await expect
    .poll(() => orcaPage.evaluate(() => window.__monacoEditorE2E?.snapshot().selection ?? null), {
      timeout: 20_000
    })
    .toMatchObject({ selectionStartLineNumber: 5, positionLineNumber: 5 })
  await shot('04-todo-opened-at-line')

  // A list over the cap says it is cut.
  write(
    root,
    'kitchen/Backlog.kt',
    Array.from({ length: 1005 }, (_, index) => `// TODO: step ${index + 1}`)
  )
  await orcaPage.getByRole('checkbox', { name: 'Only files changed on this branch' }).click()
  await orcaPage.getByRole('button', { name: 'Search again' }).click()
  await expect(panel).toContainText('Showing the first 1000 comments; the rest are left out.', {
    timeout: 20_000
  })
  await shot('05-todo-truncated')

  // A folder workspace without git lists its comments and offers no changed-files filter.
  const folder = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-todo-folder-')))
  registerPostElectronShutdownCleanup(async () => rmSync(folder, { recursive: true, force: true }))
  write(folder, 'notes/plan.py', ['def plan():', '    # TODO: write the plan', '    pass'])
  await orcaPage.evaluate(async (folderPath) => {
    const repo = await window.__store!.getState().addNonGitFolder(folderPath)
    if (!repo) {
      throw new Error('Could not add folder workspace')
    }
  }, folder)
  await expect
    .poll(() =>
      orcaPage.evaluate(() => {
        const state = window.__store!.getState()
        return state.getKnownWorktreeById(state.activeWorktreeId!)?.path
      })
    )
    .toBe(folder)
  await showContentsView(orcaPage)
  await orcaPage.getByRole('button', { name: 'Show TODO and FIXME comments' }).click()
  await expect(fileRow(panel, 'plan.py')).toBeVisible({ timeout: 20_000 })
  expect(await listed(panel)).toContain('2# TODO: write the plan')
  await expect(
    orcaPage.getByRole('checkbox', { name: 'Only files changed on this branch' })
  ).toHaveCount(0)
  await waitForQueryRowHidden(orcaPage)
  await shot('06-todo-folder-workspace')
})
