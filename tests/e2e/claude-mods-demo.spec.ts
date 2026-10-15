// The Claude Code mods demo: a visible Orca with a structured Claude chat, the demo mods loaded
// and the /mods-demo guide open. Started by `pnpm demo:claude-mods`
// (tests/tools/claude-mods-demo.mjs); skipped in every other run.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const DEMO = process.env.ORCA_CLAUDE_MODS_DEMO === '1'

test.use({
  launchEnv: {
    PATH: [process.env.CLAUDE_MODS_DEMO_BIN ?? '', process.env.PATH ?? ''].join(path.delimiter)
  },
  orcaAppExtraEnv: DEMO
    ? { CLAUDE_CODE_PLUGIN_DIRS: process.env.CLAUDE_MODS_DEMO_PLUGIN_DIRS ?? '' }
    : {}
})

/** Something for each sample mod to act on: files to delete, files to edit. */
function seedDemoFiles(repo: string): void {
  mkdirSync(path.join(repo, 'build', 'assets'), { recursive: true })
  for (let i = 1; i <= 12; i++) {
    writeFileSync(
      path.join(repo, 'build', 'assets', `chunk-${i}.js`),
      `export const chunk = ${i}\n`
    )
  }
  writeFileSync(path.join(repo, 'build', 'index.html'), '<!doctype html><title>demo</title>\n')
  mkdirSync(path.join(repo, 'src'), { recursive: true })
  writeFileSync(
    path.join(repo, 'src', 'greet.js'),
    'export function greet(name) {\n  return `Hello, ${name}!`\n}\n'
  )
}

test('claude code mods demo', async ({ orcaPage: page, electronApp, seededRepoPath }) => {
  test.skip(!DEMO, 'run through pnpm demo:claude-mods')
  test.setTimeout(0)
  seedDemoFiles(seededRepoPath)
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate(async () => {
    const next = await window.api.settings.set({ experimentalNativeChat: true })
    window.__store?.setState({ settings: next })
  })
  await page.getByRole('button', { name: 'New tab' }).click({ force: true })
  await page
    .getByRole('menuitem', { name: /^Claude(?:\s|$)/i })
    .first()
    .click({ force: true })
  const composer = page.getByRole('textbox', { name: /Ask anything/ }).first()
  await expect(composer).toBeVisible({ timeout: 60_000 })
  await composer.click({ force: true })
  await composer.fill('/mods-demo')
  await composer.press('Enter')
  await expect(page.locator('[data-claude-mods-pane="mods-demo"]')).toBeVisible({
    timeout: 60_000
  })
  // The demo is the person's from here; it ends when they close the window.
  await electronApp.waitForEvent('close', { timeout: 0 })
})
