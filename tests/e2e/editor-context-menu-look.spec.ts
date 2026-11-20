import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree,
  GOLDEN_CHANGED_PATH,
  seedGoldenSourceEdit
} from './helpers/golden-source-control'
import { waitForSessionReady } from './helpers/store'

/**
 * Monaco's own right-click menu next to Orca's gutter menu, in both themes, in a hidden window:
 * in the file editor, the diff editor and Markdown source. Monaco draws its menu inside a shadow
 * root, which no unit test or page stylesheet reaches.
 */

const CODE_PATH = 'pantry/jam.ts'
const MARKDOWN_PATH = 'pantry/jam.md'

type ItemLook = { fontFamily: string; fontSize: string; fontWeight: string; height: number }

async function rightClickGutterLine(page: Page, line: number): Promise<void> {
  const read = (): Promise<{ x: number; y: number } | null> =>
    page.locator('.monaco-editor .margin .line-numbers').evaluateAll((cells, target) => {
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

async function waitForAnimations(menu: Locator): Promise<void> {
  await expect
    .poll(() =>
      menu.evaluate((node) => node.getAnimations().every((a) => a.playState === 'finished'))
    )
    .toBe(true)
}

function readItemLook(item: Locator): Promise<ItemLook> {
  return item.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: Math.round(node.getBoundingClientRect().height)
    }
  })
}

