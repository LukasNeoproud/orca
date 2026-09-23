import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useMobileContextualFilePreview,
  type MobileContextualFilePreviewModel
} from './use-mobile-contextual-file-preview'

function ok(result: unknown) {
  return { id: '1', ok: true as const, result, _meta: { runtimeId: 'runtime-1' } }
}

describe('useMobileContextualFilePreview', () => {
  let renderer: ReactTestRenderer | null = null
  let model: MobileContextualFilePreviewModel | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    model = null
  })

  function Harness({ client }: { client: { sendRequest: ReturnType<typeof vi.fn> } }) {
    model = useMobileContextualFilePreview({
      client,
      connectionState: 'connected',
      worktreeId: 'wt-1',
      target: {
        pathText: '/tmp/report.md',
        line: null,
        column: null,
        nativeChatContext: { tabId: 'tab-1', sessionId: 'session-1' }
      }
    })
    return null
  }

  it('requires consent before reading an outside-workspace grant', async () => {
    const responses = [
      ok({
        worktree: 'wt-1',
        exists: true,
        isDirectory: false,
        openTarget: {
          kind: 'absolute-file',
          provider: 'ssh',
          absolutePath: '/tmp/report.md',
          grantId: 'grant-1',
          readOnly: true
        }
      }),
      ok({ content: '# Current', truncated: false, byteLength: 9 })
    ]
    const sendRequest = vi.fn(async () => responses.shift()!)
    const client = { sendRequest }
    await act(async () => {
      renderer = create(createElement(Harness, { client }))
    })

    expect(model?.needsConsent).toBe(true)
    expect(sendRequest).toHaveBeenCalledTimes(1)
    await act(async () => model?.approveOutsideWorkspace())
    await act(async () => {})

    expect(sendRequest).toHaveBeenCalledWith('files.readTerminalArtifact', {
      worktree: 'id:wt-1',
      absolutePath: '/tmp/report.md',
      grantId: 'grant-1'
    })
    expect(model?.preview).toMatchObject({ status: 'ready', kind: 'markdown' })
  })

  it('marks refreshed current content as changed without watching the file', async () => {
    const resolution = ok({
      worktree: 'wt-1',
      exists: true,
      isDirectory: false,
      openTarget: {
        kind: 'worktree-file',
        provider: 'ssh',
        relativePath: 'src/app.ts',
        absolutePath: '/repo/src/app.ts'
      }
    })
    const responses = [
      resolution,
      ok({ content: 'one', truncated: false, byteLength: 3 }),
      resolution,
      ok({ content: 'two', truncated: false, byteLength: 3 })
    ]
    const sendRequest = vi.fn(async () => responses.shift()!)
    const client = { sendRequest }

    function WorktreeHarness() {
      model = useMobileContextualFilePreview({
        client,
        connectionState: 'connected',
        worktreeId: 'wt-1',
        target: { pathText: 'src/app.ts', line: null, column: null }
      })
      return null
    }
    await act(async () => {
      renderer = create(createElement(WorktreeHarness))
    })
    expect(model?.changed).toBe(false)

    await act(async () => model?.reload())
    await act(async () => {})
    expect(model?.changed).toBe(true)
    expect(sendRequest).toHaveBeenCalledTimes(4)
  })

  it('does not read or resolve when the execution host is unavailable', async () => {
    const sendRequest = vi.fn()
    const client = { sendRequest }
    function DisconnectedHarness() {
      model = useMobileContextualFilePreview({
        client,
        connectionState: 'disconnected',
        worktreeId: 'wt-1',
        target: { pathText: 'src/app.ts', line: null, column: null }
      })
      return null
    }
    await act(async () => {
      renderer = create(createElement(DisconnectedHarness))
    })

    expect(sendRequest).not.toHaveBeenCalled()
    expect(model?.preview).toEqual({
      status: 'error',
      message: 'Unable to reach the desktop filesystem',
      reconnect: true
    })
  })
})
