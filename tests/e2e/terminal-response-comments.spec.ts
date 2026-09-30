import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { execInTerminal, waitForActivePanePtyId, waitForTerminalOutput } from './helpers/terminal'

test('select terminal output, comment beside selection, paste without submitting', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  const reportPath = testInfo.outputPath('received-prompt.json')
  const fixturePath = path.join(
    process.cwd(),
    'tests/e2e/fixtures/terminal-response-comments-cli.cjs'
  )
  const ptyId = await waitForActivePanePtyId(orcaPage)
  await execInTerminal(orcaPage, ptyId, `node "${fixturePath}" "${reportPath}"`)
  await waitForTerminalOutput(orcaPage, 'Cache is cleared on every launch.')
  const geometry = await orcaPage.evaluate(() => {
    const pane = window
      .__paneManagers!.get(window.__store!.getState().activeTabId!)!
      .getActivePane()!
    const term = pane.terminal
    const rect = term.element!.querySelector('.xterm-screen')!.getBoundingClientRect()
    return { x: rect.x, y: rect.y, cell: rect.width / term.cols, row: rect.height / term.rows }
  })
  await orcaPage.mouse.move(geometry.x + geometry.cell * 0.2, geometry.y + geometry.row * 1.5)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(
    geometry.x + geometry.cell * ('Keep unrelated settings unchanged.'.length + 0.5),
    geometry.y + geometry.row * 2.5,
    {
      steps: 16
    }
  )
  await orcaPage.mouse.up()
  const quote = 'Cache is cleared on every launch.\nKeep unrelated settings unchanged.'
  await expect
    .poll(() =>
      orcaPage.evaluate(() =>
        window
          .__paneManagers!.get(window.__store!.getState().activeTabId!)!
          .getActivePane()!
          .terminal.getSelection()
      )
    )
    .toBe(quote)
  const trigger = orcaPage.getByRole('button', { name: 'Comment', exact: true })
  await expect(trigger).toBeVisible()
  const box = await trigger.boundingBox()
  expect(Math.abs(box!.y - (geometry.y + geometry.row * 3))).toBeLessThan(12)
  await orcaPage.screenshot({ path: testInfo.outputPath('01-selection.png') })
  await trigger.click()
  const popup = orcaPage.getByTestId('response-comment-popover')
  await expect(popup).toBeVisible()
  await expect
    .poll(async () => {
      const editorBox = await popup.boundingBox()
      return Boolean(
        editorBox && Math.abs(editorBox.x - box!.x) < 16 && editorBox.y >= box!.y + box!.height
      )
    })
    .toBe(true)
  await expect(popup.locator('blockquote')).toHaveText(quote)
  await popup.getByRole('textbox').fill('Zachovej cache.\nInvalidate only changed entries.')
  await orcaPage.screenshot({ path: testInfo.outputPath('02-comment.png'), animations: 'disabled' })
  await popup.getByRole('button', { name: 'Insert into prompt' }).click()
  const expected =
    'Existing draft\n> Cache is cleared on every launch.\n> Keep unrelated settings unchanged.\n\nComment: Zachovej cache.\nInvalidate only changed entries.'
  await expect
    .poll(() => JSON.parse(readFileSync(reportPath, 'utf8')))
    .toEqual({ prompt: expected, submissions: 0, pastes: 1 })
  await expect(popup).toHaveCount(0)
  await expect(orcaPage.locator('.xterm-helper-textarea:focus')).toHaveCount(1)
  await waitForTerminalOutput(orcaPage, 'Invalidate only changed entries.')
  await orcaPage.screenshot({ path: testInfo.outputPath('03-inserted.png') })
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    )
  ).toBe(false)
})
