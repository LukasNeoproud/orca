// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { TerminalPaneMenuPasteContext } from './terminal-pane-menu-paste'

const mocks = vi.hoisted(() => ({
  save: null as null | ((comment: string) => Promise<boolean>),
  selection: null as unknown,
  dismiss: vi.fn(),
  paste: vi.fn(),
  protectedOptions: vi.fn(),
  state: { agentStatusByPaneKey: {}, paneForegroundAgentByPaneKey: {} }
}))
vi.mock('../response-comments/ResponseCommentPopover', () => ({
  ResponseCommentPopover: ({ onSave }: { onSave: typeof mocks.save }) => {
    mocks.save = onSave
    return null
  }
}))
vi.mock('./use-terminal-comment-selection', () => ({
  useTerminalCommentSelection: () => ({
    selection: mocks.selection,
    dismiss: mocks.dismiss,
    onEditingChange: vi.fn()
  })
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./terminal-input-host-platform', () => ({
  resolveTerminalInputHostPlatform: () => 'linux'
}))
vi.mock('./terminal-agent-paste-bracketing', () => ({
  resolveProtectedMultilinePasteOptionsForPane: mocks.protectedOptions
}))
vi.mock('./terminal-pane-menu-paste', () => ({
  executeTerminalPaneMenuPasteText: mocks.paste
}))

import { TerminalResponseComment } from './TerminalResponseComment'

function fixture() {
  let ptyId = 'original-pty'
  let connected = true
  const transport = { getPtyId: () => ptyId, isConnected: () => connected }
  const pane = { id: 1, leafId: 'leaf', terminal: { clearSelection: vi.fn(), focus: vi.fn() } }
  const context = {
    managerRef: { current: { getPanes: () => [pane] } },
    paneTransportsRef: { current: new Map([[1, transport]]) },
    tabId: 'tab',
    worktreeId: 'folder-workspace',
    forceBracketedMultilineTextPaste: false,
    onPasteError: vi.fn()
  }
  mocks.selection = { quote: 'Selected output', ptyId, transport }
  render(
    <TerminalResponseComment
      pane={pane as unknown as ManagedPane}
      context={context as unknown as TerminalPaneMenuPasteContext}
    />
  )
  return {
    pane,
    context,
    reconnect: () => {
      ptyId = 'replacement-pty'
    },
    disconnect: () => {
      connected = false
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.paste.mockResolvedValue(true)
  mocks.protectedOptions.mockReturnValue(undefined)
})
afterEach(cleanup)

describe('terminal response comment insertion', () => {
  it('uses protected programmatic paste without submit and preserves the selected quote', async () => {
    const { pane, context } = fixture()
    expect(await mocks.save!('My comment')).toBe(true)
    expect(mocks.paste).toHaveBeenCalledWith(
      context,
      pane,
      'programmatic',
      '\n> Selected output\n\nComment: My comment',
      { forceBracketedPasteForMultiline: true }
    )
    expect(pane.terminal.clearSelection).toHaveBeenCalledOnce()
    expect(mocks.dismiss).toHaveBeenCalledOnce()
  })

  it.each(['reconnect', 'disconnect'] as const)(
    'rejects a stale %s instead of targeting another process',
    async (change) => {
      const result = fixture()
      result[change]()
      expect(await mocks.save!('My comment')).toBe(false)
      expect(mocks.paste).not.toHaveBeenCalled()
      expect(result.context.onPasteError).toHaveBeenCalledOnce()
      expect(mocks.dismiss).not.toHaveBeenCalled()
    }
  )

  it('keeps the editor and selection after a failed paste', async () => {
    const { pane } = fixture()
    mocks.paste.mockResolvedValue(false)
    expect(await mocks.save!('My comment')).toBe(false)
    expect(mocks.dismiss).not.toHaveBeenCalled()
    expect(pane.terminal.clearSelection).not.toHaveBeenCalled()
    expect(pane.terminal.focus).not.toHaveBeenCalled()
  })

  it('uses the owning host Windows input-record newline encoding when required', async () => {
    const { pane, context } = fixture()
    mocks.protectedOptions.mockReturnValue({ windowsInputRecordNewline: 'csi-u' })
    await mocks.save!('My comment')
    expect(mocks.paste).toHaveBeenCalledWith(context, pane, 'programmatic', expect.any(String), {
      windowsInputRecordNewline: 'csi-u'
    })
  })
})
