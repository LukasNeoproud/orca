import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePaneHookDescriptor,
  waitForActivePanePtyId,
  waitForTerminalOutput
} from './helpers/terminal'
import type { GlobalSettings } from '../../src/shared/global-settings-types'

test('chat response comments can be collected, edited, removed and sent without an extra prompt', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  const receivedPath = testInfo.outputPath('received-prompt.json')
  const fixturePath = path.join(
    process.cwd(),
    'tests/e2e/fixtures/terminal-response-comments-cli.cjs'
  )
  await execInTerminal(
    orcaPage,
    await waitForActivePanePtyId(orcaPage),
    `node "${fixturePath}" "${receivedPath}"`
  )
  await waitForTerminalOutput(orcaPage, 'Cache is cleared on every launch.')
  const descriptor = await waitForActivePaneHookDescriptor(orcaPage)
  const sessionId = randomUUID()
  const transcriptPath = testInfo.outputPath(`${sessionId}.jsonl`)
  const text = 'Cache is cleared on every launch. Keep unrelated settings unchanged.'
  const timestamp = Date.now()
  writeFileSync(
    transcriptPath,
    `${[
      {
        sessionId,
        uuid: `${sessionId}-user`,
        timestamp: new Date(timestamp).toISOString(),
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Explain cache behavior.' }] }
      },
      {
        sessionId,
        uuid: `${sessionId}-assistant`,
        timestamp: new Date(timestamp + 1000).toISOString(),
        type: 'assistant',
        message: { model: 'claude-opus-4', content: [{ type: 'text', text }] }
      }
    ]
      .map((line) => JSON.stringify(line))
      .join('\n')}\n`
  )
  await orcaPage.evaluate(
    async ({ descriptor, sessionId, transcriptPath }) => {
      const settings = await window.api.settings.set({ experimentalNativeChat: true })
      window.__store!.setState({ settings: settings as GlobalSettings })
      const state = window.__store!.getState()
      state.setAgentStatus(
        descriptor.paneKey,
        { state: 'done', prompt: 'Comment test', agentType: 'claude' },
        'Claude',
        undefined,
        { worktreeId: descriptor.worktreeId },
        { providerSession: { key: 'session_id', id: sessionId, transcriptPath } }
      )
      const [tabId] = descriptor.paneKey.split(':')
      const tab = state.unifiedTabsByWorktree[descriptor.worktreeId].find(
        (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
      )!
      state.toggleTabViewMode(tab.id)
    },
    { descriptor, sessionId, transcriptPath }
  )
  const response = orcaPage
    .locator('[data-response-comment-selectable="true"]')
    .filter({ hasText: text })
  await expect(response).toBeVisible({ timeout: 30_000 })
  const addComment = async (comment: string) => {
    await response.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await orcaPage.getByRole('button', { name: 'Comment', exact: true }).click()
    const popup = orcaPage.getByTestId('response-comment-popover')
    await popup.getByRole('textbox', { name: 'Comment text' }).fill(comment)
    await popup.getByRole('button', { name: 'Add comment', exact: true }).click()
    await expect(popup).toHaveCount(0)
  }
  await addComment('Keep the cache.')
  await expect(orcaPage.getByRole('button', { name: '1 comment', exact: true })).toBeVisible()
  await addComment('Second comment to delete.')
  await orcaPage.getByRole('button', { name: '2 comments', exact: true }).click()
  await orcaPage
    .getByRole('textbox', { name: 'Edit comment 1' })
    .fill('Preserve cache between launches.')
  await orcaPage.getByRole('button', { name: 'Remove comment 2' }).click()
  await expect(orcaPage.getByRole('button', { name: '1 comment', exact: true })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('comment-chip-editor.png') })
  await orcaPage.keyboard.press('Escape')
  const composer = orcaPage.locator('[data-composer-scope-key] [contenteditable="true"]')
  await expect(composer).toHaveText('')
  await composer.focus()
  await orcaPage.keyboard.press('Enter')
  await expect
    .poll(() => JSON.parse(readFileSync(receivedPath, 'utf8')).prompt)
    .toContain('Comment: Preserve cache between launches.')
  await expect.poll(() => JSON.parse(readFileSync(receivedPath, 'utf8')).submissions).toBe(1)
  await expect(orcaPage.getByRole('button', { name: '1 comment', exact: true })).toHaveCount(0)
})