/** The colour a token resolves to, read the way the menu surface reads it. */
function resolveToken(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${name})`
    document.body.append(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  }, token)
}

function openInEditor(page: Page, filePath: string, relativePath: string, language: string) {
  return page.evaluate(
    ({ absolute, relative, lang }) => {
      const state = window.__store?.getState()
      if (!state?.activeWorktreeId) {
        throw new Error('No active worktree')
      }
      state.openFile({
        filePath: absolute,
        relativePath: relative,
        worktreeId: state.activeWorktreeId,
        runtimeEnvironmentId: null,
        language: lang,
        mode: 'edit'
      })
    },
    { absolute: filePath, relative: relativePath, lang: language }
  )
}

/** Opens Monaco's menu on a text line and returns it with its item look. */
async function openMonacoMenu(page: Page, line: Locator, shotPath: string) {
  const menu = page.locator('.context-view.monaco-menu-container')
  await expect(line).toBeVisible({ timeout: 20_000 })
  // Why retried: an editor that is still settling drops the first right-click.
  await expect(async () => {
    await line.click({ button: 'right', position: { x: 24, y: 6 } })
    await expect(menu.locator('.action-menu-item').first()).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await waitForAnimations(menu)
  const items = menu.locator('.action-menu-item')
  await items.nth(1).hover()
  await menu.screenshot({ path: shotPath })
  const surface = await menu
    .locator('.monaco-scrollable-element')
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node)
      return { background: style.backgroundColor, color: style.color }
    })
  const hovered = await items.nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)
  return { menu, surface, hovered, item: await readItemLook(items.first()) }
}

for (const theme of ['light', 'dark'] as const) {
  test(`the editor's context menu looks like Orca's menus (${theme})`, async ({
    orcaPage,
    testRepoPath,
    registerPostElectronShutdownCleanup
  }) => {
    await waitForSessionReady(orcaPage)
    const shotDir =
      process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-147')
    mkdirSync(shotDir, { recursive: true })
    const shot = (name: string): string => path.join(shotDir, `${theme}-${name}.png`)
    await orcaPage.evaluate(async (next) => {
      await window.__store?.getState().updateSettingsOrThrow({ theme: next })
    }, theme)

    const fixture = createGoldenWorktree(testRepoPath, `menu-look-${theme}`)
    registerPostElectronShutdownCleanup(async () => cleanupGoldenWorktree(testRepoPath, fixture))
    const codePath = path.join(fixture.worktreePath, CODE_PATH)
    mkdirSync(path.dirname(codePath), { recursive: true })
    writeFileSync(codePath, "export const jam = { fruit: 'plum', sugarGrams: 400 }\n".repeat(12))
    const markdownPath = path.join(fixture.worktreePath, MARKDOWN_PATH)
    writeFileSync(markdownPath, '# Plum jam\n\nSimmer the plums with sugar for forty minutes.\n')
    seedGoldenSourceEdit(fixture.worktreePath)
    await activateGoldenWorktree(orcaPage, testRepoPath, fixture.worktreePath)
    await openInEditor(orcaPage, codePath, CODE_PATH, 'typescript')

    // Orca's own menu: the one on a line number, with its second item under the pointer.
    await rightClickGutterLine(orcaPage, 3)
    const orcaMenu = orcaPage.locator('[data-slot="dropdown-menu-content"]')
    await expect(orcaMenu).toBeVisible()
    await waitForAnimations(orcaMenu)
    await orcaMenu.getByRole('menuitem').nth(1).hover()
    await orcaMenu.screenshot({ path: shot('orca-menu') })
    const orcaItem = await readItemLook(orcaMenu.getByRole('menuitem').first())
    await orcaPage.keyboard.press('Escape')
    await expect(orcaMenu).toHaveCount(0)
    const popover = await resolveToken(orcaPage, '--popover')
    const popoverForeground = await resolveToken(orcaPage, '--popover-foreground')

    const expectOrcaLook = (look: Awaited<ReturnType<typeof openMonacoMenu>>): void => {
      expect(look.item).toEqual(orcaItem)
      expect(look.surface).toEqual({ background: popover, color: popoverForeground })
      // Not Monaco's blue selection: the menu's own text colour at the primitive's strength.
      expect(look.hovered).toMatch(/^color\(srgb [\d.]+ [\d.]+ [\d.]+ \/ [\d.]+\)$/)
      expect(Number(look.hovered.split('/')[1]?.replace(')', ''))).toBe(
        theme === 'dark' ? 0.14 : 0.08
      )
    }

    // File editor: Monaco's items and Orca's additions stay.
    const code = await openMonacoMenu(
      orcaPage,
      orcaPage.locator('.monaco-editor .view-line').nth(4),
      shot('editor-menu')
    )
    for (const label of [
      'Go to Definition',
      'Annotate with Git Blame',
      'Show History for Selection'
    ]) {
      await expect(code.menu.getByText(label, { exact: true })).toBeVisible()
    }
    expectOrcaLook(code)
    await orcaPage.keyboard.press('Escape')
    await expect(code.menu).toBeHidden()

    // Markdown source.
    await openInEditor(orcaPage, markdownPath, MARKDOWN_PATH, 'markdown')
    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      if (!state?.activeFileId) {
        throw new Error('No active editor file')
      }
      state.setMarkdownViewMode(state.activeFileId, 'source')
    })
    const markdown = await openMonacoMenu(
      orcaPage,
      orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'Simmer the plums' }),
      shot('markdown-source-menu')
    )
    expectOrcaLook(markdown)
    await orcaPage.keyboard.press('Escape')
    await expect(markdown.menu).toBeHidden()

    // Diff editor.
    await orcaPage.evaluate(
      ({ absolute, relative }) => {
        const state = window.__store?.getState()
        if (!state?.activeWorktreeId) {
          throw new Error('No active worktree')
        }
        state.openDiff(state.activeWorktreeId, absolute, relative, 'typescript', false)
      },
      {
        absolute: path.join(fixture.worktreePath, GOLDEN_CHANGED_PATH),
        relative: GOLDEN_CHANGED_PATH
      }
    )
    const diff = await openMonacoMenu(
      orcaPage,
      orcaPage
        .locator('.modified-in-monaco-diff-editor .view-line')
        .filter({ hasText: 'golden daily loop' }),
      shot('diff-menu')
    )
    expectOrcaLook(diff)
    await orcaPage.keyboard.press('Escape')
  })
}
