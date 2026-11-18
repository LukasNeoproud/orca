import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { quotePosixShell } from '../../src/shared/wsl-login-shell-command'

/**
 * Open in from the editor and diff gutters, through the real right-click. What a unit
 * test cannot reach: Monaco reporting the pressed gutter line, and the request crossing
 * IPC into the argv the chosen application is started with.
 */

test.skip(process.platform === 'win32', 'Needs a POSIX recorder script')

const APP_LABEL = 'Recording editor'
const LINE_COUNT = 24

type Recorder = { command: string; receipt: () => string[]; dispose: () => void }

// Why named `code`: the launcher name selects the VS Code argument syntax. The script only
// writes its arguments to a file and exits; it never opens or focuses a window.
function createRecorder(): Recorder {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-open-in-ide-')))
  const command = path.join(dir, 'code')
  const receiptPath = path.join(dir, 'receipt')
  writeFileSync(command, `#!/bin/sh\nprintf '%s\\n' "$@" > ${quotePosixShell(receiptPath)}\n`)
  chmodSync(command, 0o755)
  return {
    command,
    receipt: () =>
      existsSync(receiptPath) ? readFileSync(receiptPath, 'utf8').trimEnd().split('\n') : [],
    dispose: () => rmSync(dir, { recursive: true, force: true })
  }
}

async function readWorktreePath(page: Page, worktreeId: string): Promise<string> {
  return page.evaluate((wId) => {
    const worktree = Object.values(window.__store?.getState().worktreesByRepo ?? {})
      .flat()
      .find((entry) => entry.id === wId)
    if (!worktree) {
      throw new Error('active worktree not found')
    }
    return worktree.path
  }, worktreeId)
}

async function useRecorderApplication(page: Page, command: string): Promise<void> {
  await page.evaluate(
    async ({ command, label }) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('window.__store is not available')
      }
      await state.updateSettings({
        diffDefaultView: 'inline',
        openInApplications: [{ id: 'recorder', label, command }]
      })
    },
    { command, label: APP_LABEL }
  )
}

async function rightClickGutterLine(page: Page, editor: string, line: number): Promise<void> {
  const cell = page.locator(`${editor} .margin .line-numbers`).filter({ hasText: `${line}` })
  await expect
    .poll(
      async () =>
        cell.evaluateAll(
          (cells, target) => cells.some((node) => node.textContent?.trim() === target),
          `${line}`
        ),
      { timeout: 20_000, message: `gutter line ${line} never rendered` }
    )
    .toBe(true)
  const point = await cell.evaluateAll((cells, target) => {
    const match = cells.find((node) => node.textContent?.trim() === target)
    if (!match) {
      return null
    }
    const rect = match.getBoundingClientRect()
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
  }, `${line}`)
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

function numberedLines(): string {
  return `${Array.from({ length: LINE_COUNT }, (_, index) => `export const line${index + 1} = ${index + 1}`).join('\n')}\n`
}

test.describe('Open file in external editor', () => {
  let recorder: Recorder

  test.beforeEach(async ({ orcaPage }) => {
    recorder = createRecorder()
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await useRecorderApplication(orcaPage, recorder.command)
  })

  test.afterEach(() => {
    recorder.dispose()
  })

  test('the editor gutter menu opens the file at the clicked line', async ({
    orcaPage
  }, testInfo) => {
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const worktreePath = await readWorktreePath(orcaPage, worktreeId)
    const relativePath = 'open-in-ide-editor.ts'
    const filePath = path.join(worktreePath, relativePath)
    writeFileSync(filePath, numberedLines())
    try {
      await orcaPage.evaluate(
        ({ filePath, relativePath, worktreeId }) => {
          window.__store?.getState().openFile({
            filePath,
            relativePath,
            worktreeId,
            runtimeEnvironmentId: null,
            language: 'typescript',
            mode: 'edit'
          })
        },
        { filePath, relativePath, worktreeId }
      )

      await rightClickGutterLine(orcaPage, '.monaco-editor', 7)
      const openInApp = orcaPage.getByRole('menuitem', { name: `Open in ${APP_LABEL}` })
      await expect(openInApp).toBeVisible()
      await waitForMenuAnimation(orcaPage)
      await orcaPage.screenshot({ path: testInfo.outputPath('editor-gutter-open-in.png') })
      await openInApp.click()

      await expect.poll(recorder.receipt).toEqual(['--goto', `${filePath}:7`])
    } finally {
      rmSync(filePath, { force: true })
    }
  })

  test('the header path menu opens the file at the cursor line', async ({ orcaPage }, testInfo) => {
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const worktreePath = await readWorktreePath(orcaPage, worktreeId)
    const relativePath = 'open-in-ide-header.ts'
    const filePath = path.join(worktreePath, relativePath)
    writeFileSync(filePath, numberedLines())
    try {
      await orcaPage.evaluate(
        ({ filePath, relativePath, worktreeId }) => {
          window.__store?.getState().openFile({
            filePath,
            relativePath,
            worktreeId,
            runtimeEnvironmentId: null,
            language: 'typescript',
            mode: 'edit'
          })
        },
        { filePath, relativePath, worktreeId }
      )
      await orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'line5 = 5' }).click()

      await orcaPage.locator('.editor-header-path-row').click({ button: 'right' })
      const openInApp = orcaPage.getByRole('menuitem', { name: `Open in ${APP_LABEL}` })
      await expect(openInApp).toBeVisible()
      await waitForMenuAnimation(orcaPage)
      await orcaPage.screenshot({ path: testInfo.outputPath('header-path-open-in.png') })
      await openInApp.click()

      await expect.poll(recorder.receipt).toEqual(['--goto', `${filePath}:5`])
    } finally {
      rmSync(filePath, { force: true })
    }
  })

  test('the diff gutter menu opens the workspace file at the clicked line', async ({
    orcaPage
  }, testInfo) => {
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const worktreePath = await readWorktreePath(orcaPage, worktreeId)
    const relativePath = path.join('src', 'index.ts')
    const filePath = path.join(worktreePath, relativePath)
    writeFileSync(filePath, numberedLines())
    try {
      await orcaPage.evaluate(
        ({ filePath, relativePath, worktreeId }) => {
          window.__store
            ?.getState()
            .openDiff(worktreeId, filePath, relativePath, 'typescript', false)
        },
        { filePath, relativePath, worktreeId }
      )

      await rightClickGutterLine(orcaPage, '.monaco-editor.modified-in-monaco-diff-editor', 11)
      const openInApp = orcaPage.getByRole('menuitem', { name: `Open in ${APP_LABEL}` })
      await expect(openInApp).toBeVisible()
      await waitForMenuAnimation(orcaPage)
      await orcaPage.screenshot({ path: testInfo.outputPath('diff-gutter-open-in.png') })
      await openInApp.click()

      await expect.poll(recorder.receipt).toEqual(['--goto', `${filePath}:11`])
    } finally {
      execFileSync('git', ['checkout', '--', relativePath], { cwd: worktreePath, stdio: 'pipe' })
    }
  })
})
