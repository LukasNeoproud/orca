import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationBranchStore } from './conversation-branch-store'
import { branchRecord } from '../../shared/conversation-branch.test-fixture'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function directory(): string {
  const root = mkdtempSync(join(tmpdir(), 'conversation-branch-store-'))
  roots.push(root)
  return root
}

describe('ConversationBranchStore', () => {
  it('persists branches across instances and lists them per workspace', async () => {
    const root = directory()
    const logger = { warn: vi.fn() }
    const store = new ConversationBranchStore(root, logger)
    await store.put(branchRecord())
    await store.put(
      branchRecord({ branchId: 'branch-2', requestId: 'request-2', workspaceId: 'wt-2' })
    )

    const reopened = new ConversationBranchStore(root, logger)
    expect((await reopened.list('wt-1')).map((branch) => branch.branchId)).toEqual(['branch-1'])
    expect((await reopened.findByRequest('request-2'))?.workspaceId).toBe('wt-2')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('records a returned result once, however often it is delivered', async () => {
    const store = new ConversationBranchStore(directory(), { warn: vi.fn() })
    await store.put(branchRecord())
    const entry = { returnId: 'return-1', content: 'Fixed in abc123', createdAt: 5 }
    await store.appendReturn('branch-1', entry)
    const again = await store.appendReturn('branch-1', entry)
    expect(again.returns).toEqual([entry])
    await expect(store.appendReturn('missing', entry)).rejects.toThrow(
      'conversation_branch_not_found'
    )
  })

  it('keeps an unreadable file aside and starts empty instead of overwriting it', async () => {
    const root = directory()
    writeFileSync(join(root, 'conversation-branches.json'), '{not json')
    const logger = { warn: vi.fn() }
    const store = new ConversationBranchStore(root, logger)
    expect(await store.list('wt-1')).toEqual([])
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(
      readdirSync(root).some((name) => name.startsWith('conversation-branches.json.corrupt-'))
    ).toBe(true)
  })

  it('skips a record it cannot read rather than dropping the whole file', async () => {
    const root = directory()
    writeFileSync(
      join(root, 'conversation-branches.json'),
      JSON.stringify({ schemaVersion: 1, branches: [branchRecord(), { schemaVersion: 2 }] })
    )
    const store = new ConversationBranchStore(root, { warn: vi.fn() })
    expect((await store.list('wt-1')).map((branch) => branch.branchId)).toEqual(['branch-1'])
  })
})
